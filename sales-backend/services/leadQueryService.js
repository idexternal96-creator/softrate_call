const Lead = require('../models/Lead');
const { normalizePhone, normalizeText } = require('./leadNormalization');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isPaginatedRequest(query) {
  return query.paginated === 'true' || query.page !== undefined || query.pageSize !== undefined;
}

function parsePagination(query) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  return {
    isPaginated: isPaginatedRequest(query),
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

function buildBaseLeadQuery({ companyCode, phone, query = {} }) {
  const mongoQuery = {
    companyCode,
    isArchived: { $ne: true },
  };

  if (phone) {
    mongoQuery.assignedEmployeePhone = phone;
  }

  const setLabel = normalizeText(query.setLabel);
  if (setLabel) {
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [
        { setLabelLower: setLabel },
        { setLabel: String(query.setLabel ?? '').trim() },
      ],
    });
  }

  const division = String(query.division ?? query.mainDivisionDescription ?? '').trim();
  if (division) {
    mongoQuery.mainDivisionDescription = new RegExp(`^${escapeRegex(division)}$`, 'i');
  }

  const statuses = String(query.statuses ?? '')
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);
  const status = String(query.status ?? '').trim();
  if (statuses.length) {
    mongoQuery.status = { $in: statuses };
  } else if (status) {
    mongoQuery.status = status;
  }

  if (String(query.isFavourite ?? '').trim() === 'true') {
    mongoQuery.isFavourite = true;
  }

  const updatedFrom = String(query.updatedFrom ?? '').trim();
  const updatedTo = String(query.updatedTo ?? '').trim();
  if (updatedFrom || updatedTo) {
    mongoQuery.updatedAt = {};
    if (updatedFrom) mongoQuery.updatedAt.$gte = new Date(updatedFrom);
    if (updatedTo) mongoQuery.updatedAt.$lt = new Date(updatedTo);
  }

  const company = normalizeText(query.company);
  if (company) {
    mongoQuery.$and = mongoQuery.$and || [];
    mongoQuery.$and.push({
      $or: [
        { leadCompanyNameLower: company },
        { leadCompanyName: new RegExp(`^${escapeRegex(String(query.company ?? '').trim())}$`, 'i') },
      ],
    });
  }

  return mongoQuery;
}

function buildLeadSearchQuery({ companyCode, phone, query = {} }) {
  const mongoQuery = buildBaseLeadQuery({ companyCode, phone, query });
  const search = String(query.search ?? query.remark ?? '').trim();
  const searchMode = String(query.searchMode ?? '').trim().toLowerCase();
  const normalizedSearch = normalizeText(search);
  const normalizedPhone = normalizePhone(search);

  let projection = null;
  let sort = buildLeadSort(query.sort);

  if (!search) {
    return {
      mongoQuery,
      projection,
      searchStrategy: 'none',
      sort,
    };
  }

  const isPhoneSearch = searchMode === 'phone' || (/^\+?[\d\s()-]+$/.test(search) && normalizedPhone.length >= 7);

  if (isPhoneSearch) {
    mongoQuery.contactNumberNormalized = normalizedPhone;
    return {
      mongoQuery,
      projection,
      searchStrategy: 'phone',
      sort,
    };
  }

  if (searchMode === 'quick' && normalizedSearch) {
    const prefixRegex = new RegExp(`^${escapeRegex(normalizedSearch)}`);
    const quickClauses = [
      { leadCompanyNameLower: prefixRegex },
      { contactNameLower: prefixRegex },
      { directorEmailLower: prefixRegex },
      { setLabelLower: prefixRegex },
      { status: search },
    ];

    if (normalizedPhone.length >= 3) {
      quickClauses.unshift({ contactNumberNormalized: new RegExp(`^${escapeRegex(normalizedPhone)}`) });
    }

    mongoQuery.$or = quickClauses;
    return {
      mongoQuery,
      projection,
      searchStrategy: 'quick_prefix',
      sort,
    };
  }

  if (normalizedSearch.length < 3) {
    const prefixRegex = new RegExp(`^${escapeRegex(normalizedSearch)}`);
    const rawPrefixRegex = new RegExp(`^${escapeRegex(search)}`, 'i');
    mongoQuery.$or = [
      { leadCompanyNameLower: prefixRegex },
      { leadCompanyName: rawPrefixRegex },
      { contactNameLower: prefixRegex },
      { contactName: rawPrefixRegex },
      { directorEmailLower: prefixRegex },
      { directorEmailAddress: rawPrefixRegex },
      { setLabelLower: prefixRegex },
      { setLabel: rawPrefixRegex },
      { status: new RegExp(`^${escapeRegex(search)}$`, 'i') },
    ];

    return {
      mongoQuery,
      projection,
      searchStrategy: 'prefix',
      sort,
    };
  }

  mongoQuery.$text = { $search: search };
  projection = { score: { $meta: 'textScore' } };
  sort = { score: { $meta: 'textScore' }, ...sort };

  return {
    mongoQuery,
    projection,
    searchStrategy: 'text',
    sort,
  };
}

