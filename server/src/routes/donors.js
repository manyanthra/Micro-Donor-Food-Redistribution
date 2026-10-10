const express = require('express');
const router = express.Router();
const Donor = require('../../models/Donor');
const Donation = require('../../models/Donation');
const { z } = require('zod');

const DonorSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['bakery', 'restaurant', 'hostel_mess']),
  address: z.string().min(3),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }),
  phone: z.string().optional()
});

// GET /api/donors - List all donors with active donation counts
router.get('/', async (req, res) => {
  try {
    const donors = await Donor.find({}).lean();
    const donations = await Donation.find({}).lean();

    // Attach active donations to each donor
    const donorsWithDonations = donors.map((d) => {
      const donorDonations = donations.filter((don) => don.donorId.toString() === d._id.toString());
      return {
        ...d,
        donations: donorDonations,
        activeDonationsCount: donorDonations.filter((don) => don.status === 'AVAILABLE' || don.status === 'ASSIGNED').length
      };
    });

    res.json({ ok: true, donors: donorsWithDonations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/donors/:id
router.get('/:id', async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.id).lean();
    if (!donor) return res.status(404).json({ ok: false, error: 'Donor not found' });
    const donations = await Donation.find({ donorId: req.params.id }).sort({ createdAt: -1 });
    res.json({ ok: true, donor: { ...donor, donations } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/donors - Create donor
router.post('/', async (req, res) => {
  try {
    const validated = DonorSchema.parse(req.body);
    const donor = await Donor.create(validated);
    res.status(201).json({ ok: true, donor });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, errors: err.errors });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
