import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverMarkets,evaluateMultiple,SEARCH_MODES} from '../lib/marketlab.mjs';
import {estimateMatch} from '../lib/model.mjs';
const t1={league:'P1',home:'Team A',away:'Team B',date:'2026-11-08'},t2={league:'P1',home:'Team C',away:'Team D',date:'2026-11-08'},t3={league:'E0',home:'Team E',away:'Team F',date:'2026-11-09'};
const L=(fixture,odd,p,low)=>({fixture,odd,prob:{win:p,low}});
test('Múltipla: usa odd total real e probabilidade conjunta de jogos diferentes',()=>{
 const result=evaluateMultiple([L(t1,1.9,.60,.50),L(t2,2.0,.60,.49)],4.1);
 assert.equal(result.numberOfLegs,2);
 assert.ok(Math.abs(result.probability-.36)<1e-9);
 assert.ok(Math.abs(result.ev-.476)<1e-9);
 assert.ok(Math.abs(result.breakEven-1/4.1)<.00002);
 assert.ok(result.cautions.some(s=>s.includes('independência')));
});
test('Múltipla: dois resultados do mesmo jogo não são combináveis',()=>{
 assert.throws(()=>evaluateMultiple([L(t1,1.8,.7,.6),L({...t1,id:'other'},2,.6,.4)],4),/mesmo jogo/);
});
test('Múltipla: mercados negativos individualmente não geram entrada por combinar odds',()=>{
 const result=evaluateMultiple([L(t1,1.5,.6,.53),L(t2,2.1,.55,.40)],4.2);
 assert.equal(result.verdict,'OBSERVAR');
});
test('Múltipla: bloqueia reembolsos e extremos inválidos',()=>{
 assert.throws(()=>evaluateMultiple([L(t1,1.8,.7,.6)],3),/entre 2 e 4/);
 assert.throws(()=>evaluateMultiple([L(t1,1.8,.7,.6),L(t2,2,.6,.5)],-1),/inválida/);
 assert.throws(()=>evaluateMultiple([{...L(t1,1.8,.7,.6),prob:{win:.7,low:.6,push:.2}},L(t2,2,.6,.5)],3),/reembolso/);
});
test('Modos de procura suportam odds altas e não alteram as probabilidades reais',()=>{
 assert.equal(SEARCH_MODES.higher.maxTarget,8);
 assert.ok(SEARCH_MODES.higher.minP<SEARCH_MODES.reliable.minP);
});
test('Catálogo amplo é diversificado sem cartões e só usa dados existentes',()=>{
 const matches=[];const teams=['Team A','Team B','Team C','Team D','Team E','Team F','Team G','Team H'];
 for(let i=0;i<380;i++){
  const home=teams[i%8],away=teams[(i+3)%8];
  matches.push({date:`2026-${i%2===0?'10':'09'}-${String((i%24)+1).padStart(2,'0')}`,
   home,away,hg:i%4,ag:(i+1)%3,hhg:i%2,hag:i%2,hc:3+i%8,ac:4+i%6,hy:2,ay:1,hs:10+i%9,as:9+i%6,hst:3+i%4,ast:2+i%4});
 }
 const estimate=estimateMatch(matches,t1.home,t1.away,t1.date);
 assert.ok(estimate.ready,JSON.stringify(estimate.reasons));
 const markets=discoverMarkets(estimate,{fixture:t1,matches,mode:'higher',maxMarkets:14});
 assert.ok(markets.length>4,`Apenas ${markets.length} linhas`);
 assert.ok(markets.every(m=>m.market!=='cards'&&m.market!=='dnb'));
 assert.ok(new Set(markets.map(m=>m.family)).size>=3);
 assert.ok(markets.every(m=>m.oddTarget>1&&m.probability>0&&m.low>0));
});
