const Lead = require('../models/Lead');
const { enrichLeadForStorage } = require('./leadNormalization');

let backfillStarted = false;

async function runLeadBackfill() {
  if (backfillStarted) return;
  backfillStarted = true;

  const query = {
    $or: [
      { contactNumberNormalized: { $exists: false } },
      { leadCompanyNameLower: { $exists: false } },
      { contactNameLower: { $exists: false } },
      { directorEmailLower: { $exists: false } },
      { setLabelLower: { $exists: false } },
      { isArchived: { $exists: false } },
    ],
  };

  const cursor = Lead.find(query).lean().cursor();
  const ops = [];
  let processed = 0;

  for await (const lead of cursor) {
    const normalized = enrichLeadForStorage(lead, { importBatchId: lead.importBatchId || null });
    ops.push({
      updateOne: {
        filter: { _id: lead._id },
        update: {
          $set: {
            contactNumberNormalized: normalized.contactNumberNormalized,
            leadCompanyNameLower: normalized.leadCompanyNameLower,
            contactNameLower: normalized.contactNameLower,
            directorEmailLower: normalized.directorEmailLower,
            setLabelLower: normalized.setLabelLower,
            isArchived: normalized.isArchived,
            remarks: normalized.remarks,
            contactNumber: normalized.contactNumber,
            contactName: normalized.contactName,
            leadCompanyName: normalized.leadCompanyName,
            setLabel: normalized.setLabel,
            directorEmailAddress: normalized.directorEmailAddress,
            companyDescription: normalized.companyDescription,
            mainDivisionDescription: normalized.mainDivisionDescription,
          },
        },
      },
    });

    if (ops.length >= 500) {
      await Lead.bulkWrite(ops, { ordered: false });
      processed += ops.length;
      ops.length = 0;
    }
  }

  if (ops.length > 0) {
    await Lead.bulkWrite(ops, { ordered: false });
    processed += ops.length;
  }

  if (processed > 0) {
    console.log(`✅ Lead search backfill updated ${processed} documents`);
  }
}

module.exports = {
  runLeadBackfill,
};
