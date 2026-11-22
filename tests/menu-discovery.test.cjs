const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3101';

// Read-only: also usable against production; never logs in or submits orders.
test('Every priced PDF item is discoverable; Mint Lemon Ginger works on phone, tablet and desktop', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TEST_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 } });
    const response = await page.request.get('/api/menu');
    assert.ok(response.ok());
    const menu = await response.json();
    const pdfItems = menu.items.filter(i => /^(hc|ic|cb|tea|ss|fb|bk)-(c)?\d+$/.test(i.id));
    assert.equal(pdfItems.length, 76);
    await page.goto('/');
    await page.locator('#splash-screen').waitFor({ state: 'detached' });
    for (const item of pdfItems) {
      await page.getByPlaceholder('Search coffees, bites & desserts...').fill(item.name);
      await page.locator('.main-menu-search-result-item').filter({ has: page.getByText(item.name, { exact: true }) }).click();
      await expect(page.locator('h1.item-title')).toHaveText(item.name);
      await expect(page.locator('.thumbnail-item.active')).toHaveAttribute('title', item.name);
    }
    for (const [width, height] of [[390,844],[844,390],[768,1024],[1366,768]]) {
      await page.setViewportSize({ width, height });
      await page.locator('.header-btn-left').click();
      const category = page.locator('.directory-cat-card').filter({ hasText: 'Artisan Tea' });
      if (!(await category.locator('.directory-dishes-dropdown').count())) await category.locator('.directory-cat-header-btn').click();
      await expect(category.locator('.directory-dish-item')).toHaveCount(12);
      await category.locator('.directory-dish-item').filter({ hasText: 'Mint Lemon Ginger' }).click();
      await expect(page.locator('h1.item-title')).toHaveText('Mint Lemon Ginger');
      await expect(page.locator('footer.action-bar button.btn-solid')).toBeEnabled();
    }
  } finally { await browser.close(); }
});
