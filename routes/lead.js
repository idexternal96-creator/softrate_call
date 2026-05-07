const express = require('express');
const Lead = require('../models/Lead');
const eventBus = require('../services/eventBus');
const { getOrSet } = require('../services/cacheService');
const {
  LEAD_CACHE_TTLS,
  buildAdminCompanyKey,
  buildAdminLeadListKey,
  buildAdminSetKey,
  buildEmployeeCompanyKey,
  buildEmployeeLeadListKey,
  buildEmployeeSetKey,
  invalidateLeadCaches,
} = require('../services/leadCache');
const { logChange } = require('../services/historyService');
const {
  createLeadImportBatch,
  getLeadImportBatch,
  processLeadImportBatch,
} = require('../services/leadImportService');
const { canUseQueue, queueLeadImportJob } = require('../services/leadImportQueue');
const {
  buildLeadSearchQuery,
  getLeadCompanies,
  getLeadSets,
  parsePagination,
} = require('../services/leadQueryService');
const { enrichLeadForStorage, normalizeRemarks, normalizeText } = require('../services/leadNormalization');
const { getAiBriefForLead } = require('../services/ai/researchWorkflow');
const { getAiSuggestionForLead } = require('../services/ai/suggestionWorkflow');

const router = express.Router();

function normalizeLeadForResponse(lead) {
  if (!lead) return lead;
  return {
    ...lead,
    remarks: normalizeRemarks(lead.remarks),
  };
}

function buildLeadListResponse({ items, total, page, pageSize, sets, companies, cacheHit, isPaginated }) {
  return {
    success: true,
    items,
    leads: items,
    page,
    pageSize,
    total,
    hasMore: isPaginated ? (page * pageSize) < total : false,
    sets,
    companies,
    cache: cacheHit ? 'hit' : 'miss',
  };
}

async function getCachedLeadSets({ companyCode, phone, cacheKey }) {
  const { value } = await getOrSet(cacheKey, LEAD_CACHE_TTLS.facets, async () => {
    return getLeadSets({ companyCode, phone, query: {} });
  });
  return value;
}

async function getCachedLeadCompanies({ companyCode, phone, query, cacheKey }) {
  const companiesQuery = { ...query };
  delete companiesQuery.company;

  const { value } = await getOrSet(cacheKey, LEAD_CACHE_TTLS.facets, async () => {
    return getLeadCompanies({ companyCode, phone, query: companiesQuery });
  });
  return value;
}

async function fetchLeadList({ companyCode, phone, scope, reqQuery }) {
  const pagination = parsePagination(reqQuery);
  const searchContext = buildLeadSearchQuery({ companyCode, phone, query: reqQuery });
  const cacheParams = {
    query: reqQuery,
    page: pagination.page,
    pageSize: pagination.pageSize,
    scope,
  };
  const cacheKey = scope === 'employee'
    ? buildEmployeeLeadListKey(companyCode, phone, cacheParams)
    : buildAdminLeadListKey(companyCode, cacheParams);

  const { cacheHit, value } = await getOrSet(cacheKey, LEAD_CACHE_TTLS.list, async () => {
    const { mongoQuery, projection, sort } = searchContext;

    if (!pagination.isPaginated) {
      const items = await Lead.find(mongoQuery, projection).sort(sort).lean();
      return {
        items: items.map(normalizeLeadForResponse),
        total: items.length,
      };
    }

    const [total, items] = await Promise.all([
      Lead.countDocuments(mongoQuery),
      Lead.find(mongoQuery, projection)
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.pageSize)
        .lean(),
    ]);

    return {
      items: items.map(normalizeLeadForResponse),
      total,
    };
  });

  const [setPayload, companyPayload] = await Promise.all([
    scope === 'employee'
      ? getCachedLeadSets({
          companyCode,
          phone,
          cacheKey: buildEmployeeSetKey(companyCode, phone, {}),
        })
      : getCachedLeadSets({
          companyCode,
          phone: undefined,
          cacheKey: buildAdminSetKey(companyCode, {}),
        }),
    scope === 'employee'
      ? getCachedLeadCompanies({
          companyCode,
          phone,
          query: reqQuery,
          cacheKey: buildEmployeeCompanyKey(companyCode, phone, reqQuery),
        })
      : getCachedLeadCompanies({
          companyCode,
          phone: undefined,
          query: reqQuery,
          cacheKey: buildAdminCompanyKey(companyCode, reqQuery),
        }),
  ]);

  return buildLeadListResponse({
    items: value.items,
    total: value.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    sets: setPayload.sets,
    companies: companyPayload.companies,
    cacheHit,
    isPaginated: pagination.isPaginated,
  });
}

