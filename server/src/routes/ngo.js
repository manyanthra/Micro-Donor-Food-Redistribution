const express = require('express');
const router = express.Router();
const Ngo = require('../../models/Ngo');

// GET /api/ngo - Get primary NGO
router.get('/', async (req, res) => {
  try {
    const ngo = await Ngo.findOne({});
    if (!ngo) {
      return res.status(404).json({ ok: false, error: 'NGO not found. Please seed the database.' });
    }
    res.json({ ok: true, ngo });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
