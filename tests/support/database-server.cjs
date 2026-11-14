// Test-only PostgREST subset backed by real PostgreSQL (PGlite).
// This is not a replacement for a staging Supabase deployment.
const http = require('node:http');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const ts = require('typescript');
const db = new PGlite();
const ident = s => { if (!/^[a-z_][a-z_0-9]*$/i.test(s)) throw Error('Invalid identifier'); return '"' + s + '"'; };
const tables = new Set(['orders','menu_items','categories','cafe_settings','tables','audit_logs','order_counter']);
async function start() {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const schema = fs.readFileSync('supabase/schema.sql','utf8').replace(/CREATE EXTENSION[^;]+;/g,'').replace(/DO \$\$[\s\S]*?END \$\$;/g,'').replace(/ALTER PUBLICATION[^;]+;/g,'');
  await db.exec(schema);
  await db.exec(fs.readFileSync('supabase/migrations/20261113_workflow.sql','utf8'));
  const initial = { exports: {} };
  new Function('exports','require','module',ts.transpileModule(fs.readFileSync('src/lib/initialData.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(initial.exports, require, initial);
  for (const i of initial.exports.initialMenuItems) {
    await db.query('INSERT INTO menu_items(id,category_id,category_name,name,price,image_url,stock,is_available,sizes) VALUES($1,$2,$3,$4,$5,$6,10,true,$7) ON CONFLICT(id) DO NOTHING', [i.id,i.categoryId,i.category,i.name,i.price,i.img,JSON.stringify(i.sizes)]);
  }
  const server = http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') { res.end('ok'); return; }
      // Local-only fixture: reproduce the production schema gap after creating
      // test orders. This server binds exclusively to the loopback interface.
      if (url.pathname === '/test/legacy-orders' && req.method === 'POST') {
        await db.exec('ALTER TABLE orders DROP COLUMN is_deleted, DROP COLUMN deleted_by, DROP COLUMN deleted_at, DROP COLUMN is_paid, DROP COLUMN paid_at, DROP COLUMN settled_by');
        res.end('ok'); return;
      }
      let text=''; for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : null;
      const path = url.pathname.replace('/rest/v1/', '');
      let rows;
      if (path.startsWith('rpc/')) {
        const name = path.slice(4);
        if (!['place_order','patch_cafe_config','verify_staff_otp'].includes(name)) throw Error('Unknown RPC');
        const keys = Object.keys(body); const values=keys.map(k=>typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]);
        rows = (await db.query(`SELECT ${ident(name)}(${keys.map((k,i)=>ident(k)+' => $'+(i+1)).join(',')}) AS result`,values)).rows[0].result;
      } else {
        if (!tables.has(path)) throw Error('Unknown table');
        const values=[]; const bind=v=>{ values.push(v); return '$'+values.length; };
        const where=[];
        for (const [key,v] of url.searchParams) {
          if (['select','order','limit','offset','on_conflict','columns'].includes(key)) continue;
          if (v.startsWith('eq.')) where.push(ident(key)+' = '+bind(v.slice(3)));
          else if (v.startsWith('neq.')) where.push(ident(key)+' <> '+bind(v.slice(4)));
          else if (v.startsWith('gt.')) where.push(ident(key)+' > '+bind(v.slice(3)));
          else if (v.startsWith('like.')) where.push(ident(key)+' LIKE '+bind(v.slice(5)));
          else if (v.startsWith('in.(')) where.push(ident(key)+' IN ('+v.slice(4,-1).split(',').map(bind).join(',')+')');
          else throw Error('Unsupported filter '+v);
        }
        const suffix=where.length?' WHERE '+where.join(' AND '):'';
        if (['GET','HEAD'].includes(req.method)) {
          const select=url.searchParams.get('select')||'*';
          let sql='SELECT '+(select==='*'?'*':select.split(',').map(ident).join(','))+' FROM '+ident(path)+suffix;
          if(url.searchParams.has('order')) { const [col,dir]=url.searchParams.get('order').split('.'); sql+=' ORDER BY '+ident(col)+(dir==='desc'?' DESC':' ASC'); }
          if(url.searchParams.has('limit')) sql+=' LIMIT '+Number(url.searchParams.get('limit'));
          if(url.searchParams.has('offset')) sql+=' OFFSET '+Number(url.searchParams.get('offset'));
          rows=(await db.query(sql,values)).rows;
        } else if (req.method==='PATCH') {
          const assignments=Object.entries(body).map(([key,v])=>ident(key)+' = '+bind(typeof v==='object'&&v!==null?JSON.stringify(v):v));
          rows=(await db.query('UPDATE '+ident(path)+' SET '+assignments.join(',')+suffix+' RETURNING *',values)).rows;
        } else if (req.method==='DELETE') {
          rows=(await db.query('DELETE FROM '+ident(path)+suffix+' RETURNING *',values)).rows;
        } else {
          rows=[];
          for(const entry of Array.isArray(body)?body:[body]) {
            const keys=Object.keys(entry); const vals=Object.values(entry).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v);
            let sql='INSERT INTO '+ident(path)+' ('+keys.map(ident).join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+')';
            if((req.headers.prefer||'').includes('resolution=merge-duplicates')) {
              const pk=path==='cafe_settings'?'key':path==='tables'?'table_number':'id';
              sql+=' ON CONFLICT('+ident(pk)+') DO UPDATE SET '+keys.filter(k=>k!==pk).map(k=>ident(k)+'=excluded.'+ident(k)).join(',');
            }
            rows.push(...(await db.query(sql+' RETURNING *',vals)).rows);
          }
        }
        if ((req.headers.accept||'').includes('vnd.pgrst.object')) rows=rows[0]||null;
      }
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(rows));
    } catch(e) { res.statusCode=400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({message:e.message,code:e.code||'TEST_ERROR'})); }
  });
  server.listen(3200,'127.0.0.1',()=>console.log('Isolated PostgreSQL HTTP test adapter ready on 3200'));
}
start().catch(e=>{ console.error(e); process.exit(1); });
