import test from 'node:test';
import assert from 'node:assert/strict';
import {priceReality,replacementQuoteOptions} from '../lib/market-price.mjs';

test('odd mínima 1,50 contra preço real 1,18 é inviável ao preço observado',()=>{
 const out=priceReality({minimumOdd:1.50,offeredOdd:1.18});
 assert.equal(out.status,'PRECO_MUITO_INFERIOR');
 assert.equal(out.source,'MANUAL');
 assert.equal(out.shortfall,.32);
 assert.equal(out.gapPct,27.1);
 assert.ok(out.observedBreakEven>.84);
});
test('referência indicativa é distinguida da cotação introduzida',()=>{
 assert.equal(priceReality({minimumOdd:1.50,indicativeOdd:1.18}).source,'INDICATIVA');
 assert.equal(priceReality({minimumOdd:1.50}).status,'SEM_PRECO');
 assert.equal(priceReality({minimumOdd:1.50,offeredOdd:1.72,indicativeOdd:1.18}).status,'PRECO_PASSA_MINIMO');
});
test('mercado ligeiramente abaixo não é grande desvio',()=>{
 assert.equal(priceReality({minimumOdd:1.50,offeredOdd:1.45}).status,'ABAIXO_DO_MINIMO');
});
test('sugere linha over mais exigente sem inventar odds',()=>{
 const options=[
  {id:'g15',market:'totals',selection:'over',point:1.5},
  {id:'g25',market:'totals',selection:'over',point:2.5},
  {id:'u25',market:'totals',selection:'under',point:2.5},
  {id:'btts',market:'btts',selection:'yes'}
 ];
 const candidates=[
  {optionId:'g15',label:'Mais de 1,5 golos',oddTarget:1.50,pLow:.60},
  {optionId:'g25',label:'Mais de 2,5 golos',oddTarget:1.90,pLow:.40},
  {optionId:'u25',label:'Menos de 2,5 golos',oddTarget:2.10,pLow:.35},
  {optionId:'btts',label:'Ambas marcam',oddTarget:1.80,pLow:.42}
 ];
 const alternatives=replacementQuoteOptions(candidates,options,'g15');
 assert.equal(alternatives[0].optionId,'g25');
 assert.equal(alternatives[0].relationship,'LINHA_MAIS_EXIGENTE');
 assert.ok(alternatives.every(x=>x.note.includes('odd REAL')));
 assert.equal(alternatives.length,3);
});
