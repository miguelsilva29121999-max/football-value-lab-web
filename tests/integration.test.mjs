import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLeague,analyzeFixture,scanLeague,scanLeagues} from '../lib/providers.mjs';
import {server} from '../server.mjs';
const today='2026-10-25';
function date(y,m,d){return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;}
const headings='Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,HC,AC,HY,AY,HS,AS,HST,AST';
const teams=['Team A','Team B','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'];
function season(y){const rows=[];
 for(let i=0;i<180;i++){
  const home=teams[i%10],away=teams[(i+3)%10],day=1+(i%25),month=i%2?9:10;
  rows.push(['P1',date(y,month,day),home,away,i%4,(i+2)%3,i%2,(i+1)%2,3+i%8,3+i%6,1+i%3,2+i%3,9+i%9,8+i%9,3+i%5,2+i%6].join(','));
 }return [headings,...rows].join('\n');}
const fixtures='Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A,B365>2.5,B365<2.5\nP1,29/10/2026,20:00,Team A,Team B,1.94,3.20,4.40,1.90,1.86\n';
let called=[];
const initial=global.fetch;
const mock=async url=>{
 called.push(String(url));let body;
 if(String(url).includes('/2627/P1.csv'))body=season(2026);
 else if(String(url).includes('/2526/P1.csv'))body=season(2025);
 else if(String(url).includes('/matches/fixtures.csv'))body=fixtures;
 else throw Error('URL not mocked '+url);
 return new Response(body,{status:200,headers:{'content-type':'text/csv','last-modified':'Fri, 23 Oct 2026 13:36:00 GMT'}});
};
test('Integração offline — recolha, jogos, mercados, radar e HTTP',async()=>{
 global.fetch=mock;
 try{
  const data=await loadLeague('P1',new Date('2026-10-25T12:00:00Z'));
  assert.ok(data.historicalGames>=50);
  assert.equal(data.fixtures.length,1);
  assert.equal(data.fixtures[0].home,'Team A');
  const report=await analyzeFixture('P1',data.fixtures[0]);
  assert.equal(report.estimate.ready,true,JSON.stringify(report.estimate.reasons));
  assert.equal(report.oddsKind,'snapshot');
  assert.ok(report.offers.length>0);
  assert.ok(report.offers.every(o=>o.status!=='POTENCIAL'));
  const manual=await analyzeFixture('P1',data.fixtures[0],{manualOffers:[{market:'btts',selection:'yes',price:1.9}]});
  assert.equal(manual.oddsKind,'manual');
  assert.equal(manual.offers.length,1);
  assert.equal(manual.offers[0].market,'btts');
  const radar=await scanLeagues(['P1'],'');
  assert.equal(radar.items.length,1);
  assert.equal(radar.items[0].analyzed,1);
  assert.ok(called.length>=3);
 }finally{global.fetch=initial;}
});
