const CompanyInsight = require('../../models/CompanyInsight');
const { CACHE_TTL_MS, cacheExpiryDate } = require('../../models/CompanyInsight');
const User = require('../../models/User');
const { SERVICE_CATALOG, SERVICE_CONTEXT, SERVICE_TIERS } = require('./promptCatalog');
const { companyInsightOutputSchema } = require('./schemas');
const { createStructuredModel } = require('./modelFactory');
const {
  collectEvidencePages,
  discoverSourceCandidates,
  normalizeCompanyName,
} = require('./researchTools');

function buildCompanySettingsContext(company) {
  if (!company) {
    return {
      companyName: '',
      website: '',
      products: [],
      productRemarks: [],
    };
  }

  return {
    companyName: company.companyName || '',
    website: company.contactDetails?.website || '',
    products: Array.isArray(company.products)
      ? company.products.map((product) => ({
          name: product.name,
          minPrice: product.minPrice,
          maxPrice: product.maxPrice,
        }))
      : [],
    productRemarks: Array.isArray(company.productRemarks) ? company.productRemarks : [],
  };
}

function buildPromptPayload({ lead, companySettings, candidates, evidencePages }) {
  return {
    lead: {
      leadCompanyName: lead.leadCompanyName || '',
      companyDescription: lead.companyDescription || '',
      mainDivisionDescription: lead.mainDivisionDescription || '',
      directorEmailAddress: lead.directorEmailAddress || '',
      remarks: Array.isArray(lead.remarks) ? lead.remarks : [],
      status: lead.status || '',
      setLabel: lead.setLabel || '',
    },
    companySettings,
    standardServiceCatalog: SERVICE_CATALOG,
    serviceTiers: SERVICE_TIERS,
    serviceContext: SERVICE_CONTEXT,
    searchCandidates: candidates.map((candidate) => ({
      title: candidate.title,
      url: candidate.url,
      sourceType: candidate.sourceType,
      snippet: candidate.snippet || '',
    })),
    evidencePages: evidencePages.map((page) => ({
      title: page.title,
      url: page.url,
      sourceType: page.sourceType,
      snippet: page.snippet || '',
      text: page.text || '',
    })),
  };
}

function mapInsightForPersistence({ lead, modelName, parsed }) {
  const generatedAt = new Date();
  return {
    companyCode: lead.companyCode,
    normalizedCompanyName: normalizeCompanyName(lead.leadCompanyName),
    leadCompanyName: lead.leadCompanyName,
    officialWebsite: parsed.officialWebsite,
    industry: parsed.industry,
    businessSummary: parsed.businessSummary,
    servicesOrPlatforms: parsed.servicesOrPlatforms,
    sourceFindings: parsed.sourceFindings,
    topRecommendations: parsed.topRecommendations,
    primaryPitch: parsed.primaryPitch,
    discoveryQuestions: parsed.discoveryQuestions,
    objectionHints: parsed.objectionHints,
    sources: parsed.sources,
    model: modelName,
    researchStatus: 'ready',
    lastGeneratedAt: generatedAt,
    lastError: '',
    expiresAt: cacheExpiryDate(generatedAt),
  };
}

function serializeInsight(doc) {
  const data = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: data._id?.toString?.() || '',
    companyCode: data.companyCode,
    normalizedCompanyName: data.normalizedCompanyName,
    leadCompanyName: data.leadCompanyName,
    officialWebsite: data.officialWebsite || '',
    industry: data.industry || '',
    businessSummary: data.businessSummary || '',
    servicesOrPlatforms: data.servicesOrPlatforms || [],
    sourceFindings: data.sourceFindings || [],
    topRecommendations: data.topRecommendations || [],
    primaryPitch: data.primaryPitch || '',
    discoveryQuestions: data.discoveryQuestions || [],
    objectionHints: data.objectionHints || [],
    sources: data.sources || [],
    model: data.model || '',
    researchStatus: data.researchStatus || 'pending',
    lastGeneratedAt: data.lastGeneratedAt || null,
    lastError: data.lastError || '',
  };
}

async function generateInsightForLead(lead) {
  const company = await User.findOne(
    { companyCode: lead.companyCode },
    'companyName contactDetails products productRemarks'
  ).lean();
  const companySettings = buildCompanySettingsContext(company);
  const candidates = await discoverSourceCandidates(lead, companySettings.website);
  const evidencePages = await collectEvidencePages(candidates);
  const promptPayload = buildPromptPayload({
    lead,
    companySettings,
    candidates,
    evidencePages,
  });

  const structuredModel = await createStructuredModel(companyInsightOutputSchema, {
    name: 'DealVoiceCompanyInsight',
    method: 'functionCalling',
    maxTokens: 2200,
    timeout: 60000,
    temperature: 0.1,
  });
  const systemPrompt = [
    'You are generating a company research brief for an employee sales workflow.',
    'Use only the supplied lead context, company settings context, search candidates, and fetched evidence pages.',
    'Do not invent facts or sources.',
    'Return exactly 3 ranked recommendations using only the provided Softrate service catalog.',
    'Prefer the official website as the officialWebsite field when strongly supported by the evidence.',
    'Summaries must be concise, practical, and useful for an employee preparing a pitch.',
  ].join(' ');

  const parsed = await structuredModel.invoke([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Generate the company insight JSON for this input:\n${JSON.stringify(promptPayload, null, 2)}`,
    },
  ]);

  const validated = companyInsightOutputSchema.parse(parsed);
  return mapInsightForPersistence({
    lead,
    modelName: process.env.OPENROUTER_MODEL || '',
    parsed: validated,
  });
}

async function getAiBriefForLead(leadId) {
  const Lead = require('../../models/Lead');
  const lead = await Lead.findById(leadId);

  if (!lead) {
    return {
      ok: false,
      status: 404,
      body: {
        success: false,
        message: 'Lead not found.',
      },
    };
  }

  const normalizedCompanyName = normalizeCompanyName(lead.leadCompanyName);
  const now = new Date();
  const existingReadyInsight = await CompanyInsight.findOne({
    companyCode: lead.companyCode,
    normalizedCompanyName,
    researchStatus: 'ready',
    expiresAt: { $gt: now },
    lastGeneratedAt: { $gte: new Date(now.getTime() - CACHE_TTL_MS) },
  });

  if (existingReadyInsight) {
    const insight = serializeInsight(existingReadyInsight);
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        cacheStatus: 'hit',
        researchStatus: insight.researchStatus,
        lastGeneratedAt: insight.lastGeneratedAt,
        model: insight.model,
        insight,
      },
    };
  }

  try {
    const insightPayload = await generateInsightForLead(lead);
    const saved = await CompanyInsight.findOneAndUpdate(
      {
        companyCode: lead.companyCode,
        normalizedCompanyName,
      },
      { $set: insightPayload },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      }
    );

    const insight = serializeInsight(saved);
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        cacheStatus: 'miss',
        researchStatus: insight.researchStatus,
        lastGeneratedAt: insight.lastGeneratedAt,
        model: insight.model,
        insight,
      },
    };
  } catch (error) {
    await CompanyInsight.findOneAndUpdate(
      {
        companyCode: lead.companyCode,
        normalizedCompanyName,
      },
      {
        $set: {
          leadCompanyName: lead.leadCompanyName,
          researchStatus: 'failed',
          lastError: String(error.message || error),
          expiresAt: cacheExpiryDate(),
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      }
    );

    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        retryable: true,
        cacheStatus: 'miss',
        researchStatus: 'failed',
        message: 'AI service is temporarily unavailable. Please retry later.',
      },
    };
  }
}

module.exports = {
  getAiBriefForLead,
  normalizeCompanyName,
};
