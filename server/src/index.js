const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const { connectDB, isUsingMemoryDB } = require('../config/db');
const { seedDatabase } = require('../seed/seed');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to MongoDB or start the in-memory fallback.
    await connectDB();

    console.log('✅ Database connection established.');

    // Seed the same in-memory database used by the API.
    if (isUsingMemoryDB()) {
      console.log('🌱 Seeding demo data into the active database...');

      const result = await seedDatabase();

      console.log('✅ Demo data initialized.');
      console.log(`Donors: ${result.donorsCount}`);
      console.log(`Donations: ${result.donationsCount}`);
      console.log(`Meals offered: ${result.totalMealsOffered}`);
    }

    // Start the API after initialization.
    const server = app.listen(PORT, () => {
      console.log(`🚀 Micro-Donor Server running on http://localhost:${PORT}`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
    });

    return server;
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };