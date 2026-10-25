import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMatchContext,askGeminiAI,instructions} from '../lib/ai-assistant.mjs';

const fixture={id:'E0|2026-11-10|Home|Away',date:'2026-11-10',home:'Home',away:'Away',time:null};
const games=[];
const teams=['Home','Away','C','D','E','F','G','H'];
for(let i=0;i<400;i++){
 const date=new Date(Date.UTC(2025,9,1+i%370)).toISOString().slice(0,10);
 games.push({date,home:teams[i%8],away:teams[(i+3)%8],hg:i%3,ag:(i+1)%3,hhg:i%2,hag:(i+1)%2,hc:3+i%9,ac:3+i%7,hy:1+i%4,ay:2+i%4,hs:8+i%14,as:9+i%11,hst:2+i%6,ast:3+i%6});
}
const loader=async()=>({fixtures:[fixture],matches:games,source:['teste'],issues:[]});
test('v5.3: estatísticas suficientes devolvem mercado principal para cotar independentemente do Gemini',async()=>{
 const {packet}=await createMatchContext({league:'E0',fixtureId:fixture.id},loader);
 assert.equal(packet.modelReady,true);
 assert.ok(packet.candidateMarkets.length>=1);
 assert.equal(packet.analysisStage,'PRE_COTACAO');
 assert.equal(packet.primaryMarketToQuote.id,packet.candidateMarkets[0].id);
 assert.equal(packet.manualPriceRequiredForValueAssessment,true);
 assert.equal(packet.marketOddsAvailable,false);
});
test('v5.3: primeiro pedido Gemini pede análise PARA COTAR e não conclusão de entrada sem odd',async()=>{
 let payload;
 const packet=(await createMatchContext({league:'E0',fixtureId:fixture.id},loader)).packet;
 const result=await askGeminiAI({packet,apiKey:'test123',searchWeb:false,fetcher:async(u,init)=>{
  payload=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'PARA COTAR: mercado principal'}]}}]})};
 }});
 assert.match(payload.contents[0].parts[0].text,/ANÁLISE INICIAL SEM PREÇO/);
 assert.match(payload.systemInstruction.parts[0].text,/NÃO confundir falta de odd/);
 assert.equal(result.text,'PARA COTAR: mercado principal');
});
test('v5.3: odd manual ativa a segunda fase sem alterar o preço apresentado pelo programa',async()=>{
 let payload;const packet=(await createMatchContext({league:'E0',fixtureId:fixture.id},loader)).packet;
 await askGeminiAI({packet,manual:{market:'Golos',odd:1.83,decision:'OBSERVAR',reason:'Preço fraco'},apiKey:'test123',searchWeb:false,fetcher:async(u,init)=>{
  payload=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'OBSERVAR — NÃO ENTRAR'}]}}]})};
 }});
 assert.match(payload.contents[0].parts[0].text,/VALIDAÇÃO DE PREÇO MANUAL/);
 assert.match(payload.systemInstruction.parts[0].text,/OBSERVAR — NÃO ENTRAR/);
});
test('v5.3: interface tem quadro de mercados com seleção de odd',()=>{
 const html=fs.readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
 assert.match(html,/id="quote-board"/);
 assert.match(js,/showMarketsToQuote/);
 assert.match(js,/\$\('market'\)\.value=c\.id/);
});
