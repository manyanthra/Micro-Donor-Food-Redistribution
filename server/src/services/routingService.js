const { haversineDistanceKm } = require('../utils/geo');
const { ROUTING_CONFIG } = require('../../config/foodRules');

/**
 * Generates an optimized collection route from NGO depot through clustered donor stops
 * and back to NGO depot, respecting capacity and safe time window deadlines.
 */
function generateCollectionRoute(ngo, clusterDonations, departureTime = new Date()) {
  const vehicleCapacity = ROUTING_CONFIG.VEHICLE_CAPACITY_MEALS || 60;
  const avgSpeed = ROUTING_CONFIG.AVG_SPEED_KMH || 25;
  const stopServiceMins = ROUTING_CONFIG.STOP_SERVICE_MINUTES || 5;
  const costPerKm = ROUTING_CONFIG.COST_PER_KM || 12;
  const baseTripCost = ROUTING_CONFIG.OTHER_TRIP_COST || 50;

  const depotLoc = ngo.location;
  let currentLoc = { lat: depotLoc.lat, lng: depotLoc.lng };
  let currentTime = new Date(departureTime.getTime());

  const unvisited = [...clusterDonations];
  const stops = [];
  const excluded = [];
  let currentLoad = 0;
  let totalDistanceKm = 0;

  while (unvisited.length > 0) {
    // Find candidate stops that have not yet expired by ETA
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestEta = null;
    let bestReason = null;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      const candLoc = candidate.donorId.location;
      const legDist = haversineDistanceKm(currentLoc.lat, currentLoc.lng, candLoc.lat, candLoc.lng);
      const travelMins = (legDist / avgSpeed) * 60;
      const candidateEta = new Date(currentTime.getTime() + travelMins * 60 * 1000);

      // Check if safe window would expire before arrival
      if (candidateEta > new Date(candidate.collectBy)) {
        // Cannot reach safely
        continue;
      }

      // Check capacity
      if (currentLoad >= vehicleCapacity) {
        continue;
      }

      if (legDist < bestDist) {
        bestDist = legDist;
        bestIdx = i;
        bestEta = candidateEta;
      }
    }

    if (bestIdx === -1) {
      // Remaining stops cannot be reached in time or exceed capacity
      for (const remaining of unvisited) {
        const legDist = haversineDistanceKm(currentLoc.lat, currentLoc.lng, remaining.donorId.location.lat, remaining.donorId.location.lng);
        const travelMins = (legDist / avgSpeed) * 60;
        const candidateEta = new Date(currentTime.getTime() + travelMins * 60 * 1000);

        let reason = 'Excluded from trip route';
        if (currentLoad >= vehicleCapacity) {
          reason = `Exceeds vehicle capacity (${vehicleCapacity} meals limit reached)`;
        } else if (candidateEta > new Date(remaining.collectBy)) {
          reason = `Arrival ETA (${candidateEta.toLocaleTimeString()}) misses safe deadline (${new Date(remaining.collectBy).toLocaleTimeString()})`;
        }

        excluded.push({
          donationId: remaining._id,
          reason
        });
      }
      break;
    }

    // Pick bestIdx
    const selected = unvisited.splice(bestIdx, 1)[0];
    const availableCapacity = vehicleCapacity - currentLoad;
    const plannedQty = Math.min(selected.mealsOffered, availableCapacity);

    currentLoad += plannedQty;
    totalDistanceKm += bestDist;

    // Advance time: travel time + dwell/service time
    currentTime = new Date(bestEta.getTime() + stopServiceMins * 60 * 1000);
    currentLoc = { lat: selected.donorId.location.lat, lng: selected.donorId.location.lng };

    stops.push({
      donationId: selected._id,
      donorId: selected.donorId._id || selected.donorId,
      donor: selected.donorId,
      order: stops.length + 1,
      plannedQty,
      collectedQty: 0,
      eta: bestEta,
      distanceFromPrevKm: Number(bestDist.toFixed(2)),
      status: 'PENDING',
      skipReason: ''
    });
  }

  // Return leg: last stop to NGO depot
  let returnDistKm = 0;
  if (stops.length > 0) {
    returnDistKm = haversineDistanceKm(currentLoc.lat, currentLoc.lng, depotLoc.lat, depotLoc.lng);
    totalDistanceKm += returnDistKm;
    const returnTravelMins = (returnDistKm / avgSpeed) * 60;
    currentTime = new Date(currentTime.getTime() + returnTravelMins * 60 * 1000);
  }

  const plannedTotalMeals = stops.reduce((sum, s) => sum + s.plannedQty, 0);
  const plannedDurationMin = Math.round((currentTime.getTime() - departureTime.getTime()) / (60 * 1000));
  const plannedCost = Math.round((totalDistanceKm * costPerKm) + baseTripCost);
  const plannedCostPerMeal = plannedTotalMeals > 0 ? Number((plannedCost / plannedTotalMeals).toFixed(2)) : 0;

  const plannedMetrics = {
    distanceKm: Number(totalDistanceKm.toFixed(2)),
    cost: plannedCost,
    meals: plannedTotalMeals,
    costPerMeal: plannedCostPerMeal,
    durationMin: plannedDurationMin
  };

  // Compute Baseline Metrics: "each donor gets a separate round trip NGO->donor->NGO"
  let baselineDistanceKm = 0;
  let baselineDurationMin = 0;
  let baselineCost = 0;

  for (const stop of stops) {
    const dLoc = stop.donor.location || stop.donor;
    const oneWayDist = haversineDistanceKm(depotLoc.lat, depotLoc.lng, dLoc.lat, dLoc.lng);
    const roundTripDist = oneWayDist * 2;
    const rtTravelMins = (roundTripDist / avgSpeed) * 60;
    const rtDuration = Math.round(rtTravelMins + stopServiceMins);
    const rtCost = Math.round((roundTripDist * costPerKm) + baseTripCost);

    baselineDistanceKm += roundTripDist;
    baselineDurationMin += rtDuration;
    baselineCost += rtCost;
  }

  const baselineCostPerMeal = plannedTotalMeals > 0 ? Number((baselineCost / plannedTotalMeals).toFixed(2)) : 0;

  const baselineMetrics = {
    distanceKm: Number(baselineDistanceKm.toFixed(2)),
    cost: baselineCost,
    meals: plannedTotalMeals,
    costPerMeal: baselineCostPerMeal,
    durationMin: baselineDurationMin
  };

  return {
    stops,
    plannedMetrics,
    baselineMetrics,
    excluded,
    returnDistKm: Number(returnDistKm.toFixed(2))
  };
}