async function invalidateLeadScope(companyCode, phone) {
  await invalidateLeadCaches({ companyCode, phone });
}

// POST — create a single lead
router.post('/', async (req, res) => {
  try {
    const payload = enrichLeadForStorage(req.body);
    if (!payload.companyCode || !payload.assignedEmployeePhone || !payload.contactNumber || !payload.leadCompanyName) {
      return res.status(400).json({
        success: false,
        message: 'companyCode, assignedEmployeePhone, leadCompanyName, and contactNumber are required.',
      });
    }

    const lead = await Lead.create(payload);
    const responseLead = normalizeLeadForResponse(lead.toObject());

    await invalidateLeadScope(lead.companyCode, lead.assignedEmployeePhone);
    eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_CREATED', lead: responseLead });

    await logChange({
      companyCode: lead.companyCode,
      contactNumber: lead.contactNumber,
      contactName: lead.contactName,
      companyName: lead.leadCompanyName,
      action: 'Lead Created',
      newValue: lead.status,
      changedBy: lead.assignedEmployeePhone,
    });

    return res.status(201).json({ success: true, lead: responseLead });
  } catch (err) {
    console.error('[post lead]', err);
    return res.status(500).json({ success: false, message: 'Server error saving lead.' });
  }
});

// POST — create bulk leads via mapped JSON data (Excel upload)
router.post('/bulk', async (req, res) => {
  try {
    const { leads, async: asyncImport, originalFileName, setLabel } = req.body || {};
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, message: 'No leads provided for bulk insert.' });
    }

    const firstLead = enrichLeadForStorage(leads[0]);
    if (!firstLead.companyCode || !firstLead.assignedEmployeePhone) {
      return res.status(400).json({ success: false, message: 'Bulk leads require companyCode and assignedEmployeePhone.' });
    }

    const batch = await createLeadImportBatch({
      companyCode: firstLead.companyCode,
      assignedEmployeePhone: firstLead.assignedEmployeePhone,
      originalFileName,
      setLabel: setLabel || firstLead.setLabel,
      rowCount: leads.length,
    });

    if (asyncImport && canUseQueue()) {
      const job = await queueLeadImportJob({
        batchId: String(batch._id),
        leads,
      });

      return res.status(202).json({
        success: true,
        queued: true,
        batchId: String(batch._id),
        jobId: job?.id || null,
      });
    }

    const result = await processLeadImportBatch(batch._id, leads);
    return res.status(201).json({
      success: true,
      queued: false,
      batchId: result.batchId,
      count: result.count,
      duplicateCount: result.duplicateCount,
      errorCount: result.errorCount,
    });
  } catch (err) {
    console.error('[bulk post leads]', err);
    return res.status(500).json({ success: false, message: 'Server error bulk saving leads.' });
  }
});

router.get('/import-batches/:id', async (req, res) => {
  try {
    const batch = await getLeadImportBatch(req.params.id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Lead import batch not found.' });
    }
    return res.status(200).json({ success: true, batch });
  } catch (err) {
    console.error('[get lead import batch]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching import batch.' });
  }
});

// GET — fetch only distinct set labels for an employee
router.get('/employee/sets', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }

    const payload = await getCachedLeadSets({
      companyCode,
      phone,
      cacheKey: buildEmployeeSetKey(companyCode, phone, {}),
    });

    return res.status(200).json({ success: true, sets: payload.sets, items: payload.items });
  } catch (err) {
    console.error('[get employee sets]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching sets.' });
  }
});

router.get('/employee/companies', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }

    const payload = await getCachedLeadCompanies({
      companyCode,
      phone,
      query: req.query,
      cacheKey: buildEmployeeCompanyKey(companyCode, phone, req.query),
    });

    return res.status(200).json({ success: true, companies: payload.companies, names: payload.names });
  } catch (err) {
    console.error('[get employee companies]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching companies.' });
  }
});

