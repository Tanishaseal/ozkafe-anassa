// Deploy the photographs first, then update only image_url on existing dishes.
require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const photos = require('../src/data/menu-photo-credits.json');

async function main() {
  const apply = process.argv.includes('--apply');
  const origin = process.env.MENU_PHOTO_ORIGIN || 'https://anassa.ozkafe.in';
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: rows } = await db.from('menu_items').select('id,name,image_url').throwOnError();
  const changes = [];
  for (const photo of photos) {
    const row = rows.find(row => row.id === photo.id);
    if (!row) throw Error('Missing menu item: ' + photo.id);
    if (row.name !== photo.name) throw Error('Dish name changed; review photo mapping: ' + photo.id);
    const bytes = fs.readFileSync('public' + photo.path);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== photo.sha256) throw Error('Local photo checksum mismatch: ' + photo.id);
    if (row.image_url !== photo.path) changes.push({ ...photo, previous: row.image_url });
  }
  if (!apply) {
    console.log(JSON.stringify({ verified: photos.length, pending: changes.map(p => ({ id: p.id, name: p.name, image: p.path })) }, null, 2));
    return;
  }
  // Verify every new deployed asset before making any database change.
  for (const photo of changes) {
    const response = await fetch(new URL(photo.path, origin));
    if (!response.ok) throw Error('Photo is not deployed: ' + photo.path);
    const hash = crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    if (hash !== photo.sha256) throw Error('Deployed photo checksum mismatch: ' + photo.id);
  }
  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync('scratch/menu-photo-backup-' + Date.now() + '.json', JSON.stringify(rows, null, 2));
  for (const photo of changes) {
    let query = db.from('menu_items').update({ image_url: photo.path }).eq('id', photo.id);
    query = photo.previous === null ? query.is('image_url', null) : query.eq('image_url', photo.previous);
    const { data } = await query.select('id').throwOnError();
    if (data.length !== 1) throw Error('Image changed concurrently; review ' + photo.id);
  }
  const { data: saved } = await db.from('menu_items').select('id,image_url').throwOnError();
  for (const photo of photos) {
    if (saved.find(row => row.id === photo.id)?.image_url !== photo.path) throw Error('Verification failed: ' + photo.id);
  }
  console.log(JSON.stringify({ verified: photos.length, updated: changes.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
