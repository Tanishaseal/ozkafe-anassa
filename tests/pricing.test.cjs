const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleExports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/pricing.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(moduleExports);
const { billTotals } = moduleExports;

test('Percentage discounts precede tax, preserve cents and reject invalid values', () => {
  const items = [{ price: 89, quantity: 1 }];
  assert.deepEqual(billTotals(items, 5, 20), {
    subtotal: 89, discountPercent: 20, discountAmount: 17.8,
    taxableAmount: 71.2, taxAmount: 3.56, total: 74.76,
  });
  assert.equal(billTotals(items, 5, 10).total, 84.11);
  assert.equal(billTotals(items, 5, 100).total, 0);
  assert.equal(billTotals(items, 0, 20).total, 71.2);
  assert.equal(billTotals(items, 5, 0).total, 93.45);
  for (const percent of [-1, 100.01, NaN, Infinity]) assert.throws(() => billTotals(items, 5, percent));
});
