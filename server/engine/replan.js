/**
 * Dynamic Replanning Module (Pure functions, no DB access)
 * 
 * Re-runs routing when a disruption occurs (e.g. donor cancellation).
 * Preserves already COLLECTED stops and re-routes remaining stops
 * from the vehicle's current position and time, respecting remaining capacity
 * and deadlines.
 */

const { getEstimatedDistance } = require('./geo');
const { getDonationLocation } = require('./route');
const defaultFoodRules = require('../config/foodRules');

/**
 * Dynamically re-routes a trip after a donor cancellation.
 * 
 * @param {Object} trip - Existing trip object with stops and plannedMetrics
 * @param {string} cancelledDonationId - ID of cancelled donation
 * @param {number} [currentStopIndex=0] - Current index of driver progress
 * @param {Date|string} [now=new Date()] - Current timestamp
 * @param {Object} [rules={}] - Food rules & routing configuration
 * @param {Object} [ngo=null] - NGO depot object
 * @returns {{ updatedTrip: Object, diff: Object }}
 */
function replan(trip, cancelledDonationId, currentStopIndex = 0, now = new Date(), rules = {}, ngo = null) {
  const defaultRules = defaultFoodRules;
  const routingConfig = rules.ROUTING_CONFIG || defaultRules.ROUTING_CONFIG || {};

  const vehicleCapacity = routingConfig.VEHICLE_CAPACITY_MEALS || 60;
  const avgSpeedKmh = routingConfig.AVG_SPEED_KMH || 25;
  const stopServiceMinutes = routingConfig.STOP_SERVICE_MINUTES || 5;

  const effectiveNgo = ngo || trip.ngo || trip.ngoId || { location: { lat: 12.9980, lng: 77.6030 } };
  const depotLoc = effectiveNgo.location;

  const currentTime = now instanceof Date ? now : new Date(now);
  const oldStops = trip.stops || [];
  const targetIdStr = String(cancelledDonationId);

  // 1. Separate preserved stops (already COLLECTED or prior to currentStopIndex)
  const preservedStops = [];
  const remainingCandidates = [];

  for (let i = 0; i < oldStops.length; i++) {
    const stop = oldStops[i];
    const stopDonationId = String(stop.donationId?._id || stop.donationId?.id || stop.donationId);

    // If stop was already completed/collected, or driver already passed it
    if (stop.status === 'COLLECTED' || (i < currentStopIndex && stopDonationId !== targetIdStr)) {
      preservedStops.push(stop);
    } else if (stopDonationId === targetIdStr) {
      // This is the cancelled donation -> drop it
      continue;
    } else {
      // Candidate to be re-routed
      remainingCandidates.push(stop);
    }
  }

  // 2. Determine current vehicle position, load, and capacity
  let currentLoc = depotLoc;
  let currentLoad = 0;

  if (preservedStops.length > 0) {
    const lastPreserved = preservedStops[preservedStops.length - 1];
    currentLoc = lastPreserved.donorLocation || getDonationLocation(lastPreserved);
    for (const p of preservedStops) {
      currentLoad += (p.collectedQty || p.plannedQty || 0);
    }
  }

  let remainingCapacity = Math.max(0, vehicleCapacity - currentLoad);

  // 3. Re-run nearest-feasible routing for remaining candidate stops
  const unvisited = [...remainingCandidates];
  const newStops = [];
  const excluded = [];
  let unallocatedMeals = 0;
  let runningLoc = { ...currentLoc };
  let runningTime = new Date(currentTime.getTime());
  let runningLegDistance = 0;

  while (unvisited.length > 0) {
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestArrivalEta = null;
    let bestServiceEndTime = null;
    let bestWaitMinutes = 0;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      const candLoc = candidate.donorLocation || getDonationLocation(candidate);

      if (remainingCapacity <= 0) continue;

      const distInfo = getEstimatedDistance(runningLoc, candLoc, { avgSpeedKmh });
      const legDist = distInfo.distanceKm;
      const travelMins = (legDist / avgSpeedKmh) * 60;
      const arrivalEta = new Date(runningTime.getTime() + travelMins * 60 * 1000);

      const readyAtDate = candidate.readyAt ? new Date(candidate.readyAt) : arrivalEta;
      let waitMinutes = 0;
      let serviceStartTime = arrivalEta;
      if (arrivalEta < readyAtDate) {
        waitMinutes = Math.max(0, Math.round((readyAtDate.getTime() - arrivalEta.getTime()) / 60000));
        serviceStartTime = readyAtDate;
      }

      const serviceEndTime = new Date(serviceStartTime.getTime() + stopServiceMinutes * 60 * 1000);
      const collectByDate = new Date(candidate.collectBy || candidate.donation?.collectBy || Infinity);

      if (serviceEndTime > collectByDate) continue;

      if (legDist < bestDist) {
        bestDist = legDist;
        bestIdx = i;
        bestArrivalEta = arrivalEta;
        bestServiceEndTime = serviceEndTime;
        bestWaitMinutes = waitMinutes;
      }
    }

    if (bestIdx === -1) {
      for (const remaining of unvisited) {
        const idStr = String(remaining.donationId?._id || remaining.donationId?.id || remaining.donationId);
        excluded.push({
          donationId: idStr,
          reason: remainingCapacity <= 0 ? 'vehicle capacity reached' : 'deadline violated during replanning'
        });
        unallocatedMeals += (remaining.mealsOffered || remaining.plannedQty || 0);
      }
      break;
    }

    const selected = unvisited.splice(bestIdx, 1)[0];
    const offered = Number(selected.mealsOffered || selected.plannedQty) || 0;
    const plannedQty = Math.min(offered, remainingCapacity);

    if (offered > remainingCapacity) {
      unallocatedMeals += (offered - remainingCapacity);
    }

    remainingCapacity -= plannedQty;
    runningLegDistance += bestDist;

    const candLoc = selected.donorLocation || getDonationLocation(selected);
    const donationId = String(selected.donationId?._id || selected.donationId?.id || selected.donationId);
    const donorId = selected.donorId?._id || selected.donorId?.id || selected.donorId;

    newStops.push({
      ...selected,
      donationId,
      donorId,
      donorLocation: candLoc,
      plannedQty,
      order: preservedStops.length + newStops.length + 1,
      eta: bestArrivalEta,
      serviceEndTime: bestServiceEndTime,
      waitMinutes: bestWaitMinutes,
      distanceFromPrevKm: Number(bestDist.toFixed(2)),
      status: 'PENDING'
    });

    runningTime = bestServiceEndTime;
    runningLoc = candLoc;
  }

  // 4. Return leg to NGO
  let returnDistKm = 0;
  if (preservedStops.length + newStops.length > 0) {
    returnDistKm = getEstimatedDistance(runningLoc, depotLoc, { avgSpeedKmh }).distanceKm;
    const returnTravelMins = (returnDistKm / avgSpeedKmh) * 60;
    runningTime = new Date(runningTime.getTime() + returnTravelMins * 60 * 1000);
  }

  // Calculate cumulative preserved distance
  let preservedDistanceKm = 0;
  for (const p of preservedStops) {
    preservedDistanceKm += (p.distanceFromPrevKm || 0);
  }

  const newTotalDistanceKm = Number((preservedDistanceKm + runningLegDistance + returnDistKm).toFixed(2));
  const newStopsCombined = [...preservedStops, ...newStops];
  const newMealsCollected = newStopsCombined.reduce((sum, s) => sum + (s.collectedQty || s.plannedQty || 0), 0);

  const prevDistance = trip.plannedMetrics?.distanceKm || trip.totalDistanceKm || 0;
  const prevMeals = trip.plannedMetrics?.meals || trip.mealsCollected || 0;

  const diff = {
    cancelledDonationId: targetIdStr,
    removedStopsCount: 1,
    preservedStopsCount: preservedStops.length,
    remainingStopsCount: newStops.length,
    distanceDeltaKm: Number((newTotalDistanceKm - prevDistance).toFixed(2)),
    mealsDelta: newMealsCollected - prevMeals,
    newStopsOrder: newStopsCombined.map((s) => String(s.donationId?._id || s.donationId?.id || s.donationId)),
    summary: `Donation ${targetIdStr} cancelled. Preserved ${preservedStops.length} collected stops. Re-routed ${newStops.length} remaining stops.`
  };

  const updatedTrip = {
    ...trip,
    stops: newStopsCombined,
    excluded: [...(trip.excluded || []), ...excluded],
    totalDistanceKm: newTotalDistanceKm,
    mealsCollected: newMealsCollected,
    unallocatedMeals,
    replanTimestamp: currentTime
  };

  return {
    updatedTrip,
    diff
  };
}

module.exports = {
  replan
};
