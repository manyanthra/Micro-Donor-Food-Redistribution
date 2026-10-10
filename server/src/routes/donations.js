const express = require('express');
const router = express.Router();
const Donation = require('../../models/Donation');
const Donor = require('../../models/Donor');
const { FOOD_CATEGORIES } = require('../../config/foodRules');
const { z } = require('zod');

const DonationCreateSchema = z.object({
  donorId: z.string().min(1, 'donorId is required'),
  mealsOffered: z.number().int().min(1, 'mealsOffered must be at least 1'),
  category: z.string().refine((cat) => Boolean(FOOD_CATEGORIES[cat]), {
    message: 'Invalid food category'
  }),
  readyAt: z.string().or(z.date()).optional(),
  collectBy: z.string().or(z.date()).optional(),
  notes: z.string().optional()
});

const StatusUpdateSchema = z.object({
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'REJECTED']),
  note: z.string().optional(),
  collectedQty: z.number().min(0).optional(),
  deliveredQty: z.number().min(0).optional()
});

// GET /api/donations - List donations with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, donorId, category } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (donorId) filter.donorId = donorId;
    if (category) filter.category = category;

    const donations = await Donation.find(filter)
      .populate('donorId')
      .populate('tripId')
      .sort({ createdAt: -1 });

    res.json({ ok: true, donations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/donations/:id
router.get('/:id', async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id)
      .populate('donorId')
      .populate('tripId');
    if (!donation) return res.status(404).json({ ok: false, error: 'Donation not found' });
    res.json({ ok: true, donation });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/donations - Post surplus with food safety validation
router.post('/', async (req, res) => {
  try {
    const validated = DonationCreateSchema.parse(req.body);

    const donor = await Donor.findById(validated.donorId);
    if (!donor) {
      return res.status(404).json({ ok: false, error: 'Donor not found' });
    }

    const catConfig = FOOD_CATEGORIES[validated.category];
    const now = new Date();
    const readyAt = validated.readyAt ? new Date(validated.readyAt) : now;

    // Compute safe window collectBy
    const maxCollectBy = Donation.computeMaxCollectBy(validated.category, readyAt);
    let collectBy = maxCollectBy;

    if (validated.collectBy) {
      const requestedCollectBy = new Date(validated.collectBy);
      // Optional override never exceeding the safe window
      if (requestedCollectBy < maxCollectBy) {
        collectBy = requestedCollectBy;
      }
    }

    let initialStatus = 'AVAILABLE';
    let exclusionReason = null;

    // Check donatable category
    if (!catConfig.donatable) {
      initialStatus = 'REJECTED';
      exclusionReason = `Non-donatable category (${catConfig.label})`;
    } else if (collectBy < now) {
      initialStatus = 'REJECTED';
      exclusionReason = 'Surplus safe window has already expired';
    }

    const donation = await Donation.create({
      donorId: validated.donorId,
      mealsOffered: validated.mealsOffered,
      category: validated.category,
      readyAt,
      collectBy,
      status: initialStatus,
      statusHistory: [
        {
          status: initialStatus,
          at: new Date(),
          note: exclusionReason || 'Surplus posted by donor'
        }
      ],
      exclusionReason,
      plannedQty: 0,
      collectedQty: 0,
      deliveredQty: 0,
      notes: validated.notes || ''
    });

    const populated = await Donation.findById(donation._id).populate('donorId');
    res.status(201).json({ ok: true, donation: populated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, errors: err.errors });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/donations/:id/status - Update donation status with audit history
router.patch('/:id/status', async (req, res) => {
  try {
    const validated = StatusUpdateSchema.parse(req.body);
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ ok: false, error: 'Donation not found' });

    donation.status = validated.status;
    donation.statusHistory.push({
      status: validated.status,
      at: new Date(),
      note: validated.note || `Status changed to ${validated.status}`
    });

    if (validated.collectedQty !== undefined) {
      donation.collectedQty = validated.collectedQty;
    }
    if (validated.deliveredQty !== undefined) {
      donation.deliveredQty = validated.deliveredQty;
    }

    await donation.save();
    const updated = await Donation.findById(donation._id).populate('donorId');
    res.json({ ok: true, donation: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, errors: err.errors });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
