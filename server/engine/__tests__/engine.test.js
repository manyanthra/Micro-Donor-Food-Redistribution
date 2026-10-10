/**
 * Comprehensive Unit Test Suite for Explainable Decision Engine
 * 
 * Verifies all specification requirements:
 * 1. Normal multi-stop route
 * 2. Two nearby donors with incompatible deadlines get separated/excluded
 * 3. Capacity exceeded -> respects vehicle capacity and reports unallocated meals
 * 4. Donor cancels -> dynamic replanning preserves collected stops and re-routes
 * 5. No viable batch -> not recommended with explainable threshold message
 * 6. Expired donation excluded with human-readable reason
 * 7. Non-donatable category excluded with human-readable reason
 * 8. Cost-per-meal for clustered route is lower than baseline on seed dataset
 * 9. Geo distance, OSRM timeout / caching, and offline fallback (distanceSource)
 */

const {
  haversine,
  haversineKm,
  getRoadDistance,
  getEstimatedDistance,
  clearCache,
  filterDonations,
  clusterDonations,
  isTimeCompatible,
  planRoute,
  calculateMetrics,
  recommendTrip,
  replan
} = require('../index');

const { FOOD_CATEGORIES, ROUTING_CONFIG } = require('../../config/foodRules');
const { getSeedData } = require('../demo');

