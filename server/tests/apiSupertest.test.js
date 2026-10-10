const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../config/db');
const Donor = require('../models/Donor');
const Donation = require('../models/Donation');
const Ngo = require('../models/Ngo');
const Trip = require('../models/Trip');
const BlockedDispatch = require('../models/BlockedDispatch');

describe('Supertest REST API & Decision Engine Integration Tests', () => {
  let ngo = null;
  const baseTime = new Date('2026-10-10T12:00:00Z');

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await Donation.deleteMany({});
    await Trip.deleteMany({});
    await Donor.deleteMany({});
    await Ngo.deleteMany({});
    await BlockedDispatch.deleteMany({});

    // Create primary NGO
    ngo = await Ngo.create({
      name: 'City Central Relief NGO Depot',
      address: '100 Hub Road, Sector 3',
      location: { lat: 12.9980, lng: 77.6030 },
      nightlyCapacity: 100
    });
  });

  // (1) Viable cluster -> trip created
  test('(1) viable cluster -> trip created', async () => {
    const donor1 = await Donor.create({
      name: 'Bakery One',
      type: 'bakery',
      address: '10 Baker St',
      location: { lat: 12.9800, lng: 77.6000 }
    });
    const donor2 = await Donor.create({
      name: 'Bakery Two',
      type: 'bakery',
      address: '12 Baker St',
      location: { lat: 12.9810, lng: 77.6010 }
    });

    const don1 = await Donation.create({
      donorId: donor1._id,
      mealsOffered: 12,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const don2 = await Donation.create({
      donorId: donor2._id,
      mealsOffered: 10,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const res = await request(app)
      .post('/api/trips')
      .send({ ngoId: ngo._id });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.trip).toBeDefined();
    expect(res.body.trip.status).toBe('PLANNED');
    expect(res.body.trip.stops.length).toBe(2);
    expect(res.body.trip.plannedMetrics.meals).toBe(22);

    // Verify DB update: donations are now ASSIGNED
    const updatedDon1 = await Donation.findById(don1._id);
    const updatedDon2 = await Donation.findById(don2._id);
    expect(updatedDon1.status).toBe('ASSIGNED');
    expect(updatedDon2.status).toBe('ASSIGNED');
    expect(String(updatedDon1.tripId)).toBe(String(res.body.trip._id));
  });

  // (2) Under 20 meals -> POST /api/trips returns 422 NOT_DISPATCHABLE and no trip or ASSIGNED donations exist
  test('(2) under 20 meals -> POST /api/trips returns 422 NOT_DISPATCHABLE and no trip or ASSIGNED donations exist', async () => {
    const donor = await Donor.create({
      name: 'Small Cafe',
      type: 'bakery',
      address: '5 Lane Rd',
      location: { lat: 12.9800, lng: 77.6000 }
    });

    const don = await Donation.create({
      donorId: donor._id,
      mealsOffered: 18, // 18 meals < 20 MIN_VIABLE_MEALS
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const res = await request(app)
      .post('/api/trips')
      .send({ ngoId: ngo._id });

    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('NOT_DISPATCHABLE');
    expect(res.body.shortfall).toBe(2);
    expect(res.body.reason).toContain('18 meals');
    expect(res.body.reason).toContain('20 required');

    // Verify NO trip created in DB
    const tripCount = await Trip.countDocuments();
    expect(tripCount).toBe(0);

    // Verify donation remains AVAILABLE and NOT assigned
    const checkDon = await Donation.findById(don._id);
    expect(checkDon.status).toBe('AVAILABLE');
    expect(checkDon.tripId).toBeNull();
  });

  // (3) Item that cannot reach in time is left out with reason while the trip still dispatches
  test('(3) item that cannot reach in time is left out with reason while the trip still dispatches', async () => {
    const donorSafe = await Donor.create({
      name: 'Safe Large Bakery',
      type: 'bakery',
      address: '10 Main Rd',
      location: { lat: 12.9800, lng: 77.6000 }
    });
    const donorLate = await Donor.create({
      name: 'Far Late Kiosk',
      type: 'bakery',
      address: '99 Outskirts Rd',
      location: { lat: 12.9500, lng: 77.5500 }
    });

    const safeDonation = await Donation.create({
      donorId: donorSafe._id,
      mealsOffered: 22,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const lateDonation = await Donation.create({
      donorId: donorLate._id,
      mealsOffered: 8,
      category: 'cooked_hot',
      readyAt: new Date(baseTime.getTime()),
      // Impossible deadline: 5 minutes from now
      deliverBy: new Date(baseTime.getTime() + 5 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const res = await request(app)
      .post('/api/trips')
      .send({ ngoId: ngo._id });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    const trip = res.body.trip;

    // Only safe donor is included in stops
    expect(trip.stops.length).toBe(1);
    expect(String(trip.stops[0].donationId._id || trip.stops[0].donationId)).toBe(String(safeDonation._id));

    // Late donor is recorded in excluded with plain-language reason
    expect(trip.excluded.length).toBeGreaterThanOrEqual(1);
    const lateExclusion = trip.excluded.find((e) => String(e.donationId) === String(lateDonation._id));
    expect(lateExclusion).toBeDefined();
    expect(lateExclusion.reason).toMatch(/safe window|reach the NGO/);

    // Late donation remains AVAILABLE with exclusionReason set
    const checkLate = await Donation.findById(lateDonation._id);
    expect(checkLate.status).toBe('AVAILABLE');
    expect(checkLate.exclusionReason).toBeDefined();
  });

  // (4) Full happy path: donors, donations, plan, trip create, start, collect, deliver, impact
  test('(4) full happy path from surplus post to completed delivery & impact', async () => {
    // 1. Create donor
    const donorRes = await request(app)
      .post('/api/donors')
      .send({
        name: 'Community Bakery Depot',
        type: 'bakery',
        address: '44 Station Rd',
        location: { lat: 12.9800, lng: 77.6000 },
        phone: '+91 98450 11044'
      });
    expect(donorRes.status).toBe(201);
    const donorId = donorRes.body.donor._id;

    // 2. Post surplus donation
    const donRes = await request(app)
      .post('/api/donations')
      .send({
        donorId,
        mealsOffered: 25,
        category: 'bakery_baked',
        readyAt: new Date(baseTime.getTime())
      });
    expect(donRes.status).toBe(201);
    expect(donRes.body.donation.deliverBy).toBeDefined();
    expect(donRes.body.donation.collectBy).toBeDefined();
    const donationId = donRes.body.donation._id;

    // Reject non-donatable category with clear message
    const nonDonRes = await request(app)
      .post('/api/donations')
      .send({
        donorId,
        mealsOffered: 10,
        category: 'leftover_plate',
        readyAt: new Date(baseTime.getTime())
      });
    expect(nonDonRes.status).toBe(400);
    expect(nonDonRes.body.error).toContain('non-donatable');

    // 3. POST /api/plan (does not persist)
    const planRes = await request(app)
      .post('/api/plan')
      .send({ ngoId: ngo._id });
    expect(planRes.status).toBe(200);
    expect(planRes.body.dispatchable).toBe(true);
    expect(planRes.body.recommended).toBe(true);
    expect(planRes.body.chosenRoute.stops.length).toBe(1);
    expect(planRes.body.chosenRoute.stops[0].slackMin).toBeGreaterThanOrEqual(0);
    expect(await Trip.countDocuments()).toBe(0); // verified no save

    // 4. POST /api/trips (persists PLANNED trip)
    const tripRes = await request(app)
      .post('/api/trips')
      .send({ ngoId: ngo._id });
    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.trip._id;

    // 5. POST /api/trips/:id/start -> IN_PROGRESS
    const startRes = await request(app)
      .post(`/api/trips/${tripId}/start`)
      .send({});
    expect(startRes.status).toBe(200);
    expect(startRes.body.trip.status).toBe('IN_PROGRESS');

    // 6. POST /api/trips/:id/stops/:donationId/collect
    const collectRes = await request(app)
      .post(`/api/trips/${tripId}/stops/${donationId}/collect`)
      .send({ collectedQty: 25 });
    expect(collectRes.status).toBe(200);
    expect(collectRes.body.stop.status).toBe('COLLECTED');
    expect(collectRes.body.stop.collectedQty).toBe(25);

    // 7. POST /api/trips/:id/deliver
    const deliverRes = await request(app)
      .post(`/api/trips/${tripId}/deliver`)
      .send({ deliveredQty: 25, ngoConfirmed: true });
    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.trip.status).toBe('COMPLETED');
    expect(deliverRes.body.trip.actualMetrics.meals).toBe(25);

    const completedDonation = await Donation.findById(donationId);
    expect(completedDonation.status).toBe('DELIVERED');
    expect(completedDonation.deliveredQty).toBe(25);

    // 8. GET /api/impact
    const impactRes = await request(app).get('/api/impact');
    expect(impactRes.status).toBe(200);
    expect(impactRes.body.mealsOffered).toBe(25);
    expect(impactRes.body.collectedMeals).toBe(25);
    expect(impactRes.body.deliveredMeals).toBe(25);
    expect(impactRes.body.deliveredPercentageOfOffered).toBe(100);
    expect(impactRes.body.donorsServedPerTrip).toBe(1);
    expect(impactRes.body.itemsDeliveredSafeWindow.insideSafeWindow).toBe(1);
  });

  // (5) Partial collection 10 -> 7
  test('(5) partial collection 10 -> 7 counts 7 everywhere', async () => {
    const donor1 = await Donor.create({
      name: 'Partial Donor 1',
      type: 'bakery',
      address: '10 St',
      location: { lat: 12.9800, lng: 77.6000 }
    });
    const donor2 = await Donor.create({
      name: 'Full Donor 2',
      type: 'bakery',
      address: '20 St',
      location: { lat: 12.9810, lng: 77.6010 }
    });

    const don1 = await Donation.create({
      donorId: donor1._id,
      mealsOffered: 10,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const don2 = await Donation.create({
      donorId: donor2._id,
      mealsOffered: 12,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const tripRes = await request(app)
      .post('/api/trips')
      .send({ ngoId: ngo._id });
    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.trip._id;

    await request(app).post(`/api/trips/${tripId}/start`).send({});

    // Collect 7 of 10 meals at Stop 1
    const collect1 = await request(app)
      .post(`/api/trips/${tripId}/stops/${don1._id}/collect`)
      .send({ collectedQty: 7 });
    expect(collect1.status).toBe(200);
    expect(collect1.body.stop.collectedQty).toBe(7);

    // Collect 12 of 12 meals at Stop 2
    const collect2 = await request(app)
      .post(`/api/trips/${tripId}/stops/${don2._id}/collect`)
      .send({ collectedQty: 12 });
    expect(collect2.status).toBe(200);

    // Deliver 19 meals
    const deliverRes = await request(app)
      .post(`/api/trips/${tripId}/deliver`)
      .send({ deliveredQty: 19, ngoConfirmed: true });
    expect(deliverRes.status).toBe(200);

    // Verify partial collection is counted as 7 on donation
    const checkDon1 = await Donation.findById(don1._id);
    expect(checkDon1.collectedQty).toBe(7);
    expect(checkDon1.deliveredQty).toBe(7);

    // Verify GET /api/impact counts 7
    const impactRes = await request(app).get('/api/impact');
    expect(impactRes.body.collectedMeals).toBe(19);
    expect(impactRes.body.deliveredMeals).toBe(19);
  });

  // (6) Cancellation replan dropping below 20 returns the warning flag
  test('(6) cancellation replan dropping below 20 returns the warning flag', async () => {
    const donor1 = await Donor.create({
      name: 'Donor 15 Meals',
      type: 'bakery',
      address: '15 St',
      location: { lat: 12.9800, lng: 77.6000 }
    });
    const donor2 = await Donor.create({
      name: 'Donor 10 Meals',
      type: 'bakery',
      address: '25 St',
      location: { lat: 12.9810, lng: 77.6010 }
    });

    const don1 = await Donation.create({
      donorId: donor1._id,
      mealsOffered: 15,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const don2 = await Donation.create({
      donorId: donor2._id,
      mealsOffered: 10,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const tripRes = await request(app)
      .post('/api/trips')
      .send({ ngoId: ngo._id });
    expect(tripRes.status).toBe(201);
    const tripId = tripRes.body.trip._id;

    await request(app).post(`/api/trips/${tripId}/start`).send({});

    // Donor 2 cancels: 25 -> 15 meals (below viable size 20)
    const cancelRes = await request(app)
      .post(`/api/trips/${tripId}/cancel-donation`)
      .send({ donationId: don2._id });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ok).toBe(true);
    expect(cancelRes.body.belowViableAfterReplan).toBe(true);
    expect(cancelRes.body.dispatchable).toBe(false);

    // Trip remains IN_PROGRESS (never silently killed)
    const checkTrip = await Trip.findById(tripId);
    expect(checkTrip.status).toBe('IN_PROGRESS');
  });

  // (7) Late collection auto-skips an item
  test('(7) late collection auto-skips an item', async () => {
    const donor1 = await Donor.create({
      name: 'Late Candidate Donor',
      type: 'bakery',
      address: '55 St',
      location: { lat: 12.9800, lng: 77.6000 }
    });
    const donor2 = await Donor.create({
      name: 'Companion Donor',
      type: 'bakery',
      address: '56 St',
      location: { lat: 12.9810, lng: 77.6010 }
    });

    // Donation with tight safe window
    const tightDonation = await Donation.create({
      donorId: donor1._id,
      mealsOffered: 10,
      category: 'cooked_hot',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 15 * 60 * 1000), // safe window 15 min
      status: 'AVAILABLE'
    });

    const companionDonation = await Donation.create({
      donorId: donor2._id,
      mealsOffered: 12,
      category: 'bakery_baked',
      readyAt: new Date(baseTime.getTime()),
      deliverBy: new Date(baseTime.getTime() + 4 * 60 * 60 * 1000),
      status: 'AVAILABLE'
    });

    const trip = await Trip.create({
      ngoId: ngo._id,
      status: 'IN_PROGRESS',
      stops: [
        {
          donationId: tightDonation._id,
          donorId: donor1._id,
          order: 1,
          plannedQty: 10,
          collectedQty: 0,
          status: 'PENDING'
        },
        {
          donationId: companionDonation._id,
          donorId: donor2._id,
          order: 2,
          plannedQty: 12,
          collectedQty: 0,
          status: 'PENDING'
        }
      ],
      plannedMetrics: { meals: 22, distanceKm: 5, cost: 100, costPerMeal: 4.5, durationMin: 25 }
    });

    // Driver arrives late: at = baseTime + 20 minutes (exceeds deliverBy of 15m)
    const lateTime = new Date(baseTime.getTime() + 20 * 60 * 1000);
    const collectRes = await request(app)
      .post(`/api/trips/${trip._id}/stops/${tightDonation._id}/collect`)
      .send({ collectedQty: 10, at: lateTime });

    expect(collectRes.status).toBe(200);
    expect(collectRes.body.autoSkipped).toBe(true);
    expect(collectRes.body.reason).toContain('Left out automatically: running late, would reach the NGO after its safe window');
    expect(collectRes.body.stop.status).toBe('SKIPPED');

    const checkDon = await Donation.findById(tightDonation._id);
    expect(checkDon.status).toBe('SKIPPED');
  });
});
