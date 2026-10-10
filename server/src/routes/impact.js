const express = require('express');
const router = express.Router();
const Donation = require('../../models/Donation');
const Trip = require('../../models/Trip');
const BlockedDispatch = require('../../models/BlockedDispatch');

// GET /api/impact - Comprehensive operational & economic impact reporting
router.get('/', async (req, res) => {
  try {
    const allDonations = await Donation.find({});
    const allTrips = await Trip.find({});
    const completedTrips = allTrips.filter((t) => t.status === 'COMPLETED');

    // 1. Quantity aggregations (respecting partial collection rule)
    const mealsOffered = allDonations.reduce((sum, d) => sum + (d.mealsOffered || 0), 0);
    const plannedMeals = allTrips.reduce((sum, t) => sum + (t.plannedMetrics?.meals || 0), 0);
    const collectedMeals = allDonations.reduce((sum, d) => sum + (d.collectedQty || 0), 0);
    const deliveredMeals = allDonations.reduce((sum, d) => sum + (d.deliveredQty || 0), 0);

    const deliveredPercentageOfOffered = mealsOffered > 0
      ? Number(((deliveredMeals / mealsOffered) * 100).toFixed(1))
      : 0;

    // 2. Donors served per trip (average unique donors served across completed trips)
    let totalUniqueDonorsServed = 0;
    for (const trip of completedTrips) {
      const servedDonors = new Set(
        trip.stops
          .filter((s) => s.status === 'COLLECTED')
          .map((s) => String(s.donorId))
      );
      totalUniqueDonorsServed += servedDonors.size;
    }
    const donorsServedPerTrip = completedTrips.length > 0
      ? Number((totalUniqueDonorsServed / completedTrips.length).toFixed(1))
      : 0;

    // 3. Cost per delivered meal (planned vs actual)
    let totalPlannedCost = 0;
    let totalPlannedQty = 0;
    let totalActualCost = 0;
    let totalDeliveredQty = 0;
    let totalBaselineCost = 0;
    let totalBaselineDistanceKm = 0;
    let totalActualDistanceKm = 0;

    for (const trip of completedTrips) {
      totalPlannedCost += (trip.plannedMetrics?.cost || 0);
      totalPlannedQty += (trip.plannedMetrics?.meals || 0);
      totalActualCost += (trip.actualMetrics?.cost || 0);
      totalDeliveredQty += (trip.deliveredQty || 0);
      totalBaselineCost += (trip.baselineMetrics?.cost || 0);
      totalBaselineDistanceKm += (trip.baselineMetrics?.distanceKm || 0);
      totalActualDistanceKm += (trip.actualMetrics?.distanceKm || trip.plannedMetrics?.distanceKm || 0);
    }

    const costPerDeliveredMeal = {
      planned: totalPlannedQty > 0
        ? Number((totalPlannedCost / totalPlannedQty).toFixed(2))
        : 0,
      actual: totalDeliveredQty > 0
        ? Number((totalActualCost / totalDeliveredQty).toFixed(2))
        : 0
    };

    // 4. Savings vs counterfactual baseline
    const costAbs = Number((totalBaselineCost - totalActualCost).toFixed(2));
    const costPct = totalBaselineCost > 0
      ? Number(((costAbs / totalBaselineCost) * 100).toFixed(1))
      : 0;
    const distanceKm = Number((totalBaselineDistanceKm - totalActualDistanceKm).toFixed(2));

    const savingsVsBaseline = {
      costAbs,
      costPct,
      distanceKm,
      totalBaselineCost,
      totalActualCost
    };

    // 5. Blocked dispatches count
    const blockedDispatchesCount = await BlockedDispatch.countDocuments();

    // 6. Auto-excluded items grouped by category/reason
    const groupedExcluded = {
      expired: { count: 0, sampleReasons: [] },
      cannot_reach_in_time: { count: 0, sampleReasons: [] },
      capacity: { count: 0, sampleReasons: [] },
      not_donatable: { count: 0, sampleReasons: [] },
      other: { count: 0, sampleReasons: [] }
    };

    let totalAutoExcludedCount = 0;
    const seenExcludedIds = new Set();

    // Check all trip exclusions
    for (const trip of allTrips) {
      for (const exc of trip.excluded || []) {
        const id = String(exc.donationId || '');
        if (id && !seenExcludedIds.has(id)) {
          seenExcludedIds.add(id);
          totalAutoExcludedCount++;
          categorizeReason(exc.reason, groupedExcluded);
        }
      }
    }

    // Check all donations with exclusionReason
    for (const don of allDonations) {
      const id = String(don._id);
      if (don.exclusionReason && !seenExcludedIds.has(id)) {
        seenExcludedIds.add(id);
        totalAutoExcludedCount++;
        categorizeReason(don.exclusionReason, groupedExcluded);
      }
    }

    function categorizeReason(reasonStr = '', groups) {
      const lower = reasonStr.toLowerCase();
      if (lower.includes('expired') || lower.includes('expiration')) {
        groups.expired.count++;
        if (groups.expired.sampleReasons.length < 3) groups.expired.sampleReasons.push(reasonStr);
      } else if (
        lower.includes('reach the ngo') ||
        lower.includes('safe window') ||
        lower.includes('late') ||
        lower.includes('running late') ||
        lower.includes('cannot be reached')
      ) {
        groups.cannot_reach_in_time.count++;
        if (groups.cannot_reach_in_time.sampleReasons.length < 3) groups.cannot_reach_in_time.sampleReasons.push(reasonStr);
      } else if (lower.includes('capacity')) {
        groups.capacity.count++;
        if (groups.capacity.sampleReasons.length < 3) groups.capacity.sampleReasons.push(reasonStr);
      } else if (lower.includes('non-donatable') || lower.includes('not donatable')) {
        groups.not_donatable.count++;
        if (groups.not_donatable.sampleReasons.length < 3) groups.not_donatable.sampleReasons.push(reasonStr);
      } else {
        groups.other.count++;
        if (groups.other.sampleReasons.length < 3) groups.other.sampleReasons.push(reasonStr);
      }
    }

    // 7. Items delivered inside vs outside safe window
    let deliveredInsideSafeWindow = 0;
    let deliveredOutsideSafeWindow = 0;

    for (const don of allDonations) {
      if (don.status === 'DELIVERED') {
        const deliverEntry = (don.statusHistory || []).find((h) => h.status === 'DELIVERED');
        if (deliverEntry) {
          const deliverTime = new Date(deliverEntry.at);
          const deadline = new Date(don.deliverBy || don.collectBy);
          if (deliverTime <= deadline) {
            deliveredInsideSafeWindow++;
          } else {
            deliveredOutsideSafeWindow++;
          }
        } else {
          deliveredInsideSafeWindow++;
        }
      }
    }

    res.json({
      ok: true,
      mealsOffered,
      plannedMeals,
      collectedMeals,
      deliveredMeals,
      deliveredPercentageOfOffered,
      donorsServedPerTrip,
      costPerDeliveredMeal,
      savingsVsBaseline,
      blockedDispatchesCount,
      autoExcludedCount: totalAutoExcludedCount,
      autoExcludedReasons: groupedExcluded,
      itemsDeliveredSafeWindow: {
        insideSafeWindow: deliveredInsideSafeWindow,
        outsideSafeWindow: deliveredOutsideSafeWindow
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
