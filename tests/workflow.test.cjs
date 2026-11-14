const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request, chromium, expect } = require('@playwright/test');
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL)) throw Error('These mutation tests are local-only.');
const json = async response => { assert.ok(response.ok(), `${response.status()} ${await response.text()}`); return response.json(); };

test('API workflow: authorization, isolation, status, settlement, receipt, menu, tables and settings', async () => {
  const admin = await request.newContext({ baseURL });
  const guest = await request.newContext({ baseURL });
  const other = await request.newContext({ baseURL });
  try {
    assert.equal((await guest.get('/api/admin')).status(), 401);
    assert.equal((await guest.post('/api/auth/otp', { data: { action: 'clear_all_users' } })).status(), 401);
    assert.equal((await guest.post('/api/auth/otp', { data: { action: 'set_master_pin', userId: 'user_tanisha', newPin: '6789' } })).status(), 401);
    assert.equal((await guest.get('/api/supabase-proxy/rest/v1/orders')).status(), 401);
    await json(await admin.post('/api/auth/otp', { data: { action: 'login_with_pin', identifier: 'tanishaseal20@gmail.com', pin: '1234', consoleType: 'admin' } }));
    await json(await admin.patch('/api/settings', { data: { geofencingEnabled: false, orderCooldownSeconds: 0, isOpen: true } }));
    const menu = await json(await guest.get('/api/menu')); assert.equal(menu.items.length, 76);
    const session = await json(await guest.get('/api/tables?table=Takeaway'));
    await json(await other.get('/api/tables?table=Takeaway'));
    const key = crypto.randomUUID();
    const payload = { tableNumber: 'Takeaway', sessionId: session.sessionId, customerName: 'API Test', customerPhone: '9999999999', customerFlat: '14B',
      items: [{ id: 'hc-1', quantity: 1, price: 1 }], idempotencyKey: key };
    const created = await json(await guest.post('/api/orders', { data: payload }));
    assert.equal(created.order.total, 93.45);
    assert.equal((await json(await guest.post('/api/orders', { data: payload }))).order.id, created.order.id);
    assert.deepEqual(await json(await other.get('/api/orders?table=Takeaway&phone=9999999999&session=' + session.sessionId)), []);
    assert.equal((await other.get('/api/orders?id=' + created.order.id)).status(), 404);
    for (const status of ['preparing', 'ready', 'served']) {
      await json(await admin.patch('/api/orders', { data: { id: created.order.id, status } }));
      assert.equal((await json(await guest.get('/api/orders?id=' + created.order.id))).status, status);
    }
    await json(await admin.patch('/api/orders', { data: { id: created.order.id, action: 'settle_bill', staffName: 'Test Staff' } }));
    const paid = await json(await guest.get('/api/orders?id=' + created.order.id)); assert.equal(paid.isPaid, true); assert.ok(paid.paidAt);
    await json(await admin.patch('/api/orders', { data: { id: created.order.id, action: 'edit_receipt', updates: { customerName: 'Edited Test' } } }));
    assert.equal((await json(await guest.get('/api/orders?id=' + created.order.id))).isPaid, true);
    await json(await admin.delete('/api/orders?id=' + created.order.id));
    const cancelled = (await json(await guest.get('/api/orders?table=Takeaway'))).find(o => o.id === created.order.id);
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.isDeleted, true);
    assert.equal((await admin.delete('/api/orders?id=missing-order')).status(), 404);
    assert.equal((await admin.post('/api/admin?action=delete_order', { data: { orderId: 'missing-order' } })).status(), 404);
    assert.equal((await admin.delete('/api/admin?action=delete_order')).status(), 400);
    assert.equal((await guest.delete('/api/orders?id=' + created.order.id)).status(), 401);
    await json(await admin.delete('/api/orders?id=' + created.order.id + '&permanent=true'));
    assert.equal((await guest.get('/api/orders?id=' + created.order.id)).status(), 404);
    const added = await json(await admin.post('/api/menu', { data: { name: 'Test Dish', categoryId: 'hot-coffee', category: 'Hot Coffee', price: 10, stock: 2 } }));
    await json(await admin.patch('/api/menu', { data: { id: added.item.id, price: 12, stock: 1 } }));
    assert.equal((await json(await guest.get('/api/menu'))).items.find(i => i.id === added.item.id).price, 12);
    await json(await admin.delete('/api/menu?id=' + added.item.id));
    assert.equal((await json(await guest.get('/api/menu'))).items.length, 76);
    await json(await admin.post('/api/tables', { data: { numTables: 3 } }));
    await json(await admin.post('/api/tables', { data: { numTables: 1 } }));
    assert.equal((await json(await admin.get('/api/tables'))).length, 2);
    assert.equal((await guest.get('/api/tables?table=not-a-table')).status(), 200);
    assert.equal((await json(await guest.get('/api/tables?table=not-a-table'))).valid, false);
    assert.equal((await other.get('/api/tables?table=1')).status(), 403);
    const tableOne = (await json(await admin.get('/api/tables'))).find(t => t.tableNumber === 1);
    await json(await other.get('/api/tables?table=1&key=' + encodeURIComponent(tableOne.secretKey)));
    await json(await other.get('/api/tables?table=1')); // Cleansed QR URL can reload.
    const stats = await json(await admin.get('/api/admin')); assert.ok(stats.inventory.length); assert.ok(stats.staff.length);
    await json(await admin.post('/api/admin?action=update_staff', { data: { id: stats.staff[0].id, status: 'break' } }));
    assert.equal((await json(await admin.get('/api/admin'))).staff[0].status, 'break');
    const profile = await json(await admin.patch('/api/auth/profile', { data: { name: 'Tanisha Seal' } })); assert.equal(profile.user.masterPin, undefined);
    await json(await admin.patch('/api/auth/profile', { data: { currentPin: '1234', newPin: '6789' } }));
    assert.equal((await guest.post('/api/auth/otp', { data: { action: 'login_with_pin', identifier: 'tanishaseal20@gmail.com', pin: '1234', consoleType: 'admin' } })).status(), 401);
    await json(await admin.patch('/api/auth/profile', { data: { currentPin: '6789', newPin: '1234' } }));
  } finally { await admin.dispose(); await guest.dispose(); await other.dispose(); }
});

