const jwt = require('jsonwebtoken');

function clientSecret() {
  return process.env.TICKET_JWT_SECRET || process.env.JWT_SECRET;
}

function crmSecret() {
  return process.env.CRM_JWT_SECRET || process.env.JWT_SECRET;
}

function signClientToken(client) {
  return jwt.sign(
    {
      type: 'ticket_client',
      email: client.clientEmail,
      companyCode: client.companyCode,
      clientCompanyName: client.clientCompanyName,
    },
    clientSecret(),
    { expiresIn: process.env.TICKET_CLIENT_TOKEN_TTL || '12h' }
  );
}

function verifyClientToken(token) {
  const payload = jwt.verify(token, clientSecret());
  if (payload.type !== 'ticket_client') {
    const err = new Error('Invalid client ticket token.');
    err.statusCode = 401;
    throw err;
  }
  return payload;
}

function verifyCrmToken(token) {
  const payload = jwt.verify(token, crmSecret());
  if (!['admin', 'crm_admin', 'project_manager'].includes(payload.role)) {
    const err = new Error('CRM access is required.');
    err.statusCode = 403;
    throw err;
  }
  return payload;
}

module.exports = {
  signClientToken,
  verifyClientToken,
  verifyCrmToken,
};
