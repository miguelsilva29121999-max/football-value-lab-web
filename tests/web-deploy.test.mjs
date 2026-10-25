import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Vercel tem endpoints de IA e ficheiros públicos separados',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(base,'vercel.json'),'utf8'));
 assert.ok(config.rewrites.some(x=>x.source==='/ai'&&x.destination==='/assistant.html'));
 for(const p of ['api/ai/chat.js','api/ai/preview.js','api/ai/status.js','api/fixtures.js','public/assistant.html','public/assistant.js','public/index.html'])assert.ok(fs.existsSync(path.join(base,p)),p);
 assert.ok(!fs.existsSync(path.join(base,'public/.env')));
});

test('Versão cloud bloqueia API sem código e não expõe chaves',async()=>{
 process.env.VERCEL='1'; process.env.SITE_ACCESS_CODE='um-codigo-privado-de-teste-longo';
 const {server}=await import('../server.mjs');
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const noAuth=await fetch(url+'/api/ai/status');
  assert.equal(noAuth.status,401);
  assert.equal((await noAuth.json()).code,'ACCESS_REQUIRED');
  const wrong=await fetch(url+'/api/ai/status',{headers:{'x-fvl-access-code':'errado'}});
  assert.equal(wrong.status,401);
  const valid=await fetch(url+'/api/ai/status',{headers:{'x-fvl-access-code':process.env.SITE_ACCESS_CODE}});
  assert.equal(valid.status,200);
  const status=await valid.json();
  assert.equal(status.configured,false);
  assert.equal(JSON.stringify(status).includes(process.env.SITE_ACCESS_CODE),false);
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
