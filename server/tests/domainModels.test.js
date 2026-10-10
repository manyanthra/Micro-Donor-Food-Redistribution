const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const Donation = require('../models/Donation');
const Ngo = require('../models/Ngo');
const Trip = require('../models/Trip');

describe('Domain Models Validation & Business Logic', () => {
  const dummyDonorId = new mongoose.Types.ObjectId();
  const dummyNgoId = new mongoose.Types.ObjectId();

  test('Donor model validates required fields and types', async () => {
    const validDonor = new Donor({
      name: 'Sunrise Bakes',
      type: 'bakery',
      address: '12 Library Lane',
      location: { lat: 12.975, lng: 77.595 },
      phone: '+91 98450 11002'
    });

    const err = validDonor.validateSync();
    expect(err).toBeUndefined();

    // Invalid type
    const invalidDonor = new Donor({
      name: 'Bad Type Donor',
      type: 'supermarket', // not allowed
      address: 'Nowhere',
      location: { lat: 12.97, lng: 77.59 }
    });
    const invalidErr = invalidDonor.validateSync();
    expect(invalidErr.errors.type).toBeDefined();
  });

  test('Donation automatically computes collectBy based on category safe window', async () => {
    const readyAt = new Date('2026-10-10T12:00:00Z');
    const donation = new Donation({
      donorId: dummyDonorId,
      mealsOffered: 12,
      category: 'cooked_hot', // safe window: 120 min
      readyAt
      // collectBy omitted intentionally
    });

    await donation.validate();
    expect(donation.collectBy).toBeDefined();
    const expectedCollectBy = new Date(readyAt.getTime() + 120 * 60 * 1000);
    expect(donation.collectBy.getTime()).toBe(expectedCollectBy.getTime());
  });

  test('Donation caps custom collectBy override to safe window ceiling', async () => {
    const readyAt = new Date('2026-10-10T12:00:00Z');
    const excessiveCollectBy = new Date('2026-10-10T18:00:00Z'); // 6 hours later! Safe window is only 2 hours (120m)

    const donation = new Donation({
      donorId: dummyDonorId,
      mealsOffered: 10,
      category: 'cooked_hot',
      readyAt,
      collectBy: excessiveCollectBy
    });

    await donation.validate();
    // System must cap to safe window ceiling: readyAt + 120 min
    const maxAllowed = new Date(readyAt.getTime() + 120 * 60 * 1000);
    expect(donation.collectBy.getTime()).toBe(maxAllowed.getTime());
  });

  test('Donation initializes statusHistory with initial status', async () => {
    const readyAt = new Date();
    const donation = new Donation({
      donorId: dummyDonorId,
      mealsOffered: 15,
      category: 'bakery_baked',
      readyAt
    });

    expect(donation.status).toBe('AVAILABLE');
    expect(donation.statusHistory.length).toBe(1);
    expect(donation.statusHistory[0].status).toBe('AVAILABLE');
  });

  test('Trip model tracks planned, baseline, and actual metrics separately', async () => {
    const trip = new Trip({
      ngoId: dummyNgoId,
      status: 'PLANNED',
      stops: [
        {
          donationId: new mongoose.Types.ObjectId(),
          donorId: dummyDonorId,
          order: 1,
          plannedQty: 10,
          collectedQty: 0,
          status: 'PENDING'
        }
      ],
      plannedMetrics: {
        distanceKm: 7.2,
        cost: 136,
        meals: 10,
        costPerMeal: 13.6,
        durationMin: 25
      },
      baselineMetrics: {
        distanceKm: 14.4,
        cost: 222,
        meals: 10,
        costPerMeal: 22.2,
        durationMin: 45
      },
      actualMetrics: {
        distanceKm: 0,
        cost: 0,
        meals: 0,
        costPerMeal: 0,
        durationMin: 0
      }
    });

    const err = trip.validateSync();
    expect(err).toBeUndefined();
    expect(trip.stops[0].plannedQty).toBe(10);
    expect(trip.stops[0].collectedQty).toBe(0);
  });
});
