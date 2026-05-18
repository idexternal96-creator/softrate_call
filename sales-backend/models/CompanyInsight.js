const mongoose = require('mongoose');
const CACHE_TTL_DAYS = 10;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

const sourceSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    url: { type: String, required: true },
    sourceType: { type: String, default: 'other' },
    snippet: { type: String, default: '' },
  },
  { _id: false }
);

const sourceFindingSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    url: { type: String, required: true },
    sourceType: { type: String, default: 'other' },
    finding: { type: String, default: '' },
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true },
    serviceName: { type: String, required: true },
    tier: { type: String, required: true },
    fitReason: { type: String, required: true },
    painPointMatch: { type: String, required: true },
    pitchAngle: { type: String, required: true },
  },
  { _id: false }
);

const companyInsightSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, index: true },
    normalizedCompanyName: { type: String, required: true, index: true },
    leadCompanyName: { type: String, required: true },
    officialWebsite: { type: String, default: '' },
    industry: { type: String, default: '' },
    businessSummary: { type: String, default: '' },
    servicesOrPlatforms: { type: [String], default: [] },
    sourceFindings: { type: [sourceFindingSchema], default: [] },
    topRecommendations: { type: [recommendationSchema], default: [] },
    primaryPitch: { type: String, default: '' },
    discoveryQuestions: { type: [String], default: [] },
    objectionHints: { type: [String], default: [] },
    sources: { type: [sourceSchema], default: [] },
    model: { type: String, default: '' },
    researchStatus: {
      type: String,
      enum: ['pending', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    lastGeneratedAt: { type: Date },
    lastError: { type: String, default: '' },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

companyInsightSchema.index(
  { companyCode: 1, normalizedCompanyName: 1 },
  { unique: true, name: 'company_insight_company_name_unique' }
);

companyInsightSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'company_insight_ttl' }
);

function cacheExpiryDate(baseDate = new Date()) {
  return new Date(baseDate.getTime() + CACHE_TTL_MS);
}

const CompanyInsight = mongoose.model('CompanyInsight', companyInsightSchema);

module.exports = CompanyInsight;
module.exports.CACHE_TTL_DAYS = CACHE_TTL_DAYS;
module.exports.CACHE_TTL_MS = CACHE_TTL_MS;
module.exports.cacheExpiryDate = cacheExpiryDate;
