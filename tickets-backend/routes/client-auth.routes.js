const express = require('express');
const { findConvertedClientByEmail, normalizeEmail } = require('../services/convertedClientService');
const { signClientToken } = require('../services/tokenService');
const { requireClient } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const client = await findConvertedClientByEmail(email);
    if (!client) {
      return res.status(403).json({ success: false, message: 'Only converted client emails can access ticket support.' });
    }

    const token = signClientToken(client);
    return res.json({ success: true, token, client });
  } catch (err) {
    console.error('[ticket client login]', err);
    return res.status(500).json({ success: false, message: 'Unable to login to ticket support.' });
  }
});

router.get('/me', requireClient, (req, res) => {
  res.json({ success: true, client: req.ticketClient });
});

module.exports = router;
