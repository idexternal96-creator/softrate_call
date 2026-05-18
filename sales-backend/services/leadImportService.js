const Lead = require('../models/Lead');
const LeadImportBatch = require('../models/LeadImportBatch');
const { logChange } = require('./historyService');
const { invalidateLeadCaches } = require('./leadCache');
const { buildLeadDedupKey, enrichLeadForStorage } = require('./leadNormalization');
const eventBus = require('./eventBus');

const INSERT_CHUNK_SIZE = 1000;

async function createLeadImportBatch({ companyCode, assignedEmployeePhone, originalFileName, setLabel, rowCount }) {
  return LeadImportBatch.create({
    companyCode,
    assignedEmployeePhone: assignedEmployeePhone || '',
    originalFileName: originalFileName || '',
    setLabel: setLabel || '',
    rowCount: rowCount || 0,
    status: 'queued',
  });
}

function prepareLeadDocs(leads, importBatchId) {
  const dedupe = new Set();
  const docs = [];
  let duplicateCount = 0;
  let errorCount = 0;

  leads.forEach((lead, index) => {
    const enriched = enrichLeadForStorage(
      {
        ...lead,
        sheetOrder: Number.isFinite(lead.sheetOrder) ? lead.sheetOrder : index,
      },
      { importBatchId }
    );

    if (!enriched.companyCode || !enriched.assignedEmployeePhone || !enriched.contactNumber || !enriched.leadCompanyName) {
      errorCount += 1;
      return;
    }

    const dedupKey = buildLeadDedupKey(enriched);
    if (dedupe.has(dedupKey)) {
      duplicateCount += 1;
      return;
    }

    dedupe.add(dedupKey);
    docs.push(enriched);
  });

  return { docs, duplicateCount, errorCount };
}

async function insertLeadChunks(docs) {
  let insertedCount = 0;

  for (let index = 0; index < docs.length; index += INSERT_CHUNK_SIZE) {
    const chunk = docs.slice(index, index + INSERT_CHUNK_SIZE);
    const insertedDocs = await Lead.insertMany(chunk, { ordered: false });
    insertedCount += insertedDocs.length;
  }

  return insertedCount;
}

async function logBulkImportHistory(docs) {
  setImmediate(() => {
    docs.forEach((lead) => {
      logChange({
        companyCode: lead.companyCode,
        contactNumber: lead.contactNumber,
        contactName: lead.contactName,
        companyName: lead.leadCompanyName,
        action: 'Lead Created (Bulk)',
        newValue: lead.status,
        changedBy: lead.assignedEmployeePhone || 'Admin',
      }).catch((err) => {
        console.error('[history bulk error]:', err);
      });
    });
  });
}

async function processLeadImportBatch(batchId, leads) {
  const batch = await LeadImportBatch.findById(batchId);
  if (!batch) {
    throw new Error('Lead import batch not found.');
  }

  batch.status = 'processing';
  batch.startedAt = new Date();
  await batch.save();

  try {
    const { docs, duplicateCount, errorCount } = prepareLeadDocs(leads, batch._id);
    const insertedCount = await insertLeadChunks(docs);

    batch.status = 'completed';
    batch.insertedCount = insertedCount;
    batch.duplicateCount = duplicateCount;
    batch.errorCount = errorCount;
    batch.completedAt = new Date();
    await batch.save();

    await invalidateLeadCaches({
      companyCode: batch.companyCode,
      phone: batch.assignedEmployeePhone || undefined,
    });

    if (docs.length > 0) {
      eventBus.emitToCompany(batch.companyCode, {
        type: 'LEADS_REFRESH',
        importBatchId: String(batch._id),
      });
      eventBus.emitToCompany(batch.companyCode, {
        type: 'LEAD_IMPORT_COMPLETED',
        importBatchId: String(batch._id),
        insertedCount,
      });
      logBulkImportHistory(docs);
    }

    return {
      batchId: String(batch._id),
      count: insertedCount,
      duplicateCount,
      errorCount,
    };
  } catch (err) {
    batch.status = 'failed';
    batch.errorSummary = err.message;
    batch.completedAt = new Date();
    await batch.save();
    throw err;
  }
}

async function getLeadImportBatch(batchId) {
  return LeadImportBatch.findById(batchId).lean();
}

module.exports = {
  createLeadImportBatch,
  getLeadImportBatch,
  processLeadImportBatch,
};
