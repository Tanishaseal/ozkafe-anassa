const {test}=require('node:test'),assert=require('node:assert/strict');const {chromium,expect}=require('@playwright/test');
const baseURL=process.env.TEST_BASE_URL||'http://localhost:3101';if(!baseURL.startsWith('http://localhost:'))throw Error('Local only');
test('Syrup options stay hidden for tea on narrow phones', async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page = await browser.newPage({baseURL,viewport:{width:320,height:568}});
    await page.goto('/');
    await page.locator('#splash-screen').waitFor({state:'detached'});
    await page.getByPlaceholder('Search coffees, bites & desserts...').fill('Mint Lemon Ginger');
    await page.locator('.main-menu-search-result-item').filter({hasText:'Mint Lemon Ginger'}).click();
    await expect(page.getByRole('button',{name:'ADD-ONS',exact:true})).toHaveCount(0);
    await page.locator('footer.action-bar button.btn-solid').click();
    await page.locator('button.header-btn-right').click();
    await expect(page.locator('.cart-addon-card')).toHaveCount(0);
    await expect(page.locator('.cart-item-name')).toHaveText('Mint Lemon Ginger');
  } finally { await browser.close(); }
});
test('Per-item coffee syrups stay attached and priced across menu, kitchen and admin',{timeout:60000},async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{const ctx=await browser.newContext({baseURL,viewport:{width:390,height:844}});await ctx.addInitScript(()=>localStorage.setItem('anassa_guest_profile',JSON.stringify({name:'Syrup Test',phone:'9999999996',flat:'14B'})));const page=await ctx.newPage();await page.goto('/');await page.locator('#splash-screen').waitFor({state:'detached'});await page.getByPlaceholder('Search coffees, bites & desserts...').fill('Americano');await page.locator('.main-menu-search-result-item').filter({hasText:'Americano'}).click();await page.getByRole('button',{name:'Increase',exact:true}).click();await page.locator('footer.action-bar button.btn-solid').click();await page.locator('button.header-btn-right').click();await page.getByRole('button',{name:'Americano item 1: Caramel',exact:true}).click();await page.getByRole('button',{name:'Americano item 1: Vanilla',exact:true}).click();await page.getByRole('button',{name:'Americano item 2: Hazelnut',exact:true}).click();const submitted=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');await page.locator('.sheet-footer button.btn-solid').click();const response=await submitted;assert(response.ok(),await response.text());const order=(await response.json()).order;assert.equal(order.subtotal,275);assert.equal(order.items.length,2);assert.match(order.items[0].name,/Caramel.*Vanilla/);assert.match(order.items[1].name,/Hazelnut/);assert.equal(order.items[0].price,147);assert.equal(order.items[1].price,128);
const staff=await browser.newContext({baseURL});await staff.request.post('/api/auth/otp',{data:{action:'login_with_pin',identifier:'tanishaseal20@gmail.com',pin:'1234',consoleType:'admin'}});for(const path of ['/api/orders?status=active','/api/orders?all=true']){const rows=await (await staff.request.get(path)).json();assert.deepEqual(rows.find(o=>o.id===order.id).items,order.items);}
for(const items of [[{id:'fb-1',quantity:1,syrupIds:['ad-1']}],[{id:'ad-1',quantity:1}],[{id:'hc-3',quantity:1,syrupIds:['ad-1','ad-1']}]]){const r=await ctx.request.post('/api/orders',{data:{tableNumber:'Takeaway',customerName:'Syrup Test',customerPhone:'9999999996',customerFlat:'14B',items,idempotencyKey:crypto.randomUUID()}});assert.equal(r.status(),400,await r.text());}
}finally{await browser.close();}});
