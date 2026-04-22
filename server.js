require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/softrate_record';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Softrate Record Backend is running 🚀', status: 'OK' });
});

// Auth routes
app.use('/api/auth', require('./routes/auth'));

const cron = require('node-cron');
const User = require('./models/User');

// Expiration Cron Job (Runs every midnight)
cron.schedule('0 0 * * *', async () => {
  console.log('⏳ Running trial/subscription expiration check...');
  try {
    // Expire Free-Trial users after 7 days
    const expiredTrials = await User.updateMany(
      {
        status: 'Free-Trial',
        trialStartDate: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      { $set: { status: 'On due' } }
    );
    console.log(`✅ Updated ${expiredTrials.modifiedCount} trial users to 'On due'.`);

    // Expire Paid users whose subscriptionTo has passed
    const expiredPaid = await User.updateMany(
      {
        status: 'Paid',
        subscriptionTo: { $lt: new Date() }
      },
      { $set: { status: 'On due' } }
    );
    console.log(`✅ Updated ${expiredPaid.modifiedCount} paid users to 'On due' (subscription expired).`);
  } catch (err) {
    console.error('❌ Error in expiration cron job:', err);
  }
});

// Admin routes
app.use('/api/admin', require('./routes/admin'));

// Employee routes
app.use('/api/employees', require('./routes/employee'));

// Bookmark routes
app.use('/api/bookmarks', require('./routes/bookmark'));

// Payment routes
app.use('/api/payment', require('./routes/payment'));

// CallLog routes
app.use('/api/calllogs', require('./routes/calllog'));

// Lead routes
app.use('/api/leads', require('./routes/lead'));

// ── Real-time SSE events endpoint ────────────────────────────
const eventBus = require('./services/eventBus');

app.get('/api/events', (req, res) => {
  const { companyCode, phone } = req.query;
  if (!companyCode || !phone) {
    return res.status(400).json({ success: false, message: 'companyCode and phone required.' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
  res.flushHeaders();

  // Register client
  eventBus.addClient(companyCode, phone, res);

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', companyCode, phone })}\n\n`);

  // Heartbeat every 25s to keep connection alive through proxies/load balancers
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { clearInterval(heartbeat); }
  }, 25000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.removeClient(companyCode, phone, res);
  });
});

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
