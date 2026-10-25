import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
const baseFetch=global.fetch;
const headings='Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,HC,AC,HY,AY,HS,AS,HST,AST';
const teams=['Team A','Team B','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'];
const season=y=>[headings,...Array.from({length:220},(_,i)=>[ 'P1',`${String(1+i%25).padStart(2,'0')}/${i%2?'09':'10'}/${y}`,teams[i%10],teams[(i+3)%10],i%4,(i+2)%3,i%2,(i+1)%2,3+i%8,3+i%6,1+i%3,2+i%3,9+i%9,8+i%9,3+i%5,2+i%6].join(','))].join('\n');
const fixtures='Div,Date,Time,HomeTeam,AwayTeam\nP1,29/10/2026,20:00,Team A,Team B\nP1,30/10/2026,20:00,Third,Fourth\n';
test('Novos endpoints respondem com mercados e recusam múltipla com mesmo jogo',async()=>{
 global.fetch=async(url,opts)=>{
  if(String(url).startsWith('http://127.0.0.1:'))return baseFetch(url,opts);
  const body=String(url).includes('/2627/P1.csv')?season(2026):String(url).includes('/2526/P1.csv')?season(2025):String(url).includes('/matches/fixtures.csv')?fixtures:null;
  if(!body)throw Error('URL inesperado: '+url);
  return new Response(body,{status:200,headers:{'content-type':'text/csv'}});
 };
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const a=await baseFetch(base+'/api/market-lab?leagues=P1&mode=higher');
  assert.equal(a.status,200);
  const data=await a.json();
  assert.equal(data.seen,2);
  assert.ok(data.games[0].markets.length>2);
  const fixture=data.games[0].fixture,optionId=data.games[0].markets[0].optionId;
  const b=await baseFetch(base+'/api/multiple-evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legs:[{league:'P1',fixture,optionId,odd:1.9},{league:'P1',fixture,optionId,odd:2.0}],totalOdd:3.8})});
  assert.equal(b.status,400);
  assert.match((await b.json()).error,/mesmo jogo/);
 }finally{global.fetch=baseFetch;await new Promise(resolve=>server.close(resolve));}
});
