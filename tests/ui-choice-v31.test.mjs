import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/\binit\(\);\s*$/,'');
test('Interface identifica uma primeira escolha, mostra suporte recente e não inventa aposta quando faltam dados',()=>{
 const panel={innerHTML:'',querySelectorAll:()=>[]};
 const document={getElementById:id=>id==='stat-panel'?panel:null};
 const data={fixturesSeen:2,withoutHistory:1,withoutCandidates:0,candidatesFound:1,gamesWithCandidates:1,games:[
  {country:'Portugal',leagueName:'Primeira Liga',fixture:{league:'P1',date:'2026-10-29',home:'Casa',away:'Fora'},quality:{dataScore:.76},candidates:[{label:'Mais de 2,5 golos',market:'totals',position:'PRINCIPAL',optionId:'24',p:.68,pLow:.55,oddFair:1.47,oddTarget:1.58,samples:{home:15,away:14},sensitivity:'Moderada',evidence:{home:{wins:4,total:5},away:{wins:3,total:5},restHome:5,restAway:6},warnings:[]}]},
  {country:'Portugal',leagueName:'Primeira Liga',fixture:{league:'P1',date:'2026-10-30',home:'Clube C',away:'Clube D'},quality:{},candidates:[],reason:'Histórico insuficiente.'}
 ],failures:[],gamesTruncated:0};
 const context={document,Intl,Date,Math,Number,Set,Map,Array,Object,String,Boolean,console};
 vm.runInNewContext(`${code}\nrenderStatRadar(data);`,{...context,data},{timeout:5000});
 assert.match(panel.innerHTML,/(1\.ª OPÇÃO NA FAIXA|FORA DA FAIXA)/);
 assert.match(panel.innerHTML,/4\/5/);
 assert.match(panel.innerHTML,/3\/5/);
 assert.match(panel.innerHTML,/Histórico insuficiente/);
 assert.match(panel.innerHTML,/Não vou inventar/);
 assert.match(panel.innerHTML,/não é uma entrada automaticamente boa/i);
});