// GET — fetch leads for an employee
router.get('/employee', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }

    const response = await fetchLeadList({
      companyCode,
      phone,
      scope: 'employee',
      reqQuery: req.query,
    });

    return res.status(200).json(response);
  } catch (err) {
    console.error('[get employee leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

router.get('/admin/sets', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const payload = await getCachedLeadSets({
      companyCode,
      phone: undefined,
      cacheKey: buildAdminSetKey(companyCode, {}),
    });

    return res.status(200).json({ success: true, sets: payload.sets, items: payload.items });
  } catch (err) {
    console.error('[get admin sets]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching sets.' });
  }
});

router.get('/admin/companies', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const payload = await getCachedLeadCompanies({
      companyCode,
      phone: undefined,
      query: req.query,
      cacheKey: buildAdminCompanyKey(companyCode, req.query),
    });

    return res.status(200).json({ success: true, companies: payload.companies, names: payload.names });
  } catch (err) {
    console.error('[get admin companies]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching companies.' });
  }
});

// GET — fetch leads for an admin's company
router.get('/admin', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const response = await fetchLeadList({
      companyCode,
      phone: undefined,
      scope: 'admin',
      reqQuery: req.query,
    });

    return res.status(200).json(response);
  } catch (err) {
    console.error('[get admin leads]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching leads.' });
  }
});

// POST — remove all leads in a set for an employee
router.post('/set/delete', async (req, res) => {
  try {
    const { companyCode, phone, setLabel } = req.body;
    if (!companyCode || !phone || !setLabel) {
      return res.status(400).json({ success: false, message: 'companyCode, phone, and setLabel are required.' });
    }

    const result = await Lead.deleteMany({
      companyCode,
      assignedEmployeePhone: phone,
      setLabelLower: normalizeText(setLabel),
      isArchived: false,
    });

    await invalidateLeadScope(companyCode, phone);
    eventBus.emitToEmployee(companyCode, phone, { type: 'LEADS_REFRESH' });
    return res.status(200).json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[delete set leads]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting set.' });
  }
});

// POST — remove all leads in a set for the whole company
router.post('/admin/delete-set', async (req, res) => {
  try {
    const { companyCode, setLabel } = req.body;
    if (!companyCode || !setLabel) {
      return res.status(400).json({ success: false, message: 'companyCode and setLabel are required.' });
    }

    const result = await Lead.deleteMany({
      companyCode,
      setLabelLower: normalizeText(setLabel),
      isArchived: false,
    });

    await invalidateLeadScope(companyCode);
    eventBus.emitToCompany(companyCode, { type: 'LEADS_REFRESH' });
    return res.status(200).json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error('[admin delete set leads]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting admin set.' });
  }
});

// GET — fetch cached or newly generated AI brief for a lead/company
router.get('/:id/ai-brief', async (req, res) => {
  try {
    const result = await getAiBriefForLead(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[get lead ai brief]', err);
    return res.status(500).json({
      success: false,
      retryable: true,
      message: 'Server error generating AI brief.',
    });
  }
});

// POST — fetch scenario-specific AI suggestion for a lead/workflow
router.post('/:id/ai-suggestion', async (req, res) => {
  try {
    const result = await getAiSuggestionForLead(req.params.id, req.body || {});
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[get lead ai suggestion]', err);
    return res.status(500).json({
      success: false,
      retryable: true,
      message: 'Server error generating AI suggestion.',
    });
  }
});

// DELETE — remove a single lead by ID
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (lead) {
      await invalidateLeadScope(lead.companyCode, lead.assignedEmployeePhone);
      eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_DELETED', id: req.params.id });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[delete lead]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting lead.' });
  }
});

// PATCH — update lead status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
    }

    const oldLead = await Lead.findById(req.params.id);
    if (!oldLead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    const oldStatus = oldLead.status;
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status: String(status).trim() }, { new: true });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    const responseLead = normalizeLeadForResponse(lead.toObject());
    await invalidateLeadScope(lead.companyCode, lead.assignedEmployeePhone);
    eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead: responseLead });

    await logChange({
      companyCode: lead.companyCode,
      contactNumber: lead.contactNumber,
      contactName: lead.contactName,
      companyName: lead.leadCompanyName,
      action: 'Status Change',
      oldValue: oldStatus,
      newValue: lead.status,
      changedBy: lead.assignedEmployeePhone,
    });

    return res.status(200).json({ success: true, lead: responseLead });
  } catch (err) {
    console.error('[update lead status]', err);
    return res.status(500).json({ success: false, message: 'Server error updating lead status.' });
  }
});

