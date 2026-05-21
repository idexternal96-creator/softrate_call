require('../loadEnv');

const mongoose = require('mongoose');
const { ensureLeadIndexes } = require('../services/leadIndexService');

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri || !mongoUri.trim()) {
    throw new Error('MONGO_URI is required to ensure lead indexes.');
  }

  mongoose.set('autoIndex', false);
  await mongoose.connect(mongoUri);

  try {
    await ensureLeadIndexes(console);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(`❌ Lead index ensure failed: ${err.message}`);
  process.exit(1);
});
