import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMatchContext,buildManualOdd,instructions} from '../lib/ai-assistant.mjs';
import {normalizedTeam,allMarketOptions} from '../lib/model.mjs';
const fixture={id:'P1|2026-12-12|Nacional|Sporting%20Clube%20de%20Braga',date:'2026-12-12',home:'Nacional',away:'Sporting Clube de Braga',time:null};
const teams=['Nacional','Sp Braga','Porto','Benfica','Moreirense','Arouca','Braga','Vitoria Guimaraes'];
const matches=Array.from({length:240},(_,i)=>{const home=teams[i%8],away=teams[(i+3)%8],date=new Date(Date.UTC(2026,3,1+i)).toISOString().slice(0,10);return {date,home,away,hg:i%4,ag:(i+1)%3,hhg:i%2,hag:(i+1)%2,hc:4+i%6,ac:3+i%6,hy:2,ay:2,hs:9+i%8,as:8+i%7,hst:3+i%5,ast:3+i%4};});
const loader=async()=>({fixtures:[fixture],matches,source:['league csv'],issues:[]});
test('Sporting Clube de Braga corresponde a Sp Braga',()=>assert.equal(normalizedTeam('Sporting Clube de Braga'),normalizedTeam('Sp Braga')));
test('escolhe seleção principal e não chama xG aos golos projetados',async()=>{
 const {packet}=await createMatchContext({league:'P1',fixtureId:fixture.id},loader);
 assert.equal(packet.modelReady,true,JSON.stringify(packet.modelLimitations));assert.ok(packet.projectedGoalsFromResults);assert.equal(packet.expectedGoals,undefined);assert.ok(packet.primaryMarketToQuote);
 assert.equal(packet.primaryMarketToQuote.id,packet.candidateMarkets[0].id);assert.match(instructions,/NÃO xG/);
});
test('odd muito baixa não é candidata de entrada',async()=>{
 const c=await createMatchContext({league:'P1',fixtureId:fixture.id},loader);const m=buildManualOdd(c,c.packet.primaryMarketToQuote.id,'1,05');
 assert.equal(m.decision,'OBSERVAR');assert.ok(m.marketImpliedProbability>.9);
});
test('modelo demasiado discrepante do preço exige revisão',()=>{
 const option=allMarketOptions().find(o=>o.market==='btts'&&o.selection==='yes');
 const c={estimate:{ready:true,rates:{goals:{ready:true,home:2.7,away:2.7,uncertainty:.08,dispersion:1,coverage:{home:30,away:30}}}},markets:[{optionId:option.id}],packet:{fixture:{status:'FUTURO_CONFORME_HORA'}}};
 const m=buildManualOdd(c,option.id,'1,70');assert.equal(m.decision,'REVER_MODELO');assert.match(m.reason,/NÃO ENTRAR/);
});
test('UI tem verificação de odd independente do Gemini e versão 5.4',()=>{
 const html=fs.readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8'),js=fs.readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8'),server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 assert.match(html,/id="check-price"/);assert.match(js,/api\/ai\/validate/);assert.match(server,/api\/ai\/validate/);assert.match(html,/Web 5.4/);
});
