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
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Ticket MongoDB connected successfully'))
  .catch((err) => {
    console.error('Ticket MongoDB connection error:', err.message);
    process.exit(1);
  });

app.get('/', (req, res) => {
  res.json({ success: true, service: 'tickets-backend', status: 'OK' });
});

app.get('/api/tickets/health', (req, res) => {
  res.json({ success: true, service: 'tickets-backend', status: 'OK' });
});

app.use('/api/client-auth', require('./routes/client-auth.routes'));
app.use('/api/client/tickets', require('./routes/client-tickets.routes'));
app.use('/api/crm/tickets', require('./routes/crm-tickets.routes'));

const PORT = process.env.TICKETS_PORT || 4300;
app.listen(PORT, () => {
  console.log(`Tickets backend running on port ${PORT}`);
});

module.exports = app;
