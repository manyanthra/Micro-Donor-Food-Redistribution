const express = require('express');
const router = express.Router();
const Ngo = require('../../models/Ngo');
const Donation = require('../../models/Donation');
const { FOOD_CATEGORIES, ROUTING_CONFIG } = require('../../config/foodRules');
const {
  filterDonations,
  clusterDonations,
  planRoute,
  calculateMetrics,
  recommendTrip,
  evaluateDispatch
} = require('../../engine');
const { z } = require('zod');

const PlanRequestSchema = z.object({
  ngoId: z.string().optional(),
  clusterId: z.string().optional(),
  capacity: z.number().positive().optional(),
  costPerKm: z.number().positive().optional(),
  minViableMeals: z.number().int().positive().optional()
});

// POST /api/plan - Generate explainable collection plan without persisting to DB
router.post('/', async (req, res) => {
  try {
    const validated = PlanRequestSchema.parse(req.body);

    let ngo = null;
    if (validated.ngoId) {
      ngo = await Ngo.findById(validated.ngoId);
    }
    if (!ngo) {
      ngo = await Ngo.findOne({});
    }
    if (!ngo) {
      return res.status(404).json({ ok: false, error: 'NGO not found. Reseed data first.' });
    }

    const rules = {
      FOOD_CATEGORIES,
      ROUTING_CONFIG: {
        ...ROUTING_CONFIG,
        ...(validated.costPerKm ? { COST_PER_KM: Number(validated.costPerKm) } : {}),
        ...(validated.capacity ? { VEHICLE_CAPACITY_MEALS: Number(validated.capacity) } : {}),
        ...(validated.minViableMeals ? { MIN_VIABLE_MEALS: Number(validated.minViableMeals) } : {})
      }
    };

    const minViableMeals = validated.minViableMeals
      ? Number(validated.minViableMeals)
      : rules.ROUTING_CONFIG.MIN_VIABLE_MEALS;

    const available = await Donation.find({ status: 'AVAILABLE' }).populate('donorId');
    const now = new Date();

    // 1. Screening
    const { feasible, excluded: filterExcluded } = filterDonations(available, now, rules, ngo);

    // 2. Clustering
    const clusters = clusterDonations(feasible, 1.0, { rules, now, ngo });

    if (clusters.length === 0) {
      const leftOut = filterExcluded.map((e) => ({ donationId: e.donationId, reason: e.reason }));
      return res.json({
        ok: true,
        clusters: [],
        chosenRoute: {
          stops: [],
          excluded: leftOut,
          totalDistanceKm: 0,
          durationMin: 0,
          mealsCollected: 0,
          unallocatedMeals: 0,
          distanceSource: 'estimated'
        },
        leftOut,
        dispatchable: false,
        reason: 'Not dispatchable: no feasible donations available to form a collection trip.',
        shortfall: minViableMeals,
        minViableMeals,
        recommended: false,
        recommendReason: 'No feasible donations available for collection.',
        optimizedMetrics: null,
        baselineMetrics: null,
        savings: null,
        distanceSource: 'estimated',
        assumptions: ''
      });
    }

    // 3. Choose cluster (by requested ID or primary cluster)
    const chosenCluster = validated.clusterId
      ? (clusters.find((c) => c.id === validated.clusterId) || clusters[0])
      : clusters[0];

    // 4. Route planning with candidate simulation and stabilisation loop
    const routeResult = planRoute(ngo, chosenCluster.donations, now, rules, {
      vehicleCapacity: validated.capacity
    });

    // 5. Merge all left-out items (from filter + route auto-exclusions)
    const leftOutMap = new Map();
    for (const exc of filterExcluded) {
      leftOutMap.set(String(exc.donationId), exc.reason);
    }
    for (const exc of routeResult.excluded) {
      leftOutMap.set(String(exc.donationId), exc.reason);
    }
    const leftOut = Array.from(leftOutMap.entries()).map(([donationId, reason]) => ({
      donationId,
      reason
    }));

    // 6. Mandatory dispatch gate evaluation
    const dispatchResult = evaluateDispatch(
      {
        stops: routeResult.stops,
        excluded: leftOut
      },
      rules
    );

    // 7. Economic metrics & counterfactual baseline
    const metrics = calculateMetrics(routeResult, ngo, rules);

    // 8. Viability recommendation (merges dispatchable hard gate with cost-per-meal advisory)
    const recommendation = recommendTrip(routeResult, metrics, {
      rules,
      minViableMeals
    });

    res.json({
      ok: true,
      clusters,
      chosenRoute: routeResult,
      leftOut,
      dispatchable: dispatchResult.dispatchable,
      reason: dispatchResult.reason,
      shortfall: dispatchResult.shortfall,
      minViableMeals: dispatchResult.minViableMeals,
      recommended: recommendation.recommended,
      recommendReason: recommendation.reason,
      optimizedMetrics: metrics.optimized,
      baselineMetrics: metrics.baseline,
      savings: metrics.savings,
      distanceSource: routeResult.distanceSource,
      assumptions: metrics.assumptionsText
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, errors: err.errors });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
