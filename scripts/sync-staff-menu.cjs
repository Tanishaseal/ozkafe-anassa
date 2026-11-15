// Add only the requested Staff records; never reseed the existing menu.
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const source = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(fs.readFileSync('src/lib/initialData.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(source.exports, require, source);

async function main() {
  const { staffCategory: cat, staffMenuItems: items } = source.exports;
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ category: cat.title, items: items.map(({ id, name, price }) => ({ id, name, price })) }, null, 2));
    return;
  }
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await db.from('categories').upsert({ id: cat.id, title: cat.title, subtitle: cat.subtitle, emoji: cat.emoji,
    hero_label: cat.heroLabel, icon_svg: cat.iconSvg, sort_order: cat.sortOrder, is_active: true }).throwOnError();
  for (const item of items) {
    const { data: existing } = await db.from('menu_items').select('id').eq('id', item.id).maybeSingle().throwOnError();
    const fields = { category_id: item.categoryId, category_name: item.category, name: item.name, price: item.price,
      desc: item.desc, image_url: item.img, is_veg: item.isVeg, sizes: item.sizes, sort_order: item.sortOrder };
    // Repeat runs preserve availability and stock adjusted by staff/orders.
    if (existing) await db.from('menu_items').update(fields).eq('id', item.id).throwOnError();
    else await db.from('menu_items').insert({ id: item.id, ...fields, stock: item.stock, is_available: true }).throwOnError();
  }
  const { data } = await db.from('menu_items').select('id,name,price,category_id').eq('category_id', cat.id).order('sort_order').throwOnError();
  for (const item of items) {
    if (!data.some(row => row.id === item.id && row.name === item.name && Number(row.price) === item.price)) throw Error('Staff menu verification failed: ' + item.id);
  }
  console.log(JSON.stringify({ category: cat.title, verifiedItems: data }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
