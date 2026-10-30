import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
const original=global.fetch;
const headings='Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,HC,AC,HY,AY,HS,AS,HST,AST';
const teams=['Team A','Team B','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'];
const season=y=>[headings,...Array.from({length:180},(_,i)=>{
 const date=`${String(1+i%25).padStart(2,'0')}/${i%2?'09':'10'}/${y}`;
 return ['P1',date,teams[i%10],teams[(i+3)%10],i%4,(i+2)%3,i%2,(i+1)%2,3+i%8,3+i%6,1+i%3,2+i%3,9+i%9,8+i%9,3+i%5,2+i%6].join(',');
})].join('\n');
const mock=async (url,opts)=>{
 const s=String(url);if(s.startsWith('http://127.0.0.1:'))return original(url,opts);
 let body;
 if(s.includes('/2627/P1.csv'))body=season(2026);
 else if(s.includes('/2526/P1.csv'))body=season(2025);
 else if(s.includes('/matches/fixtures.csv'))body='Div,Date,Time,HomeTeam,AwayTeam\nP1,10/11/2026,20:00,Team A,Team B\n';
 else throw new Error('Missing mock: '+s);
 return new Response(body,{status:200,headers:{'content-type':'text/csv'}});
};
test('Radar estatístico funciona sem chave de odds, e validação da odd é feita no servidor',async()=>{
 global.fetch=mock;
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/stats-radar?leagues=P1');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.mode,'STAT_FIRST');assert.equal(data.fixturesSeen,1);
  assert.equal(data.gamesWithCandidates,1);
  assert.ok(data.games[0].candidates.length>0);
  assert.ok(data.games[0].candidates.every(x=>x.market!=='cards'));
  const chosen=data.games[0].candidates[0];
  const valResponse=await fetch(base+'/api/stats-validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league:'P1',fixture:data.games[0].fixture,optionId:chosen.optionId,odd:'1,10'})});
  assert.equal(valResponse.status,200);
  const result=await valResponse.json();
  assert.equal(result.validation.status,'OBSERVAR');
  assert.ok(Number.isFinite(result.validation.ev));
 }finally{await new Promise(ok=>server.close(ok));global.fetch=original;}
});
