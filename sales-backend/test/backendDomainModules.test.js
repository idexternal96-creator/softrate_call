const test = require('node:test');
const assert = require('node:assert/strict');

test('domain route modules export legacy-compatible routers', () => {
  const modules = [
    '../src/modules/settings/settings.routes',
    '../src/modules/employees/employee.routes',
    '../src/modules/follow-ups/follow-up.routes',
    '../src/modules/reports/report.routes',
    '../src/modules/leads/lead.routes',
    '../src/modules/invoices/invoice.routes',
    '../src/modules/quotations/quotation.routes',
  ];

  for (const modulePath of modules) {
    const router = require(modulePath);
    assert.equal(typeof router, 'function', `${modulePath} should export an express router`);
    assert.ok(Array.isArray(router.stack), `${modulePath} should have route stack`);
  }
});

test('domain DTOs normalize route boundary input', () => {
  const { toInvoiceHistoryQueryDto } = require('../src/modules/invoices/invoice.dto');
  const { toQuotationHistoryQueryDto } = require('../src/modules/quotations/quotation.dto');
  const { toFollowUpListQueryDto } = require('../src/modules/follow-ups/follow-up.dto');
  const { toEmployeeListQueryDto } = require('../src/modules/employees/employee.dto');
  const { toReportQueryDto } = require('../src/modules/reports/report.dto');
  const { toSettingsDto } = require('../src/modules/settings/settings.dto');

  assert.equal(toInvoiceHistoryQueryDto({ companyCode: ' DV ' }).companyCode, 'DV');
  assert.equal(toQuotationHistoryQueryDto({ companyCode: ' DV ' }).companyCode, 'DV');
  assert.equal(toFollowUpListQueryDto({ companyCode: ' DV ', employeePhone: ' 9 ' }).companyCode, 'DV');
  assert.equal(toEmployeeListQueryDto({ companyCode: ' DV ' }).companyCode, 'DV');
  assert.equal(toReportQueryDto({ companyCode: ' DV ', period: '' }).period, 'today');
  assert.deepEqual(toSettingsDto({ companyName: ' Acme ', leadStatuses: ['New'] }), {
    companyName: 'Acme',
    leadStatuses: ['New'],
    products: [],
  });
});

test('domain validators reject invalid boundary payloads', () => {
  const invoiceValidation = require('../src/modules/invoices/invoice.validation');
  const quotationValidation = require('../src/modules/quotations/quotation.validation');
  const employeeValidation = require('../src/modules/employees/employee.validation');
  const settingsValidation = require('../src/modules/settings/settings.validation');

  assert.throws(() => invoiceValidation.requireCompanyCode({}), /companyCode is required/);
  assert.throws(() => quotationValidation.validateQuotationItems([]), /At least one quotation item/);
  assert.throws(() => employeeValidation.validateEmployeeTags('sales'), /tags must be an array/);
  assert.throws(() => settingsValidation.validateSettingsPayload({ products: 'bad' }), /products must be an array/);
});
