require('dotenv').config();
const mongoose = require('mongoose');
const Lead = require('./models/Lead');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/softrate_record';

async function deleteDuplicateLeads() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    console.log('Finding duplicate leads by contactNumber...');

    const duplicates = await Lead.aggregate([
      {
        $group: {
          _id: "$contactNumber",
          ids: { $push: "$_id" },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    console.log(`Found ${duplicates.length} contact numbers with duplicates.`);

    let totalDeleted = 0;

    for (const group of duplicates) {
      // Keep the first one, delete the rest
      const [keepId, ...deleteIds] = group.ids;
      
      const result = await Lead.deleteMany({ _id: { $in: deleteIds } });
      totalDeleted += result.deletedCount;
      console.log(`Contact: ${group._id} | Kept: ${keepId} | Deleted: ${result.deletedCount}`);
    }

    console.log(`\n✅ Finished! Total leads deleted: ${totalDeleted}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

deleteDuplicateLeads();
