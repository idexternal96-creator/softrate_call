const { verifyClientToken, verifyCrmToken } = require('../services/tokenService');
const { findConvertedClientByEmail } = require('../services/convertedClientService');

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function requireClient(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Client login is required.' });
    const payload = verifyClientToken(token);
    const client = await findConvertedClientByEmail(payload.email);
    if (!client) return res.status(401).json({ success: false, message: 'Client access is no longer valid.' });
    req.ticketClient = client;
    return next();
  } catch (err) {
    return res.status(err.statusCode || 401).json({ success: false, message: err.message || 'Client login is required.' });
  }
}

function requireCrm(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'CRM login is required.' });
    req.crmUser = verifyCrmToken(token);
    return next();
  } catch (err) {
    return res.status(err.statusCode || 401).json({ success: false, message: err.message || 'CRM login is required.' });
  }
}

module.exports = {
  requireClient,
  requireCrm,
};
