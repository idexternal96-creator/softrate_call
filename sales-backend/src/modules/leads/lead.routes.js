const express = require('express');
const Lead = require('../../../models/Lead');
const LeadCompanyProfile = require('../../../models/LeadCompanyProfile');
const eventBus = require('../../../services/eventBus');
const { getOrSet } = require('../../../services/cacheService');
const {
  LEAD_CACHE_TTLS,
  buildAdminCompanyKey,
  buildAdminLeadListKey,
  buildAdminSetKey,
  buildEmployeeCompanyContactsKey,
  buildEmployeeCompanyKey,
  buildEmployeeLeadListKey,
  buildEmployeeSetKey,
  buildEmployeeStatusCountKey,
  invalidateLeadCaches,
} = require('../../../services/leadCache');
const { logChange } = require('../../../services/historyService');
const {
  createLeadImportBatch,
  getLeadImportBatch,
  processLeadImportBatch,
} = require('../../../services/leadImportService');
const { canUseQueue, queueLeadImportJob } = require('../../../services/leadImportQueue');
const {
  buildLeadSearchQuery,
  getLeadDivisions,
  getLeadCompanies,
  getLeadSets,
  parsePagination,
} = require('../../../services/leadQueryService');
const { enrichLeadForStorage, normalizeRemarks, normalizeText } = require('../../../services/leadNormalization');
const { getAiBriefForLead } = require('../../../services/ai/researchWorkflow');
const { getAiSuggestionForLead } = require('../../../services/ai/suggestionWorkflow');

const router = express.Router();
const DEFAULT_COMPANY_CONTACT_PAGE_SIZE = 20;
const MAX_COMPANY_CONTACT_PAGE_SIZE = 200;

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

function mapCompanyProfile(profile, companyName = '') {
  return {
    leadCompanyName: String(profile?.leadCompanyName || companyName || '').trim(),
    alternatePhone: String(profile?.alternatePhone || '').trim(),
    alternateEmail: String(profile?.alternateEmail || '').trim(),
    notes: Array.isArray(profile?.notes)
      ? profile.notes
          .map((note) => ({
            _id: String(note?._id || ''),
            text: String(note?.text || '').trim(),
            createdAt: note?.createdAt || null,
          }))
          .filter((note) => note.text)
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      : [],
    updatedAt: profile?.updatedAt || null,
    createdAt: profile?.createdAt || null,
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
  delete companiesQuery.sort;
  delete companiesQuery.includeFacets;
  delete companiesQuery.includeContacts;
  delete companiesQuery.contactPageSize;

  const { value } = await getOrSet(cacheKey, LEAD_CACHE_TTLS.facets, async () => {
    return getLeadCompanies({ companyCode, phone, query: companiesQuery });
  });
  return value;
}

function parseContactPageSize(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COMPANY_CONTACT_PAGE_SIZE;
  return Math.min(parsed, MAX_COMPANY_CONTACT_PAGE_SIZE);
}

function shouldIncludeCompanyContacts(query) {
  return query.includeContacts === true || String(query.includeContacts ?? '').trim().toLowerCase() === 'true';
}

async function getCachedEmployeeCompanyContacts({ companyCode, phone, query, companyNames, cacheKey }) {
  const contactPageSize = parseContactPageSize(query.contactPageSize);
  const contactQuery = { ...query };
  delete contactQuery.page;
  delete contactQuery.pageSize;
  delete contactQuery.paginated;
  delete contactQuery.includeContacts;
  delete contactQuery.contactPageSize;
  delete contactQuery.includeFacets;

  const { value } = await getOrSet(cacheKey, LEAD_CACHE_TTLS.companyContacts, async () => {
    const requestedCompanies = companyNames
      .map((companyName) => String(companyName || '').trim())
      .filter(Boolean);
    const companyKeys = Array.from(new Set(requestedCompanies.map(normalizeText).filter(Boolean)));
    const contactsByCompany = Object.fromEntries(requestedCompanies.map((companyName) => [companyName, []]));

    if (!companyKeys.length) return contactsByCompany;

    const { mongoQuery } = buildLeadSearchQuery({
      companyCode,
      phone,
      query: contactQuery,
    });
    mongoQuery.leadCompanyNameLower = { $in: companyKeys };

    const rows = await Lead.aggregate([
      { $match: mongoQuery },
      { $sort: { leadCompanyNameLower: 1, sheetOrder: 1, createdAt: 1, _id: 1 } },
      { $group: { _id: '$leadCompanyName', contacts: { $push: '$$ROOT' } } },
      { $project: { contacts: { $slice: ['$contacts', contactPageSize] } } },
    ]);

    for (const row of rows) {
      if (!row?._id) continue;
      contactsByCompany[row._id] = (row.contacts || []).map(normalizeLeadForResponse);
    }

    return contactsByCompany;
  });

  return value;
}

async function fetchLeadList({ companyCode, phone, scope, reqQuery }) {
  const pagination = parsePagination(reqQuery);
  const searchContext = buildLeadSearchQuery({ companyCode, phone, query: reqQuery });
  const shouldIncludeFacets = !pagination.isPaginated || pagination.page === 1 || reqQuery.includeFacets === 'true';
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

  let setPayload = { sets: [], items: [] };
  let companyPayload = { companies: [], names: [] };

  if (shouldIncludeFacets) {
    const facetQuery = { ...reqQuery };
    delete facetQuery.page;
    delete facetQuery.pageSize;
    delete facetQuery.paginated;
    delete facetQuery.sort;
    delete facetQuery.includeFacets;

    [setPayload, companyPayload] = await Promise.all([
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
            query: facetQuery,
            cacheKey: buildEmployeeCompanyKey(companyCode, phone, facetQuery),
          })
        : getCachedLeadCompanies({
            companyCode,
            phone: undefined,
            query: facetQuery,
            cacheKey: buildAdminCompanyKey(companyCode, facetQuery),
          }),
    ]);
  }

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

