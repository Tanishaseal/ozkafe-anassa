const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('@playwright/test');

// Prices transcribed from anassa menu.pdf, pages 2–9. Page 11 has no retail prices.
const prices = {
  hc: [89,99,109,119,129,129,139,159,119,139,149,109,139,99],
  ic: [189,169,159,169,199,159,139,139],
  cb: [139,149,159,299],
  tea: [69,49,69,79,119,119,119,119,119,119,119,119],
  ss: [129,149,149,179,199,199,59,99,10],
  fb: [129,139,149,149,169,129,89,109,149,79,30,179,189,169,179],
  'cb-c': [299,689,949],
  bk: [99,99,99,109,50,60,80,100,129,139,149],
};
const expected = Object.entries(prices).flatMap(([prefix, values]) => values.map((price, i) => ({
  id: prefix === 'cb-c' ? `${prefix}${i + 1}` : `${prefix}-${i + 1}`, price,
})));
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3101';
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL)) throw Error('Local mutation tests only');
const json = async r => { assert.ok(r.ok(), await r.text()); return r.json(); };

test('All 76 PDF menu entries are editable and reach kitchen and admin with authoritative prices', async () => {
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '127.0.0.80' } });
  const guest = await request.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '127.0.0.81' } });
  try {
    await json(await admin.post('/api/auth/otp', { data: { action: 'login_with_pin', identifier: 'tanishaseal20@gmail.com', pin: '1234', consoleType: 'admin' } }));
    await json(await admin.patch('/api/settings', { data: { orderCooldownSeconds: 0, geofencingEnabled: false, isOpen: true } }));
    const menu = await json(await guest.get('/api/menu'));
    assert.equal(expected.length, 76);
    for (const entry of expected) {
      const item = menu.items.find(i => i.id === entry.id);
      assert.ok(item, `Missing PDF item ${entry.id}`);
      assert.equal(item.price, entry.price, item.name);
      assert.ok(menu.categories.some(c => c.id === item.categoryId), `Unreachable category: ${item.name}`);
      const edited = await json(await admin.patch('/api/menu', { data: { id: item.id, desc: 'PDF audit edit' } }));
      assert.equal(edited.item.desc, 'PDF audit edit');
      await json(await admin.patch('/api/menu', { data: { id: item.id, desc: item.desc } }));
    }
    await json(await guest.get('/api/tables?table=Takeaway'));
    for (let start = 0; start < expected.length; start += 20) {
      const batch = expected.slice(start, start + 20);
      const { order } = await json(await guest.post('/api/orders', { data: {
        tableNumber: 'Takeaway', customerName: 'PDF Audit', customerPhone: '9999999981', customerFlat: '14B',
        idempotencyKey: crypto.randomUUID(), items: batch.map(i => ({ id: i.id, quantity: 1, price: 1 })),
      } }));
      assert.equal(order.subtotal, batch.reduce((sum, i) => sum + i.price, 0));
      for (const endpoint of ['/api/orders?status=active', '/api/orders?all=true']) {
        const rows = await json(await admin.get(endpoint));
        assert.deepEqual(rows.find(o => o.id === order.id).items, order.items);
      }
      await json(await admin.delete('/api/orders?id=' + order.id + '&permanent=true'));
    }
    for (const entry of expected) {
      const item = menu.items.find(i => i.id === entry.id);
      await json(await admin.patch('/api/menu', { data: { id: item.id, stock: item.stock, isAvailable: item.isAvailable } }));
    }
  } finally { await admin.dispose(); await guest.dispose(); }
});
