/**
 * Route Generation Module (Pure functions, no DB access)
 * 
 * Implements the nearest-feasible-stop heuristic:
 * - Starts at NGO depot.
 * - At each step, filters candidates that fit remaining vehicle capacity,
 *   respect readyAt (wait if not ready, count wait time),
 *   and arrive/complete service <= collectBy deadline.
 * - Picks nearest feasible stop.
 * - Updates vehicle location, current time, and capacity.
 * - Finally returns to NGO depot.
 * - Reports stops, exclusions with human-readable reasons, total distance,
 *   duration, meals collected, and unallocated meals.
 */

const { haversineKm, getEstimatedDistance } = require('./geo');
const defaultFoodRules = require('../config/foodRules');

/**
 * Extracts normalized donor location from donation object.
 */
function getDonationLocation(donation) {
  const loc = donation.donorId?.location || donation.donor?.location || donation.location;
  if (!loc) throw new Error(`Donation ${donation._id || donation.id} missing location`);
  const lat = loc.lat !== undefined ? Number(loc.lat) : Number(loc.latitude);
  const lng = loc.lng !== undefined ? Number(loc.lng) : loc.lon !== undefined ? Number(loc.lon) : Number(loc.longitude);
  return { lat, lng };
}

/**
 * Plans an optimized collection route using the nearest-feasible-stop heuristic.
 * 
 * @param {Object} ngo - NGO depot object { location: { lat, lng } }
 * @param {Array} donations - Candidate donations to route
 * @param {Date|string} [startTime=new Date()] - Planned departure time
 * @param {Object} [rules={}] - Food rules & routing configuration
 * @param {Object} [options={}] - Custom options (e.g. distanceFn)
 * @returns {Object} Route result
 */