// GET — fetch only distinct lead segregation values for an employee
router.get('/employee/divisions', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }

    const payload = await getLeadDivisions({ companyCode, phone, query: {} });

    return res.status(200).json({ success: true, divisions: payload.divisions, items: payload.items });
  } catch (err) {
    console.error('[get employee divisions]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching lead segregations.' });
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

    const contactsByCompany = shouldIncludeCompanyContacts(req.query)
      ? await getCachedEmployeeCompanyContacts({
          companyCode,
          phone,
          query: req.query,
          companyNames: payload.names,
          cacheKey: buildEmployeeCompanyContactsKey(companyCode, phone, {
            query: req.query,
            companyNames: payload.names,
            contactPageSize: parseContactPageSize(req.query.contactPageSize),
          }),
        })
      : {};

    return res.status(200).json({
      success: true,
      companies: payload.companies,
      names: payload.names,
      contactsByCompany,
      page: payload.page,
      pageSize: payload.pageSize,
      total: payload.total,
      hasMore: payload.hasMore,
    });
  } catch (err) {
    console.error('[get employee companies]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching companies.' });
  }
});

router.get('/employee/status-counts', async (req, res) => {
  try {
    const { companyCode, phone } = req.query;
    if (!companyCode || !phone) {
      return res.status(400).json({ success: false, message: 'companyCode and phone are required.' });
    }

    const cacheKey = buildEmployeeStatusCountKey(companyCode, phone, req.query);
    const { value } = await getOrSet(cacheKey, LEAD_CACHE_TTLS.facets, async () => {
      const rows = await Lead.aggregate([
        {
          $match: {
            companyCode,
            assignedEmployeePhone: phone,
            isArchived: { $ne: true },
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const counts = {};
      for (const row of rows) {
        counts[row._id || 'New'] = row.count;
      }

      return { counts };
    });

    return res.status(200).json({ success: true, counts: value.counts || {} });
  } catch (err) {
    console.error('[get employee status counts]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching status counts.' });
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

    return res.status(200).json({
      success: true,
      companies: payload.companies,
      names: payload.names,
      contactsByCompany: payload.contactsByCompany || {},
      page: payload.page,
      pageSize: payload.pageSize,
      total: payload.total,
      hasMore: payload.hasMore,
    });
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

router.get('/company-profile', async (req, res) => {
  try {
    const companyCode = String(req.query.companyCode || '').trim();
    const companyName = String(req.query.companyName || '').trim();
    if (!companyCode || !companyName) {
      return res.status(400).json({ success: false, message: 'companyCode and companyName are required.' });
    }

    const profile = await LeadCompanyProfile.findOne({
      companyCode,
      normalizedCompanyName: normalizeText(companyName),
    }).lean();

    return res.status(200).json({
      success: true,
      profile: mapCompanyProfile(profile, companyName),
    });
  } catch (err) {
    console.error('[get company profile]', err);
    return res.status(500).json({ success: false, message: 'Server error fetching company profile.' });
  }
});

router.patch('/company-profile', async (req, res) => {
  try {
    const companyCode = String(req.body.companyCode || '').trim();
    const companyName = String(req.body.companyName || '').trim();
    if (!companyCode || !companyName) {
      return res.status(400).json({ success: false, message: 'companyCode and companyName are required.' });
    }

    const payload = {
      companyCode,
      leadCompanyName: companyName,
      normalizedCompanyName: normalizeText(companyName),
      alternatePhone: String(req.body.alternatePhone || '').trim(),
      alternateEmail: String(req.body.alternateEmail || '').trim(),
    };

    const profile = await LeadCompanyProfile.findOneAndUpdate(
      { companyCode, normalizedCompanyName: payload.normalizedCompanyName },
      { $set: payload, $setOnInsert: { notes: [] } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      success: true,
      profile: mapCompanyProfile(profile, companyName),
    });
  } catch (err) {
    console.error('[patch company profile]', err);
    return res.status(500).json({ success: false, message: 'Server error saving company profile.' });
  }
});

router.post('/company-profile/notes', async (req, res) => {
  try {
    const companyCode = String(req.body.companyCode || '').trim();
    const companyName = String(req.body.companyName || '').trim();
    const noteText = String(req.body.note || '').trim();
    if (!companyCode || !companyName) {
      return res.status(400).json({ success: false, message: 'companyCode and companyName are required.' });
    }
    if (!noteText) {
      return res.status(400).json({ success: false, message: 'note is required.' });
    }

    const note = {
      _id: undefined,
      text: noteText,
      createdAt: new Date(),
    };

    const profile = await LeadCompanyProfile.findOneAndUpdate(
      { companyCode, normalizedCompanyName: normalizeText(companyName) },
      {
        $setOnInsert: {
          companyCode,
          leadCompanyName: companyName,
          normalizedCompanyName: normalizeText(companyName),
          alternatePhone: '',
          alternateEmail: '',
        },
        $push: { notes: note },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(201).json({
      success: true,
      profile: mapCompanyProfile(profile, companyName),
    });
  } catch (err) {
    console.error('[post company profile note]', err);
    return res.status(500).json({ success: false, message: 'Server error saving company note.' });
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
