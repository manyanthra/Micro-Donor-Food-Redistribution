/**
 * Explainable Decision Engine - Central Barrel Export
 * Pure functions, zero database dependencies, 100% unit-testable.
 */

const {
  haversine,
  haversineKm,
  getRoadDistance,
  getEstimatedDistance,
  clearCache,
  toLatLng
} = require('./geo');

const { filterDonations } = require('./filter');
const { clusterDonations, isTimeCompatible, splitIncompatibleCluster } = require('./cluster');
const { planRoute, getDonationLocation } = require('./route');
const { calculateMetrics, calculateTripMetrics } = require('./metrics');
const { recommendTrip, evaluateTripRecommendation } = require('./recommend');
const { replan } = require('./replan');

module.exports = {
  // Geo
  haversine,
  haversineKm,
  getRoadDistance,
  getEstimatedDistance,
  clearCache,
  toLatLng,

  // Screening
  filterDonations,

  // Clustering
  clusterDonations,
  isTimeCompatible,
  splitIncompatibleCluster,

  // Routing
  planRoute,
  getDonationLocation,

  // Metrics
  calculateMetrics,
  calculateTripMetrics,

  // Recommendation
  recommendTrip,
  evaluateTripRecommendation,

  // Dynamic Replanning
  replan
};
