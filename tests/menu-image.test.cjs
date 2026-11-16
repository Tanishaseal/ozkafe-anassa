const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const baseURL=process.env.TEST_BASE_URL||'http://localhost:3101';
if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL))throw Error('Local-only mutation test');

test('Admin image editor persists, customer refreshes, landscape frame stays stable across devices', {timeout:90000}, async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const adminContext=await browser.newContext({baseURL});
    const login=await adminContext.request.post('/api/auth/otp',{data:{action:'login_with_pin',identifier:'tanishaseal20@gmail.com',pin:'1234',consoleType:'admin'}});
    assert(login.ok());
    const guest=await browser.newPage({baseURL,viewport:{width:390,height:844}});
    await guest.goto('/');
    await guest.locator('#splash-screen').waitFor({state:'detached'});
    await guest.getByPlaceholder('Search coffees, bites & desserts...').fill('Americano');
    await guest.locator('.main-menu-search-result-item').filter({hasText:'Americano'}).click();
    const before=(await (await adminContext.request.get('/api/menu')).json()).items.find(i=>i.id==='hc-3');
    const admin=await adminContext.newPage();await admin.goto('/admin');
    await admin.getByTitle('Menu Management',{exact:true}).click();
    await admin.locator('tr').filter({hasText:'Americano'}).getByRole('button',{name:'Edit',exact:true}).click();
    await admin.getByLabel('Image URL',{exact:true}).fill('/menu-photos/hc-2.webp');
    await expect(admin.getByAltText('Dish image preview')).toHaveAttribute('src','/menu-photos/hc-2.webp');
    const saved=admin.waitForResponse(r=>r.url().endsWith('/api/menu')&&r.request().method()==='PATCH');
    await admin.getByRole('button',{name:'Save Changes',exact:true}).click();assert((await saved).ok());
    const hero=guest.locator('.hero-slide-item img');
    await expect(hero).toHaveAttribute('src',/hc-2/, {timeout:12000});
    const shared=(await (await adminContext.request.get('http://localhost:3102/api/menu')).json()).items.find(i=>i.id==='hc-3');
    assert.equal(shared.img,'/menu-photos/hc-2.webp');assert.equal(shared.price,before.price);assert.equal(shared.stock,before.stock);
    assert.equal((await adminContext.request.patch('/api/menu',{data:{id:'hc-3',img:'javascript:alert(1)'}})).status(),400);
    for(const [width,height]of [[360,800],[844,390],[768,1024],[1440,900]]){
      await guest.setViewportSize({width,height});
      const first=await hero.boundingBox();
      assert(Math.abs(first.width/first.height-1.5)<0.02);
      await adminContext.request.patch('/api/menu',{data:{id:'hc-3',img:'/menu-photos/hc-3.webp'}});
      await expect(hero).toHaveAttribute('src',/hc-3/,{timeout:12000});
      const portrait=await hero.boundingBox();assert(Math.abs(first.height-portrait.height)<1);
      assert(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await guest.screenshot({path:`scratch/landscape-frame-${width}.png`,fullPage:true});
      await adminContext.request.patch('/api/menu',{data:{id:'hc-3',img:'/menu-photos/hc-2.webp'}});
      await expect(hero).toHaveAttribute('src',/hc-2/,{timeout:12000});
    }
    await adminContext.request.patch('/api/menu',{data:{id:'hc-3',img:before.img}});
  } finally {await browser.close();}
});
