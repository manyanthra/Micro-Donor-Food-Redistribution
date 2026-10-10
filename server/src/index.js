const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root .env or server .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const app = require('./app');
const { connectDB } = require('../config/db');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`🚀 Micro-Donor Server running on http://localhost:${PORT}`);
      console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
    });
    return server;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
