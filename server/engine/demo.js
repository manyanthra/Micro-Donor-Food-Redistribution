/**
 * Standalone Demo Script for Explainable Decision Engine
 * 
 * Runs all pure engine stages against the hackathon seed dataset:
 * 1. Screening & Filtering (Feasible vs Excluded with explanations)
 * 2. Spatial & Temporal Clustering (with explanations)
 * 3. Route Generation (Nearest-feasible-stop heuristic)
 * 4. Economic Metrics & Baseline Comparison
 * 5. Viability Recommendation
 * 6. Dynamic Replanning Simulation
 * 
 * Run via: node server/engine/demo.js
 */

const {
  filterDonations,
  clusterDonations,
  planRoute,
  calculateMetrics,
  recommendTrip,
  replan,
  haversineKm
} = require('./index');

const { FOOD_CATEGORIES, ROUTING_CONFIG } = require('../config/foodRules');

function getSeedData(now = new Date()) {
  const collegeLat = 12.9716;
  const collegeLng = 77.5946;

  const ngoLat = Number((collegeLat + 0.0265).toFixed(6));
  const ngoLng = Number((collegeLng + 0.0085).toFixed(6));

  const ngo = {
    _id: 'ngo-asha-1',
    name: 'Asha Community Food Relief Network',
    address: 'Plot 104, Ring Road Hub, Sector 4 (3 km from College)',
    location: { lat: ngoLat, lng: ngoLng },
    nightlyCapacity: 100
  };

  const rawDonors = [
    {
      id: 'd1',
      name: 'The Daily Crust Bakery',
      type: 'bakery',
      latOffset: 0.0035,
      lngOffset: 0.0015,
      category: 'bakery_baked',
      mealsOffered: 12,
      readyDelta: -30,
      windowDelta: 480
    },
    {
      id: 'd2',
      name: 'Sunrise Artisan Bakes',
      type: 'bakery',
      latOffset: 0.0045,
      lngOffset: -0.0030,
      category: 'bakery_baked',
      mealsOffered: 10,
      readyDelta: -60,
      windowDelta: 480
    },
    {
      id: 'd3',
      name: 'Golden Oven Pastry Shop',
      type: 'bakery',
      latOffset: 0.0060,
      lngOffset: 0.0040,
      category: 'bakery_baked',
      mealsOffered: 14,
      readyDelta: -45,
      windowDelta: 480
    },
    {
      id: 'd4',
      name: 'College Corner Bakery',
      type: 'bakery',
      latOffset: -0.0025,
      lngOffset: 0.0020,
      category: 'cooked_hot', // EXPIRED TEST CASE
      mealsOffered: 8,
      readyDelta: -200,
      windowDelta: 120 // Expired 80 mins ago
    },
    {
      id: 'd5',
      name: 'Sweet Cravings Patisserie',
      type: 'bakery',
      latOffset: -0.0050,
      lngOffset: -0.0035,
      category: 'bakery_baked',
      mealsOffered: 11,
      readyDelta: -15,
      windowDelta: 480
    },
    {
      id: 'd6',
      name: 'Flour & Yeast Workshop',
      type: 'bakery',
      latOffset: 0.0075,
      lngOffset: -0.0020,
      category: 'packaged_sealed',
      mealsOffered: 15,
      readyDelta: -120,
      windowDelta: 1440
    },
    {
      id: 'd7',
      name: 'Campus Bread & Bun House',
      type: 'bakery',
      latOffset: -0.0065,
      lngOffset: 0.0050,
      category: 'bakery_baked',
      mealsOffered: 9,
      readyDelta: -40,
      windowDelta: 480
    },
    {
      id: 'd8',
      name: 'Velvet Crumbs Boulangerie',
      type: 'bakery',
      latOffset: 0.0080,
      lngOffset: 0.0065,
      category: 'bakery_baked',
      mealsOffered: 13,
      readyDelta: -90,
      windowDelta: 480
    },
    {
      id: 'd9',
      name: 'Warm Hearth Bakery',
      type: 'bakery',
      latOffset: -0.0125,
      lngOffset: -0.0055,
      category: 'bakery_baked',
      mealsOffered: 5, // TINY FAR-AWAY TEST CASE
      readyDelta: -30,
      windowDelta: 480
    },
    {
      id: 'd10',
      name: 'Campus Spice Kitchen',
      type: 'restaurant',
      latOffset: 0.0036,
      lngOffset: 0.0016,
      category: 'cooked_hot',
      mealsOffered: 12,
      readyDelta: -105,
      windowDelta: 120 // URGENT EXPIRY: 15m remaining!
    },
    {
      id: 'd11',
      name: 'Green Olive Bistro',
      type: 'restaurant',
      latOffset: -0.0040,
      lngOffset: 0.0045,
      category: 'leftover_plate', // NON-DONATABLE TEST CASE
      mealsOffered: 10,
      readyDelta: -20,
      windowDelta: 0
    },
    {
      id: 'd12',
      name: 'Taste of Bengal Diner',
      type: 'restaurant',
      latOffset: 0.0055,
      lngOffset: -0.0060,
      category: 'cooked_cold',
      mealsOffered: 8,
      readyDelta: -50,
      windowDelta: 180
    },
    {
      id: 'd13',
      name: 'Royal Biryani Point',
      type: 'restaurant',
      latOffset: 0.0020,
      lngOffset: 0.0070,
      category: 'cooked_hot',
      mealsOffered: 14,
      readyDelta: -30,
      windowDelta: 120
    },
    {
      id: 'd14',
      name: 'Aryabhatta Hostel Mess',
      type: 'hostel_mess',
      latOffset: -0.0010,
      lngOffset: -0.0030,
      category: 'cooked_hot',
      mealsOffered: 15,
      readyDelta: -40,
      windowDelta: 120
    },
    {
      id: 'd15',
      name: 'Kaveri Hall Food Court',
      type: 'hostel_mess',
      latOffset: 0.0015,
      lngOffset: 0.0025,
      category: 'raw_produce',
      mealsOffered: 15,
      readyDelta: -60,
      windowDelta: 720
    }
  ];

  const donations = rawDonors.map((d) => {
    const donorLat = Number((collegeLat + d.latOffset).toFixed(6));
    const donorLng = Number((collegeLng + d.lngOffset).toFixed(6));
    const readyAt = new Date(now.getTime() + d.readyDelta * 60 * 1000);
    const collectBy = new Date(readyAt.getTime() + d.windowDelta * 60 * 1000);

    return {
      _id: `don-${d.id}`,
      donorId: {
        _id: `donor-${d.id}`,
        name: d.name,
        type: d.type,
        location: { lat: donorLat, lng: donorLng }
      },
      mealsOffered: d.mealsOffered,
      category: d.category,
      readyAt,
      collectBy,
      status: 'AVAILABLE'
    };
  });

  return { ngo, donations };
}

