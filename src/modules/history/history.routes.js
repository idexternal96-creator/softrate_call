const express = require('express');
const History = require('../../../models/History');
const router = express.Router();

// GET — fetch history for a specific company/lead
router.get('/', async (req, res) => {
  try {
    const { companyCode, contactNumber, companyName } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const query = { companyCode };
    if (companyName) {
      query.companyName = companyName;
    }
    if (contactNumber) {
      query.contactNumber = contactNumber;
    }

    const logs = await History.find(query).sort({ timestamp: -1, createdAt: -1 });
    return res.status(200).json({ success: true, logs });
  } catch (err) {
    console.error('[get history]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching history.' });
  }
});

module.exports = router;
