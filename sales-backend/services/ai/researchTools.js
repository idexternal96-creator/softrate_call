const { load } = require('cheerio');

const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/';
const MAX_TEXT_LENGTH = 3500;
const REQUEST_TIMEOUT_MS = 15000;

const DIRECTORY_HOSTS = [
  'linkedin.com',
  'indiamart.com',
  'justdial.com',
  'tradeindia.com',
  'crunchbase.com',
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'zaubacorp.com',
  'quickcompany.in',
  'tofler.in',
];

function normalizeCompanyName(companyName) {
  return String(companyName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function companyTokens(companyName) {
  return normalizeCompanyName(companyName)
    .split(' ')
    .filter((token) => token.length > 2);
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function safeUrl(url) {
  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
}

function classifySourceType(url) {
  const hostname = getHostname(url);

  if (!hostname) return 'other';
  if (hostname.includes('linkedin.com')) return 'social';
  if (hostname.includes('indiamart.com') || hostname.includes('tradeindia.com')) return 'marketplace';
  if (hostname.includes('justdial.com')) return 'directory';
  if (hostname.includes('crunchbase.com')) return 'business_profile';
  if (hostname.includes('zaubacorp.com') || hostname.includes('quickcompany.in') || hostname.includes('tofler.in')) return 'regulatory';
  if (hostname.includes('gov.in') || hostname.includes('nic.in')) return 'regulatory';
  if (hostname.includes('facebook.com') || hostname.includes('instagram.com') || hostname.includes('x.com') || hostname.includes('twitter.com')) return 'social';

  return 'official_or_other';
}

function likelyOfficialDomain(hostname, tokens, emailDomain) {
  if (!hostname) return false;
  if (DIRECTORY_HOSTS.some((blocked) => hostname.includes(blocked))) return false;
  if (emailDomain && hostname === emailDomain) return true;

  const compact = hostname.replace(/\.[a-z.]+$/, '');
  return tokens.some((token) => compact.includes(token));
}

function scoreSearchResult(result, tokens, emailDomain) {
  const hostname = getHostname(result.url);
  const haystack = `${result.title} ${result.snippet} ${hostname}`.toLowerCase();
  let score = 0;

  if (!hostname) return -100;
  if (emailDomain && hostname === emailDomain) score += 80;
  if (likelyOfficialDomain(hostname, tokens, emailDomain)) score += 50;

  for (const token of tokens) {
    if (haystack.includes(token)) score += 6;
  }

  const sourceType = classifySourceType(result.url);
  if (sourceType === 'official_or_other') score += 10;
  if (sourceType === 'regulatory') score += 8;
  if (sourceType === 'directory') score += 5;
  if (sourceType === 'marketplace') score += 6;
  if (sourceType === 'social') score -= 8;

  return score;
}

function buildSearchQueries(lead, websiteHint) {
  const company = lead.leadCompanyName || '';
  const division = lead.mainDivisionDescription || '';
  const description = lead.companyDescription || '';
  const queries = [
    `${company} official website`,
    `${company} company`,
  ];

  if (division) {
    queries.push(`${company} ${division}`);
  }

  if (description) {
    queries.push(`${company} ${description.slice(0, 80)}`);
  }

  if (websiteHint) {
    queries.push(`${company} ${websiteHint}`);
  }

  return Array.from(
    new Set(
      queries
        .map((query) => query.trim())
        .filter(Boolean)
        .slice(0, 4)
    )
  );
}

function decodeDuckDuckGoUrl(rawHref) {
  if (!rawHref) return '';

  try {
    const parsed = new URL(rawHref, 'https://html.duckduckgo.com');
    const redirect = parsed.searchParams.get('uddg');
    return safeUrl(redirect || parsed.toString());
  } catch {
    return safeUrl(rawHref);
  }
}

async function searchDuckDuckGo(query) {
  const url = `${SEARCH_ENDPOINT}?${new URLSearchParams({ q: query }).toString()}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 DealVoiceAI/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const html = await response.text();
  const $ = load(html);
  const results = [];

  $('.result').each((_, element) => {
    const link = $(element).find('.result__title a').first();
    const title = link.text().trim();
    const snippet = $(element).find('.result__snippet').first().text().trim();
    const href = decodeDuckDuckGoUrl(link.attr('href') || '');

    if (!title || !href) return;
    results.push({
      title,
      url: href,
      snippet,
    });
  });

  return results.slice(0, 10);
}

function getDirectorEmailDomain(email) {
  const parts = String(email || '').toLowerCase().split('@');
  if (parts.length !== 2) return '';

  const domain = parts[1].trim();
  if (!domain) return '';

  const publicDomains = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
  ]);

  return publicDomains.has(domain) ? '' : domain;
}

async function discoverSourceCandidates(lead, websiteHint) {
  const tokens = companyTokens(lead.leadCompanyName);
  const emailDomain = getDirectorEmailDomain(lead.directorEmailAddress);
  const queries = buildSearchQueries(lead, websiteHint);
  const resultMap = new Map();
  const settledSearches = await Promise.allSettled(
    queries.map((query) => searchDuckDuckGo(query))
  );

  for (const [index, settled] of settledSearches.entries()) {
    const query = queries[index];

    if (settled.status === 'fulfilled') {
      for (const result of settled.value) {
        const canonicalUrl = safeUrl(result.url);
        if (!canonicalUrl || resultMap.has(canonicalUrl)) continue;
        resultMap.set(canonicalUrl, {
          ...result,
          url: canonicalUrl,
          sourceType: classifySourceType(canonicalUrl),
          score: scoreSearchResult(result, tokens, emailDomain),
        });
      }
      continue;
    }

    resultMap.set(`error:${query}`, {
      title: `Search failed for "${query}"`,
      url: '',
      snippet: String(settled.reason?.message || settled.reason || ''),
      sourceType: 'error',
      score: -1000,
    });
  }

  return Array.from(resultMap.values())
    .filter((entry) => entry.url)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function compressWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractVisibleText($) {
  const root = $('main').length ? $('main') : $('body');
  const blocks = [];

  root.find('h1, h2, h3, h4, p, li').each((_, element) => {
    const text = compressWhitespace($(element).text());
    if (text && text.length > 25) {
      blocks.push(text);
    }
  });

  const combined = blocks.join(' ').slice(0, MAX_TEXT_LENGTH);
  return compressWhitespace(combined);
}

async function fetchPageSnapshot(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 DealVoiceAI/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Page fetch failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return {
      url: response.url || url,
      title: getHostname(response.url || url),
      snippet: '',
      text: '',
      sourceType: classifySourceType(response.url || url),
    };
  }

  const html = await response.text();
  const $ = load(html);

  $('script, style, noscript').remove();

  const resolvedUrl = response.url || url;
  const title = compressWhitespace($('title').first().text()) || getHostname(resolvedUrl);
  const metaDescription =
    compressWhitespace($('meta[name="description"]').attr('content')) ||
    compressWhitespace($('meta[property="og:description"]').attr('content'));
  const text = extractVisibleText($);

  return {
    url: resolvedUrl,
    title,
    snippet: metaDescription.slice(0, 320),
    text,
    sourceType: classifySourceType(resolvedUrl),
  };
}

async function collectEvidencePages(candidates) {
  const selectedCandidates = candidates.slice(0, 4);
  const settledSnapshots = await Promise.allSettled(
    selectedCandidates.map((candidate) => fetchPageSnapshot(candidate.url))
  );

  return settledSnapshots.map((settled, index) => {
    const candidate = selectedCandidates[index];

    if (settled.status === 'fulfilled') {
      const snapshot = settled.value;
      return {
        title: snapshot.title || candidate.title,
        url: snapshot.url || candidate.url,
        sourceType: snapshot.sourceType || candidate.sourceType,
        snippet: snapshot.snippet || candidate.snippet || '',
        text: snapshot.text || '',
      };
    }

    return {
      title: candidate.title,
      url: candidate.url,
      sourceType: candidate.sourceType,
      snippet: candidate.snippet || '',
      text: `Fetch error: ${String(settled.reason?.message || settled.reason || '')}`.slice(0, 300),
    };
  });
}

module.exports = {
  classifySourceType,
  collectEvidencePages,
  discoverSourceCandidates,
  getDirectorEmailDomain,
  normalizeCompanyName,
};
