const { z } = require('zod');

const sourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().url(),
  sourceType: z.string().trim().min(1).max(50),
  snippet: z.string().trim().max(400).default(''),
});

const sourceFindingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().url(),
  sourceType: z.string().trim().min(1).max(50),
  finding: z.string().trim().min(1).max(500),
});

const recommendationSchema = z.object({
  rank: z.number().int().min(1).max(3),
  serviceName: z.string().trim().min(1).max(120),
  tier: z.enum(['Basic', 'Premium', 'Elite']),
  fitReason: z.string().trim().min(1).max(500),
  painPointMatch: z.string().trim().min(1).max(400),
  pitchAngle: z.string().trim().min(1).max(400),
});

function rankedRecommendationsSchema(minLength, maxLength = minLength) {
  return z
    .array(recommendationSchema)
    .min(minLength)
    .max(maxLength)
    .refine((items) => items.every((item, index) => item.rank === index + 1), {
      message: `Recommendations must be ranked sequentially starting from 1.`,
    });
}

const companyInsightOutputSchema = z.object({
  officialWebsite: z.string().trim().url().or(z.literal('')),
  industry: z.string().trim().min(1).max(160),
  businessSummary: z.string().trim().min(1).max(1400),
  servicesOrPlatforms: z.array(z.string().trim().min(1).max(160)).min(3).max(8),
  sourceFindings: z.array(sourceFindingSchema).min(2).max(5),
  topRecommendations: rankedRecommendationsSchema(3),
  primaryPitch: z.string().trim().min(1).max(700),
  discoveryQuestions: z.array(z.string().trim().min(1).max(220)).min(3).max(5),
  objectionHints: z.array(z.string().trim().min(1).max(240)).min(2).max(5),
  sources: z.array(sourceSchema).min(2).max(6),
});

const aiSuggestionOutputSchema = z.object({
  recommendedApproach: z.string().trim().min(1).max(900),
  topRecommendations: rankedRecommendationsSchema(1, 3),
  talkingPoints: z.array(z.string().trim().min(1).max(280)).min(3).max(6),
  objectionHandling: z.array(z.string().trim().min(1).max(280)).min(2).max(5),
  followupMessageDraft: z.string().trim().min(1).max(900),
  discoveryQuestions: z.array(z.string().trim().min(1).max(220)).min(3).max(5),
  nextStep: z.string().trim().min(1).max(260),
  confidenceNote: z.string().trim().min(1).max(260),
});

module.exports = {
  aiSuggestionOutputSchema,
  companyInsightOutputSchema,
  recommendationSchema,
};
