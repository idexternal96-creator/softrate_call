require('./loadEnv');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { getAiConfigStatus } = require('./services/ai/modelFactory');
const { runLeadBackfill } = require('./services/leadBackfillService');

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key] || !process.env[key].trim());

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/softrate_record';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    runLeadBackfill().catch((err) => {
      console.error('❌ Lead backfill failed:', err.message);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Softrate Record Backend is running 🚀', status: 'OK' });
});

// Auth/settings routes
app.use('/api/auth', require('./src/modules/settings/settings.routes'));

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
app.use('/api/admin', require('./src/modules/admin/admin.routes'));

// Employee routes
app.use('/api/employees', require('./src/modules/employees/employee.routes'));

// Follow-up/bookmark routes
app.use('/api/bookmarks', require('./src/modules/follow-ups/follow-up.routes'));

// Payment routes
app.use('/api/payment', require('./src/modules/payments/payment.routes'));

// Report/call log routes
app.use('/api/calllogs', require('./src/modules/reports/report.routes'));

// Lead routes
app.use('/api/leads', require('./src/modules/leads/lead.routes'));

// Invoice routes
app.use('/api/invoices', require('./src/modules/invoices/invoice.routes'));

// Quotation routes
app.use('/api/quotations', require('./src/modules/quotations/quotation.routes'));

// Break log routes
app.use('/api/breaklog', require('./src/modules/break-logs/break-log.routes'));

// History routes
app.use('/api/history', require('./src/modules/history/history.routes'));

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
  const aiConfig = getAiConfigStatus();
  if (aiConfig.ok) {
    console.log(`🤖 AI brief config ready for model ${process.env.OPENROUTER_MODEL}`);
  } else {
    console.warn(`⚠️ AI brief config incomplete. Missing: ${aiConfig.missing.join(', ')}`);
  }
});

module.exports = app;
