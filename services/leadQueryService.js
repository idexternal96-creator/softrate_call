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

  const status = String(query.status ?? '').trim();
  if (status) {
    mongoQuery.status = status;
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
  sort = { score: { $meta: 'textScore' }, updatedAt: -1, _id: -1 };

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
  const mongoQuery = buildBaseLeadQuery({ companyCode, phone, query });
  const rows = await Lead.aggregate([
    { $match: mongoQuery },
    { $match: { leadCompanyNameLower: { $ne: '' } } },
    { $group: { _id: '$leadCompanyName', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return {
    companies: rows.map((row) => ({ name: row._id, count: row.count })),
    names: rows.map((row) => row._id).filter(Boolean),
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildLeadSearchQuery,
  buildLeadSort,
  getLeadCompanies,
  getLeadSets,
  isPaginatedRequest,
  parsePagination,
};
