const test = require('node:test');
const assert = require('node:assert/strict');

const { aiSuggestionOutputSchema } = require('../services/ai/schemas');

function buildValidSuggestion() {
  return {
    recommendedApproach:
      'Lead with the strongest matched service, connect it to the buyer signal already shown, and ask for one concrete next action before ending the conversation.',
    topRecommendations: [
      {
        rank: 1,
        serviceName: 'Dynamic Website',
        tier: 'Premium',
        fitReason: 'A stronger owned website would support credibility and lead capture.',
        painPointMatch: 'Current discovery and conversion signals are fragmented.',
        pitchAngle: 'Frame the website as the main conversion layer they control directly.',
      },
      {
        rank: 2,
        serviceName: 'CRM',
        tier: 'Premium',
        fitReason: 'CRM would help structure follow-ups and deal progression.',
        painPointMatch: 'Sales conversations are likely being tracked manually.',
        pitchAngle: 'Position CRM as the operating system for repeatable follow-up.',
      },
    ],
    talkingPoints: [
      'Reference the exact buyer interest already visible in the lead or bookmark notes.',
      'Tie the recommendation back to a business pain point instead of listing features.',
      'End with one direct next-step question to move the conversation forward.',
    ],
    objectionHandling: [
      'If they say they are still evaluating, offer a narrower next step such as a short demo or scoped proposal.',
      'If timing is the issue, suggest a specific follow-up window instead of forcing a decision.',
    ],
    followupMessageDraft:
      'Hi, sharing a quick follow-up on the discussion. Based on your current workflow, I believe a stronger website plus CRM flow would help streamline inquiries and follow-ups. If useful, I can share a short plan and next-step estimate.',
    discoveryQuestions: [
      'How are new inquiries currently captured and assigned?',
      'Do you already use any system to track follow-ups after first contact?',
      'What would be the most useful next step from your side: demo, proposal, or pricing discussion?',
    ],
    nextStep: 'Ask for a 15-minute follow-up slot or permission to send a scoped proposal.',
    confidenceNote: 'High confidence because the recommendation is grounded in the cached company brief and the active scenario context.',
  };
}

test('aiSuggestionOutputSchema accepts a valid suggestion payload', () => {
  const parsed = aiSuggestionOutputSchema.parse(buildValidSuggestion());
  assert.equal(parsed.topRecommendations.length, 2);
  assert.deepEqual(
    parsed.topRecommendations.map((item) => item.rank),
    [1, 2]
  );
});

test('aiSuggestionOutputSchema rejects non-sequential recommendation ranks', () => {
  const invalid = buildValidSuggestion();
  invalid.topRecommendations = invalid.topRecommendations.map((item, index) => ({
    ...item,
    rank: index + 2,
  }));

  assert.throws(
    () => aiSuggestionOutputSchema.parse(invalid),
    /Recommendations must be ranked sequentially starting from 1/
  );
});
