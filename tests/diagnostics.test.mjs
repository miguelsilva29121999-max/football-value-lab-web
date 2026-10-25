import test from 'node:test';
import assert from 'node:assert/strict';
import {LEAGUES,scoreOffer,policyForMode} from '../lib/model.mjs';

test('Chaves de odds para as três divisões inglesas recuperadas e contagem coerente',()=>{
 assert.equal(LEAGUES.E1.sport,'soccer_efl_champ');
 assert.equal(LEAGUES.E2.sport,'soccer_england_league1');
 assert.equal(LEAGUES.E3.sport,'soccer_england_league2');
 assert.equal(Object.values(LEAGUES).filter(x=>x.sport).length,18);
});

test('Diagnóstico distingue odd fora do intervalo de modelo com EV central fraco',()=>{
 const probability={win:.64,scenarios:[{win:.58,push:0}],push:0};
 const lowPrice=scoreOffer(probability,1.3,policyForMode('balanced'));
 assert.equal(lowPrice.status,'REJEITAR');
 assert.ok(lowPrice.failureCodes.includes('ODD_FORA_INTERVALO'));
 const weakEV=scoreOffer(probability,1.60,policyForMode('balanced'));
 assert.ok(weakEV.failureCodes.includes('VALOR_ESPERADO'));
});

test('Diagnóstico preserva candidaturas experimentais sem forçar rejeições',()=>{
 const favorable=scoreOffer({win:.72,push:0,scenarios:[{win:.67,push:0}]},1.90,policyForMode('balanced'));
 assert.equal(favorable.status,'POTENCIAL');
 assert.deepEqual(favorable.failureCodes,[]);
});