function planRoute(ngo, donations = [], startTime = new Date(), rules = {}, options = {}) {
  const defaultRules = defaultFoodRules;
  const routingConfig = rules.ROUTING_CONFIG || defaultRules.ROUTING_CONFIG || {};

  const vehicleCapacity = options.vehicleCapacity || routingConfig.VEHICLE_CAPACITY_MEALS || 60;
  const avgSpeedKmh = options.avgSpeedKmh || routingConfig.AVG_SPEED_KMH || 25;
  const stopServiceMinutes = options.stopServiceMinutes || routingConfig.STOP_SERVICE_MINUTES || 5;

  if (!ngo || !ngo.location) {
    throw new Error('Valid NGO depot with location is required for routing');
  }

  const depotLoc = {
    lat: Number(ngo.location.lat),
    lng: Number(ngo.location.lng)
  };

  const departureTime = startTime instanceof Date ? startTime : new Date(startTime);
  let currentLoc = { ...depotLoc };
  let currentTime = new Date(departureTime.getTime());
  let remainingCapacity = vehicleCapacity;

  const unvisited = [...donations];
  const stops = [];
  const excluded = [];
  let totalDistanceKm = 0;
  let mealsCollected = 0;
  let unallocatedMeals = 0;

  while (unvisited.length > 0) {
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestArrivalEta = null;
    let bestServiceEndTime = null;
    let bestWaitMinutes = 0;
    let bestCandidate = null;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      const candLoc = getDonationLocation(candidate);

      // 1. Capacity check: vehicle must have capacity remaining
      if (remainingCapacity <= 0) {
        continue;
      }

      // 2. Travel calculation
      const distInfo = getEstimatedDistance(currentLoc, candLoc, { avgSpeedKmh });
      const legDist = distInfo.distanceKm;
      const travelMins = (legDist / avgSpeedKmh) * 60;
      const arrivalEta = new Date(currentTime.getTime() + travelMins * 60 * 1000);

      // 3. Ready-at check: wait if not ready yet
      const readyAtDate = candidate.readyAt ? new Date(candidate.readyAt) : arrivalEta;
      let waitMinutes = 0;
      let serviceStartTime = arrivalEta;
      if (arrivalEta < readyAtDate) {
        waitMinutes = Math.max(0, Math.round((readyAtDate.getTime() - arrivalEta.getTime()) / 60000));
        serviceStartTime = readyAtDate;
      }

      const serviceEndTime = new Date(serviceStartTime.getTime() + stopServiceMinutes * 60 * 1000);
      const collectByDate = new Date(candidate.collectBy);

      // 4. Collect-by check: service must be completed at or before collect-by deadline
      if (serviceEndTime > collectByDate) {
        continue; // Misses deadline
      }

      // Pick nearest feasible
      if (legDist < bestDist) {
        bestDist = legDist;
        bestIdx = i;
        bestArrivalEta = arrivalEta;
        bestServiceEndTime = serviceEndTime;
        bestWaitMinutes = waitMinutes;
        bestCandidate = candidate;
      }
    }

    if (bestIdx === -1) {
      // No remaining candidates can be visited feasibly
      for (const remaining of unvisited) {
        const candLoc = getDonationLocation(remaining);
        const legDist = getEstimatedDistance(currentLoc, candLoc, { avgSpeedKmh }).distanceKm;
        const travelMins = (legDist / avgSpeedKmh) * 60;
        const arrivalEta = new Date(currentTime.getTime() + travelMins * 60 * 1000);

        const readyAtDate = remaining.readyAt ? new Date(remaining.readyAt) : arrivalEta;
        const serviceStartTime = arrivalEta < readyAtDate ? readyAtDate : arrivalEta;
        const serviceEndTime = new Date(serviceStartTime.getTime() + stopServiceMinutes * 60 * 1000);
        const collectByDate = new Date(remaining.collectBy);

        let reason = '';
        if (remainingCapacity <= 0) {
          reason = 'vehicle capacity reached';
        } else if (serviceEndTime > collectByDate) {
          const lateMins = Math.max(1, Math.round((serviceEndTime.getTime() - collectByDate.getTime()) / 60000));
          reason = `would arrive ${lateMins} min after collect-by`;
        } else {
          reason = 'infeasible under current route constraints';
        }

        const donationId = remaining._id ? String(remaining._id) : remaining.id ? String(remaining.id) : 'unknown';
        excluded.push({
          donationId,
          reason
        });

        unallocatedMeals += (Number(remaining.mealsOffered) || 0);
      }
      break;
    }

    // Feasible candidate found
    const selected = unvisited.splice(bestIdx, 1)[0];
    const offered = Number(selected.mealsOffered) || 0;
    const plannedQty = Math.min(offered, remainingCapacity);

    if (offered > remainingCapacity) {
      unallocatedMeals += (offered - remainingCapacity);
    }

    remainingCapacity -= plannedQty;
    mealsCollected += plannedQty;
    totalDistanceKm += bestDist;

    const candLoc = getDonationLocation(selected);
    const donationId = selected._id ? String(selected._id) : selected.id ? String(selected.id) : 'unknown';
    const donorId = selected.donorId?._id || selected.donorId?.id || selected.donorId || selected.donor?._id || selected.donor;

    stops.push({
      donationId,
      donorId,
      donor: selected.donorId || selected.donor || null,
      donorLocation: candLoc,
      category: selected.category,
      mealsOffered: offered,
      plannedQty,
      order: stops.length + 1,
      eta: bestArrivalEta,
      serviceEndTime: bestServiceEndTime,
      waitMinutes: bestWaitMinutes,
      distanceFromPrevKm: Number(bestDist.toFixed(2)),
      status: 'PENDING'
    });

    currentTime = bestServiceEndTime;
    currentLoc = candLoc;
  }

  // Return leg: last stop to NGO depot (no deadline for returning home)
  let returnDistKm = 0;
  if (stops.length > 0) {
    returnDistKm = getEstimatedDistance(currentLoc, depotLoc, { avgSpeedKmh }).distanceKm;
    totalDistanceKm += returnDistKm;
    const returnTravelMins = (returnDistKm / avgSpeedKmh) * 60;
    currentTime = new Date(currentTime.getTime() + returnTravelMins * 60 * 1000);
  }

  const durationMin = Math.max(1, Math.round((currentTime.getTime() - departureTime.getTime()) / 60000));

  return {
    stops,
    excluded,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    durationMin,
    mealsCollected,
    unallocatedMeals,
    distanceSource: 'estimated'
  };
}

module.exports = {
  planRoute,
  getDonationLocation
};
