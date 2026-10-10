const express = require('express');
const cors = require('cors');
const { FOOD_CATEGORIES, ROUTING_CONFIG } = require('../config/foodRules');

const donorsRouter = require('./routes/donors');
const donationsRouter = require('./routes/donations');
const ngoRouter = require('./routes/ngo');
const tripsRouter = require('./routes/trips');
const devRouter = require('./routes/dev');

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Config endpoint for client
app.get('/api/config', (req, res) => {
  res.json({
    foodCategories: FOOD_CATEGORIES,
    routingConfig: ROUTING_CONFIG,
    college: {
      lat: parseFloat(process.env.COLLEGE_LAT || '12.9716'),
      lng: parseFloat(process.env.COLLEGE_LNG || '77.5946'),
      name: process.env.COLLEGE_NAME || 'Central Engineering College'
    }
  });
});

// Mount domain routes
app.use('/api/donors', donorsRouter);
app.use('/api/donations', donationsRouter);
app.use('/api/ngo', ngoRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/dev', devRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

module.exports = app;
