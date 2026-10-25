import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rankStatMarkets, quoteProfile, QUOTE_PROFILES, validatePrice} from '../lib/statfirst.mjs';
import {allMarketOptions} from '../lib/model.mjs';
const model={ready:true,quality:{dataScore:.86},rates:{
 goals:{ready:true,home:1.63,away:1.14,dispersion:1,uncertainty:.14,coverage:{home:16,away:15}},
 half:{ready:true,home:.77,away:.53,dispersion:1,uncertainty:.14,coverage:{home:16,away:15}},
 corners:{ready:true,home:5.1,away:4.9,dispersion:1.3,uncertainty:.15,coverage:{home:16,away:16}},
 shots:{ready:false},sot:{ready:false}}};
test('Perfil equilibrado seleciona preferencialmente mercado na faixa teórica 1,75-2,25',()=>{
 const selections=rankStatMarkets(model,{profile:'balanced',maxPerGame:4});
 assert.ok(selections.some(x=>x.inTargetBand));
 assert.equal(selections[0].inTargetBand,true);
 assert.ok(selections[0].oddTarget>=1.75&&selections[0].oddTarget<=2.25);
 assert.ok(selections[0].p>=.52);
});
test('Perfil maior probabilidade procura odd teórica mais baixa que perfil retorno',()=>{
 const high=rankStatMarkets(model,{profile:'accurate',maxPerGame:4});
 const returns=rankStatMarkets(model,{profile:'return',maxPerGame:4});
 assert.ok(high.length&&returns.length);
 assert.ok(high[0].oddTarget<=1.90,`Alta probabilidade: ${high[0].oddTarget}`);
 assert.ok(returns[0].oddTarget>=1.90,`Maior retorno: ${returns[0].oddTarget}`);
 assert.ok(high[0].p>=returns[0].p);
});
test('Sem escolhas na faixa declara-se alternativa fora da faixa, sem inventar mercado',()=>{
 const constrained={...model,rates:{...model.rates,half:{ready:false},corners:{ready:false}}};
 const picks=rankStatMarkets(constrained,{profile:'return',maxPerGame:4});
 assert.ok(picks.every(x=>x.optionId!=null));
 if(picks.length && !picks.some(x=>x.inTargetBand))assert.match(picks[0].verdict,/ALTERNATIVA/);
});
test('O preço manual insuficiente continua rejeitado e mostra desvio face à odd mínima',()=>{
 const o=allMarketOptions().find(x=>x.market==='totals'&&x.point===2.5&&x.selection==='over');
 const bad=validatePrice(model,o.id,'1,05');
 assert.equal(bad.status,'OBSERVAR');
 assert.ok(bad.shortfall>=0);
 assert.ok(bad.breakEven>0.9);
});
test('Página tem seleção de perfil e informa que não são odds reais',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="quote-profile"/);
 assert.match(js,/profile=\x27\+encodeURIComponent\(profile\)/);
 assert.match(html,/odd mínima teórica/);
 assert.deepEqual(Object.keys(QUOTE_PROFILES).sort(),['accurate','balanced','return']);
 assert.equal(quoteProfile('invalid'),QUOTE_PROFILES.balanced);
});
