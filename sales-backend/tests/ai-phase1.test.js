const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CACHE_TTL_DAYS,
  cacheExpiryDate,
} = require('../models/CompanyInsight');
const { companyInsightOutputSchema } = require('../services/ai/schemas');
const {
  collectEvidencePages,
  discoverSourceCandidates,
} = require('../services/ai/researchTools');
const { normalizeCompanyName } = require('../services/ai/researchWorkflow');

function buildValidInsight() {
  return {
    officialWebsite: 'https://example.com',
    industry: 'Food manufacturing',
    businessSummary: 'Example Foods manufactures packaged snacks for retail and distributor channels across India.',
    servicesOrPlatforms: ['ERP', 'eCommerce storefront', 'Distributor portal'],
    sourceFindings: [
      {
        title: 'Example Foods',
        url: 'https://example.com',
        sourceType: 'official_or_other',
        finding: 'The company sells packaged snack products through retail and distributor channels.',
      },
      {
        title: 'Example Foods on IndiaMART',
        url: 'https://www.indiamart.com/example-foods',
        sourceType: 'marketplace',
        finding: 'Its public catalog lists multiple product lines and B2B ordering context.',
      },
    ],
    topRecommendations: [
      {
        rank: 1,
        serviceName: 'Dynamic Website',
        tier: 'Premium',
        fitReason: 'A managed website would improve product presentation and distributor inquiry flow.',
        painPointMatch: 'Public product discovery and lead capture are fragmented across channels.',
        pitchAngle: 'Position a stronger owned web presence as the base for distributor and retail conversion.',
      },
      {
        rank: 2,
        serviceName: 'CRM',
        tier: 'Premium',
        fitReason: 'CRM would help structure distributor follow-up and inquiry handling.',
        painPointMatch: 'Lead tracking is difficult when buyer conversations happen across multiple channels.',
        pitchAngle: 'Tie inbound demand and distributor follow-ups into one sales workflow.',
      },
      {
        rank: 3,
        serviceName: 'GST Filing',
        tier: 'Basic',
        fitReason: 'Compliance support complements a growing B2B operation.',
        painPointMatch: 'Scaling order volume increases compliance overhead.',
        pitchAngle: 'Offer filing support as an operational reliability add-on.',
      },
    ],
    primaryPitch: 'Lead with web and CRM modernization tied to distributor lead capture and faster follow-up.',
    discoveryQuestions: [
      'How do inbound distributor and retailer inquiries reach your team today?',
      'Do you maintain a current product catalog on your own website or only on marketplaces?',
      'How are repeat buyer follow-ups assigned and tracked internally?',
    ],
    objectionHints: [
      'If they already use marketplaces, position an owned website as a control and trust layer.',
      'If they say follow-up is manual, connect CRM value to faster response and reduced leakage.',
    ],
    sources: [
      {
        title: 'Example Foods',
        url: 'https://example.com',
        sourceType: 'official_or_other',
        snippet: 'Packaged snacks manufacturer serving retail and distributor customers.',
      },
      {
        title: 'Example Foods on IndiaMART',
        url: 'https://www.indiamart.com/example-foods',
        sourceType: 'marketplace',
        snippet: 'B2B catalog of packaged snack products.',
      },
    ],
  };
}

test('normalizeCompanyName lowercases and removes punctuation noise', () => {
  assert.equal(normalizeCompanyName('  Acme, Pvt. Ltd.  '), 'acme pvt ltd');
  assert.equal(normalizeCompanyName('Foo-Bar & Co'), 'foo bar co');
});

test('companyInsightOutputSchema accepts a valid phase 1 insight payload', () => {
  const parsed = companyInsightOutputSchema.parse(buildValidInsight());
  assert.equal(parsed.topRecommendations.length, 3);
  assert.deepEqual(
    parsed.topRecommendations.map((item) => item.rank),
    [1, 2, 3]
  );
});

