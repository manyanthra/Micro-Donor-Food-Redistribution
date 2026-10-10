/**
 * Trip Dispatch Evaluation Module (Pure functions, no DB access)
 * 
 * Determines whether a planned trip meets the mandatory operational constraints:
 * - Cluster reaches a viable size (MIN_VIABLE_MEALS, default 20, configurable via env/config).
 * - Every item in the cluster can reach the receiver (NGO) within its safe window (slackMin >= 0).
 * - Left-out items are reported with specific reasons.
 */

const defaultFoodRules = require('../config/foodRules');

/**
 * Evaluates whether a planned route is dispatchable.
 * 
 * @param {Object} plan - Route result containing stops and excluded/leftOut
 * @param {Object} [rules={}] - Food rules & routing configuration
 * @returns {{ dispatchable: boolean, totalMeals: number, minViableMeals: number, shortfall: number, reason: string, leftOut: Array }}
 */
function evaluateDispatch(plan = {}, rules = {}) {
  const defaultRules = defaultFoodRules;
  const routingConfig = rules.ROUTING_CONFIG || defaultRules.ROUTING_CONFIG || {};

  const minViableMeals = rules.minViableMeals !== undefined
    ? Number(rules.minViableMeals)
    : (routingConfig.MIN_VIABLE_MEALS !== undefined
        ? Number(routingConfig.MIN_VIABLE_MEALS)
        : parseInt(process.env.MIN_VIABLE_MEALS || '20', 10));

  const stops = plan.stops || [];
  const leftOut = plan.excluded || plan.leftOut || [];
  const totalMeals = stops.reduce((sum, s) => sum + (Number(s.plannedQty) || Number(s.mealsOffered) || 0), 0);
  const shortfall = Math.max(0, minViableMeals - totalMeals);

  // Check slackMin >= 0 on every stop
  const hasNegativeSlack = stops.some((s) => s.slackMin !== undefined && s.slackMin < 0);
  const hasViableMeals = totalMeals >= minViableMeals;
  const hasStops = stops.length > 0;

  const dispatchable = hasViableMeals && hasStops && !hasNegativeSlack;

  const formatHHMM = (d) => {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '--:--';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  let earliestDeliverByMs = Infinity;
  for (const stop of stops) {
    const raw = stop.deliverBy || stop.collectBy;
    if (raw) {
      const ms = new Date(raw).getTime();
      if (!isNaN(ms) && ms < earliestDeliverByMs) earliestDeliverByMs = ms;
    }
  }
  for (const item of leftOut) {
    const raw = item.deliverBy || item.donation?.deliverBy || item.donation?.collectBy;
    if (raw) {
      const ms = new Date(raw).getTime();
      if (!isNaN(ms) && ms < earliestDeliverByMs) earliestDeliverByMs = ms;
    }
  }

  const earliestDeliverByStr = earliestDeliverByMs !== Infinity
    ? formatHHMM(new Date(earliestDeliverByMs))
    : '--:--';

  let reason = '';
  if (dispatchable) {
    reason = `Dispatchable: viable cluster of ${totalMeals} meals (meets >= ${minViableMeals} minimum requirement) and all stops can reach the NGO within safe window.`;
  } else {
    if (stops.length === 0) {
      reason = 'Not dispatchable: no feasible donations available to form a collection trip.';
    } else if (hasNegativeSlack) {
      reason = 'Not dispatchable: one or more items cannot reach the NGO within safe window.';
    } else if (totalMeals < minViableMeals) {
      if (leftOut.length > 0) {
        reason = `Not dispatchable: only ${totalMeals} meals after leaving out ${leftOut.length} items that could not reach the NGO in time; ${minViableMeals} required. Wait for more donations (earliest deliver-by ${earliestDeliverByStr}).`;
      } else {
        reason = `Not dispatchable: only ${totalMeals} meals available; ${minViableMeals} required. Wait for more donations (earliest deliver-by ${earliestDeliverByStr}).`;
      }
    } else {
      reason = 'Not dispatchable: route constraints violated.';
    }
  }

  return {
    dispatchable,
    totalMeals,
    minViableMeals,
    shortfall,
    reason,
    leftOut
  };
}

module.exports = {
  evaluateDispatch
};
