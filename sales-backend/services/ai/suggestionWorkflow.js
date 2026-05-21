const Bookmark = require('../../models/Bookmark');
const Lead = require('../../models/Lead');
const User = require('../../models/User');
const { SERVICE_CATALOG, SERVICE_CONTEXT, SERVICE_TIERS } = require('./promptCatalog');
const { aiSuggestionOutputSchema } = require('./schemas');
const { createStructuredModel } = require('./modelFactory');
const { getAiBriefForLead } = require('./researchWorkflow');

const ALLOWED_SCENARIOS = new Set(['followup', 'interested', 'not_interested']);

const SCENARIO_GUIDANCE = {
  followup: {
    label: 'Follow-up',
    objective:
      'Continue an existing sales conversation, move the lead toward a concrete next step, and use any bookmark notes or reminders to stay specific.',
  },
  interested: {
    label: 'Interested',
    objective:
      'Lean into qualification and proposal direction. Assume the lead has shown buying intent and help the employee close the next commitment.',
  },
  not_interested: {
    label: 'Not Interested / DNP',
    objective:
      'Handle resistance carefully. Reframe only when the evidence supports it, otherwise recommend a graceful defer or future check-in.',
  },
};

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

function serializeLead(lead) {
  return {
    id: lead._id?.toString?.() || '',
    leadCompanyName: lead.leadCompanyName || '',
    contactName: lead.contactName || '',
    contactNumber: lead.contactNumber || '',
    status: lead.status || '',
    setLabel: lead.setLabel || '',
    companyDescription: lead.companyDescription || '',
    mainDivisionDescription: lead.mainDivisionDescription || '',
    directorEmailAddress: lead.directorEmailAddress || '',
    remarks: Array.isArray(lead.remarks) ? lead.remarks : [],
  };
}

function serializeBookmark(bookmark) {
  if (!bookmark) return null;

  return {
    id: bookmark._id?.toString?.() || '',
    companyName: bookmark.companyName || '',
    contactName: bookmark.contactName || '',
    contactNumber: bookmark.contactNumber || '',
    description: bookmark.description || '',
    remarks: Array.isArray(bookmark.remarks) ? bookmark.remarks : [],
    reminderDate: bookmark.reminderDate || null,
    flags: [
      bookmark.brochuresSent ? 'Brochures sent' : null,
      bookmark.techMeet ? 'Tech meet requested' : null,
      bookmark.meetingRemarks ? 'Meeting done' : null,
      bookmark.quotationSent ? 'Quotation sent' : null,
      bookmark.proposalSent ? 'Proposal sent' : null,
      bookmark.whatsappGrp ? 'WhatsApp group active' : null,
    ].filter(Boolean),
  };
}

function buildPromptPayload({ scenario, lead, bookmark, companySettings, insight }) {
  return {
    scenario,
    scenarioLabel: SCENARIO_GUIDANCE[scenario].label,
    scenarioObjective: SCENARIO_GUIDANCE[scenario].objective,
    lead: serializeLead(lead),
    bookmark: serializeBookmark(bookmark),
    companySettings,
    cachedCompanyInsight: {
      leadCompanyName: insight.leadCompanyName,
      officialWebsite: insight.officialWebsite,
      industry: insight.industry,
      businessSummary: insight.businessSummary,
      servicesOrPlatforms: insight.servicesOrPlatforms || [],
      topRecommendations: insight.topRecommendations || [],
      primaryPitch: insight.primaryPitch,
      discoveryQuestions: insight.discoveryQuestions || [],
      objectionHints: insight.objectionHints || [],
      sourceFindings: insight.sourceFindings || [],
      sources: insight.sources || [],
    },
    standardServiceCatalog: SERVICE_CATALOG,
    serviceTiers: SERVICE_TIERS,
    serviceContext: SERVICE_CONTEXT,
  };
}

function classifyFailure(error) {
  const message = String(error?.message || error || '');

  if (message.includes('AI configuration missing')) return 'env_config_issue';
  if (message.includes('timed out') || message.includes('timeout')) return 'model_timeout';
  if (message.includes('Provider returned error')) return 'model_provider_error';
  if (message.includes('Recommendations must be ranked sequentially')) return 'schema_validation_failure';
  if (message.includes('must stay within the cached recommendation set')) return 'schema_validation_failure';
  if (message.includes('Lead not found')) return 'not_found';
  return 'unknown';
}

function ensureAllowedRecommendations(parsed, insight) {
  const allowed = new Set((insight.topRecommendations || []).map((item) => item.serviceName));
  if (!allowed.size) return;

  const invalid = parsed.topRecommendations.filter((item) => !allowed.has(item.serviceName));
  if (invalid.length) {
    throw new Error('Suggestion recommendations must stay within the cached recommendation set.');
  }
}