test('companyInsightOutputSchema rejects recommendations without ordered ranks', () => {
  const invalid = buildValidInsight();
  invalid.topRecommendations = invalid.topRecommendations.map((item, index) => ({
    ...item,
    rank: index + 2,
  }));

  assert.throws(
    () => companyInsightOutputSchema.parse(invalid),
    /Recommendations must be ranked sequentially starting from 1/
  );
});

test('cacheExpiryDate sets cache expiry to 10 days', () => {
  const baseDate = new Date('2026-05-07T00:00:00.000Z');
  const expiresAt = cacheExpiryDate(baseDate);
  assert.equal(CACHE_TTL_DAYS, 10);
  assert.equal(expiresAt.toISOString(), '2026-05-17T00:00:00.000Z');
});

test('discoverSourceCandidates preserves query-order dedupe even when searches resolve out of order', async () => {
  const originalFetch = global.fetch;
  const htmlByQuery = new Map([
    [
      'Acme Labs official website',
      `
        <div class="result">
          <div class="result__title"><a href="https://acme.example.com">Official Acme</a></div>
          <div class="result__snippet">Official company website</div>
        </div>
      `,
    ],
    [
      'Acme Labs company',
      `
        <div class="result">
          <div class="result__title"><a href="https://acme.example.com">Duplicate Acme</a></div>
          <div class="result__snippet">Duplicate result from slower query</div>
        </div>
        <div class="result">
          <div class="result__title"><a href="https://directory.example.com/acme">Acme Directory</a></div>
          <div class="result__snippet">Directory entry</div>
        </div>
      `,
    ],
  ]);

  global.fetch = async (url) => {
    const parsed = new URL(url);
    const query = parsed.searchParams.get('q');
    const delay = query === 'Acme Labs official website' ? 60 : 5;
    const body = htmlByQuery.get(query) || '';

    await new Promise((resolve) => setTimeout(resolve, delay));
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };

  try {
    const candidates = await discoverSourceCandidates(
      {
        leadCompanyName: 'Acme Labs',
        mainDivisionDescription: '',
        companyDescription: '',
        directorEmailAddress: '',
      },
      ''
    );

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].url, 'https://acme.example.com/');
    assert.equal(candidates[0].title, 'Official Acme');
    assert.equal(candidates[1].url, 'https://directory.example.com/acme');
  } finally {
    global.fetch = originalFetch;
  }
});

test('collectEvidencePages preserves candidate order even when page fetches resolve out of order', async () => {
  const originalFetch = global.fetch;
  const htmlByUrl = new Map([
    [
      'https://first.example.com/',
      { delay: 80, html: '<html><head><title>First</title><meta name="description" content="First page"></head><body><main><p>First page text content that is long enough to keep.</p></main></body></html>' },
    ],
    [
      'https://second.example.com/',
      { delay: 10, html: '<html><head><title>Second</title><meta name="description" content="Second page"></head><body><main><p>Second page text content that is long enough to keep.</p></main></body></html>' },
    ],
    [
      'https://third.example.com/',
      { delay: 40, html: '<html><head><title>Third</title><meta name="description" content="Third page"></head><body><main><p>Third page text content that is long enough to keep.</p></main></body></html>' },
    ],
  ]);

  global.fetch = async (url) => {
    const entry = htmlByUrl.get(url);
    await new Promise((resolve) => setTimeout(resolve, entry.delay));
    return new Response(entry.html, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };

  try {
    const snapshots = await collectEvidencePages([
      { title: 'First Candidate', url: 'https://first.example.com/', sourceType: 'official_or_other', snippet: '' },
      { title: 'Second Candidate', url: 'https://second.example.com/', sourceType: 'official_or_other', snippet: '' },
      { title: 'Third Candidate', url: 'https://third.example.com/', sourceType: 'official_or_other', snippet: '' },
    ]);

    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.url),
      [
        'https://first.example.com/',
        'https://second.example.com/',
        'https://third.example.com/',
      ]
    );
    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.title),
      ['First', 'Second', 'Third']
    );
  } finally {
    global.fetch = originalFetch;
  }
});
