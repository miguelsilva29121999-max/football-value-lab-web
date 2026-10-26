import test from 'node:test';
import assert from 'node:assert/strict';
import {buildManualOdd,compareManualOffers} from '../lib/ai-assistant.mjs';
import {allMarketOptions} from '../lib/model.mjs';

const btts=allMarketOptions().find(o=>o.market==='btts'&&o.selection==='yes');
const context={
 estimate:{ready:true,rates:{goals:{ready:true,home:1.4,away:1.25,uncertainty:.08,dispersion:1,coverage:{home:20,away:20}}}},
 markets:[{optionId:btts.id}],
 packet:{fixture:{status:'FUTURO_CONFORME_HORA'}}
};
test('Odd 3.10 acima do limite matematico ~2.00 distingue preco de robustez',()=>{
 const m=buildManualOdd(context,btts.id,'3,10');
 assert.ok(m.estimatedMinimumOdd>=1.90&&m.estimatedMinimumOdd<=2.10);
 assert.equal(m.pricePassesMinimum,true);
 assert.equal(m.priceAssessment,'PRECO_SUPERA_MINIMO');
 assert.ok(m.estimatedEv>.3);
 assert.equal(m.decision,'REVER_MODELO');
 assert.equal(m.reliabilityAssessment,'DIVERGENCIA_A_REVER');
 assert.ok(m.reviewReasons.includes('DIVERGENCIA_MODELO_MERCADO'));
 assert.match(m.reason,/PREÇO PASSA/);
 assert.match(m.reason,/14 p.p/);
 const comparison=compareManualOffers(context,[{optionId:btts.id,odd:'3,10'}]);
 assert.equal(comparison.finalStatus,'PRECO_FAVORAVEL_MAS_EM_REVISAO');
 assert.equal(comparison.bestCandidate,null);
 assert.ok(comparison.bestTheoreticalInReview?.pricePassesMinimum);
});
test('Odd insuficiente permanece rejeitada mesmo sem discrepancia extrema',()=>{
 const m=buildManualOdd(context,btts.id,'1,35');
 assert.equal(m.pricePassesMinimum,false);
 assert.equal(m.decision,'OBSERVAR');
 assert.ok(m.reviewReasons.includes('PRECO_INSUFICIENTE'));
});
test('Odd moderada que passa triagem nao recebe rotulo de aposta comprovada',()=>{
 const m=buildManualOdd(context,btts.id,'2,05');
 assert.equal(m.pricePassesMinimum,true);
 assert.equal(m.decision,'POTENCIAL');
 assert.match(m.verification,/não calibradas/);
});

test('Referencia de mercado independente sinaliza divergencia sem a considerar odd atual',()=>{
 const withReference={...context,markets:[{optionId:btts.id,marketReference:{impliedNoVig:0.30,indicativeOdd:3.10,source:'snapshot antigo'}}]};
 const m=buildManualOdd(withReference,btts.id,'2,05');
 assert.equal(m.pricePassesMinimum,true);
 assert.equal(m.decision,'REVER_MODELO');
 assert.equal(m.reliabilityAssessment,'REFERENCIA_DE_MERCADO_DIVERGENTE');
 assert.ok(m.reviewReasons.includes('DESVIO_FACE_A_PRECO_INDICATIVO'));
 assert.match(m.reason,/NÃO é a odd atual/);
});
