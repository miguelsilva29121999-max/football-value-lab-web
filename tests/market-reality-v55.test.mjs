import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchContext,buildManualOdd} from '../lib/ai-assistant.mjs';
import {allMarketOptions} from '../lib/model.mjs';

const teams=['Barcelona','Real Madrid','Betis','Sevilla','Valencia','Villarreal'];
const matches=Array.from({length:190},(_,i)=>({
 date:new Date(Date.UTC(2026,5,1+i)).toISOString().slice(0,10),
 home:teams[i%6],away:teams[(i+1)%6],hg:i%4,ag:(i+1)%3,hhg:i%2,hag:(i+1)%2,
 hc:i%8+3,ac:i%7+3,hs:i%15+8,as:i%16+8,hst:i%6+2,ast:i%5+3,hy:2,ay:2
}));
const fixture={id:'SP1|2026-12-12|Barcelona|Real%20Madrid',date:'2026-12-12',home:'Barcelona',away:'Real Madrid',time:null};
const loader=async()=>({matches,fixtures:[fixture],source:[],issues:[],snapshot:{rows:[]}});

test('No longer proposes team to score only 1 goal as primary',async()=>{
 const {packet}=await createMatchContext({league:'SP1',fixtureId:fixture.id},loader);
 assert.equal(packet.modelReady,true);
 const options=new Map(allMarketOptions().map(o=>[o.id,o]));
 for(const c of packet.candidateMarkets){
  const o=options.get(c.id);assert.ok(o);
  assert.notEqual(o.market,'dc');
  if(o.market==='team_goals')assert.ok(o.point>=1.5);
  if(o.market==='totals')assert.ok(o.point>=2.5);
 }
});
test('Historical market reference never claims to be a current quote',async()=>{
 const source=async()=>({...await loader(),snapshot:{rows:[{
 Date:'12/12/2026',HomeTeam:'Barcelona',AwayTeam:'Real Madrid',
 AvgH:'1.70',AvgD:'4.60',AvgA:'4.50','Avg>2.5':'1.22','Avg<2.5':'4.10'
 }]}});
 const {packet}=await createMatchContext({league:'SP1',fixtureId:fixture.id},source);
 for(const c of packet.candidateMarkets)if(c.marketReference){
  assert.match(c.marketReference.source,/indicativo/);
  assert.ok(c.marketReference.impliedNoVig>0);
 }
});
test('Same-day fixture without verified kickoff cannot be treated as valid pre-match quote',async()=>{
 const today=new Date().toISOString().slice(0,10);
 const f={...fixture,date:today,id:'SP1|'+today+'|Barcelona|Real%20Madrid'};
 const c=await createMatchContext({league:'SP1',fixtureId:f.id},async()=>({...await loader(),fixtures:[f]}));
 assert.equal(c.packet.fixture.status,'INICIO_HOJE_NAO_CONFIRMADO');
 if(c.packet.candidateMarkets.length)assert.throws(()=>buildManualOdd(c,c.packet.candidateMarkets[0].id,'1.8'),/hora de início/i);
});