async function resolveInsightForLead(leadId) {
  const result = await getAiBriefForLead(leadId);
  if (result?.body?.success && result.body.insight) {
    return {
      cacheStatus: result.body.cacheStatus || '',
      researchStatus: result.body.researchStatus || result.body.insight.researchStatus || 'ready',
      insight: result.body.insight,
    };
  }

  const error = new Error(result?.body?.error || result?.body?.message || 'AI brief is unavailable.');
  error.status = result?.status || 503;
  error.retryable = result?.body?.retryable !== false;
  error.cacheStatus = result?.body?.cacheStatus || '';
  error.researchStatus = result?.body?.researchStatus || 'failed';
  throw error;
}

async function getAiSuggestionForLead(leadId, input = {}) {
  const startedAt = Date.now();
  const scenario = String(input.scenario || '').trim();
  const bookmarkId = String(input.bookmarkId || '').trim();
  let failureCategory = '';

  try {
    if (!ALLOWED_SCENARIOS.has(scenario)) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          message: 'scenario must be one of: followup, interested, not_interested.',
        },
      };
    }

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

    let bookmark = null;
    if (bookmarkId) {
      bookmark = await Bookmark.findById(bookmarkId);
      if (!bookmark) {
        return {
          ok: false,
          status: 404,
          body: {
            success: false,
            message: 'Bookmark not found.',
          },
        };
      }
    }

    const company = await User.findOne(
      { companyCode: lead.companyCode },
      'companyName contactDetails products productRemarks'
    ).lean();
    const companySettings = buildCompanySettingsContext(company);
    const insightResult = await resolveInsightForLead(lead._id.toString());
    const promptPayload = buildPromptPayload({
      scenario,
      lead,
      bookmark,
      companySettings,
      insight: insightResult.insight,
    });

    const structuredModel = await createStructuredModel(aiSuggestionOutputSchema, {
      name: `DealVoice${SCENARIO_GUIDANCE[scenario].label.replace(/[^a-zA-Z0-9]/g, '')}Suggestion`,
      method: 'functionCalling',
      temperature: 0.15,
      timeout: 35000,
      maxTokens: 1800,
    });
    const systemPrompt = [
      'You are generating scenario-specific sales guidance for a DealVoice employee.',
      `Scenario: ${SCENARIO_GUIDANCE[scenario].label}.`,
      `Objective: ${SCENARIO_GUIDANCE[scenario].objective}`,
      'Use only the supplied lead context, optional bookmark context, company settings, and cached company insight.',
      'Do not invent company facts, budgets, timelines, or tools that are not supported by the provided context.',
      'Your topRecommendations must stay within the cached company insight recommendation set.',
      'The tone should be crisp, practical, and immediately usable by an employee during a live conversation or follow-up.',
      'The followupMessageDraft should read like a ready-to-send WhatsApp or email note and must stay concise.',
    ].join(' ');

    const parsed = await structuredModel.invoke([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate the AI suggestion JSON for this input:\n${JSON.stringify(promptPayload, null, 2)}`,
      },
    ]);
    const validated = aiSuggestionOutputSchema.parse(parsed);
    ensureAllowedRecommendations(validated, insightResult.insight);

    console.info(
      '[ai-suggestion]',
      JSON.stringify({
        leadId,
        bookmarkId: bookmarkId || null,
        scenario,
        outcome: 'success',
        latencyMs: Date.now() - startedAt,
        cacheStatus: insightResult.cacheStatus,
        model: process.env.OPENROUTER_MODEL || '',
      })
    );

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        scenario,
        cacheStatus: insightResult.cacheStatus,
        researchStatus: insightResult.researchStatus,
        model: process.env.OPENROUTER_MODEL || '',
        generatedAt: new Date().toISOString(),
        suggestion: validated,
      },
    };
  } catch (error) {
    failureCategory = classifyFailure(error);
    console.error(
      '[ai-suggestion]',
      JSON.stringify({
        leadId,
        bookmarkId: bookmarkId || null,
        scenario,
        outcome: 'failure',
        failureCategory,
        latencyMs: Date.now() - startedAt,
        error: String(error?.message || error),
      })
    );

    return {
      ok: false,
      status: error?.status === 404 ? 404 : 503,
      body: {
        success: false,
        retryable: error?.status === 404 ? false : true,
        scenario,
        message:
          error?.status === 404
            ? String(error.message || 'Required context was not found.')
            : 'AI service is temporarily unavailable. Please retry later.',
      },
    };
  }
}

module.exports = {
  getAiSuggestionForLead,
};
