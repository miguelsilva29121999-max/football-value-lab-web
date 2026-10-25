import test from 'node:test';
import assert from 'node:assert/strict';
import {recentEvidence,rankStatMarkets} from '../lib/statfirst.mjs';
const fx={date:'2026-10-25',home:'Clube A',away:'Clube B'};
const matches=[];
for(let i=0;i<5;i++){
 matches.push({date:`2026-10-${String(5+i).padStart(2,'0')}`,home:'Clube A',away:'Outra',hg:2,ag:1,hhg:1,hag:0,hc:7,ac:3});
 matches.push({date:`2026-10-${String(5+i).padStart(2,'0')}`,home:'Outra',away:'Clube B',hg:1,ag:1,hhg:0,hag:0,hc:4,ac:5});
}
matches.push({date:'2026-10-26',home:'Clube A',away:'Clube B',hg:9,ag:9});
const fake={ready:true,quality:{dataScore:.8},rates:{goals:{ready:true,home:1.7,away:1.1,uncertainty:.16,dispersion:1,coverage:{home:15,away:15}},half:{ready:false},corners:{ready:false},shots:{ready:false},sot:{ready:false}}};
test('Frequência recente considera último 5 em casa/fora e exclui jogo futuro',()=>{
 const a=recentEvidence(matches,fx,{market:'totals',selection:'over',point:2.5});
 assert.equal(a.home.total,5);assert.equal(a.home.wins,5);
 assert.equal(a.away.total,5);assert.equal(a.away.wins,0);
 assert.equal(a.combined.total,10);assert.equal(a.combined.wins,5);
 assert.equal(a.restHome,16);assert.equal(a.restAway,16);
});
test('Sem campo estatístico válido não conta observação como derrota',()=>{
 const a=recentEvidence(matches,fx,{market:'corners',selection:'over',point:8.5});
 assert.equal(a.combined.total,10);
 const b=recentEvidence(matches,fx,{market:'shots',selection:'over',point:16.5});
 assert.equal(b.combined.total,0);
});
test('Há primeira opção para cotar, alternativas diversas, sem prometer aposta validada',()=>{
 const items=rankStatMarkets(fake,{fixture:fx,matches,maxPerGame:4});
 assert.ok(items.length>0);
 assert.equal(items[0].position,'PRINCIPAL');
 assert.ok(items[0].verdict.includes('COTAR')||items[0].verdict.includes('ALTERNATIVA'));
 assert.equal(new Set(items.map(x=>x.group)).size,items.length);
 assert.ok(items.every(x=>x.evidence && x.market!=='cards'));
});
test('Sem probabilidade fiável, recusa inventar entrada',()=>{
 assert.deepEqual(rankStatMarkets({ready:false,quality:{dataScore:1}},{fixture:fx,matches}),[]);
});