test('Three real browser screens: scan, submit, kitchen buttons, live tracker, settlement and admin', { timeout: 150000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const guestContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    await guestContext.addInitScript(() => localStorage.setItem('anassa_guest_profile', JSON.stringify({ name: 'Browser Test Guest', phone: '9999999998', flat: '15B' })));
    const customer = await guestContext.newPage();
    const errors = []; customer.on('pageerror', e => errors.push(e.message));
    await customer.goto('/');
    await customer.getByPlaceholder('Search all 76 coffees, bites & desserts...').fill('Corn');
    await customer.locator('.main-menu-search-result-item').filter({ hasText: 'Corn & Cheese Sandwich' }).click();
    await customer.locator('footer.action-bar button.btn-solid').click();
    await customer.locator('button.header-btn-right').click();
    const placedResponse = customer.waitForResponse(r => r.url().endsWith('/api/orders') && r.request().method() === 'POST');
    await customer.locator('.sheet-footer button.btn-solid').click();
    const placed = await json(await placedResponse);
    assert.equal(placed.order.items[0].id, 'fb-1', 'Searching food must not select espresso');
    assert.equal(placed.order.items[0].name, 'Corn & Cheese Sandwich');
    await expect(customer.locator('.bottom-sheet')).toContainText(placed.order.orderNumber);
    const kitchenContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
    const kitchen = await kitchenContext.newPage(); kitchen.on('pageerror', e => errors.push(e.message));
    await kitchen.goto('/kitchen');
    await kitchen.locator('input[type="text"]').first().fill('mamonix109@gmail.com');
    await kitchen.locator('input[type="password"]').fill('1234');
    await kitchen.locator('button[type="submit"]').click();
    const card = kitchen.locator('.kds-order-card').filter({ hasText: placed.order.orderNumber });
    let polling = 0; kitchen.on('request', r => { if (r.url().includes('status=active')) polling++; });
    for (const [button, status] of [['.btn-start-prep', 'preparing'], ['.btn-mark-ready', 'ready'], ['.btn-complete', 'served']]) {
      await card.locator(button).click();
      await expect.poll(async () => (await (await guestContext.request.get('/api/orders?id=' + placed.order.id)).json()).status).toBe(status);
      await expect.poll(async () => (await customer.locator('.bottom-sheet').innerText()).toLowerCase(), { timeout: 12000 }).toContain(status === 'preparing' ? 'prepar' : status);
    }
    await customer.reload();
    await customer.locator('button[aria-label="Track Order"]').click();
    await expect(customer.locator('.bottom-sheet')).toContainText(placed.order.orderNumber);
    const adminContext = await browser.newContext({ baseURL });
    const admin = await adminContext.newPage(); await admin.goto('/admin');
    await admin.locator('input[type="email"]').fill('tanishaseal20@gmail.com');
    await admin.locator('input[type="password"]').fill('1234');
    await admin.locator('button[type="submit"]').click();
    await expect(admin.locator('.admin-layout')).toBeVisible();
    const ledger = await json(await adminContext.request.get('/api/orders?all=true'));
    assert.ok(ledger.some(o => o.id === placed.order.id));
    await json(await kitchenContext.request.patch('/api/orders', { data: { id: placed.order.id, action: 'settle_bill', staffName: 'Browser Staff' } }));
    await expect(customer.locator('.bottom-sheet')).toContainText('Paid', { timeout: 12000 });
    await admin.getByTitle('Live Orders & Kanban').click();
    const row = admin.locator('tr').filter({ hasText: placed.order.orderNumber });
    await expect(row).toBeVisible();
    admin.on('dialog', dialog => dialog.accept());
    // Even HTTP 200 must not produce success when the operation failed.
    await admin.route('**/api/orders?id=*', route => route.request().method() === 'DELETE'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Deletion test failure' }) })
      : route.continue());
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(admin.getByRole('alert').filter({ hasText: 'Deletion test failure' })).toContainText('Deletion test failure');
    await expect(row).toBeVisible();
    await admin.unroute('**/api/orders?id=*');
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(admin.getByRole('alert').filter({ hasText: 'Deletion test failure' })).toHaveCount(0);
    await expect(customer.locator('.bottom-sheet')).toContainText('cancelled and deleted', { timeout: 15000 });
    assert.equal((await json(await kitchenContext.request.get('/api/orders?status=active'))).some(o => o.id === placed.order.id), false);
    await admin.reload();
    await admin.getByTitle('Live Orders & Kanban').click();
    await expect(admin.locator('tr').filter({ hasText: placed.order.orderNumber })).toHaveCount(0);
    assert.ok(polling < 35, 'Kitchen requests must be bounded, not an effect loop: ' + polling);
    assert.deepEqual(errors, []);
    await customer.screenshot({ path: 'scratch/customer-verified.png' });
    await kitchen.screenshot({ path: 'scratch/kitchen-verified.png' });
    await admin.screenshot({ path: 'scratch/admin-verified.png' });
  } finally { await browser.close(); }
});
