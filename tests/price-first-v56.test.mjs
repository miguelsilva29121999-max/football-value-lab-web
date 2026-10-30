import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildManualOdd,compareManualOffers,createMatchContext} from '../lib/ai-assistant.mjs';
import {allMarketOptions} from '../lib/model.mjs';

const opt=allMarketOptions().find(o=>o.market==='btts'&&o.selection==='yes');
const context={
 estimate:{ready:true,rates:{goals:{ready:true,home:1.8,away:1.3,uncertainty:.08,dispersion:1,coverage:{home:26,away:24}}}},
 markets:[{optionId:opt.id}],
 packet:{fixture:{status:'FUTURO_CONFORME_HORA'}}
};
test('Apostas com odd 1,15 sao sempre nao entrar neste perfil',()=>{
 const m=buildManualOdd(context,opt.id,'1,15');
 assert.equal(m.decision,'OBSERVAR');
 assert.match(m.reason,/1,70/);
 const batch=compareManualOffers(context,[{optionId:opt.id,odd:'1,15'}]);
 assert.equal(batch.bestCandidate,null);
 assert.equal(batch.finalStatus,'SEM_ENTRADA');
});
test('Preco razoavel nao significa lucro validado',()=>{
 const r=compareManualOffers(context,[{optionId:opt.id,odd:'1,90'}]);
 assert.equal(r.count,1);
 assert.equal(r.offers[0].decision,'POTENCIAL');
 assert.equal(r.finalStatus,'PRECO_EXPERIMENTAL_A_CONFIRMAR');
 assert.match(r.notice,/experimental/i);
});
test('Odd excessivamente afastada do modelo exige revisao, sem forcar entrada',()=>{
 const m=buildManualOdd(context,opt.id,'3,00');
 assert.equal(m.decision,'REVER_MODELO');
 assert.match(m.reason,/NÃO ENTRAR/);
});
test('Comparar odds rejeita mercados repetidos e invalidos',()=>{
 assert.throws(()=>compareManualOffers(context,[]),/entre 1 e 12/);
 assert.throws(()=>compareManualOffers(context,[{optionId:opt.id,odd:'1.8'},{optionId:opt.id,odd:'1.9'}]),/repetido/);
});
test('Interface e servidor expõem comparacao de varias odds no mesmo pedido',()=>{
 const html=fs.readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
 const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 assert.match(html,/Web 5\.9\.1/);
 assert.match(js,/compareQuotedMarkets/);
 assert.match(js,/fixtureId,offers/);
 assert.match(server,/compareManualOffers/);
});
