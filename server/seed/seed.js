const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const { connectDB } = require('../config/db');
const Donor = require('../models/Donor');
const Donation = require('../models/Donation');
const Trip = require('../models/Trip');
const Ngo = require('../models/Ngo');
const { FOOD_CATEGORIES } = require('../config/foodRules');

// Haversine distance helper in km
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function seedDatabase() {
  await connectDB();

  console.log('--- Cleaning existing database collections ---');
  await Donation.deleteMany({});
  await Trip.deleteMany({});
  await Donor.deleteMany({});
  await Ngo.deleteMany({});

  const collegeLat = parseFloat(process.env.COLLEGE_LAT || '12.9716');
  const collegeLng = parseFloat(process.env.COLLEGE_LNG || '77.5946');
  const now = new Date();

  // 1. Create 1 NGO ~3.0 km North-East from college center
  // 1 deg lat ~ 111 km, ~3 km ~ 0.027 deg
  const ngoLat = Number((collegeLat + 0.0265).toFixed(6));
  const ngoLng = Number((collegeLng + 0.0085).toFixed(6));
  const ngoDistanceKm = haversineDistanceKm(collegeLat, collegeLng, ngoLat, ngoLng);

  const ngo = await Ngo.create({
    name: 'Asha Community Food Relief Network',
    address: 'Plot 104, Ring Road Hub, Sector 4 (3 km from College)',
    location: {
      lat: ngoLat,
      lng: ngoLng
    },
    nightlyCapacity: 100
  });

  console.log(`Created NGO: ${ngo.name} at distance ${ngoDistanceKm.toFixed(2)} km from college.`);

  // 2. Exactly 15 Donors within 1.5 km:
  // 9 bakeries, 4 restaurants, 2 hostel messes.
  // We specify explicit deterministic offsets from college center.
  // 1 deg lat = 111 km, 0.001 deg ~ 111 m
  const rawDonors = [
    // --- 9 Bakeries ---
    {
      name: 'The Daily Crust Bakery',
      type: 'bakery',
      address: 'Shop 4, College North Gate Rd',
      latOffset: 0.0035, // ~388m N
      lngOffset: 0.0015,
      phone: '+91 98450 11001',
      category: 'bakery_baked',
      mealsOffered: 12,
      // Incompatible pair with D10: D1 is ready now, safe for 8 hrs
      readyMinutesDelta: -30,
      overrideWindowMinutes: null,
      notes: 'Fresh sourdough loaves & dinner rolls'
    },
    {
      name: 'Sunrise Artisan Bakes',
      type: 'bakery',
      address: '12 Library Lane',
      latOffset: 0.0045, // ~500m N
      lngOffset: -0.0030,
      phone: '+91 98450 11002',
      category: 'bakery_baked',
      mealsOffered: 10,
      readyMinutesDelta: -60,
      overrideWindowMinutes: null,
      notes: 'Baguettes, multigrain rolls, milk buns'
    },
    {
      name: 'Golden Oven Pastry Shop',
      type: 'bakery',
      address: '28 Station Boulevard',
      latOffset: 0.0060, // ~660m NE
      lngOffset: 0.0040,
      phone: '+91 98450 11003',
      category: 'bakery_baked',
      mealsOffered: 14,
      readyMinutesDelta: -45,
      overrideWindowMinutes: null,
      notes: 'Croissants, savory puffs, wholewheat loaves'
    },
    {
      name: 'College Corner Bakery',
      type: 'bakery',
      address: 'Corner Stall, Main Junction',
      latOffset: -0.0025, // ~280m S
      lngOffset: 0.0020,
      phone: '+91 98450 11004',
      category: 'cooked_hot', // Deliberate expired cooked food donation
      mealsOffered: 8,
      readyMinutesDelta: -200, // Ready 3h20m ago! safeWindow=120m -> expired 80m ago
      overrideWindowMinutes: null,
      notes: 'Hot vegetable patties held past safe holding limit (EXPIRED TEST CASE)'
    },
    {
      name: 'Sweet Cravings Patisserie',
      type: 'bakery',
      address: 'Shop 17, University Walkway',
      latOffset: -0.0050, // ~555m S
      lngOffset: -0.0035,
      phone: '+91 98450 11005',
      category: 'bakery_baked',
      mealsOffered: 11,
      readyMinutesDelta: -15,
      overrideWindowMinutes: null,
      notes: 'Brioche buns and fruit tea breads'
    },
    {
      name: 'Flour & Yeast Workshop',
      type: 'bakery',
      address: '45 Tech Hub Alley',
      latOffset: 0.0075, // ~830m NE
      lngOffset: -0.0020,
      phone: '+91 98450 11006',
      category: 'packaged_sealed',
      mealsOffered: 15,
      readyMinutesDelta: -120,
      overrideWindowMinutes: null,
      notes: 'Sealed loaves of sandwich bread, dated for tomorrow'
    },
    {
      name: 'Campus Bread & Bun House',
      type: 'bakery',
      address: '8 West Campus Road',
      latOffset: -0.0065, // ~720m SW
      lngOffset: 0.0050,
      phone: '+91 98450 11007',
      category: 'bakery_baked',
      mealsOffered: 9,
      readyMinutesDelta: -40,
      overrideWindowMinutes: null,
      notes: 'Assorted dinner buns and garlic bread'
    },
    {
      name: 'Velvet Crumbs Boulangerie',
      type: 'bakery',
      address: '92 Metro Feeder Lane',
      latOffset: 0.0080, // ~900m N
      lngOffset: 0.0065,
      phone: '+91 98450 11008',
      category: 'bakery_baked',
      mealsOffered: 13,
      readyMinutesDelta: -90,
      overrideWindowMinutes: null,
      notes: 'Whole wheat bread, herb focaccia'
    },
    {
      name: 'Warm Hearth Bakery',
      type: 'bakery',
      address: 'Plot 2, Outskirts Ring Road',
      latOffset: -0.0125, // ~1.46 km SW (TINY FAR-AWAY DONOR)
      lngOffset: -0.0055,
      phone: '+91 98450 11009',
      category: 'bakery_baked',
      mealsOffered: 5, // Exactly 5 meals (tiny donor)
      readyMinutesDelta: -30,
      overrideWindowMinutes: null,
      notes: 'Isolated outpost bakery with small batch (TINY FAR-AWAY TEST CASE)'
    },

    // --- 4 Restaurants ---
    {
      name: 'Campus Spice Kitchen',
      type: 'restaurant',
      address: 'Shop 5, College North Gate Rd (next to Daily Crust)',
      latOffset: 0.0036, // ~395m N (within 20m of Daily Crust Bakery!)
      lngOffset: 0.0016,
      phone: '+91 98450 12001',
      category: 'cooked_hot',
      mealsOffered: 12,
      // INCOMPATIBLE DEADLINE PAIR: Hot food ready 105 mins ago, safe window is 120m!
      // Must be collected within 15 minutes!
      readyMinutesDelta: -105,
      overrideWindowMinutes: 120,
      notes: 'Dal makhani and steamed jeera rice (URGENT EXPIRY TEST CASE - 15m remaining)'
    },
    {
      name: 'Green Olive Bistro',
      type: 'restaurant',
      address: '15 High Street Arcade',
      latOffset: -0.0040, // ~450m S
      lngOffset: 0.0045,
      phone: '+91 98450 12002',
      category: 'leftover_plate', // DELIBERATE NON-DONATABLE CATEGORY
      mealsOffered: 10,
      readyMinutesDelta: -20,
      overrideWindowMinutes: 0,
      notes: 'Customer buffet and dining table scrapings (NON-DONATABLE TEST CASE)'
    },
    {
      name: 'Taste of Bengal Diner',
      type: 'restaurant',
      address: '77 Student Quad',
      latOffset: 0.0055, // ~610m NE
      lngOffset: -0.0060,
      phone: '+91 98450 12003',
      category: 'cooked_cold',
      mealsOffered: 8,
      readyMinutesDelta: -50,
      overrideWindowMinutes: null,
      notes: 'Chilled paneer gravy and spiced lentils in cold storage'
    },
    {
      name: 'Royal Biryani Point',
      type: 'restaurant',
      address: '101 Commercial Strip',
      latOffset: 0.0020, // ~250m E
      lngOffset: 0.0070,
      phone: '+91 98450 12004',
      category: 'cooked_hot',
      mealsOffered: 14,
      readyMinutesDelta: -30,
      overrideWindowMinutes: null,
      notes: 'Hot vegetable dum biryani, held in thermal warming containers'
    },

    // --- 2 Hostel Messes ---
    {
      name: 'Aryabhatta Hostel Mess',
      type: 'hostel_mess',
      address: 'Block C, Engineering Campus',
      latOffset: -0.0010, // ~110m SW
      lngOffset: -0.0030,
      phone: '+91 98450 13001',
      category: 'cooked_hot',
      mealsOffered: 15,
      readyMinutesDelta: -40,
      overrideWindowMinutes: null,
      notes: 'Clean untasted chapati & mixed vegetable sabzi from mess heating counters'
    },
    {
      name: 'Kaveri Hall Food Court',
      type: 'hostel_mess',
      address: 'East Dining Hall, Central Campus',
      latOffset: 0.0015, // ~170m NE
      lngOffset: 0.0025,
      phone: '+91 98450 13002',
      category: 'raw_produce',
      mealsOffered: 15,
      readyMinutesDelta: -60,
      overrideWindowMinutes: null,
      notes: 'Surplus fresh uncut melons, apples, and salad vegetables'
    }
  ];

  const createdDonors = [];
  const createdDonations = [];
  const summaryRows = [];

  for (let i = 0; i < rawDonors.length; i++) {
    const raw = rawDonors[i];
    const donorLat = Number((collegeLat + raw.latOffset).toFixed(6));
    const donorLng = Number((collegeLng + raw.lngOffset).toFixed(6));
    const distFromCollege = haversineDistanceKm(collegeLat, collegeLng, donorLat, donorLng);
    const distFromNgo = haversineDistanceKm(ngoLat, ngoLng, donorLat, donorLng);

    const donor = await Donor.create({
      name: raw.name,
      type: raw.type,
      address: raw.address,
      location: {
        lat: donorLat,
        lng: donorLng
      },
      phone: raw.phone
    });
    createdDonors.push(donor);

    // Compute timestamps relative to 'now'
    const readyAt = new Date(now.getTime() + raw.readyMinutesDelta * 60 * 1000);
    const catConfig = FOOD_CATEGORIES[raw.category];
    const windowMinutes = raw.overrideWindowMinutes !== null ? raw.overrideWindowMinutes : (catConfig ? catConfig.safeWindowMinutes : 120);
    const collectBy = new Date(readyAt.getTime() + windowMinutes * 60 * 1000);

    // Evaluate initial status & exclusion reasons
    let status = 'AVAILABLE';
    let exclusionReason = null;

    if (!catConfig || !catConfig.donatable) {
      status = 'REJECTED';
      exclusionReason = `Non-donatable category (${raw.category})`;
    } else if (collectBy < now) {
      status = 'REJECTED';
      exclusionReason = 'Donation expired before collection could be scheduled';
    }

    const donation = await Donation.create({
      donorId: donor._id,
      mealsOffered: raw.mealsOffered,
      category: raw.category,
      readyAt,
      collectBy,
      status,
      statusHistory: [
        {
          status: status,
          at: new Date(now.getTime() + raw.readyMinutesDelta * 60 * 1000),
          note: exclusionReason || 'Surplus posted by donor'
        }
      ],
      exclusionReason,
      plannedQty: 0,
      collectedQty: 0,
      deliveredQty: 0,
      notes: raw.notes
    });
    createdDonations.push(donation);

    summaryRows.push({
      '#': i + 1,
      Donor: donor.name,
      Type: donor.type,
      Category: raw.category,
      Meals: raw.mealsOffered,
      'Dist College (km)': distDistance(distFromCollege),
      'Dist NGO (km)': distDistance(distFromNgo),
      'Ready At': formatTime(readyAt),
      'Collect By': formatTime(collectBy),
      Status: status,
      Flag: exclusionReason || 'Active'
    });
  }

  function distDistance(d) {
    return `${d.toFixed(2)} km`;
  }

  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const totalMealsOffered = createdDonations.reduce((sum, d) => sum + d.mealsOffered, 0);

  console.log('\n================== SEED DATA SUMMARY ==================');
  console.log(`College Center: [${collegeLat}, ${collegeLng}] (${process.env.COLLEGE_NAME || 'Central Engineering College'})`);
  console.log(`NGO: ${ngo.name} [${ngoLat}, ${ngoLng}] | Capacity: ${ngo.nightlyCapacity} meals | Dist: ${ngoDistanceKm.toFixed(2)} km`);
  console.log(`Total Donors: ${createdDonors.length} (9 Bakeries, 4 Restaurants, 2 Hostel Messes)`);
  console.log(`Total Meals Offered: ${totalMealsOffered} (Threshold > 120: ${totalMealsOffered > 120 ? 'PASSED ✅' : 'FAILED ❌'})`);
  console.table(summaryRows);
  console.log('========================================================\n');

  return {
    ngo,
    donorsCount: createdDonors.length,
    donationsCount: createdDonations.length,
    totalMealsOffered,
    donors: createdDonors,
    donations: createdDonations
  };
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Database seeding completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Database seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seedDatabase, haversineDistanceKm };
