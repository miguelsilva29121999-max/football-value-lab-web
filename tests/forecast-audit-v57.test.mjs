import test from 'node:test';
import assert from 'node:assert/strict';
import {auditForecasts,metricForMarket} from '../lib/forecast-audit.mjs';
import {allMarketOptions} from '../lib/model.mjs';
import {createMatchContext,buildManualOdd} from '../lib/ai-assistant.mjs';

const teams=['A','B','C','D','E','F','G','H'];
const matches=Array.from({length:330},(_,i)=>{
 const date=new Date(Date.UTC(2025,8,1+i)).toISOString().slice(0,10);
 const a=teams[i%8],b=teams[(i+3)%8];
 return {date,home:a,away:b,hg:(i*7)%4,ag:(i*5+1)%4,hhg:i%2,hag:(i+1)%2,
  hc:3+i%7,ac:4+i%5,hy:2,ay:1,hs:11+i%10,as:8+i%9,hst:2+i%6,ast:3+i%4};
});
const fixture={id:'E0|2026-08-01|A|B',date:'2026-08-01',home:'A',away:'B',time:null};
test('Auditoria calcula previsoes com cronologia e baseline pre-jogo',()=>{
 const audit=auditForecasts(matches,{maxGames:55,minPrior:90});
 assert.ok(audit.examined>20,'Amostra deve conter previsoes viaveis');
 const r=audit.marketResults['btts_yes'];
 assert.ok(r.n>20);
 assert.ok(r.brier>=0&&r.brier<=1);
 assert.ok(r.baselineBrier>=0&&r.baselineBrier<=1);
 assert.ok(r.observedFrequency>=0&&r.observedFrequency<=1);
 assert.ok(r.meanPredicted>=0&&r.meanPredicted<=1);
 assert.equal(r.bins.reduce((a,b)=>a+b.n,0),r.n);
});
test('O modelo nao herda auditoria de mercados diferentes',()=>{
 const options=allMarketOptions();
 assert.equal(metricForMarket(options.find(x=>x.market==='btts'&&x.selection==='yes')),'btts_yes');
 assert.equal(metricForMarket(options.find(x=>x.market==='totals'&&x.point===2.5&&x.selection==='under')),'under25');
 assert.equal(metricForMarket(options.find(x=>x.market==='team_corners')),null);
});
test('Conjunto pequeno nao gera falsos sinais de validacao',()=>{
 const out=auditForecasts(matches.slice(0,16),{maxGames:10});
 assert.equal(out.examined,0);
 assert.equal(out.marketResults.h2h_home.status,'SEM_AMOSTRA');
});
test('Resultado de auditoria e explicacao ficam associados ao mercado, sem afetar fonte de odd',async()=>{
 const data=async()=>({fixtures:[fixture],matches,source:['historia da liga'],issues:[],snapshot:null});
 const {packet}=await createMatchContext({league:'E0',fixtureId:fixture.id},data);
 assert.equal(packet.modelReady,true);
 assert.ok(packet.modelAudit?.examined>=20);
 for(const c of packet.candidateMarkets){
  if(c.historicalAudit)assert.ok(c.historicalAudit.n>=0);
  assert.ok(c.thresholdOddExperimental>1);
 }
});
