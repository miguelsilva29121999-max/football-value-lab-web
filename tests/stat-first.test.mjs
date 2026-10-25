import test from 'node:test';
import assert from 'node:assert/strict';
import {targetOdds,rankStatMarkets,validatePrice} from '../lib/statfirst.mjs';
import {allMarketOptions} from '../lib/model.mjs';
const model={ready:true,quality:{dataScore:.88,homeGames:34,awayGames:35},rates:{
 goals:{ready:true,home:1.75,away:1.24,dispersion:1,uncertainty:.13,coverage:{home:17,away:16}},
 half:{ready:true,home:.78,away:.49,dispersion:1,uncertainty:.14,coverage:{home:16,away:15}},
 corners:{ready:true,home:5.5,away:4.7,dispersion:1.5,uncertainty:.14,coverage:{home:17,away:16}},
 yellows:{ready:true,home:2.1,away:2.2,dispersion:1.8,uncertainty:.15,coverage:{home:17,away:16}},
 shots:{ready:false},sot:{ready:false}}};
test('Odd mínima inclui a margem experimental de EV, incluindo reembolso no empate',()=>{
 const s=targetOdds({win:.65,push:0});assert.equal(s.fair,1.54);assert.equal(s.target,1.65);
 const d=targetOdds({win:.55,push:.25});assert.equal(d.fair,1.36);assert.equal(d.target,1.50);
});
test('Sem estimativa ou com qualidade insuficiente não produz mercados',()=>{
 assert.deepEqual(rankStatMarkets({ready:false}),[]);
 assert.deepEqual(rankStatMarkets({...model,quality:{dataScore:.3}}),[]);
});
test('O radar devolve mercados sem odds, respeita diversidade e retira cartões',()=>{
 const picks=rankStatMarkets(model,{maxPerGame:6});
 assert.ok(picks.length>0,'É necessário encontrar pelo menos um mercado matematicamente estimável');
 assert.ok(picks.length<=6);
 assert.equal(new Set(picks.map(x=>x.group)).size,picks.length);
 assert.ok(picks.every(x=>x.market!=='cards'));
 assert.ok(picks.every(x=>x.oddTarget>=1.55&&x.oddTarget<=3.3));
 assert.ok(picks.every(x=>x.p>=.52&&x.pLow<=x.p));
});
test('Com odd baixa ou ausente, não cria entrada',()=>{
 const a=allMarketOptions().find(x=>x.market==='totals'&&x.selection==='over'&&x.point===2.5);
 const v=validatePrice(model,a.id,'1,10');assert.equal(v.status,'OBSERVAR');assert.ok(v.ev<.07);
 assert.throws(()=>validatePrice(model,a.id,''),/Odd introduzida inválida/);
});
test('Uma odd elevada pode ser rotulada apenas como potencial experimental, sem ser validada',()=>{
 const a=allMarketOptions().find(x=>x.market==='totals'&&x.selection==='under'&&x.point===3.5);
 const v=validatePrice(model,a.id,4.5);
 assert.equal(v.status,'POTENCIAL');assert.ok(v.ev>.07);assert.ok(v.evLow>-.2);
});
test('Mercados de cartões ficam bloqueados no novo validador',()=>{
 const a=allMarketOptions().find(x=>x.market==='cards');assert.throws(()=>validatePrice(model,a.id,2.3),/Mercado não disponível/);
});
