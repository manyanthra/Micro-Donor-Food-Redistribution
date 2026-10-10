const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoMemoryServer = null;

async function connectDB(customUri = null) {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  const uri = customUri || process.env.MONGODB_URI;

  if (uri && uri.trim() !== '') {
    try {
      console.log(`Connecting to MongoDB via URI: ${uri}`);
      await mongoose.connect(uri);
      console.log('MongoDB connected successfully.');
      return mongoose.connection;
    } catch (err) {
      console.warn(`Failed to connect to provided MONGODB_URI: ${err.message}. Falling back to mongodb-memory-server...`);
    }
  }

  console.log('Starting in-memory MongoDB server (mongodb-memory-server)...');
  mongoMemoryServer = await MongoMemoryServer.create();
  const memUri = mongoMemoryServer.getUri();
  console.log(`In-memory MongoDB running at: ${memUri}`);
  await mongoose.connect(memUri);
  console.log('Connected to in-memory MongoDB.');
  return mongoose.connection;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
}

function isUsingMemoryDB() {
  return Boolean(mongoMemoryServer);
}

module.exports = {
  connectDB,
  disconnectDB,
  isUsingMemoryDB
};
