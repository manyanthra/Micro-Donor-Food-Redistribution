/**
 * Trip Recommendation Module (Pure functions, no DB access)
 * 
 * Decides whether a planned collection trip is recommended or should be deferred.
 * If only a small uneconomical batch exists where cost per meal exceeds the configurable
 * viability threshold, returns recommended: false with an actionable explanation:
 * "Only 6 meals available; cost per meal Rs X exceeds threshold Rs Y; wait for more donations before 'collect-by' of Z"
 */

const defaultFoodRules = require('../config/foodRules');

/**
 * Evaluates whether a planned collection trip is economically recommended.
 * 
 * @param {Object} routeResult - Result from planRoute
 * @param {Object} metricsResult - Result from calculateMetrics
 * @param {Object} [options={}] - Configurable options { thresholdCostPerMeal, rules }
 * @returns {Object} { recommended: boolean, reason: string, costPerMeal: number, threshold: number, meals: number }
 */
function recommendTrip(routeResult, metricsResult, options = {}) {
  const defaultRules = defaultFoodRules;
  const routingConfig = options.rules?.ROUTING_CONFIG || defaultRules.ROUTING_CONFIG || {};

  const threshold = options.thresholdCostPerMeal !== undefined
    ? Number(options.thresholdCostPerMeal)
    : (routingConfig.MIN_VIABLE_COST_PER_MEAL || 8.0);

  const stops = routeResult?.stops || [];
  const meals = metricsResult?.optimized?.meals !== undefined
    ? metricsResult.optimized.meals
    : routeResult?.mealsCollected || 0;
  const costPerMeal = metricsResult?.optimized?.costPerMeal !== undefined
    ? metricsResult.optimized.costPerMeal
    : 0;

  if (stops.length === 0 || meals === 0) {
    return {
      recommended: false,
      reason: 'No feasible donations available for collection.',
      costPerMeal: 0,
      threshold,
      meals: 0
    };
  }

  // Find earliest collectBy among stops
  let earliestCollectByMs = Infinity;
  for (const stop of stops) {
    const rawDate = stop.collectBy || stop.donation?.collectBy || stop.eta;
    if (rawDate) {
      const ms = new Date(rawDate).getTime();
      if (!isNaN(ms) && ms < earliestCollectByMs) {
        earliestCollectByMs = ms;
      }
    }
  }

  const earliestDate = earliestCollectByMs !== Infinity ? new Date(earliestCollectByMs) : new Date();
  const timeStr = earliestDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (costPerMeal > threshold) {
    const reason = `Only ${meals} meals available; cost per meal Rs ${costPerMeal.toFixed(2)} exceeds threshold Rs ${threshold.toFixed(2)}; wait for more donations before 'collect-by' of ${timeStr}`;
    return {
      recommended: false,
      reason,
      costPerMeal,
      threshold,
      meals,
      earliestCollectBy: earliestDate
    };
  }

  return {
    recommended: true,
    reason: `Trip is economically viable at Rs ${costPerMeal.toFixed(2)}/meal (below threshold Rs ${threshold.toFixed(2)}/meal).`,
    costPerMeal,
    threshold,
    meals,
    earliestCollectBy: earliestDate
  };
}

module.exports = {
  recommendTrip,
  evaluateTripRecommendation: recommendTrip
};
