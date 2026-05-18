require('./loadEnv');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET'];
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

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ CRM MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ CRM MongoDB connection error:', err.message);
    process.exit(1);
  });

app.get('/', (req, res) => {
  res.json({ message: 'Softrate CRM Backend is running', status: 'OK' });
});

app.get('/api/crm/health', (req, res) => {
  res.json({ success: true, service: 'crm-backend', status: 'OK' });
});

app.use('/api/crm/auth', require('./routes/auth.routes'));
app.use('/api/crm', require('./routes/crm.routes'));

const PORT = process.env.CRM_PORT || 4100;
app.listen(PORT, () => {
  console.log(`🚀 CRM backend running on port ${PORT}`);
});

module.exports = app;
