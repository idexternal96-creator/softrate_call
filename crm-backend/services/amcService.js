function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function addYears(value, years) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getMonth();
  date.setFullYear(date.getFullYear() + years);
  if (date.getMonth() !== month) {
    date.setDate(0);
  }
  return date;
}

function nextAnnualRenewalDate(anchorValue, fromValue = new Date()) {
  const anchor = startOfDay(anchorValue);
  const from = startOfDay(fromValue);
  if (!anchor || !from) return null;

  let renewal = new Date(from.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (renewal.getMonth() !== anchor.getMonth()) {
    renewal = new Date(from.getFullYear(), anchor.getMonth() + 1, 0);
  }
  if (renewal.getTime() < from.getTime()) {
    renewal = addYears(renewal, 1);
  }
  return renewal;
}

function daysUntil(value, fromValue = new Date()) {
  const target = startOfDay(value);
  const from = startOfDay(fromValue);
  if (!target || !from) return null;
  return Math.ceil((target.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function lifecycleStatusFor(record) {
  if (!record) return 'Not Configured';
  if (record.blocked || record.status === 'Blocked') return 'Blocked';
  if (!record.domainPurchaseDate && !record.renewalDate) return 'Not Configured';

  const days = daysUntil(record.renewalDate);
  if (days === null) return 'Not Configured';
  if (days < 0) return 'Unpaid';
  if (days <= 60) return 'Upcoming Renewals';
  if (record.paymentStatus === 'Paid') return 'Paid';
  return 'Unpaid';
}

function canManualBlock(record) {
  if (!record || record.blocked) return false;
  if (lifecycleStatusFor(record) === 'Paid') return false;
  const days = daysUntil(record.renewalDate);
  return days !== null && days <= 3;
}

function serializeAmcRecord(record) {
  const plain = typeof record.toObject === 'function' ? record.toObject() : { ...record };
  const status = lifecycleStatusFor(plain);
  const days = daysUntil(plain.renewalDate);
  const paymentStatus = ['Upcoming Renewals', 'Unpaid', 'Blocked'].includes(status) ? 'Unpaid' : (plain.paymentStatus || 'Unpaid');
  const outstandingAmount = paymentStatus === 'Paid' ? 0 : Number(plain.outstandingAmount || plain.annualFee || 0);
  return {
    ...plain,
    id: String(plain._id || plain.id || ''),
    status,
    paymentStatus,
    outstandingAmount,
    daysUntilRenewal: days,
    canManualBlock: canManualBlock(plain),
  };
}

function normalizeDomainName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(private|pvt|limited|ltd|llp|inc|company|co|technologies|technology|tech|solutions|services|systems|india)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function domainRoot(domainName) {
  return normalizeDomainName(domainName).split('.')[0] || '';
}

function clientSuggestionsForDomain(domainName, clients) {
  const root = normalizeMatchText(domainRoot(domainName));
  if (!root) return [];

  return clients
    .map((client) => {
      const clientName = client.companyName || client.clientCompanyName || '';
      const normalizedClient = normalizeMatchText(clientName);
      let score = 0;
      if (normalizedClient === root) score = 100;
      else if (normalizedClient.includes(root)) score = Math.min(95, 55 + root.length);
      else if (root.includes(normalizedClient) && normalizedClient.length >= 4) score = Math.min(90, 70 + normalizedClient.length);
      return {
        clientCompanyName: clientName,
        companyCode: client.companyCode || '',
        primaryEmail: client.primaryEmail || '',
        score,
      };
    })
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

module.exports = {
  addYears,
  canManualBlock,
  clientSuggestionsForDomain,
  daysUntil,
  lifecycleStatusFor,
  nextAnnualRenewalDate,
  normalizeDomainName,
  serializeAmcRecord,
};
