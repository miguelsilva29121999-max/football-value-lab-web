import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedTeam,estimateMatch} from '../lib/model.mjs';
import {createMatchContext} from '../lib/ai-assistant.mjs';

test('Sporting Clube de Portugal, Sporting CP e Sp Lisbon referem-se ao mesmo clube',()=>{
 const variants=['Sp Lisbon','Sp Lisboa','Sporting Lisbon','Sporting Lisboa','Sporting CP','Sporting Clube de Portugal','Sporting'];
 assert.equal(new Set(variants.map(normalizedTeam)).size,1);
 assert.equal(normalizedTeam('Casa Pia AC'),normalizedTeam('Casa Pia'));
 // Sporting Braga nunca pode ser confundido com Sporting Clube de Portugal.
 assert.notEqual(normalizedTeam('Sp Braga'),normalizedTeam('Sp Lisbon'));
});
test('Histórico Sp Lisbon conta como jogos de Sporting Clube de Portugal',async()=>{
 const date='2026-10-30';
 const fixture={league:'P1',date,home:'Casa Pia AC',away:'Sporting Clube de Portugal',id:'P1|2026-10-30|Casa%20Pia%20AC|Sporting%20Clube%20de%20Portugal',time:null};
 const teams=['Casa Pia','Sp Lisbon','Porto','Benfica','Estoril','Arouca','Sp Braga','Guimaraes'];
 const matches=Array.from({length:240},(_,i)=>{
  const day=new Date(Date.UTC(2026,2,1+i)).toISOString().slice(0,10);
  return {date:day,home:teams[i%8],away:teams[(i+3)%8],
   hg:(i+1)%3,ag:i%3,hhg:i%2,hag:(i+1)%2,
   hc:3+i%7,ac:4+i%6,hs:9+i%9,as:8+i%10,hst:2+i%6,ast:3+i%5};
 });
 const estimate=estimateMatch(matches,fixture.home,fixture.away,date);
 assert.equal(estimate.ready,true,JSON.stringify(estimate.reasons));
 assert.ok(estimate.quality.homeGames>=25);
 assert.ok(estimate.quality.awayGames>=25);
 assert.ok(estimate.quality.homeVenue>=5);
 assert.ok(estimate.quality.awayVenue>=5);
 const {packet}=await createMatchContext({league:'P1',fixtureId:fixture.id},async()=>({
  fixtures:[fixture],matches,source:['regression fixture'],issues:[]
 }));
 assert.equal(packet.modelReady,true);
 assert.equal(packet.historySummary.home.leagueGames,estimate.quality.homeGames);
 assert.equal(packet.historySummary.away.leagueGames,estimate.quality.awayGames);
});
