const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL migration: atomic orders, stock, retries, settings, OTP, permissions', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    // PGlite has no replication/uuid-ossp extension. Application tables are unchanged.
    let schema = fs.readFileSync('supabase/schema.sql', 'utf8');
    schema = schema.replace(/CREATE EXTENSION[^;]+;/g, '').replace(/DO \$\$[\s\S]*?END \$\$;/g, '').replace(/ALTER PUBLICATION[^;]+;/g, '');
    await db.exec(schema);
    const migration = fs.readFileSync('supabase/migrations/20261113_workflow.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Repeatable rollout.
    const payload = (key) => ({ id: crypto.randomUUID(), table_number: '1', session_id: 'test-session', customer_name: 'Test', customer_phone: '9999999999',
      items: [{ id: 'hc-1', name: 'Espresso', quantity: 1, price: 89, isAddon: false }], subtotal: 89, tax_amount: 4.45, total: 93.45,
      status: 'received', created_at: new Date().toISOString(), idempotency_key: key });
    const place = async p => (await db.query('SELECT place_order($1::jsonb) AS result', [JSON.stringify(p)])).rows[0].result;
    const first = payload('retry-1');
    const orders = await Promise.all([place(first), place(first), place(payload('unique-2'))]);
    assert.equal(orders[0].id, orders[1].id);
    assert.notEqual(orders[0].order_number, orders[2].order_number);
    assert.equal((await db.query("SELECT stock FROM menu_items WHERE id='hc-1'")).rows[0].stock, 8);
    await db.exec("UPDATE menu_items SET stock=1 WHERE id='hc-1'");
    const attempts = await Promise.allSettled([place(payload('last-1')), place(payload('last-2'))]);
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await db.query("SELECT stock FROM menu_items WHERE id='hc-1'")).rows[0].stock, 0);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM orders')).rows[0].count, 3);
    await Promise.all([
      db.query("SELECT patch_cafe_config('main_config','{}', '{\"gstPercent\":7}')"),
      db.query("SELECT patch_cafe_config('main_config','{}', '{\"isOpen\":false}')"),
    ]);
    const config = (await db.query("SELECT value FROM cafe_settings WHERE key='main_config'")).rows[0].value;
    assert.equal(config.gstPercent, 7); assert.equal(config.isOpen, false);
    await db.query("INSERT INTO cafe_settings(key,value) VALUES('otp:test:admin',$1)", [JSON.stringify({ hash: 'test-hash', attempts: 0, exp: Date.now() + 60000 })]);
    assert.equal((await db.query("SELECT verify_staff_otp('otp:test:admin','wrong') AS ok")).rows[0].ok, false);
    assert.equal((await db.query("SELECT verify_staff_otp('otp:test:admin','test-hash') AS ok")).rows[0].ok, true);
    assert.equal((await db.query("SELECT verify_staff_otp('otp:test:admin','test-hash') AS ok")).rows[0].ok, false);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM orders'), /permission denied/);
    await assert.rejects(db.query('SELECT place_order($1)', [JSON.stringify(payload('forbidden'))]), /permission denied/);
  } finally { await db.close(); }
});
