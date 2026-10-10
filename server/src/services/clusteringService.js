const { haversineDistanceKm } = require('../utils/geo');
const { FOOD_CATEGORIES, ROUTING_CONFIG } = require('../../config/foodRules');

/**
 * Filter and screen donations into eligible candidates and excluded donations.
 */
function screenDonations(donations, now = new Date()) {
  const eligible = [];
  const excluded = [];

  for (const donation of donations) {
    const catConfig = FOOD_CATEGORIES[donation.category];
    const collectByDate = new Date(donation.collectBy);
    const readyAtDate = new Date(donation.readyAt);

    if (donation.status !== 'AVAILABLE') {
      excluded.push({
        donationId: donation._id,
        donation,
        reason: `Donation is already in '${donation.status}' state`
      });
      continue;
    }

    if (!catConfig || !catConfig.donatable) {
      excluded.push({
        donationId: donation._id,
        donation,
        reason: `Food category '${donation.category}' is non-donatable`
      });
      continue;
    }

    if (collectByDate <= now) {
      excluded.push({
        donationId: donation._id,
        donation,
        reason: `Safe consumption window expired at ${collectByDate.toLocaleTimeString()}`
      });
      continue;
    }

    eligible.push(donation);
  }

  return { eligible, excluded };
}

/**
 * Clusters eligible donations based on mutual distance <= CLUSTER_RADIUS_KM.
 * Uses connected components / graph clustering where edge exists if dist <= radius.
 */
function clusterEligibleDonations(eligibleDonations, maxRadiusKm = ROUTING_CONFIG.CLUSTER_RADIUS_KM) {
  if (eligibleDonations.length === 0) return [];

  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < eligibleDonations.length; i++) {
    if (visited.has(i)) continue;

    const cluster = [eligibleDonations[i]];
    visited.add(i);
    const queue = [eligibleDonations[i]];

    while (queue.length > 0) {
      const current = queue.shift();
      const currLoc = current.donorId.location;

      for (let j = 0; j < eligibleDonations.length; j++) {
        if (!visited.has(j)) {
          const candidate = eligibleDonations[j];
          const candLoc = candidate.donorId.location;
          const dist = haversineDistanceKm(currLoc.lat, currLoc.lng, candLoc.lat, candLoc.lng);

          if (dist <= maxRadiusKm) {
            visited.add(j);
            cluster.push(candidate);
            queue.push(candidate);
          }
        }
      }
    }

    clusters.push(cluster);
  }

  // Sort clusters by descending total meals offered
  clusters.sort((a, b) => {
    const mealsA = a.reduce((sum, d) => sum + d.mealsOffered, 0);
    const mealsB = b.reduce((sum, d) => sum + d.mealsOffered, 0);
    return mealsB - mealsA;
  });

  return clusters;
}

module.exports = {
  screenDonations,
  clusterEligibleDonations
};
