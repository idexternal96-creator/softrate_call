require('./loadEnv');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const requiredEnvVars = ['MONGO_URI'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key] || !process.env[key].trim());

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Finance MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ Finance MongoDB connection error:', err.message);
    process.exit(1);
  });

app.get('/', (req, res) => {
  res.json({ message: 'Softrate Finance Backend is running', status: 'OK' });
});

app.use('/api/finance', require('./routes/finance.routes'));

const PORT = process.env.FINANCE_PORT || 4400;
app.listen(PORT, () => {
  console.log(`🚀 Finance backend running on port ${PORT}`);
});

module.exports = app;
