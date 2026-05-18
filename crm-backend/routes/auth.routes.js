const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

function crmCredentialConfig() {
  return {
    email: (process.env.CRM_ADMIN_EMAIL || 'crm.admin@softrate.local').toLowerCase(),
    password: process.env.CRM_ADMIN_PASSWORD || 'CrmAdmin@123',
    companyCode: process.env.CRM_DEFAULT_COMPANY_CODE || '',
    companyName: process.env.CRM_DEFAULT_COMPANY_NAME || 'Softrate CRM',
  };
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const config = crmCredentialConfig();

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  if (String(email).toLowerCase() !== config.email || String(password) !== config.password) {
    return res.status(401).json({ success: false, message: 'Invalid CRM admin credentials.' });
  }

  const token = jwt.sign(
    { email: config.email, role: 'crm_admin', companyCode: config.companyCode },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.status(200).json({
    success: true,
    message: 'CRM login successful.',
    token,
    user: {
      id: 'crm-admin',
      name: 'CRM Admin',
      email: config.email,
      role: 'crm_admin',
      companyName: config.companyName,
      companyCode: config.companyCode,
      teamSize: '0',
    },
  });
});

module.exports = router;
