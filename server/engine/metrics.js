/**
 * Economic & Route Metrics Module (Pure functions, no DB access)
 * 
 * Computes:
 * - Optimized trip cost and cost-per-meal.
 * - Counterfactual baseline: separate round trip per donor from NGO with same assumptions.
 * - Absolute and percentage cost, distance, and per-meal savings.
 */

const { getEstimatedDistance } = require('./geo');
const defaultFoodRules = require('../config/foodRules');

/**
 * Calculates optimized trip metrics and compares against separate-round-trip baseline.
 * 
 * @param {Object} routeResult - Output from planRoute
 * @param {Object} ngo - NGO depot with location { lat, lng }
 * @param {Object} [rules={}] - Food rules & routing configuration
 * @returns {Object} { optimized, baseline, savings, assumptionsText }
 */
function calculateMetrics(routeResult, ngo, rules = {}) {
  const defaultRules = defaultFoodRules;
  const routingConfig = rules.ROUTING_CONFIG || defaultRules.ROUTING_CONFIG || {};

  const costPerKm = routingConfig.COST_PER_KM !== undefined ? routingConfig.COST_PER_KM : 12;
  const otherTripCost = routingConfig.OTHER_TRIP_COST !== undefined ? routingConfig.OTHER_TRIP_COST : 50;
  const avgSpeedKmh = routingConfig.AVG_SPEED_KMH || 25;
  const stopServiceMinutes = routingConfig.STOP_SERVICE_MINUTES || 5;

  const optDistanceKm = Number(routeResult.totalDistanceKm) || 0;
  const meals = Number(routeResult.mealsCollected) || 0;
  const optTripCost = Number((optDistanceKm * costPerKm + otherTripCost).toFixed(2));
  const optCostPerMeal = meals > 0 ? Number((optTripCost / meals).toFixed(2)) : 0;
  const optDurationMin = Number(routeResult.durationMin) || 0;

  // Compute baseline: separate round trip per donor (NGO -> donor -> NGO)
  let baselineDistanceKm = 0;
  let baselineTripCost = 0;
  let baselineDurationMin = 0;

  const depotLoc = ngo.location;
  const stops = routeResult.stops || [];

  for (const stop of stops) {
    const donorLoc = stop.donorLocation || stop.donor?.location || stop.location;
    const oneWay = getEstimatedDistance(depotLoc, donorLoc, { avgSpeedKmh }).distanceKm;
    const roundTripKm = Number((oneWay * 2).toFixed(2));
    const roundTripCost = Number((roundTripKm * costPerKm + otherTripCost).toFixed(2));
    const roundTripTravelMin = (roundTripKm / avgSpeedKmh) * 60;
    const roundTripDuration = Math.round(roundTripTravelMin + stopServiceMinutes);

    baselineDistanceKm += roundTripKm;
    baselineTripCost += roundTripCost;
    baselineDurationMin += roundTripDuration;
  }

  baselineDistanceKm = Number(baselineDistanceKm.toFixed(2));
  baselineTripCost = Number(baselineTripCost.toFixed(2));
  const baselineCostPerMeal = meals > 0 ? Number((baselineTripCost / meals).toFixed(2)) : 0;

  // Savings
  const costAbs = Number((baselineTripCost - optTripCost).toFixed(2));
  const costPct = baselineTripCost > 0 ? Number(((costAbs / baselineTripCost) * 100).toFixed(1)) : 0;
  const savedDistanceKm = Number((baselineDistanceKm - optDistanceKm).toFixed(2));
  const perMealImprovement = Number((baselineCostPerMeal - optCostPerMeal).toFixed(2));

  const assumptionsText = `Baseline assumes each donor gets a separate round trip NGO->donor->NGO with fixed dispatch cost Rs ${otherTripCost} + Rs ${costPerKm}/km. Optimized route aggregates donors into a single collection loop.`;

  return {
    optimized: {
      distanceKm: optDistanceKm,
      tripCost: optTripCost,
      meals,
      costPerMeal: optCostPerMeal,
      durationMin: optDurationMin
    },
    baseline: {
      distanceKm: baselineDistanceKm,
      tripCost: baselineTripCost,
      meals,
      costPerMeal: baselineCostPerMeal,
      durationMin: baselineDurationMin
    },
    savings: {
      costAbs,
      costPct,
      distanceKm: savedDistanceKm,
      perMealImprovement
    },
    assumptionsText
  };
}

module.exports = {
  calculateMetrics,
  calculateTripMetrics: calculateMetrics
};