function buildLeadSort(sortKey) {
  const sortMap = {
    createdAt_desc: { createdAt: -1, _id: -1 },
    createdAt_asc: { createdAt: 1, _id: 1 },
    updatedAt_desc: { updatedAt: -1, _id: -1 },
    company_asc: { leadCompanyNameLower: 1, sheetOrder: 1, _id: 1 },
    sheetOrder_asc: { sheetOrder: 1, createdAt: 1, _id: 1 },
  };

  return sortMap[sortKey] || sortMap.sheetOrder_asc;
}

async function getLeadDivisions({ companyCode, phone, query = {} }) {
  const mongoQuery = buildBaseLeadQuery({ companyCode, phone, query });
  const rows = await Lead.aggregate([
    { $match: mongoQuery },
    { $match: { mainDivisionDescription: { $nin: ['', null] } } },
    { $group: { _id: '$mainDivisionDescription', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  return {
    divisions: rows.map((row) => row._id).filter(Boolean),
    items: rows.map((row) => ({ label: row._id, count: row.count })),
  };
}

async function getLeadSets({ companyCode, phone, query = {} }) {
  const mongoQuery = buildBaseLeadQuery({ companyCode, phone, query });
  const rows = await Lead.aggregate([
    { $match: mongoQuery },
    { $match: { setLabelLower: { $ne: '' } } },
    { $group: { _id: '$setLabel', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  return {
    sets: rows.map((row) => row._id).filter(Boolean),
    items: rows.map((row) => ({ label: row._id, count: row.count })),
  };
}

async function getLeadCompanies({ companyCode, phone, query = {} }) {
  const { mongoQuery } = buildLeadSearchQuery({ companyCode, phone, query });
  const pagination = parsePagination(query);
  const pipeline = [
    { $match: mongoQuery },
    { $match: { leadCompanyNameLower: { $ne: '' } } },
    {
      $group: {
        _id: '$leadCompanyName',
        count: { $sum: 1 },
        minSheetOrder: { $min: '$sheetOrder' },
      },
    },
    { $sort: { minSheetOrder: 1, _id: 1 } },
  ];

  const [totalRows, rows] = await Promise.all([
    Lead.aggregate([...pipeline, { $count: 'total' }]),
    Lead.aggregate([
      ...pipeline,
      ...(pagination.isPaginated ? [{ $skip: pagination.skip }, { $limit: pagination.pageSize }] : []),
    ]),
  ]);

  const total = totalRows[0]?.total || rows.length;
  const companies = rows.map((row) => ({ name: row._id, count: row.count }));
  const names = rows.map((row) => row._id).filter(Boolean);
  let contactsByCompany = {};

  if (query.includeContacts === 'true' && names.length) {
    const contactPageSize = Math.min(parsePositiveInt(query.contactPageSize, pagination.pageSize), MAX_PAGE_SIZE);
    const contacts = await Lead.find({
      ...mongoQuery,
      leadCompanyName: { $in: names },
    })
      .sort({ leadCompanyNameLower: 1, sheetOrder: 1, createdAt: 1, _id: 1 })
      .lean();

    contactsByCompany = contacts.reduce((grouped, lead) => {
      const companyName = lead.leadCompanyName;
      if (!companyName || !names.includes(companyName)) return grouped;
      grouped[companyName] = grouped[companyName] || [];
      if (grouped[companyName].length < contactPageSize) {
        grouped[companyName].push(lead);
      }
      return grouped;
    }, {});
  }

  return {
    companies,
    names,
    contactsByCompany,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    hasMore: pagination.isPaginated ? pagination.page * pagination.pageSize < total : false,
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildLeadSearchQuery,
  buildLeadSort,
  getLeadDivisions,
  getLeadCompanies,
  getLeadSets,
  isPaginatedRequest,
  parsePagination,
};
