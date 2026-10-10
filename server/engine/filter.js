/**
 * Donation Screening & Filtering Module (Pure functions, no DB access)
 * Evaluates candidate donations against food safety rules, expiration times,
 * reachability physics from NGO depot, and depot intake capacity.
 */

const { haversineKm } = require('./geo');

/**
 * Filters raw donations into feasible candidates and excluded items with human-readable reasons.
 * 
 * @param {Array} donations - Array of donation plain objects
 * @param {Date|string} [now=new Date()] - Reference current timestamp
 * @param {Object} rules - Food rules & routing configuration
 * @param {Object} ngo - Primary NGO object with location and nightlyCapacity
 * @returns {{ feasible: Array, excluded: Array }}
 */
function filterDonations(donations = [], now = new Date(), rules = {}, ngo = null) {
  const currentTime = now instanceof Date ? now : new Date(now);
  const foodCategories = rules.FOOD_CATEGORIES || {};
  const routingConfig = rules.ROUTING_CONFIG || {};
  const avgSpeedKmh = routingConfig.AVG_SPEED_KMH || 25;
  const ngoCapacity = ngo?.nightlyCapacity || routingConfig.NGO_NIGHTLY_CAPACITY_MEALS || 100;

  const feasible = [];
  const excluded = [];
  let allocatedNgoMeals = 0;

  for (const donation of donations) {
    const donationId = donation._id ? String(donation._id) : donation.id ? String(donation.id) : null;

    // 1. Missing or invalid required fields
    const donorLocation = donation.donorId?.location || donation.donor?.location || donation.location;
    const meals = Number(donation.mealsOffered);

    if (!donationId || !donorLocation || isNaN(meals) || meals <= 0 || !donation.category) {
      excluded.push({
        donationId: donationId || 'unknown',
        donation,
        reason: 'Missing or invalid fields (requires valid ID, donor location, category, and positive mealsOffered)'
      });
      continue;
    }

    // 2. Status must be 'AVAILABLE'
    const status = donation.status || 'AVAILABLE';
    if (status !== 'AVAILABLE') {
      excluded.push({
        donationId,
        donation,
        reason: `Donation status is '${status}', not 'AVAILABLE'`
      });
      continue;
    }

    // 3. Category must be donatable
    const catConfig = foodCategories[donation.category];
    if (catConfig && catConfig.donatable === false) {
      excluded.push({
        donationId,
        donation,
        reason: `Category '${donation.category}' is strictly non-donatable (${catConfig.label})`
      });
      continue;
    }

    // 4. collectBy already passed
    const collectByDate = donation.collectBy ? new Date(donation.collectBy) : null;
    if (!collectByDate || isNaN(collectByDate.getTime())) {
      excluded.push({
        donationId,
        donation,
        reason: 'Missing or invalid collectBy deadline'
      });
      continue;
    }

    if (collectByDate <= currentTime) {
      const expiredAtStr = collectByDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      excluded.push({
        donationId,
        donation,
        reason: `Safe consumption window expired at ${expiredAtStr}`
      });
      continue;
    }

    // 5. Reachability from NGO: direct fastest trip arrives after collectBy
    if (ngo && ngo.location) {
      const straightDist = haversineKm(ngo.location, donorLocation);
      const estRoadDist = straightDist * 1.3;
      const minTransitMins = (estRoadDist / avgSpeedKmh) * 60;
      const earliestArrival = new Date(currentTime.getTime() + minTransitMins * 60 * 1000);

      if (earliestArrival > collectByDate) {
        const arrivalStr = earliestArrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const deadlineStr = collectByDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        excluded.push({
          donationId,
          donation,
          reason: `Cannot be reached before collect-by (${deadlineStr}) even by fastest direct trip from NGO (earliest arrival: ${arrivalStr})`
        });
        continue;
      }
    }

    // 6. Exceeds NGO remaining nightly capacity
    const remainingCapacity = ngoCapacity - allocatedNgoMeals;
    if (meals > remainingCapacity) {
      excluded.push({
        donationId,
        donation,
        reason: `Exceeds NGO nightly remaining capacity (${meals} meals offered, only ${remainingCapacity} remaining of ${ngoCapacity} max capacity)`
      });
      continue;
    }

    allocatedNgoMeals += meals;
    feasible.push(donation);
  }

  return { feasible, excluded };
}

module.exports = {
  filterDonations
};
