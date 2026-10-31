import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEspnEvent,fetchEspnEvents,ESPN_CODES} from '../lib/espn.mjs';

const sample=(date,state='pre',completed=false,hg=null,ag=null)=>({
 date,status:{type:{state,completed}},
 competitions:[{competitors:[
  {homeAway:'home',team:{displayName:'Sporting Braga'},score:hg},
  {homeAway:'away',team:{displayName:'FC Porto'},score:ag}
 ]}]
});
test('converte kickoff ISO em data portuguesa e ID estável',()=>{
 const match=parseEspnEvent(sample('2026-11-01T01:30:00Z'),'P1');
 assert.equal(match.date,'2026-11-01');
 assert.equal(match.id,'P1|2026-11-01|Sporting%20Braga|FC%20Porto');
 assert.equal(match.state,'pre');
 assert.equal(match.completed,false);
});
test('resultados só usam marcadores válidos',()=>{
 const m=parseEspnEvent(sample('2026-10-29T20:00:00Z','post',true,'2','1'),'P1');
 assert.equal(m.hg,2);assert.equal(m.ag,1);assert.equal(m.completed,true);
 const invalid=parseEspnEvent(sample('2026-10-29T20:00:00Z','post',true,'','1'),'P1');
 assert.equal(invalid.hg,null);
});
test('consulta ESPN com datas e sem chave de API',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({events:[sample('2029-01-01T20:00:00Z')]})};
 };
 const response=await fetchEspnEvents('BR2',new Date('2029-01-01T00:00:00Z'),new Date('2029-01-03T00:00:00Z'),{fetcher});
 assert.equal(response.events.length,1);
 assert.match(calls[0].url,/bra\.2\/scoreboard\?dates=20290101-20290103/);
 assert.ok(!calls[0].url.includes('apiKey'));
});
test('divisões e países latino-americanos têm slugs explícitos',()=>{
 for(const k of ['BR1','BR2','AR1','CO1','CL1','PY1','PE1','UY1','BO1','EQ1','MX2'])assert.ok(ESPN_CODES[k]);
});
