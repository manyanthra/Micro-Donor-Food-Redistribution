const express = require('express');
const router = express.Router();
const Trip = require('../../models/Trip');
const Donation = require('../../models/Donation');
const Donor = require('../../models/Donor');
const Ngo = require('../../models/Ngo');
const { screenDonations, clusterEligibleDonations } = require('../services/clusteringService');
const { generateCollectionRoute, calculateActualMetrics } = require('../services/routingService');
const { z } = require('zod');

// GET /api/trips - List all trips
router.get('/', async (req, res) => {
  try {
    const trips = await Trip.find({})
      .populate('ngoId')
      .populate('stops.donorId')
      .populate('stops.donationId')
      .sort({ createdAt: -1 });
    res.json({ ok: true, trips });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/trips/:id - Get single trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('ngoId')
      .populate('stops.donorId')
      .populate('stops.donationId');
    if (!trip) return res.status(404).json({ ok: false, error: 'Trip not found' });
    res.json({ ok: true, trip });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/trips/cluster-and-plan - Cluster surplus & generate route
router.post('/cluster-and-plan', async (req, res) => {
  try {
    const ngo = await Ngo.findOne({});
    if (!ngo) {
      return res.status(404).json({ ok: false, error: 'NGO not found. Reseed data first.' });
    }

    const availableDonations = await Donation.find({ status: 'AVAILABLE' }).populate('donorId');
    const { eligible, excluded: screeningExcluded } = screenDonations(availableDonations);

    if (eligible.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No eligible donations found for clustering',
        screeningExcluded
      });
    }

    const clusters = clusterEligibleDonations(eligible);
    const primaryCluster = clusters[0] || [];

    const departureTime = req.body.departureTime ? new Date(req.body.departureTime) : new Date();
    const routeResult = generateCollectionRoute(ngo, primaryCluster, departureTime);

    // Merge screening exclusions with route exclusions
    const allExcluded = [
      ...screeningExcluded.map((e) => ({ donationId: e.donationId, reason: e.reason })),
      ...routeResult.excluded
    ];

    // If commit flag is set, persist the planned trip to DB
    let savedTrip = null;
    if (req.body.commit) {
      const tripDoc = await Trip.create({
        ngoId: ngo._id,
        status: 'PLANNED',
        stops: routeResult.stops.map((s) => ({
          donationId: s.donationId,
          donorId: s.donorId,
          order: s.order,
          plannedQty: s.plannedQty,
          collectedQty: 0,
          eta: s.eta,
          distanceFromPrevKm: s.distanceFromPrevKm,
          status: 'PENDING',
          skipReason: ''
        })),
        plannedMetrics: routeResult.plannedMetrics,
        baselineMetrics: routeResult.baselineMetrics,
        actualMetrics: {
          distanceKm: 0,
          cost: 0,
          meals: 0,
          costPerMeal: 0,
          durationMin: 0
        },
        excluded: allExcluded,
        deliveredQty: 0
      });

      // Update plannedQty and tripId on donations
      for (const stop of routeResult.stops) {
        await Donation.findByIdAndUpdate(stop.donationId, {
          plannedQty: stop.plannedQty,
          tripId: tripDoc._id
        });
      }

      savedTrip = await Trip.findById(tripDoc._id)
        .populate('ngoId')
        .populate('stops.donorId')
        .populate('stops.donationId');
    }

    res.json({
      ok: true,
      clustersCount: clusters.length,
      primaryClusterSize: primaryCluster.length,
      route: routeResult,
      excluded: allExcluded,
      trip: savedTrip
    });
  } catch (err) {
    console.error('Error in cluster-and-plan:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/trips/:id/start - Start trip dispatch
router.post('/:id/start', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ ok: false, error: 'Trip not found' });
    if (trip.status !== 'PLANNED') {
      return res.status(400).json({ ok: false, error: `Cannot start trip in status '${trip.status}'` });
    }

    trip.status = 'IN_PROGRESS';
    trip.startedAt = new Date();
    await trip.save();

    // Mark all donations in stops as ASSIGNED
    for (const stop of trip.stops) {
      const donation = await Donation.findById(stop.donationId);
      if (donation) {
        donation.status = 'ASSIGNED';
        donation.statusHistory.push({
          status: 'ASSIGNED',
          at: new Date(),
          note: `Assigned to Trip #${trip._id.toString().slice(-6)} (Order: ${stop.order})`
        });
        await donation.save();
      }
    }

    const updated = await Trip.findById(trip._id)
      .populate('ngoId')
      .populate('stops.donorId')
      .populate('stops.donationId');
    res.json({ ok: true, trip: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/trips/:id/stop/:stopOrder - Update stop status (COLLECT or SKIP)
router.post('/:id/stop/:stopOrder', async (req, res) => {
  try {
    const { action, collectedQty, skipReason } = req.body;
    const orderNum = parseInt(req.params.stopOrder, 10);

    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ ok: false, error: 'Trip not found' });

    const stop = trip.stops.find((s) => s.order === orderNum);
    if (!stop) return res.status(404).json({ ok: false, error: `Stop ${orderNum} not found in trip` });

    const donation = await Donation.findById(stop.donationId);

    if (action === 'COLLECT') {
      const actualQty = collectedQty !== undefined ? Number(collectedQty) : stop.plannedQty;
      stop.status = 'COLLECTED';
      stop.collectedQty = actualQty;

      if (donation) {
        donation.status = 'COLLECTED';
        donation.collectedQty = actualQty;
        donation.statusHistory.push({
          status: 'COLLECTED',
          at: new Date(),
          note: `Driver collected ${actualQty} meals (planned: ${stop.plannedQty}, offered: ${donation.mealsOffered})`
        });
        await donation.save();
      }
    } else if (action === 'SKIP') {
      stop.status = 'SKIPPED';
      stop.collectedQty = 0;
      stop.skipReason = skipReason || 'Skipped by driver';

      if (donation) {
        donation.status = 'AVAILABLE';
        donation.tripId = null;
        donation.statusHistory.push({
          status: 'AVAILABLE',
          at: new Date(),
          note: `Stop skipped during trip: ${stop.skipReason}`
        });
        await donation.save();
      }
    } else {
      return res.status(400).json({ ok: false, error: "Invalid action. Must be 'COLLECT' or 'SKIP'" });
    }

    trip.actualMetrics = calculateActualMetrics(trip);
    await trip.save();

    const updated = await Trip.findById(trip._id)
      .populate('ngoId')
      .populate('stops.donorId')
      .populate('stops.donationId');
    res.json({ ok: true, trip: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/trips/:id/complete - Complete collection trip and verify delivery at NGO
router.post('/:id/complete', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ ok: false, error: 'Trip not found' });

    const totalCollectedStops = trip.stops.reduce((sum, s) => {
      return s.status === 'COLLECTED' ? sum + (s.collectedQty || 0) : sum;
    }, 0);

    const deliveredQty = req.body.deliveredQty !== undefined ? Number(req.body.deliveredQty) : totalCollectedStops;

    trip.status = 'COMPLETED';
    trip.completedAt = new Date();
    trip.deliveredQty = deliveredQty;
    trip.ngoConfirmed = Boolean(req.body.ngoConfirmed ?? true);
    trip.actualMetrics = calculateActualMetrics(trip);
    await trip.save();

    // Mark all collected donations as DELIVERED
    for (const stop of trip.stops) {
      if (stop.status === 'COLLECTED') {
        const donation = await Donation.findById(stop.donationId);
        if (donation) {
          donation.status = 'DELIVERED';
          donation.deliveredQty = stop.collectedQty;
          donation.statusHistory.push({
            status: 'DELIVERED',
            at: new Date(),
            note: `Successfully received and verified at NGO depot (${donation.deliveredQty} meals)`
          });
          await donation.save();
        }
      }
    }

    const updated = await Trip.findById(trip._id)
      .populate('ngoId')
      .populate('stops.donorId')
      .populate('stops.donationId');
    res.json({ ok: true, trip: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/trips/:id/cancel - Cancel trip
router.post('/:id/cancel', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ ok: false, error: 'Trip not found' });

    trip.status = 'CANCELLED';
    await trip.save();

    // Revert pending stops back to AVAILABLE
    for (const stop of trip.stops) {
      if (stop.status === 'PENDING') {
        const donation = await Donation.findById(stop.donationId);
        if (donation && (donation.status === 'ASSIGNED' || donation.status === 'AVAILABLE')) {
          donation.status = 'AVAILABLE';
          donation.tripId = null;
          donation.statusHistory.push({
            status: 'AVAILABLE',
            at: new Date(),
            note: `Trip #${trip._id.toString().slice(-6)} was cancelled`
          });
          await donation.save();
        }
      }
    }

    const updated = await Trip.findById(trip._id)
      .populate('ngoId')
      .populate('stops.donorId')
      .populate('stops.donationId');
    res.json({ ok: true, trip: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
