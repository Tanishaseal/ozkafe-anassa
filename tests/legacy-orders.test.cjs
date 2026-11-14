const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('@playwright/test');

test('Unmigrated production schema: delete, payment and receipt edits persist across instances', async () => {
  const one = await request.newContext({ baseURL: 'http://localhost:3101' });
  const two = await request.newContext({ baseURL: 'http://localhost:3102' });
  const ok = async r => { assert.ok(r.ok(), await r.text()); return r.json(); };
  try {
    const auth = await ok(await one.post('/api/auth/otp', { data: { action: 'login_with_pin', identifier: 'tanishaseal20@gmail.com', pin: '1234', consoleType: 'admin' } }));
    const headers = { Authorization: 'Bearer ' + auth.token };
    const session = await ok(await one.get('/api/tables?table=Takeaway'));
    const customerHeaders = { 'x-table-session': session.sessionToken };
    const created = await ok(await one.post('/api/orders', { headers: customerHeaders, data: {
      tableNumber: 'Takeaway', customerName: 'Legacy Schema Test', customerPhone: '9999999996', customerFlat: '17B',
      items: [{ id: 'hc-2', quantity: 1 }], specialInstructions: 'Keep these notes', idempotencyKey: crypto.randomUUID(),
    } }));
    const id = created.order.id;
    assert.ok((await fetch('http://127.0.0.1:3200/test/legacy-orders', { method: 'POST' })).ok);
    assert.equal((await one.get('/api/health')).status(), 503);
    await ok(await one.patch('/api/orders', { headers, data: { id, status: 'served' } }));
    await ok(await one.patch('/api/orders', { headers, data: { id, action: 'settle_bill', staffName: 'Legacy Staff' } }));
    let order = await ok(await two.get('/api/orders?id=' + id, { headers: customerHeaders }));
    assert.equal(order.isPaid, true);
    const paidAt = order.paidAt;
    await ok(await two.delete('/api/orders?id=' + id, { headers }));
    order = await ok(await one.get('/api/orders?id=' + id, { headers: customerHeaders }));
    assert.equal(order.status, 'cancelled'); assert.equal(order.isDeleted, true);
    assert.equal(order.deletedBy, 'admin'); assert.ok(order.deletedAt);
    assert.equal(order.isPaid, true); assert.equal(order.paidAt, paidAt);
    assert.equal(order.specialInstructions, 'Keep these notes');
    assert.equal((await ok(await one.get('/api/orders?status=active', { headers }))).some(o => o.id === id), false);
    await ok(await one.post('/api/admin?action=edit_order', { headers, data: { orderId: id, updates: { specialInstructions: 'Edited notes' } } }));
    order = await ok(await two.get('/api/orders?id=' + id, { headers: customerHeaders }));
    assert.equal(order.isPaid, true); assert.equal(order.isDeleted, true);
    assert.equal(order.specialInstructions, 'Edited notes');
    await ok(await one.delete('/api/orders?id=' + id, { headers }));
    assert.equal((await two.delete('/api/orders?id=missing-legacy-order', { headers })).status(), 404);
  } finally { await one.dispose(); await two.dispose(); }
});
