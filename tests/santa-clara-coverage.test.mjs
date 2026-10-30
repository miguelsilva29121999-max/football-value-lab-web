import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizedTeam} from '../lib/model.mjs';
import {summarizeLeagueHistory,createMatchContext} from '../lib/ai-assistant.mjs';
test('Aliás da Primeira Liga reconhecidos e duplicados Marítimo normalizados',()=>{
 assert.equal(normalizedTeam('CD Santa Clara'),normalizedTeam('Santa Clara'));
 assert.equal(normalizedTeam('Sport Lisboa e Benfica'),normalizedTeam('Benfica'));
 assert.equal(normalizedTeam('CS Marítimo'),normalizedTeam('Maritimo'));
});
test('Histórico da liga existe independentemente da disponibilidade de mercados e jogo de hoje',async()=>{
 const date=new Date().toISOString().slice(0,10),teams=['Santa Clara','Benfica','Porto','Braga'],matches=[];
 for(let i=1;i<=100;i++){
  const d=new Date(Date.parse(date+'T00:00:00Z')-i*86400000).toISOString().slice(0,10);
  matches.push({date:d,home:teams[i%4],away:teams[(i+1)%4],hg:i%4,ag:(i+1)%3,
   hc:i%4===0?null:3+i%6,ac:i%4===3?null:4+i%5,hs:i%6===0?null:9+i%8,as:8+i%7,hst:3,ast:4,
   hhg:0,hag:1,hy:2,ay:2});
 }
 const f={id:'P1|'+date+'|CD%20Santa%20Clara|Sport%20Lisboa%20e%20Benfica',date,home:'CD Santa Clara',away:'Sport Lisboa e Benfica',time:null};
 const {packet}=await createMatchContext({league:'P1',fixtureId:f.id},async()=>({matches,fixtures:[f],source:['fixture unit test'],issues:[]}));
 assert.equal(packet.modelReady,true);
 assert.equal(packet.fixture.status,'INICIO_HOJE_NAO_CONFIRMADO');
 assert.ok(packet.historySummary.home.leagueGames>15);
 assert.ok(packet.historySummary.away.leagueGames>15);
 assert.equal(packet.historySummary.home.lastFive.games.length,5);
 assert.ok(packet.historySummary.home.lastFive.averages.corners.coverage<5);
 assert.ok(packet.historySummary.home.lastFive.averages.corners.coverage>=0);
});
test('Histórico não transforma estatísticas desconhecidas em zero',()=>{
 const f={date:'2026-10-26',home:'CD Santa Clara',away:'Sport Lisboa e Benfica'};
 const s=summarizeLeagueHistory([
  {date:'2026-10-10',home:'Casa Pia',away:'Santa Clara',hg:0,ag:1,hc:null,ac:null,hs:null,as:null,hst:null,ast:null},
  {date:'2026-10-11',home:'Benfica',away:'Guimaraes',hg:2,ag:0,hc:6,ac:2,hs:18,as:8,hst:6,ast:2}
 ],f);
 assert.equal(s.home.lastFive.averages.corners.value,null);
 assert.equal(s.home.lastFive.averages.shots.coverage,0);
 assert.equal(s.home.lastFive.averages.scored.value,1);
 assert.equal(s.away.lastFive.averages.scored.value,2);
});
test('No dia da partida o UI mostra histórico antes de bloquear entradas pré-jogo',()=>{
 const js=fs.readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
 const history=js.indexOf('renderHistory(packet);');
 const guard=js.indexOf('locked=isNoKickoff(data.fixture);');
 assert.ok(history>0&&guard>0,'histórico e bloqueio continuam separados');
 assert.match(js,/Dados históricos disponíveis/);
});
