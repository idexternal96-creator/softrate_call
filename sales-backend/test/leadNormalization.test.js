const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLeadDedupKey,
  enrichLeadForStorage,
  normalizePhone,
  normalizeRemarks,
  normalizeText,
} = require('../services/leadNormalization');

test('normalizePhone strips formatting and uses the last 10 digits', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '9876543210');
  assert.equal(normalizePhone('(044) 4000 1234'), '4440001234');
  assert.equal(normalizePhone(''), '');
});

test('normalizeText lowercases, trims, and collapses whitespace', () => {
  assert.equal(normalizeText('  Acme   Holdings  '), 'acme holdings');
});

test('normalizeRemarks returns a trimmed array', () => {
  assert.deepEqual(normalizeRemarks([' first ', '', 'second']), ['first', 'second']);
  assert.deepEqual(normalizeRemarks(' one-off '), ['one-off']);
});

test('enrichLeadForStorage populates normalized lead fields', () => {
  const lead = enrichLeadForStorage({
    companyCode: ' DV01 ',
    assignedEmployeePhone: ' 9999999999 ',
    leadCompanyName: '  Acme Corp  ',
    contactName: '  Priya Singh ',
    contactNumber: '+91 98765 43210',
    setLabel: ' April 2026 ',
    directorEmailAddress: ' CEO@ACME.COM ',
    remarks: [' first touch '],
  });

  assert.equal(lead.companyCode, 'DV01');
  assert.equal(lead.contactNumberNormalized, '9876543210');
  assert.equal(lead.leadCompanyNameLower, 'acme corp');
  assert.equal(lead.contactNameLower, 'priya singh');
  assert.equal(lead.directorEmailLower, 'ceo@acme.com');
  assert.equal(lead.setLabelLower, 'april 2026');
  assert.deepEqual(lead.remarks, ['first touch']);
  assert.equal(lead.isArchived, false);
});

test('buildLeadDedupKey uses normalized company and phone values', () => {
  const key = buildLeadDedupKey({
    companyCode: 'DV01',
    assignedEmployeePhone: '9999999999',
    contactNumber: '+91 98765 43210',
    leadCompanyName: ' Acme Corp ',
  });

  assert.equal(key, 'DV01__9999999999__9876543210__acme corp');
});
