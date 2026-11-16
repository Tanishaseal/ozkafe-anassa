require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db.storage.listBuckets();
  if (error) throw error;
  if (data.some(bucket => bucket.id === 'menu-images')) {
    console.log('Menu image storage already exists; existing settings preserved.'); return;
  }
  const { error: createError } = await db.storage.createBucket('menu-images', {
    public: false, allowedMimeTypes: ['image/webp'], fileSizeLimit: 3 * 1024 * 1024,
  });
  if (createError) throw createError;
  console.log('Private menu-images bucket created. Uploads require the admin API; only finished menu images are served publicly.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
