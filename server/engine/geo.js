/**
 * Geospatial Engine Module (Pure functions, no DB access)
 * Provides Haversine distance and road network routing with OSRM,
 * 2-second timeout, in-memory caching, and offline fallback (haversine * 1.3).
 */

const osrmCache = new Map();

/**
 * Normalizes input location to { lat, lng }
 */
function toLatLng(loc) {
  if (!loc) throw new Error('Location is required');
  if (Array.isArray(loc)) {
    return { lat: Number(loc[0]), lng: Number(loc[1]) };
  }
  const lat = loc.lat !== undefined ? Number(loc.lat) : Number(loc.latitude);
  const lng = loc.lng !== undefined ? Number(loc.lng) : loc.lon !== undefined ? Number(loc.lon) : Number(loc.longitude);
  if (isNaN(lat) || isNaN(lng)) {
    throw new Error(`Invalid coordinates: ${JSON.stringify(loc)}`);
  }
  return { lat, lng };
}

/**
 * Haversine great-circle distance in kilometers.
 */
function haversineKm(a, b, lonA, lonB) {
  let lat1, lon1, lat2, lon2;
  if (lonA !== undefined && lonB !== undefined) {
    lat1 = Number(a);
    lon1 = Number(b);
    lat2 = Number(lonA);
    lon2 = Number(lonB);
  } else {
    const p1 = toLatLng(a);
    const p2 = toLatLng(b);
    lat1 = p1.lat;
    lon1 = p1.lng;
    lat2 = p2.lat;
    lon2 = p2.lng;
  }

  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLon2 = Math.sin(dLon / 2);

  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;

  const h = sinDLat2 * sinDLat2 + Math.cos(radLat1) * Math.cos(radLat2) * sinDLon2 * sinDLon2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number((R * c).toFixed(3));
}

/**
 * Synchronous estimated road distance using Haversine * 1.3 detour factor.
 */
function getEstimatedDistance(a, b, { avgSpeedKmh = 25, detourFactor = 1.3 } = {}) {
  const straightLine = haversineKm(a, b);
  const distanceKm = Number((straightLine * detourFactor).toFixed(2));
  const durationMin = Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
  return {
    distanceKm,
    durationMin,
    distanceSource: 'estimated'
  };
}

/**
 * Asynchronously tries public OSRM API with 2s timeout and memory cache.
 * Falls back to estimated (haversine * 1.3) offline.
 */
async function getRoadDistance(a, b, { timeoutMs = 2000, avgSpeedKmh = 25, detourFactor = 1.3 } = {}) {
  const p1 = toLatLng(a);
  const p2 = toLatLng(b);

  // If points are identical
  if (p1.lat === p2.lat && p1.lng === p2.lng) {
    return {
      distanceKm: 0,
      durationMin: 0,
      distanceSource: 'road'
    };
  }

  const cacheKey = `${p1.lat.toFixed(5)},${p1.lng.toFixed(5)}->${p2.lat.toFixed(5)},${p2.lng.toFixed(5)}`;
  if (osrmCache.has(cacheKey)) {
    return osrmCache.get(cacheKey);
  }

  const straightLine = haversineKm(p1, p2);

  // Attempt OSRM
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const durationMin = Math.max(1, Math.round(route.duration / 60));
        const result = {
          distanceKm,
          durationMin,
          distanceSource: 'road'
        };
        osrmCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    // Network failure, offline, or timeout - expected behavior
  } finally {
    clearTimeout(timeoutId);
  }

  // Offline / Timeout Fallback: Haversine * 1.3
  const fallback = {
    distanceKm: Number((straightLine * detourFactor).toFixed(2)),
    durationMin: Math.max(1, Math.round(((straightLine * detourFactor) / avgSpeedKmh) * 60)),
    distanceSource: 'estimated'
  };

  osrmCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Clear the in-memory route cache (useful for testing)
 */
function clearCache() {
  osrmCache.clear();
}

module.exports = {
  haversine: haversineKm,
  haversineKm,
  getEstimatedDistance,
  getRoadDistance,
  clearCache,
  toLatLng
};
