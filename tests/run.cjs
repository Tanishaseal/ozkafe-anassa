const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const children=[];
// Explicit overrides prevent local .env files from directing mutation tests at production.
const env={...process.env,SUPABASE_URL:'http://127.0.0.1:3200',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3200',SUPABASE_SERVICE_ROLE_KEY:'isolated-test-key',SESSION_SECRET:'isolated-test-session-secret',TEST_BASE_URL:'http://localhost:3101'};
const run=(args)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(args.join(' ')+' exited '+c)));});
function background(args,log){const fd=fs.openSync('scratch/'+log,'w');const p=spawn(process.execPath,args,{env,stdio:['ignore',fd,fd],windowsHide:true});children.push(p);return p;}
async function waitFor(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('Server not ready: '+url);}
async function main(){
  fs.mkdirSync('scratch',{recursive:true});
  // Do not reuse an existing database adapter: every run must start with fresh isolated data.
  try { await fetch('http://127.0.0.1:3200/health'); throw Error('Port 3200 is occupied; stop the old test adapter first.'); } catch(e) { if(e.message.startsWith('Port'))throw e; }
  await run(['--test','tests/database.test.cjs']);
  await run(['node_modules/typescript/bin/tsc','--noEmit']);
  await run(['node_modules/next/dist/bin/next','build']);
  background(['tests/support/database-server.cjs'],'database-server.log');await waitFor('http://127.0.0.1:3200/health');
  background(['node_modules/next/dist/bin/next','start','--port','3101'],'server-one.log');
  background(['node_modules/next/dist/bin/next','start','--port','3102'],'server-two.log');
  await waitFor('http://localhost:3101/api/health');await waitFor('http://localhost:3102/api/health');
  await run(['--test','tests/workflow.test.cjs']);
  await run(['--test','tests/instances.test.cjs']);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const p of children){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else p.kill();}});
