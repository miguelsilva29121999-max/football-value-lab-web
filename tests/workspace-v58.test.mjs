import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {filterUpcomingFixtures,lisbonToday} from '../lib/fixture-time.mjs';

test('A data e calculada na zona Europa/Lisboa, incluindo transicao da hora',()=>{
 assert.equal(lisbonToday(new Date('2026-10-27T00:10:00Z')),'2026-10-27');
 assert.equal(lisbonToday(new Date('2026-06-01T23:30:00Z')),'2026-06-02');
});
test('Calendario nunca mostra jogos de datas anteriores, mesmo vindos de fallback',()=>{
 const matches=[
  {league:'P1',date:'2026-10-25',home:'Barcelona',away:'Real Madrid',id:'passado'},
  {league:'P1',date:'2026-10-27',home:'Porto',away:'Benfica',id:'hoje'},
  {league:'P1',date:'2026-10-28',home:'Santa Clara',away:'Braga',id:'amanha'},
  {league:'P1',date:'2026-10-28',home:'Santa Clara',away:'Braga',id:'duplicado'},
  {league:'P1',date:'2026-10-29',home:'Guimaraes',away:'Famalicao',id:'futuro'}
 ];
 const filtered=filterUpcomingFixtures(matches,new Date('2026-10-27T12:00:00Z'));
 assert.deepEqual(filtered.map(x=>x.id),['hoje','amanha','futuro']);
});
test('Pagina principal abre centro atual sem mostrar antigos radares na navegacao',()=>{
 const html=fs.readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.rewrites.some(x=>x.source==='/'&&x.destination==='/assistant.html'));
 assert.match(html,/CENTRO DE OPORTUNIDADES/);
 assert.doesNotMatch(html,/Ferramentas anteriores|Radar antigo|Mercado \+ Múltiplas/);
 for(const id of ['league','filter','fixture','quote-board','decision-summary','history-panel','chat','price-verdict','batch-verdict','question','market'])assert.match(html,new RegExp('id="'+id+'"'),id);
});
test('Frontend atualizado e sintaticamente valido, compara odds e bloqueia jogos de ontem',()=>{
 execFileSync(process.execPath,['--check',new URL('../public/assistant.js',import.meta.url).pathname]);
 const js=fs.readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
 const provider=fs.readFileSync(new URL('../lib/providers.mjs',import.meta.url),'utf8');
 assert.match(js,/f.date<today/);
 assert.match(js,/showMarketsToQuote/);
 assert.match(js,/compareQuotedMarkets/);
 assert.match(js,/setDecision/);
 assert.match(js,/isNoKickoff/);
 assert.match(provider,/filterUpcomingFixtures\(\[\.\.\.fixtures\.values\(\)\],now\)/);
});