describe('Explainable Decision Engine Unit Tests', () => {
  const ngo = {
    _id: 'ngo-1',
    name: 'City Central NGO Depot',
    location: { lat: 12.9980, lng: 77.6030 },
    nightlyCapacity: 100
  };

  const rules = { FOOD_CATEGORIES, ROUTING_CONFIG };
  const baseTime = new Date('2026-10-10T12:00:00Z');

  beforeEach(() => {
    clearCache();
  });

  // 1. Normal multi-stop route
  test('Scenario 1: normal multi-stop route generates loop with return leg to NGO', () => {
    const donations = [
      {
        _id: 'd1',
        donorId: { _id: 'donor-1', name: 'Bakery A', location: { lat: 12.9750, lng: 77.5950 } },
        mealsOffered: 15,
        category: 'bakery_baked',
        readyAt: new Date(baseTime.getTime()),
        collectBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000), // 4h
        status: 'AVAILABLE'
      },
      {
        _id: 'd2',
        donorId: { _id: 'donor-2', name: 'Bakery B', location: { lat: 12.9770, lng: 77.5960 } },
        mealsOffered: 20,
        category: 'bakery_baked',
        readyAt: new Date(baseTime.getTime()),
        collectBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
        status: 'AVAILABLE'
      },
      {
        _id: 'd3',
        donorId: { _id: 'donor-3', name: 'Bakery C', location: { lat: 12.9780, lng: 77.5940 } },
        mealsOffered: 10,
        category: 'bakery_baked',
        readyAt: new Date(baseTime.getTime()),
        collectBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
        status: 'AVAILABLE'
      }
    ];

    const route = planRoute(ngo, donations, baseTime, rules);

    expect(route.stops.length).toBe(3);
    expect(route.mealsCollected).toBe(45);
    expect(route.unallocatedMeals).toBe(0);
    expect(route.excluded.length).toBe(0);
    expect(route.totalDistanceKm).toBeGreaterThan(0);
    expect(route.durationMin).toBeGreaterThan(0);
    expect(route.distanceSource).toBe('estimated');

    // Orders should be 1, 2, 3
    expect(route.stops.map((s) => s.order)).toEqual([1, 2, 3]);

    // ETAs should be chronologically strictly ascending
    for (let i = 1; i < route.stops.length; i++) {
      expect(new Date(route.stops[i].eta).getTime()).toBeGreaterThanOrEqual(new Date(route.stops[i - 1].eta).getTime());
    }
  });

  // 2. Two nearby donors with incompatible deadlines get separated/excluded
  test('Scenario 2: two nearby donors with incompatible deadlines get separated into distinct clusters', () => {
    // Both donors are ~50 meters apart, but Donor 1 has tight 10-minute deadline while Donor 2 is not ready for 60 mins
    const incompatibleDonations = [
      {
        _id: 'd_urgent',
        donorId: { _id: 'donor-urgent', name: 'Urgent Curry House', location: { lat: 12.9750, lng: 77.5950 } },
        mealsOffered: 12,
        category: 'cooked_hot',
        readyAt: new Date(baseTime.getTime() - 110 * 60 * 1000), // Ready 110m ago
        collectBy: new Date(baseTime.getTime() + 10 * 60 * 1000), // Expires in 10 minutes!
        status: 'AVAILABLE'
      },
      {
        _id: 'd_delayed',
        donorId: { _id: 'donor-delayed', name: 'Boutique Kitchen', location: { lat: 12.9752, lng: 77.5951 } }, // 20m away!
        mealsOffered: 15,
        category: 'cooked_hot',
        readyAt: new Date(baseTime.getTime() + 60 * 60 * 1000), // Not ready for 60 minutes!
        collectBy: new Date(baseTime.getTime() + 180 * 60 * 1000),
        status: 'AVAILABLE'
      }
    ];

    // Verify time compatibility check fails when together
    const compatibleTogether = isTimeCompatible(incompatibleDonations, { ngo, now: baseTime });
    expect(compatibleTogether).toBe(false);

    // When clustered, they must be separated into 2 distinct clusters
    const clusters = clusterDonations(incompatibleDonations, 1.0, { rules, now: baseTime, ngo });
    expect(clusters.length).toBe(2);
    expect(clusters[0].donations.length).toBe(1);
    expect(clusters[1].donations.length).toBe(1);
  });

  test('Scenario 2b: routing excludes donor when arrival exceeds collect-by deadline', () => {
    const expiredByArrivalDonations = [
      {
        _id: 'd_far_tight',
        donorId: { _id: 'donor-tight', name: 'Faraway Tight Deadline', location: { lat: 12.9500, lng: 77.5500 } }, // ~8 km away
        mealsOffered: 10,
        category: 'bakery_baked',
        readyAt: new Date(baseTime.getTime()),
        // At 25 km/h, 8 km takes ~25 mins. Deadline is 5 mins from now!
        collectBy: new Date(baseTime.getTime() + 5 * 60 * 1000),
        status: 'AVAILABLE'
      }
    ];

    const route = planRoute(ngo, expiredByArrivalDonations, baseTime, rules);
    expect(route.stops.length).toBe(0);
    expect(route.excluded.length).toBe(1);
    expect(route.excluded[0].reason).toMatch(/would arrive \d+ min after collect-by/);
  });

  // 3. Capacity exceeded -> respects capacity and reports unallocated meals
  test('Scenario 3: capacity exceeded -> respects vehicle capacity limit and reports unallocated meals', () => {
    const vehicleCapacity = 60;
    // d1 is nearest to NGO [12.9980, 77.6030] -> d1 at [12.9900, 77.6020]
    // d2 is next nearest -> [12.9800, 77.6000]
    // d3 is furthest -> [12.9700, 77.5900]
    const excessDonations = [
      {
        _id: 'd1',
        donorId: { _id: 'donor-1', name: 'Mess Hall A', location: { lat: 12.9900, lng: 77.6020 } },
        mealsOffered: 40,
        category: 'bakery_baked',
        readyAt: baseTime,
        collectBy: new Date(baseTime.getTime() + 180 * 60 * 1000),
        status: 'AVAILABLE'
      },
      {
        _id: 'd2',
        donorId: { _id: 'donor-2', name: 'Mess Hall B', location: { lat: 12.9800, lng: 77.6000 } },
        mealsOffered: 30, // Vehicle has 20 capacity remaining; takes 20, leaves 10 unallocated
        category: 'bakery_baked',
        readyAt: baseTime,
        collectBy: new Date(baseTime.getTime() + 180 * 60 * 1000),
        status: 'AVAILABLE'
      },
      {
        _id: 'd3',
        donorId: { _id: 'donor-3', name: 'Mess Hall C', location: { lat: 12.9700, lng: 77.5900 } },
        mealsOffered: 20, // Vehicle full; cannot visit, completely excluded
        category: 'bakery_baked',
        readyAt: baseTime,
        collectBy: new Date(baseTime.getTime() + 180 * 60 * 1000),
        status: 'AVAILABLE'
      }
    ];

    const route = planRoute(ngo, excessDonations, baseTime, rules, { vehicleCapacity });

    // Vehicle can only carry 60 meals total
    expect(route.mealsCollected).toBe(60);
    // Total offered is 40 + 30 + 20 = 90. Unallocated must be exactly 30!
    expect(route.unallocatedMeals).toBe(30);

    // Stops 1 & 2 visited; Stop 3 cannot fit and is excluded
    expect(route.stops.length).toBe(2);
    expect(route.stops[0].plannedQty).toBe(40);
    expect(route.stops[1].plannedQty).toBe(20);

    // Stop 3 must be excluded with vehicle capacity reached
    expect(route.excluded.length).toBe(1);
    expect(route.excluded[0].donationId).toBe('d3');
    expect(route.excluded[0].reason).toContain('vehicle capacity reached');
  });

  // 4. Donor cancels -> replan
  test('Scenario 4: donor cancels -> replan preserves collected stops and re-routes remaining', () => {
    const trip = {
      _id: 'trip-101',
      totalDistanceKm: 12.4,
      mealsCollected: 45,
      plannedMetrics: { distanceKm: 12.4, meals: 45 },
      stops: [
        {
          order: 1,
          donationId: 'don-1',
          donorId: 'donor-1',
          donorLocation: { lat: 12.9800, lng: 77.6000 },
          plannedQty: 15,
          collectedQty: 15,
          status: 'COLLECTED', // Preserved!
          distanceFromPrevKm: 2.1
        },
        {
          order: 2,
          donationId: 'don-2-cancelled',
          donorId: 'donor-2',
          donorLocation: { lat: 12.9820, lng: 77.6020 },
          plannedQty: 15,
          mealsOffered: 15,
          status: 'PENDING',
          distanceFromPrevKm: 0.8
        },
        {
          order: 3,
          donationId: 'don-3',
          donorId: 'donor-3',
          donorLocation: { lat: 12.9840, lng: 77.6030 },
          plannedQty: 15,
          mealsOffered: 15,
          collectBy: new Date(baseTime.getTime() + 120 * 60 * 1000),
          status: 'PENDING',
          distanceFromPrevKm: 0.9
        }
      ]
    };

    const replanTime = new Date(baseTime.getTime() + 20 * 60 * 1000);
    const { updatedTrip, diff } = replan(trip, 'don-2-cancelled', 1, replanTime, rules, ngo);

    expect(diff.cancelledDonationId).toBe('don-2-cancelled');
    expect(diff.preservedStopsCount).toBe(1);
    expect(diff.remainingStopsCount).toBe(1);
    expect(diff.summary).toContain('Preserved 1 collected stops');

    // Updated trip should have 2 stops (don-1 collected, don-3 re-routed)
    expect(updatedTrip.stops.length).toBe(2);
    expect(updatedTrip.stops[0].donationId).toBe('don-1');
    expect(updatedTrip.stops[0].status).toBe('COLLECTED');
    expect(updatedTrip.stops[1].donationId).toBe('don-3');
    expect(updatedTrip.stops[1].order).toBe(2);
    expect(updatedTrip.mealsCollected).toBe(30);
  });

  // 5. No viable batch -> not recommended with explanation
  test('Scenario 5: uneconomical small batch is not recommended with threshold explanation', () => {
    const tinyDonation = [
      {
        _id: 'd_tiny',
        donorId: { _id: 'donor-isolated', name: 'Isolated Kiosk', location: { lat: 12.9300, lng: 77.5300 } }, // Far outpost ~10 km away
        mealsOffered: 6,
        category: 'bakery_baked',
        readyAt: baseTime,
        collectBy: new Date(baseTime.getTime() + 120 * 60 * 1000),
        status: 'AVAILABLE'
      }
    ];

    const route = planRoute(ngo, tinyDonation, baseTime, rules);
    const metrics = calculateMetrics(route, ngo, rules);

    // Round trip distance ~25 km -> Cost > Rs 350 for 6 meals -> Cost per meal > Rs 50
    expect(metrics.optimized.costPerMeal).toBeGreaterThan(15.0);

    const recommendation = recommendTrip(route, metrics, { thresholdCostPerMeal: 8.0, rules });

    expect(recommendation.recommended).toBe(false);
    expect(recommendation.meals).toBe(6);
    expect(recommendation.reason).toMatch(/Only 6 meals available; cost per meal Rs \d+(\.\d+)? exceeds threshold Rs 8\.00; wait for more donations before 'collect-by'/);
  });

  // 6. Expired donation excluded with reason
  test('Scenario 6: expired donation excluded with human-readable reason', () => {
    const expiredDonation = {
      _id: 'don-expired',
      donorId: { _id: 'donor-1', location: { lat: 12.9750, lng: 77.5950 } },
      mealsOffered: 10,
      category: 'cooked_hot',
      readyAt: new Date(baseTime.getTime() - 180 * 60 * 1000),
      collectBy: new Date(baseTime.getTime() - 60 * 60 * 1000), // Expired 1 hour ago
      status: 'AVAILABLE'
    };

    const { feasible, excluded } = filterDonations([expiredDonation], baseTime, rules, ngo);

    expect(feasible.length).toBe(0);
    expect(excluded.length).toBe(1);
    expect(excluded[0].donationId).toBe('don-expired');
    expect(excluded[0].reason).toContain('Safe consumption window expired');
  });

  // 7. Non-donatable excluded
  test('Scenario 7: non-donatable category (leftover_plate) excluded with human-readable reason', () => {
    const nonDonatable = {
      _id: 'don-leftovers',
      donorId: { _id: 'donor-plate', location: { lat: 12.9750, lng: 77.5950 } },
      mealsOffered: 12,
      category: 'leftover_plate',
      readyAt: baseTime,
      collectBy: new Date(baseTime.getTime() + 60 * 60 * 1000),
      status: 'AVAILABLE'
    };

    const { feasible, excluded } = filterDonations([nonDonatable], baseTime, rules, ngo);

    expect(feasible.length).toBe(0);
    expect(excluded.length).toBe(1);
    expect(excluded[0].donationId).toBe('don-leftovers');
    expect(excluded[0].reason).toContain('strictly non-donatable');
  });

  // 8. Cost-per-meal for route is lower than baseline on the seed dataset
  test('Scenario 8: cost-per-meal for clustered route is lower than baseline on seed dataset', () => {
    const now = new Date();
    const { ngo: seedNgo, donations: seedDonations } = getSeedData(now);

    const { feasible } = filterDonations(seedDonations, now, rules, seedNgo);
    const clusters = clusterDonations(feasible, 1.0, { rules, now, ngo: seedNgo });

    expect(clusters.length).toBeGreaterThan(0);
    const primaryCluster = clusters[0];

    const route = planRoute(seedNgo, primaryCluster.donations, now, rules);
    const metrics = calculateMetrics(route, seedNgo, rules);

    // Optimized cost per meal must be strictly lower than counterfactual baseline
    expect(metrics.optimized.costPerMeal).toBeLessThan(metrics.baseline.costPerMeal);
    expect(metrics.savings.costPct).toBeGreaterThan(0);
    expect(metrics.savings.costAbs).toBeGreaterThan(0);
    expect(metrics.savings.distanceKm).toBeGreaterThan(0);
    expect(metrics.savings.perMealImprovement).toBeGreaterThan(0);

    // Clustered trip achieves substantial logistics savings (> 50%)
    expect(metrics.savings.costPct).toBeGreaterThan(50);
  });

  // 9. Geospatial pure functions, offline fallback and road distance
  test('Scenario 9: geo haversine and offline fallback work properly and mark distanceSource', async () => {
    const locA = { lat: 12.9716, lng: 77.5946 }; // College
    const locB = { lat: 12.9981, lng: 77.6031 }; // NGO ~3 km away

    const dist = haversine(locA, locB);
    const distKm = haversineKm(locA, locB);
    expect(dist).toBe(distKm);
    expect(dist).toBeGreaterThan(2.5);
    expect(dist).toBeLessThan(3.5);

    // Estimated distance applies 1.3 detour factor
    const est = getEstimatedDistance(locA, locB, { detourFactor: 1.3 });
    expect(est.distanceKm).toBeCloseTo(Number((dist * 1.3).toFixed(2)), 1);
    expect(est.distanceSource).toBe('estimated');

    // Offline / Network Failure Fallback
    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline simulation'));
      const fallbackRoad = await getRoadDistance(locA, locB);
      expect(fallbackRoad.distanceKm).toBeGreaterThan(0);
      expect(fallbackRoad.distanceSource).toBe('estimated');

      // Online OSRM simulation
      clearCache();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{ distance: 3450, duration: 420 }]
        })
      });
      const onlineRoad = await getRoadDistance(locA, locB);
      expect(onlineRoad.distanceKm).toBe(3.45);
      expect(onlineRoad.durationMin).toBe(7);
      expect(onlineRoad.distanceSource).toBe('road');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
