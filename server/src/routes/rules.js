const express = require('express');
const router = express.Router();
const { FOOD_CATEGORIES, ROUTING_CONFIG, MIN_VIABLE_MEALS } = require('../../config/foodRules');

// GET /api/rules - Food safety rules, safe windows, routing config & min viable meals
router.get('/', (req, res) => {
  const safeWindows = {};
  for (const [key, val] of Object.entries(FOOD_CATEGORIES)) {
    safeWindows[key] = {
      label: val.label,
      safeWindowMinutes: val.safeWindowMinutes,
      donatable: val.donatable,
      compatibilityGroup: val.compatibilityGroup
    };
  }

  res.json({
    ok: true,
    categories: FOOD_CATEGORIES,
    safeWindows,
    routingConfig: ROUTING_CONFIG,
    minViableMeals: ROUTING_CONFIG.MIN_VIABLE_MEALS || MIN_VIABLE_MEALS || 20
  });
});

module.exports = router;
