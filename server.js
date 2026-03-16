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

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
