const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('@playwright/test');
test('Two production Next processes share orders, stock, sessions and settlements', async () => {
  const one = await request.newContext({ baseURL: 'http://localhost:3101' });
  const two = await request.newContext({ baseURL: 'http://localhost:3102' });
  const ok = async r => { assert.ok(r.ok(), await r.text()); return r.json(); };
  try {
    const auth = await ok(await one.post('/api/auth/otp', { data: { action:'login_with_pin',identifier:'tanishaseal20@gmail.com',pin:'1234',consoleType:'admin' } }));
    const headers = { Authorization: 'Bearer ' + auth.token };
    await ok(await two.patch('/api/settings',{ headers, data:{geofencingEnabled:false,orderCooldownSeconds:0,isOpen:true} }));
    await ok(await one.patch('/api/menu',{headers,data:{id:'hc-1',stock:2}}));
    const session=await ok(await one.get('/api/tables?table=Takeaway'));
    const customerHeaders={'x-table-session':session.sessionToken};
    const payload={tableNumber:'Takeaway',customerName:'Two Instances',customerPhone:'9999999997',customerFlat:'16B',items:[{id:'hc-1',quantity:1}],idempotencyKey:crypto.randomUUID()};
    const replies=await Promise.all([one.post('/api/orders',{headers:customerHeaders,data:payload}),two.post('/api/orders',{headers:customerHeaders,data:payload})]);
    const saved=await Promise.all(replies.map(ok)); assert.equal(saved[0].order.id,saved[1].order.id);
    assert.equal((await ok(await two.get('/api/menu'))).items.find(i=>i.id==='hc-1').stock,1);
    const id=saved[0].order.id;
    await ok(await two.patch('/api/orders',{headers,data:{id,status:'preparing'}}));
    await ok(await two.post('/api/admin?action=edit_order',{headers,data:{orderId:id,updates:{customerName:'Edited on second instance'}}}));
    assert.equal((await ok(await one.get('/api/orders?id='+id,{headers:customerHeaders}))).customerName,'Edited on second instance');
    assert.equal((await ok(await one.get('/api/orders?id='+id,{headers:customerHeaders}))).status,'preparing');
    await ok(await two.patch('/api/orders',{headers,data:{id,status:'served'}}));
    await ok(await one.patch('/api/orders',{headers,data:{id,action:'settle_bill'}}));
    assert.equal((await ok(await two.get('/api/orders?id='+id,{headers:customerHeaders}))).isPaid,true);
    await ok(await two.delete('/api/orders?id='+id,{headers}));
    assert.equal((await ok(await one.get('/api/orders?id='+id,{headers:customerHeaders}))).isDeleted,true);
    const menuBefore=(await ok(await one.get('/api/menu'))).items;
    await ok(await two.delete('/api/menu?id=hc-1',{headers}));
    const after=(await ok(await one.get('/api/menu'))).items;
    assert.equal(after.length,menuBefore.length-1); assert.equal(after.some(i=>i.id==='hc-1'),false);
  } finally { await one.dispose(); await two.dispose(); }
});
