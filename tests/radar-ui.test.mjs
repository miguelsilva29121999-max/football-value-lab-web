import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/\binit\(\);\s*$/,'');
test('Painel de auditoria do radar mostra causas de exclusão e fontes',()=>{
 const panel={innerHTML:'',querySelectorAll:()=>[]};
 const document={getElementById:(id)=>id==='radar-panel'?panel:null};
 const context={document,Intl,Date,Math,Number,Set,Map,Array,Object,String,Boolean,console};
 const result={leagues:['E0'],items:[{league:'E0',name:'Premier League',country:'Inglaterra',items:[],diagnostic:{},totalEvents:1,analyzed:0,insufficient:1,offersChecked:0,advancedFetched:0,candidates:0,watch:0,indicative:0}],errors:[],totalCandidates:0,totalWatch:0,totalIndicative:0,totalOffersChecked:0,analyzed:0,advancedFetched:0,note:'Pesquisa de teste sem odds',diagnostic:{reviewed:0,rejected:0,missingPrices:0,noConsensus:0,feedGames:1,insufficientHistory:1,notEvaluable:0,leaguesWithoutOdds:[],leaguesWithFeedErrors:[],failures:{PROBABILIDADE:2},marketsEvaluated:{totals:4}}};
 vm.runInNewContext(`${code}\nrenderRadar(data);`,{...context,data:result},{timeout:5000});
 assert.match(panel.innerHTML,/Onde desaparecem as oportunidades/);
 assert.match(panel.innerHTML,/Probabilidade insuficiente/);
 assert.match(panel.innerHTML,/MERCADOS EFETIVAMENTE AVALIADOS/);
 assert.match(panel.innerHTML,/Portugal/);
});
