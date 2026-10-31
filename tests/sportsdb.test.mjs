import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSportsDbEvent,scanSportsDbNextHours} from '../lib/sportsdb.mjs';

const event=(time='2029-01-02T01:00:00')=>({
 strSport:'Soccer',strLeague:'English Premier League',
 strHomeTeam:'Arsenal',strAwayTeam:'Chelsea',strTimestamp:time,strStatus:'NS'
});

test('fallback normaliza hora UTC sem inventar fuso',()=>{
 const match=parseSportsDbEvent(event());
 assert.equal(match.league,'E0');
 assert.equal(match.kickoffUtc,'2029-01-02T01:00:00.000Z');
 assert.equal(match.home,'Arsenal');
});
test('não trata meia-noite sem confirmação como hora garantida',()=>{
 assert.equal(parseSportsDbEvent(event('2029-01-02T00:00:00')),null);
});
test('fallback encontra um jogo numa janela que atravessa a meia-noite',async()=>{
 const requests=[];
 const fake=async url=>{
  requests.push(url);
  return {ok:true,json:async()=>({events:[event()]})};
 };
 const out=await scanSportsDbNextHours(new Date('2029-01-01T23:30:00Z'),5,{fetcher:fake});
 assert.equal(requests.length,2);
 assert.equal(out.matches.length,1);
 assert.equal(out.checkedDays,2);
 assert.equal(out.matches[0].league,'E0');
});
test('fallback não inventa jogos quando o fornecedor falha',async()=>{
 const fake=async()=>{throw new Error('sem ligação');};
 const out=await scanSportsDbNextHours(new Date('2029-01-01T23:30:00Z'),5,{fetcher:fake});
 assert.deepEqual(out.matches,[]);
 assert.equal(out.checkedDays,0);
 assert.ok(out.issues.length>0);
});