function runDemo() {
  const now = new Date();
  console.log('========================================================================');
  console.log('      MICRO-DONOR FOOD REDISTRIBUTION: EXPLAINABLE DECISION ENGINE      ');
  console.log(`      Anchor Time: ${now.toLocaleTimeString()} | NGO Intake: 100 meals `);
  console.log('========================================================================\n');

  const { ngo, donations } = getSeedData(now);
  const rules = { FOOD_CATEGORIES, ROUTING_CONFIG };

  // STAGE 1: Screening & Filtering
  console.log('--- 1. SCREENING & FILTERING (filter.js) ---');
  const { feasible, excluded } = filterDonations(donations, now, rules, ngo);

  console.log(`Evaluated ${donations.length} candidate donations:`);
  console.log(`  -> Feasible: ${feasible.length}`);
  console.log(`  -> Excluded: ${excluded.length}\n`);

  console.log('Exclusion Log with Human-Readable Rationale:');
  console.table(
    excluded.map((e) => ({
      DonationId: e.donationId,
      Donor: e.donation?.donorId?.name || 'Unknown',
      Category: e.donation?.category,
      Meals: e.donation?.mealsOffered,
      Reason: e.reason
    }))
  );

  // STAGE 2: Spatial & Temporal Clustering
  console.log('\n--- 2. SPATIAL & TEMPORAL CLUSTERING (cluster.js) ---');
  const clusters = clusterDonations(feasible, 1.0, { rules, now, ngo });
  console.log(`Formed ${clusters.length} compatible cluster(s) within 1.0 km radius:\n`);

  console.table(
    clusters.map((c) => ({
      ClusterId: c.id,
      Group: c.compatibilityGroup,
      Donors: c.donorCount,
      Meals: c.totalMeals,
      SpanKm: `${c.maxSpanKm} km`,
      CommonDeadline: c.commonCollectBy.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      Explanation: c.explanation
    }))
  );

  // STAGE 3: Route Planning on Primary Cluster
  const primaryCluster = clusters[0];
  console.log(`\n--- 3. ROUTE PLANNING ON PRIMARY CLUSTER (${primaryCluster.id}) ---`);
  const route = planRoute(ngo, primaryCluster.donations, now, rules);

  console.log(`Route summary: ${route.stops.length} stops, ${route.mealsCollected} meals, ${route.totalDistanceKm} km, ${route.durationMin} min (distanceSource: ${route.distanceSource})`);
  console.table(
    route.stops.map((s) => ({
      Stop: s.order,
      Donor: s.donor?.name || s.donorId,
      Category: s.category,
      Meals: s.plannedQty,
      ETA: new Date(s.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      WaitMin: s.waitMinutes,
      LegDistKm: s.distanceFromPrevKm
    }))
  );

  if (route.excluded.length > 0) {
    console.log('\nRoute step exclusions:');
    console.table(route.excluded);
  }

  // STAGE 4: Economic Metrics & Baseline Comparison
  console.log('\n--- 4. ECONOMIC METRICS & COUNTERFACTUAL BASELINE (metrics.js) ---');
  const metrics = calculateMetrics(route, ngo, rules);

  console.log(`Assumptions: ${metrics.assumptionsText}\n`);
  console.table({
    'Optimized Route (Clustered)': {
      'Distance (km)': `${metrics.optimized.distanceKm} km`,
      'Total Cost (INR)': `Rs ${metrics.optimized.tripCost}`,
      'Meals Collected': metrics.optimized.meals,
      'Cost per Meal (INR)': `Rs ${metrics.optimized.costPerMeal}`,
      'Duration (min)': `${metrics.optimized.durationMin} min`
    },
    'Counterfactual Baseline (Separate Dispatches)': {
      'Distance (km)': `${metrics.baseline.distanceKm} km`,
      'Total Cost (INR)': `Rs ${metrics.baseline.tripCost}`,
      'Meals Collected': metrics.baseline.meals,
      'Cost per Meal (INR)': `Rs ${metrics.baseline.costPerMeal}`,
      'Duration (min)': `${metrics.baseline.durationMin} min`
    },
    'Savings / Impact': {
      'Distance (km)': `Saved ${metrics.savings.distanceKm} km`,
      'Total Cost (INR)': `Saved Rs ${metrics.savings.costAbs} (${metrics.savings.costPct}%)`,
      'Meals Collected': `${metrics.optimized.meals} meals delivered in 1 loop`,
      'Cost per Meal (INR)': `Reduced by Rs ${metrics.savings.perMealImprovement}/meal`,
      'Duration (min)': `${metrics.baseline.durationMin - metrics.optimized.durationMin} min saved`
    }
  });

  // STAGE 5: Viability Recommendation
  console.log('\n--- 5. TRIP VIABILITY RECOMMENDATION (recommend.js) ---');
  const recommendation = recommendTrip(route, metrics, { rules });
  console.log(`Recommended: ${recommendation.recommended ? 'YES ✅' : 'NO ❌'}`);
  console.log(`Explanation: ${recommendation.reason}`);
  console.log(`Threshold: Rs ${recommendation.threshold}/meal | Actual: Rs ${recommendation.costPerMeal}/meal\n`);

  // STAGE 6: Dynamic Replanning Simulation
  console.log('--- 6. DYNAMIC REPLANNING SIMULATION (replan.js) ---');
  if (route.stops.length > 2) {
    // Simulate first stop completed, second stop cancels!
    const completedStop = { ...route.stops[0], status: 'COLLECTED', collectedQty: route.stops[0].plannedQty };
    const simulatedTrip = {
      ...route,
      stops: [completedStop, ...route.stops.slice(1)]
    };
    const cancelledId = route.stops[1].donationId;
    const cancelDonorName = route.stops[1].donor?.name || cancelledId;

    console.log(`Event: Donor '${cancelDonorName}' (${cancelledId}) cancels pickup while driver is at Stop 1!`);
    const { updatedTrip, diff } = replan(simulatedTrip, cancelledId, 1, new Date(now.getTime() + 15 * 60 * 1000), rules, ngo);

    console.log(`Replan Summary: ${diff.summary}`);
    console.log(`Distance delta: ${diff.distanceDeltaKm} km | Meals delta: ${diff.mealsDelta}`);
    console.log('Updated Stops Order:');
    console.table(
      updatedTrip.stops.map((s) => ({
        Order: s.order,
        Status: s.status,
        DonationId: s.donationId,
        Donor: s.donor?.name || s.donorId,
        Meals: s.collectedQty || s.plannedQty,
        DistFromPrevKm: s.distanceFromPrevKm
      }))
    );
  }

  console.log('\n========================================================================');
  console.log('          DECISION ENGINE DEMONSTRATION EXECUTED SUCCESSFULLY           ');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runDemo();
}

module.exports = { runDemo, getSeedData };
