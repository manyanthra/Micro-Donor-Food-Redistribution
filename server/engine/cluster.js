/**
 * Donation Clustering Module (Pure functions, no DB access)
 * 
 * Groups feasible donations geographically (within radiusKm),
 * enforces category compatibility groups, verifies time window compatibility
 * (there must be a viable visiting order where all deadlines are met),
 * splits clusters that fail time compatibility, and attaches an explainable summary.
 */

const { haversineKm } = require('./geo');
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
 * Checks whether an ordered sequence of donations can all be served before their collectBy deadlines.
 */
function verifyOrderFeasibility(orderedDonations, { startLocation, startTime, avgSpeedKmh = 25, stopServiceMinutes = 5 }) {
  let currLoc = startLocation;
  let currTime = new Date(startTime);

  for (const donation of orderedDonations) {
    const loc = getDonationLocation(donation);
    const dist = haversineKm(currLoc, loc) * 1.3; // estimated road distance
    const transitMin = (dist / avgSpeedKmh) * 60;
    const arrivalEta = new Date(currTime.getTime() + transitMin * 60 * 1000);

    // Respect readyAt
    const readyAtDate = donation.readyAt ? new Date(donation.readyAt) : arrivalEta;
    const serviceStartTime = arrivalEta < readyAtDate ? readyAtDate : arrivalEta;
    const departureTime = new Date(serviceStartTime.getTime() + stopServiceMinutes * 60 * 1000);

    const collectByDate = new Date(donation.collectBy);
    if (departureTime > collectByDate) {
      return false; // Deadline violated
    }

    currTime = departureTime;
    currLoc = loc;
  }

  return true;
}

/**
 * Generates all permutations of an array.
 */
function getPermutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const perms = getPermutations(remaining);
    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

/**
 * Checks if a cluster is time-compatible by verifying whether there exists ANY
 * visiting order where every stop meets its collectBy window.
 */
function isTimeCompatible(clusterDonations, options) {
  if (clusterDonations.length <= 1) return true;

  const startLocation = options.ngo?.location || getDonationLocation(clusterDonations[0]);
  const startTime = options.now ? new Date(options.now) : new Date();
  const context = {
    startLocation,
    startTime,
    avgSpeedKmh: options.avgSpeedKmh || 25,
    stopServiceMinutes: options.stopServiceMinutes || 5
  };

  // For small clusters (<= 6 stops), exhaustively check permutations
  if (clusterDonations.length <= 6) {
    const perms = getPermutations(clusterDonations);
    for (const order of perms) {
      if (verifyOrderFeasibility(order, context)) {
        return true;
      }
    }
    return false;
  }

  // For larger clusters, test Earliest Deadline First (EDF) order
  const edfOrder = [...clusterDonations].sort((a, b) => new Date(a.collectBy) - new Date(b.collectBy));
  if (verifyOrderFeasibility(edfOrder, context)) {
    return true;
  }

  // Also test nearest-neighbor greedy sequence
  let remaining = [...clusterDonations];
  let greedyOrder = [];
  let currLoc = startLocation;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(currLoc, getDonationLocation(remaining[i]));
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    greedyOrder.push(remaining.splice(bestIdx, 1)[0]);
    currLoc = getDonationLocation(greedyOrder[greedyOrder.length - 1]);
  }

  return verifyOrderFeasibility(greedyOrder, context);
}

/**
 * Splits a time-incompatible cluster by separating the most restrictive / conflicting donation.
 */
function splitIncompatibleCluster(clusterDonations, options) {
  if (clusterDonations.length <= 1) return [clusterDonations];

  // Sort by collectBy ascending to isolate the tightest deadline
  const sorted = [...clusterDonations].sort((a, b) => new Date(a.collectBy) - new Date(b.collectBy));
  
  // Separate the most urgent / conflicting stop into its own cluster
  const urgent = [sorted[0]];
  const remainder = sorted.slice(1);

  const subClusters = [];
  if (isTimeCompatible(urgent, options)) {
    subClusters.push(urgent);
  } else {
    subClusters.push(urgent);
  }

  if (isTimeCompatible(remainder, options)) {
    subClusters.push(remainder);
  } else {
    subClusters.push(...splitIncompatibleCluster(remainder, options));
  }

  return subClusters;
}

/**
 * Clusters feasible donations by compatibility groups, geographic proximity,
 * and time-window viability.
 * 
 * @param {Array} feasible - Array of feasible donations from filterDonations
 * @param {number} [radiusKm=1.0] - Maximum geographic clustering radius
 * @param {Object} [options={}] - Config options ({ rules, now, ngo })
 * @returns {Array<Object>} Array of explainable cluster objects
 */
