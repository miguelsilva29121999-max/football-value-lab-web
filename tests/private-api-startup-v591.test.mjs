import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const file=new URL('../public/assistant.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
function createRequestHarness(answer='correct-private-code'){
 const cut=source.indexOf('function addOption(');
 assert.ok(cut>1000,'Request functions must be before UI initialization');
 const initial=source.slice(0,cut);
 const calls=[],store=new Map();
 let prompts=0;
 const api={
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
 };
 const context={
  document:{getElementById:()=>null},Headers,sessionStorage:api,location:{protocol:'https:'},
  window:{prompt:()=>{prompts++;return answer;}},
  fetch:async (url,options)=>{
   const code=options.headers.get('x-fvl-access-code');
   calls.push({url,code});
   if(code==='correct-private-code')
    return {ok:true,status:200,json:async()=>({leagues:{P1:{country:'Portugal',name:'Primeira Liga'}}})};
   return {ok:false,status:401,json:async()=>({error:'ACCESS_REQUIRED'})};
  }
 };
 vm.runInNewContext(initial+'\nglobalThis.__request={fetchJSON,requestWithAccess};',context);
 return {ctx:context,calls,store,prompts:()=>prompts};
}
test('new v5.9.1 UI remains valid JavaScript and requests password on private API 401',async()=>{
 execFileSync(process.execPath,['--check',file.pathname]);
 const testEnv=createRequestHarness();
 const result=await testEnv.ctx.__request.fetchJSON('/api/status');
 assert.ok(result.leagues.P1);
 assert.equal(testEnv.calls.length,2);
 assert.equal(testEnv.calls[0].code,null);
 assert.equal(testEnv.calls[1].code,'correct-private-code');
 assert.equal(testEnv.prompts(),1);
 const again=await testEnv.ctx.__request.fetchJSON('/api/ai/status');
 assert.ok(again.leagues.P1);
 assert.equal(testEnv.calls.length,3);
 assert.equal(testEnv.prompts(),1);
 assert.equal(testEnv.store.get('fvl_site_code'),'correct-private-code');
});
test('invalid private code is rejected and never stored',async()=>{
 const testEnv=createRequestHarness('wrong');
 await assert.rejects(testEnv.ctx.__request.fetchJSON('/api/status'),/incorreto/);
 assert.equal(testEnv.store.has('fvl_site_code'),false);
});
test('startup error is visible beside league selection and current game dates are filtered',()=>{
 const html=fs.readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
 assert.match(html,/Web 5\.9\.1/);
 assert.match(html,/id="problem".*role="alert"/);
 assert.ok(html.indexOf('id="problem"')<html.indexOf('id="league"'));
 assert.match(source,/timeZone:'Europe\/Lisbon'/);
 assert.match(source,/f\.date>=today/);
 assert.match(source,/API é privada/);
});