/**
 * Recomputes actualMetrics based on collected quantities and actual trip execution.
 * Partial collection rule: Store plannedQty and actual collected/deliveredQty as separate fields.
 * Partial collection (offered 10, collected 7) counts 7 everywhere, never 10.
 */
function calculateActualMetrics(trip) {
  const costPerKm = ROUTING_CONFIG.COST_PER_KM || 12;
  const baseTripCost = ROUTING_CONFIG.OTHER_TRIP_COST || 50;
  const actualMeals = trip.deliveredQty || trip.stops.reduce((sum, s) => {
    return s.status === 'COLLECTED' ? sum + (s.collectedQty || 0) : sum;
  }, 0);

  // If completed, calculate actual duration
  let actualDurationMin = trip.plannedMetrics.durationMin;
  if (trip.startedAt && trip.completedAt) {
    actualDurationMin = Math.max(1, Math.round((new Date(trip.completedAt) - new Date(trip.startedAt)) / (60 * 1000)));
  }

  // Actual distance traveled:
  // Count distance for stops that were visited/attempted plus return leg
  const actualDistanceKm = trip.plannedMetrics.distanceKm;
  const actualCost = Math.round((actualDistanceKm * costPerKm) + baseTripCost);
  const actualCostPerMeal = actualMeals > 0 ? Number((actualCost / actualMeals).toFixed(2)) : 0;

  return {
    distanceKm: actualDistanceKm,
    cost: actualCost,
    meals: actualMeals,
    costPerMeal: actualCostPerMeal,
    durationMin: actualDurationMin
  };
}

module.exports = {
  generateCollectionRoute,
  calculateActualMetrics
};
