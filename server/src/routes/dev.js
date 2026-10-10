const express = require('express');
const router = express.Router();
const { seedDatabase } = require('../../seed/seed');

router.post('/reseed', async (req, res) => {
  try {
    const summary = await seedDatabase();
    res.json({
      ok: true,
      message: 'Database reseeded successfully',
      summary: {
        ngoName: summary.ngo.name,
        donorsCount: summary.donorsCount,
        donationsCount: summary.donationsCount,
        totalMealsOffered: summary.totalMealsOffered
      }
    });
  } catch (err) {
    console.error('Error during /api/dev/reseed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