// PATCH — update lead flags (isStarred, isFavourite)
router.patch('/:id/flags', async (req, res) => {
  try {
    const update = {};
    if (req.body.isStarred !== undefined) update.isStarred = req.body.isStarred;
    if (req.body.isFavourite !== undefined) update.isFavourite = req.body.isFavourite;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'No flags provided to update.' });
    }

    const oldLead = await Lead.findById(req.params.id);
    if (!oldLead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    const responseLead = normalizeLeadForResponse(lead.toObject());
    await invalidateLeadScope(lead.companyCode, lead.assignedEmployeePhone);
    eventBus.emitToEmployee(lead.companyCode, lead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead: responseLead });

    if (update.isStarred !== undefined && update.isStarred !== oldLead.isStarred) {
      await logChange({
        companyCode: lead.companyCode,
        contactNumber: lead.contactNumber,
        contactName: lead.contactName,
        companyName: lead.leadCompanyName,
        action: lead.isStarred ? 'Starred' : 'Unstarred',
        changedBy: lead.assignedEmployeePhone,
      });
    }
    if (update.isFavourite !== undefined && update.isFavourite !== oldLead.isFavourite) {
      await logChange({
        companyCode: lead.companyCode,
        contactNumber: lead.contactNumber,
        contactName: lead.contactName,
        companyName: lead.leadCompanyName,
        action: lead.isFavourite ? 'Favourited' : 'Unfavourited',
        changedBy: lead.assignedEmployeePhone,
      });
    }

    return res.status(200).json({ success: true, lead: responseLead });
  } catch (err) {
    console.error('[update lead flags]', err);
    return res.status(500).json({ success: false, message: 'Server error updating lead flags.' });
  }
});

// POST — add a remark to a lead
router.post('/:id/remarks', async (req, res) => {
  try {
    const { remark } = req.body;
    if (!remark) {
      return res.status(400).json({ success: false, message: 'Remark is required.' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    const updatedRemarks = [...normalizeRemarks(lead.remarks), String(remark).trim()];
    const updatedLead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: { remarks: updatedRemarks } },
      { new: true }
    );

    const responseLead = normalizeLeadForResponse(updatedLead.toObject());
    await invalidateLeadScope(updatedLead.companyCode, updatedLead.assignedEmployeePhone);
    eventBus.emitToEmployee(updatedLead.companyCode, updatedLead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead: responseLead });

    await logChange({
      companyCode: updatedLead.companyCode,
      contactNumber: updatedLead.contactNumber,
      contactName: updatedLead.contactName,
      companyName: updatedLead.leadCompanyName,
      action: 'Remark Added',
      newValue: remark,
      details: `To Director: ${updatedLead.contactName || 'Primary'}`,
      changedBy: updatedLead.assignedEmployeePhone,
    });

    return res.status(200).json({ success: true, lead: responseLead });
  } catch (err) {
    console.error('[add lead remark]', err);
    return res.status(500).json({ success: false, message: 'Server error adding remark.' });
  }
});

// DELETE — remove a specific remark from a lead
router.delete('/:id/remarks/:index', async (req, res) => {
  try {
    const { id, index } = req.params;
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    if (!Array.isArray(lead.remarks)) {
      return res.status(400).json({ success: false, message: 'Remarks is not an array.' });
    }

    const updatedRemarks = [...lead.remarks];
    updatedRemarks.splice(Number.parseInt(index, 10), 1);

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      { $set: { remarks: updatedRemarks } },
      { new: true }
    );

    const responseLead = normalizeLeadForResponse(updatedLead.toObject());
    await invalidateLeadScope(updatedLead.companyCode, updatedLead.assignedEmployeePhone);
    eventBus.emitToEmployee(updatedLead.companyCode, updatedLead.assignedEmployeePhone, { type: 'LEAD_UPDATED', lead: responseLead });
    return res.status(200).json({ success: true, lead: responseLead });
  } catch (err) {
    console.error('[delete lead remark]', err);
    return res.status(500).json({ success: false, message: 'Server error deleting remark.' });
  }
});

module.exports = router;
