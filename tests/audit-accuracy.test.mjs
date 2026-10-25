import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOffers} from '../lib/providers.mjs';
import fs from 'node:fs';
const now=new Date().toISOString();
const est={ready:true,quality:{dataScore:.95},rates:{goals:{ready:true,home:1.8,away:1.2,uncertainty:.15,dispersion:1}}};
const offer=(name,selection,price)=>({market:'totals',point:2.5,selection,bookmaker:name,price,sourceType:'api',lastUpdate:now});
test('Preços repetidos de várias casas NÃO são confundidos com falta de modelo',()=>{
 const input=[offer('A','over',1.9),offer('B','over',2.02),offer('C','over',1.97),offer('A','under',1.93),offer('B','under',1.91)];
 const audit={};const result=evaluateOffers(est,input,'balanced',audit);
 assert.equal(audit.received,5);assert.equal(audit.compatible,5);assert.equal(audit.unsupported,0);
 assert.equal(result.length,2);assert.equal(audit.grouped,3);
 assert.equal(audit.compatible,audit.grouped+result.length);
});
test('Mercados sem modelo são contados separadamente das odds agrupadas',()=>{
 const input=[offer('A','over',1.9),offer('B','over',2.01),{...offer('A','over',1.95),market:'corners',point:9.5}];
 const audit={};const result=evaluateOffers(est,input,'balanced',audit);
 assert.equal(audit.compatible,2);assert.equal(audit.unsupported,1);assert.equal(audit.grouped,1);
 assert.equal(audit.unsupportedMarkets.corners,1);assert.equal(result.length,1);
});
test('Interface distingue profundidade selecionada de modo aprofundado ativo',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="radar-extended"/);
 assert.match(app,/el\('deep-games'\)\.disabled=!enabled/);
 assert.match(app,/Radar aprofundado DESATIVADO/);
});