function clusterDonations(feasible = [], radiusKm = 1.0, options = {}) {
  if (!Array.isArray(feasible) || feasible.length === 0) {
    return [];
  }

  const effectiveRules = options.rules || defaultFoodRules;
  const foodCategories = effectiveRules.FOOD_CATEGORIES || defaultFoodRules.FOOD_CATEGORIES || {};
  const routingConfig = effectiveRules.ROUTING_CONFIG || defaultFoodRules.ROUTING_CONFIG || {};
  const effectiveRadius = radiusKm || routingConfig.CLUSTER_RADIUS_KM || 1.0;
  const avgSpeedKmh = routingConfig.AVG_SPEED_KMH || 25;
  const stopServiceMinutes = routingConfig.STOP_SERVICE_MINUTES || 5;
  const contextOptions = {
    ...options,
    avgSpeedKmh,
    stopServiceMinutes,
    ngo: options.ngo || null,
    now: options.now || new Date()
  };

  // 1. Enforce compatibilityGroup: partition by category compatibilityGroup
  const compatibilityPartitions = new Map();
  for (const donation of feasible) {
    const catConfig = foodCategories[donation.category];
    const groupKey = catConfig?.compatibilityGroup || 'default';
    if (!compatibilityPartitions.has(groupKey)) {
      compatibilityPartitions.set(groupKey, []);
    }
    compatibilityPartitions.get(groupKey).push(donation);
  }

  const rawClusters = [];

  // 2. Geographic grouping (Connected components / radius graph) within each compatibility partition
  for (const [groupKey, groupDonations] of compatibilityPartitions.entries()) {
    const visited = new Set();

    for (let i = 0; i < groupDonations.length; i++) {
      if (visited.has(i)) continue;

      const cluster = [groupDonations[i]];
      visited.add(i);
      const queue = [groupDonations[i]];

      while (queue.length > 0) {
        const curr = queue.shift();
        const currLoc = getDonationLocation(curr);

        for (let j = 0; j < groupDonations.length; j++) {
          if (!visited.has(j)) {
            const cand = groupDonations[j];
            const candLoc = getDonationLocation(cand);
            const dist = haversineKm(currLoc, candLoc);

            if (dist <= effectiveRadius) {
              visited.add(j);
              cluster.push(cand);
              queue.push(cand);
            }
          }
        }
      }

      rawClusters.push({
        groupKey,
        donations: cluster
      });
    }
  }

  // 3. Verify time window compatibility; split clusters that fail
  const finalClusters = [];
  for (const raw of rawClusters) {
    if (isTimeCompatible(raw.donations, contextOptions)) {
      finalClusters.push({
        groupKey: raw.groupKey,
        donations: raw.donations
      });
    } else {
      const split = splitIncompatibleCluster(raw.donations, contextOptions);
      for (const sub of split) {
        finalClusters.push({
          groupKey: raw.groupKey,
          donations: sub
        });
      }
    }
  }

  // 4. Attach explainable metrics and human-readable explanation string
  const explainableClusters = finalClusters.map((c, index) => {
    const donations = c.donations;
    const donorCount = donations.length;
    const totalMeals = donations.reduce((sum, d) => sum + (Number(d.mealsOffered) || 0), 0);

    // Compute max span (distance between farthest pair in cluster)
    let maxSpanKm = 0;
    for (let i = 0; i < donations.length; i++) {
      for (let j = i + 1; j < donations.length; j++) {
        const d = haversineKm(getDonationLocation(donations[i]), getDonationLocation(donations[j]));
        if (d > maxSpanKm) maxSpanKm = d;
      }
    }

    // Earliest collect-by in this cluster (common deadline)
    const collectByTimes = donations.map((d) => new Date(d.collectBy).getTime());
    const minCollectBy = new Date(Math.min(...collectByTimes));
    const commonWindowStr = minCollectBy.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let explanation = '';
    if (donorCount > 1) {
      const spanStr = maxSpanKm.toFixed(1);
      explanation = `Grouped ${donorCount} donors within ${spanStr} km; common window until ${commonWindowStr}`;
    } else {
      const donorName = donations[0].donorId?.name || donations[0].donor?.name || 'Single donor';
      explanation = `Single donor (${donorName}); window until ${commonWindowStr}`;
    }

    return {
      id: `cluster-${index + 1}`,
      compatibilityGroup: c.groupKey,
      donations,
      donorCount,
      totalMeals,
      maxSpanKm: Number(maxSpanKm.toFixed(2)),
      commonCollectBy: minCollectBy,
      explanation
    };
  });

  // Sort clusters descending by total meals
  explainableClusters.sort((a, b) => b.totalMeals - a.totalMeals);

  return explainableClusters;
}

module.exports = {
  clusterDonations,
  isTimeCompatible,
  splitIncompatibleCluster
};
