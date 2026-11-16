const {test}=require('node:test');const assert=require('node:assert/strict');const {chromium,expect}=require('@playwright/test');const sharp=require('sharp');
const baseURL=process.env.TEST_BASE_URL||'http://localhost:3101';
if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL))throw Error('Local-only mutation test');
test('Image editor: upload, crop, rotate, flip, zoom, position, resize, reset, save and cross-device refresh', {timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({baseURL});const login=await context.request.post('/api/auth/otp',{data:{action:'login_with_pin',identifier:'tanishaseal20@gmail.com',pin:'1234',consoleType:'admin'}});assert(login.ok());
  const guest=await browser.newPage({baseURL,viewport:{width:390,height:844}});await guest.goto('/');await guest.locator('#splash-screen').waitFor({state:'detached'});
  await expect(guest.getByText('SIZE / SELECTION',{exact:true})).toHaveCount(0);await expect(guest.getByRole('link',{name:'Photo credits',exact:true})).toHaveCount(0);
  await guest.getByPlaceholder('Search coffees, bites & desserts...').fill('Americano');await guest.locator('.main-menu-search-result-item').filter({hasText:'Americano'}).click();
  const before=(await (await context.request.get('/api/menu')).json()).items.find(i=>i.id==='hc-3');
  const page=await context.newPage();await page.goto('/admin');await page.getByTitle('Menu Management',{exact:true}).click();await page.locator('tr').filter({hasText:'Americano'}).getByRole('button',{name:'Edit',exact:true}).click();
  // Existing URL editing remains supported and cancelling leaves the dish intact.
  await page.getByRole('button',{name:'Edit image',exact:true}).click();await expect(page.locator('canvas')).toBeVisible();await expect(page.getByRole('button',{name:'Save Changes',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Cancel editing',exact:true}).click();await expect(page.getByLabel('Image URL',{exact:true})).toHaveValue(before.img);
  const fixture=await sharp(Buffer.from('<svg width="600" height="900"><rect width="300" height="450" fill="red"/><rect x="300" width="300" height="450" fill="green"/><rect y="450" width="300" height="450" fill="blue"/><rect x="300" y="450" width="300" height="450" fill="yellow"/></svg>')).png().toBuffer();
  await page.getByLabel('Upload photo').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:fixture});await expect(page.locator('canvas')).toBeVisible();
  const pixels=()=>page.locator('canvas').evaluate(c=>c.toDataURL());const original=await pixels();
  await page.getByRole('button',{name:'Rotate right',exact:true}).click();await expect.poll(pixels).not.toBe(original);await page.getByRole('button',{name:'Rotate left',exact:true}).click();await expect.poll(pixels).toBe(original);
  await page.getByRole('button',{name:'Flip horizontal',exact:true}).click();await expect.poll(pixels).not.toBe(original);await page.getByRole('button',{name:'Reset edits',exact:true}).click();await expect.poll(pixels).toBe(original);
  await page.getByRole('button',{name:'Flip vertical',exact:true}).click();await expect.poll(pixels).not.toBe(original);await page.getByRole('button',{name:'Reset edits',exact:true}).click();
  await page.getByRole('slider',{name:'Zoom',exact:true}).fill('2');await page.getByRole('slider',{name:'Horizontal position',exact:true}).fill('0.35');await page.getByRole('slider',{name:'Vertical position',exact:true}).fill('-0.25');
  await page.locator('canvas').scrollIntoViewIfNeeded();const canvasBox=await page.locator('canvas').boundingBox();await page.mouse.move(canvasBox.x+canvasBox.width/2,canvasBox.y+canvasBox.height/2);await page.mouse.down();await page.mouse.move(canvasBox.x+canvasBox.width/2+25,canvasBox.y+canvasBox.height/2+15);await page.mouse.up();assert.notEqual(await page.getByRole('slider',{name:'Horizontal position',exact:true}).inputValue(),'0.35');
  await page.getByLabel('Output size',{exact:true}).selectOption('600');
  for(const [width,height]of [[320,568],[844,390],[768,1024],[1440,900]]){await page.setViewportSize({width,height});await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();assert(b.x>=0&&b.x+b.width<=width);await expect(page.getByRole('button',{name:'Save Changes',exact:true})).toBeInViewport();}
  const uploaded=page.waitForResponse(r=>r.url().endsWith('/api/menu-images')&&r.request().method()==='POST');await page.getByRole('button',{name:'Use edited image',exact:true}).click();const response=await uploaded;assert.equal(response.status(),201,await response.text());const result=await response.json();
  await expect(page.getByLabel('Image URL',{exact:true})).toHaveValue(result.url);await expect(page.getByRole('button',{name:'Save Changes',exact:true})).toBeEnabled();
  const first=await context.request.get(result.url);assert.equal(first.status(),200);const bytes=await first.body();const meta=await sharp(bytes).metadata();assert.equal(meta.width,600);assert.equal(meta.height,400);assert.equal(meta.format,'webp');
  const second=await context.request.get('http://localhost:3102'+result.url);assert.deepEqual(await second.body(),bytes);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/menu')&&r.request().method()==='PATCH');await page.getByRole('button',{name:'Save Changes',exact:true}).click();assert((await saved).ok());
  await expect(guest.locator('.hero-slide-item img')).toHaveAttribute('src',new RegExp(encodeURIComponent(result.url)),{timeout:12000});
  for(const width of [320,768,1440]){await guest.setViewportSize({width,height:900});const b=await guest.locator('.hero-slide-item img').boundingBox();assert(Math.abs(b.width/b.height-1.5)<.02);assert(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  const updated=(await (await context.request.get('/api/menu')).json()).items.find(i=>i.id==='hc-3');assert.equal(updated.img,result.url);assert.equal(updated.price,before.price);assert.equal(updated.stock,before.stock);
  assert.equal((await guest.request.post('/api/menu-images',{data:bytes,headers:{'Content-Type':'image/webp'}})).status(),401);
  assert.equal((await context.request.post('/api/menu-images',{data:'not an image'})).status(),400);
  assert.equal((await context.request.post('/api/menu-images',{data:fixture,headers:{'Content-Type':'image/png'}})).status(),400);
  assert.equal((await context.request.post('/api/menu-images',{data:Buffer.alloc(3*1024*1024+1)})).status(),413);
  await context.request.patch('/api/menu',{data:{id:'hc-3',img:before.img}});
 }finally{await browser.close();}
});
