const { FOOD_CATEGORIES, ROUTING_CONFIG } = require('../config/foodRules');
const { screenDonations, clusterEligibleDonations } = require('../src/services/clusteringService');
const { generateCollectionRoute, calculateActualMetrics } = require('../src/services/routingService');

describe('Food Safety Rules & Routing Configuration', () => {
  test('foodRules contains expected categories and safe windows', () => {
    expect(FOOD_CATEGORIES.cooked_hot).toBeDefined();
    expect(FOOD_CATEGORIES.cooked_hot.safeWindowMinutes).toBe(120);
    expect(FOOD_CATEGORIES.cooked_hot.donatable).toBe(true);

    expect(FOOD_CATEGORIES.bakery_baked).toBeDefined();
    expect(FOOD_CATEGORIES.bakery_baked.safeWindowMinutes).toBe(480);
    expect(FOOD_CATEGORIES.bakery_baked.donatable).toBe(true);

    expect(FOOD_CATEGORIES.leftover_plate).toBeDefined();
    expect(FOOD_CATEGORIES.leftover_plate.donatable).toBe(false);
  });

  test('routing config has specified parameters and baseline text', () => {
    expect(ROUTING_CONFIG.AVG_SPEED_KMH).toBe(25);
    expect(ROUTING_CONFIG.STOP_SERVICE_MINUTES).toBe(5);
    expect(ROUTING_CONFIG.COST_PER_KM).toBe(12);
    expect(ROUTING_CONFIG.OTHER_TRIP_COST).toBe(50);
    expect(ROUTING_CONFIG.VEHICLE_CAPACITY_MEALS).toBe(60);
    expect(ROUTING_CONFIG.CLUSTER_RADIUS_KM).toBe(1.0);
    expect(ROUTING_CONFIG.BASELINE_TEXT).toContain('each donor gets a separate round trip NGO->donor->NGO');
  });
});

describe('Clustering & Screening Service', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  test('screens out non-donatable and expired donations', () => {
    const sampleDonations = [
      {
        _id: 'don1',
        status: 'AVAILABLE',
        category: 'bakery_baked',
        readyAt: new Date('2026-10-10T11:00:00Z'),
        collectBy: new Date('2026-10-10T19:00:00Z'), // valid
        mealsOffered: 10
      },
      {
        _id: 'don2',
        status: 'AVAILABLE',
        category: 'leftover_plate', // non-donatable
        readyAt: new Date('2026-10-10T11:00:00Z'),
        collectBy: new Date('2026-10-10T13:00:00Z'),
        mealsOffered: 8
      },
      {
        _id: 'don3',
        status: 'AVAILABLE',
        category: 'cooked_hot',
        readyAt: new Date('2026-10-10T08:00:00Z'),
        collectBy: new Date('2026-10-10T10:00:00Z'), // expired in past
        mealsOffered: 12
      }
    ];

    const { eligible, excluded } = screenDonations(sampleDonations, now);

    expect(eligible.length).toBe(1);
    expect(eligible[0]._id).toBe('don1');

    expect(excluded.length).toBe(2);
    expect(excluded.some((e) => e.reason.includes('non-donatable'))).toBe(true);
    expect(excluded.some((e) => e.reason.includes('expired'))).toBe(true);
  });

  test('clusters donors within 1.0 km radius', () => {
    // College center: [12.9716, 77.5946]
    const closeDonations = [
      {
        _id: 'd1',
        mealsOffered: 10,
        donorId: { location: { lat: 12.9720, lng: 77.5950 } } // ~50m
      },
      {
        _id: 'd2',
        mealsOffered: 15,
        donorId: { location: { lat: 12.9730, lng: 77.5960 } } // ~200m from d1
      },
      {
        _id: 'd_far',
        mealsOffered: 5,
        donorId: { location: { lat: 12.9500, lng: 77.5700 } } // ~3.5km away
      }
    ];

    const clusters = clusterEligibleDonations(closeDonations, 1.0);
    expect(clusters.length).toBe(2);
    // Primary cluster should contain the 2 close donors
    expect(clusters[0].length).toBe(2);
    expect(clusters[1].length).toBe(1);
  });
});

describe('Route Generation & Economic Comparison', () => {
  const ngo = {
    name: 'Asha NGO',
    location: { lat: 12.9980, lng: 77.6030 } // ~3km North of college
  };

  const sampleDonations = [
    {
      _id: 'don1',
      mealsOffered: 15,
      category: 'cooked_hot',
      collectBy: new Date(Date.now() + 180 * 60 * 1000), // 3h safe window
      donorId: {
        _id: 'donor1',
        name: 'Bakery A',
        location: { lat: 12.9750, lng: 77.5950 }
      }
    },
    {
      _id: 'don2',
      mealsOffered: 20,
      category: 'bakery_baked',
      collectBy: new Date(Date.now() + 300 * 60 * 1000),
      donorId: {
        _id: 'donor2',
        name: 'Bakery B',
        location: { lat: 12.9760, lng: 77.5960 }
      }
    }
  ];

  test('generates planned route and compares with baseline round trips', () => {
    const result = generateCollectionRoute(ngo, sampleDonations);

    expect(result.stops.length).toBe(2);
    expect(result.plannedMetrics.meals).toBe(35);
    expect(result.plannedMetrics.distanceKm).toBeGreaterThan(0);
    expect(result.plannedMetrics.cost).toBeGreaterThan(0);

    // Baseline should be strictly more expensive and longer distance than single clustered loop
    expect(result.baselineMetrics.distanceKm).toBeGreaterThan(result.plannedMetrics.distanceKm);
    expect(result.baselineMetrics.cost).toBeGreaterThan(result.plannedMetrics.cost);
  });

  test('respects partial collection quantity in actual metrics calculation', () => {
    // Offered 10, driver collected 7
    const trip = {
      plannedMetrics: { distanceKm: 8.5, durationMin: 28 },
      stops: [
        {
          order: 1,
          plannedQty: 10,
          collectedQty: 7, // Partial collection!
          status: 'COLLECTED'
        }
      ],
      deliveredQty: 7,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
      completedAt: new Date()
    };

    const actual = calculateActualMetrics(trip);
    // Must count 7 everywhere, NEVER 10
    expect(actual.meals).toBe(7);
    expect(actual.costPerMeal).toBe(Number(((trip.plannedMetrics.distanceKm * 12 + 50) / 7).toFixed(2)));
  });
});
