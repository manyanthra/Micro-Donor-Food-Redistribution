/**
 * Food Safety & Routing Configuration
 * 
 * NOTE: The categories and safe window durations below are DEMO SIMULATION VALUES
 * tailored for prototype testing and hackathon demonstration purposes only.
 * They are NOT official or legal food-safety guidance.
 */

const FOOD_CATEGORIES = {
  cooked_hot: {
    key: 'cooked_hot',
    label: 'Cooked Hot Food',
    safeWindowMinutes: 120, // 2 hours
    compatibilityGroup: 'cooked',
    donatable: true,
    description: 'Hot meals freshly prepared (e.g., curries, rice, dal).'
  },
  cooked_cold: {
    key: 'cooked_cold',
    label: 'Cooked Chilled Food',
    safeWindowMinutes: 180, // 3 hours
    compatibilityGroup: 'cooked',
    donatable: true,
    description: 'Cooked food held under chilled / refrigerated conditions.'
  },
  bakery_baked: {
    key: 'bakery_baked',
    label: 'Bakery / Baked Goods',
    safeWindowMinutes: 480, // 8 hours
    compatibilityGroup: 'bakery',
    donatable: true,
    description: 'Breads, buns, dry pastries without dairy cream.'
  },
  packaged_sealed: {
    key: 'packaged_sealed',
    label: 'Packaged & Sealed Food',
    safeWindowMinutes: 1440, // 24 hours
    compatibilityGroup: 'packaged',
    donatable: true,
    description: 'Intact factory or commercial sealed food items.'
  },
  raw_produce: {
    key: 'raw_produce',
    label: 'Raw Fresh Produce',
    safeWindowMinutes: 720, // 12 hours
    compatibilityGroup: 'produce',
    donatable: true,
    description: 'Uncut fresh fruits and vegetables.'
  },
  leftover_plate: {
    key: 'leftover_plate',
    label: 'Leftover Plate Scrapings',
    safeWindowMinutes: 0,
    compatibilityGroup: 'cooked',
    donatable: false,
    description: 'Partially eaten plate food. STRICTLY NON-DONATABLE for hygiene reasons.'
  }
};

const ROUTING_CONFIG = {
  AVG_SPEED_KMH: 25,
  STOP_SERVICE_MINUTES: 5,
  COST_PER_KM: 12, // in INR
  OTHER_TRIP_COST: 50, // fixed dispatch cost per trip in INR
  VEHICLE_CAPACITY_MEALS: 60,
  NGO_NIGHTLY_CAPACITY_MEALS: 100,
  CLUSTER_RADIUS_KM: 1.0,
  MIN_VIABLE_COST_PER_MEAL: 8.0, // threshold in INR
  BASELINE_TEXT: 'each donor gets a separate round trip NGO->donor->NGO'
};

module.exports = {
  FOOD_CATEGORIES,
  ROUTING_CONFIG
};
