import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchContext,buildManualOdd} from '../lib/ai-assistant.mjs';

const future='2099-11-17';
const fixture={
 id:'AR1|'+future+'|Estudiantes|Instituto',league:'AR1',date:future,
 home:'Estudiantes',away:'Instituto',time:'2099-11-17T19:30:00Z'
};
const dates=Array.from({length:40},(_,i)=>{
 const d=new Date(Date.UTC(2099,9,3+i));
 return d.toISOString().slice(0,10);
});
const matches=[
 ...dates.slice(0,20).map((d,i)=>({date:d,home:'Estudiantes',away:'Oponente '+i,hg:i%3,ag:i%2})),
 ...dates.slice(0,20).map((d,i)=>({date:d,home:'Outro '+i,away:'Instituto',hg:i%3,ag:i%2})),
 ...dates.map((d,i)=>({date:d,home:'Equipa A '+i,away:'Equipa B '+i,hg:i%4,ag:i%3}))
];
const loader=async()=>({fixtures:[fixture],matches,issues:[],source:['fixtures-mock'],historicalGames:matches.length});

test('sem odd real nunca elege entrada principal mesmo com histórico suficiente',async()=>{
 const result=await createMatchContext({league:'AR1',fixtureId:fixture.id},loader);
 assert.equal(result.packet.modelReady,true);
 assert.ok(result.packet.candidateMarkets.length>0);
 assert.equal(result.packet.primaryMarketToQuote,null);
 assert.equal(result.packet.prePriceSelectionStatus,'PENDENTE_DE_COTACAO_REAL');
 assert.equal(result.packet.marketOddsAvailable,false);
});
test('a cotação 1.18 não é classificada como sinal verde por si só',async()=>{
 const result=await createMatchContext({league:'AR1',fixtureId:fixture.id},loader);
 const first=result.packet.candidateMarkets[0];
 const evaluation=buildManualOdd(result,first.id,'1.18');
 assert.equal(evaluation.decision,'OBSERVAR');
 assert.equal(evaluation.priceInDesiredBand,false);
 assert.match(evaluation.reason,/Não entrar|NÃO ENTRAR/i);
});
