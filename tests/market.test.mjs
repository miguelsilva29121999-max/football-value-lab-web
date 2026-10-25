import test from 'node:test';
import assert from 'node:assert/strict';
import {marketConsensus,benchmarkOffer,reviewAgainstMarket,evaluateOffers,marketsFromEvent,pickScore} from '../lib/providers.mjs';
import {policyForMode} from '../lib/model.mjs';
const iso=new Date().toISOString();
const O=(book,point,side,price)=>({bookmaker:book,market:'totals',point,selection:side,price,sourceType:'api',lastUpdate:iso});
function totalBook(name,under,over,point=4.5){return [O(name,point,'under',under),O(name,point,'over',over)];}
const group=[...totalBook('A',1.75,2.07),...totalBook('B',1.72,2.10),...totalBook('C',1.81,2.00)];
test('Consenso de mercado remove margem por casa no mesmo mercado e linha',()=>{
 const c=marketConsensus(group);const bench=benchmarkOffer(O('A',4.5,'under',1.75),c);
 assert.ok(bench&&bench.bookmakers>=2);
 assert.ok(bench.fair>.51&&bench.fair<.57,JSON.stringify(bench));
 assert.ok(bench.marketEv<0);
});
test('Modelo otimista sem melhor preço vira observação, sem fingir entrada',()=>{
 const b=benchmarkOffer(O('A',4.5,'under',1.75),marketConsensus(group));
 const result=reviewAgainstMarket({status:'POTENCIAL',odd:1.75,p:.73,ev:.2775,evSafe:-.08,why:''},b,policyForMode('balanced'));
 assert.equal(result.status,'OBSERVAR');assert.equal(result.marketCheck,'DIVERGENCIA');
});
test('Melhor odd contra casas comparáveis pode gerar candidatura experimental sem afrouxar piso de dados',()=>{
 const group=[...totalBook('A',2.06,1.78,2.5),...totalBook('B',1.82,1.96,2.5),...totalBook('C',1.86,1.91,2.5)];
 const b=benchmarkOffer(O('A',2.5,'under',2.06),marketConsensus(group));
 assert.ok(b.marketEv>0.05,JSON.stringify(b));
 const result=reviewAgainstMarket({status:'OBSERVAR',odd:2.06,p:.62,ev:.2772,evSafe:-.14,why:'Cenario adverso',},b,policyForMode('balanced'));
 assert.equal(result.status,'POTENCIAL');assert.equal(result.signalBasis,'COMPARACAO_CASAS');
});
test('Um bookmaker sozinho não constitui consenso',()=>{
 const c=marketConsensus(totalBook('Sozinha',1.83,2.05));
 assert.equal(benchmarkOffer(O('Sozinha',4.5,'under',1.83),c),null);
});
test('Não mistura over e under de linhas distintas',()=>{
 const c=marketConsensus([O('Casa A',2.5,'under',1.8),O('Casa A',3.5,'over',2),...totalBook('Casa B',1.85,1.96)]);
 const b=benchmarkOffer(O('Casa A',2.5,'under',1.8),c);
 assert.equal(b,null);
});
test('Valores de margem irrealistas não criam benchmark',()=>{
 const a=[...totalBook('A',1.15,1.14),...totalBook('B',1.1,1.19)];
 assert.equal(benchmarkOffer(O('A',4.5,'under',1.15),marketConsensus(a)),null);
});
test('Integracao de avaliações aplica consenso e mantém apenas a melhor odd',()=>{
 const est={ready:true,quality:{dataScore:.92},rates:{goals:{ready:true,home:2.25,away:1.40,uncertainty:.26,dispersion:1}}};
 const opts=[...totalBook('A',1.75,2.07),...totalBook('B',1.72,2.10),...totalBook('C',1.81,2.00)];
 const r=evaluateOffers(est,opts,'balanced');const under=r.find(x=>x.selection==='under');
 assert.ok(under);assert.equal(under.odd,1.81);assert.ok(under.benchmark);assert.ok(under.benchmark.bookmakers>=2);
});
test('Melhor preço de mercado tem prioridade sobre sinal puramente do modelo, mas não garante acerto',()=>{
 assert.ok(pickScore({signalBasis:'COMPARACAO_CASAS',benchmarkEdge:.08,ev:.05,evSafe:-.05})>
           pickScore({ev:.12,evSafe:-.05}));
});

// Mercados de futebol disponíveis apenas no endpoint por jogo, se a casa os publicar.
const eventWith=(key,point,description='')=>({home_team:'Team A',away_team:'Team B',bookmakers:[{title:'Book A',last_update:iso,markets:[{key,last_update:iso,outcomes:[{name:'Over',description,point,price:1.9},{name:'Under',description,point,price:1.9}]}]}]});
test('Lê corretamente totais de golos da primeira parte, sem confundir com jogo completo',()=>{
 const offers=marketsFromEvent(eventWith('totals_h1',1.5));
 assert.equal(offers.length,2);
 assert.ok(offers.every(x=>x.market==='half_totals'&&x.point===1.5));
});
test('Lê corretamente cantos da equipa da casa',()=>{
 const offers=marketsFromEvent(eventWith('alternate_team_totals_corners',4.5,'Team A'));
 assert.equal(offers.length,2);
 assert.ok(offers.every(x=>x.market==='team_corners'&&x.team==='home'));
});
test('Rejeita odds de cantos por equipa sem identificação clara da equipa',()=>{
 assert.equal(marketsFromEvent(eventWith('alternate_team_totals_corners',4.5,'Equipa desconhecida')).length,0);
});

test('Interpreta dupla hipótese em inglês com Home or Draw e Draw or Away',()=>{
 const e={home_team:'Team A',away_team:'Team B',bookmakers:[{title:'Book A',last_update:iso,markets:[{key:'double_chance',last_update:iso,outcomes:[{name:'Home or Draw',price:1.8},{name:'Draw or Away',price:1.9},{name:'Home or Away',price:1.7}]}]}]};
 const out=marketsFromEvent(e);
 assert.deepEqual(out.map(x=>x.selection),['1X','X2','12']);
});
