import test from 'node:test';
import assert from 'node:assert/strict';
import {askGeminiAI,getGeminiText} from '../lib/ai-assistant.mjs';
const packet={fixture:{home:'Benfica',away:'Porto',date:'2026-10-28',status:'FUTURO_CONFORME_HORA'},candidateMarkets:[],liveFeedAvailable:false};
test('Gemini gratuito: envia a chave so no cabecalho e pesquisa opcional',async()=>{
 let body,headers,url;
 const fetcher=async(u,init)=>{url=u;headers=init.headers;body=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'SEM ENTRADA JUSTIFICADA'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://www.uefa.com/news',title:'UEFA'}}]}}]})};};
 const r=await askGeminiAI({packet,apiKey:'test-GEMINIKEY123456789',fetcher,searchWeb:true});
 assert.match(url,/models\/gemini-2\.5-flash:generateContent$/);
 assert.equal(headers['x-goog-api-key'],'test-GEMINIKEY123456789');
 assert.equal(JSON.stringify(body).includes('test-GEMINIKEY'),false);
 assert.equal(body.tools[0].google_search.constructor,Object);
 assert.equal(body.contents[0].role,'user');
 assert.equal(r.text,'SEM ENTRADA JUSTIFICADA');
 assert.equal(r.links[0].url,'https://www.uefa.com/news');
 assert.equal(r.usedWebSearch,true);
});
test('Gemini: modo sem pesquisa nao envia ferramentas externas',async()=>{
 let body;
 const fetcher=async(u,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Hipotese para cotar. Sem noticias confirmadas.'}]}}]})};};
 const r=await askGeminiAI({packet,apiKey:'test-GEMINIKEY123456789',fetcher,searchWeb:false,question:'E os cantos?',history:[{role:'assistant',content:'Estatisticas parciais.'}]});
 assert.equal(body.tools,undefined);
 assert.equal(body.contents[1].role,'model');
 assert.equal(body.contents[2].parts[0].text,'E os cantos?');
 assert.equal(r.usedWebSearch,false);
});
test('Gemini: ao esgotar free tier reporta limite, nao faz fallback pago',async()=>{
 let count=0;
 const fetcher=async()=>{count++;return {ok:false,status:429,json:async()=>({error:{message:'Resource exhausted'}})};};
 await assert.rejects(()=>askGeminiAI({packet,apiKey:'test-GEMINIKEY123456789',fetcher}),/limite gratuito/);
 assert.equal(count,1);
});
test('Gemini: sem chave ou resposta vazia, nunca inventa entrada',async()=>{
 await assert.rejects(()=>askGeminiAI({packet,apiKey:''}),/Configura/);
 await assert.rejects(()=>askGeminiAI({packet,apiKey:'test-GEMINIKEY123456789',fetcher:async()=>({ok:true,json:async()=>({candidates:[]})})}),/não devolveu texto/);
});
test('Gemini: ignora links nao-HTTPS e duplicados',()=>{
 const r=getGeminiText({candidates:[{content:{parts:[{text:'Análise'}]},groundingMetadata:{groundingChunks:[{web:{uri:'http://inseguro.pt'}},{web:{uri:'https://club.pt',title:'Clube'}},{web:{uri:'https://club.pt',title:'Clube'}}]}}]});
 assert.equal(r.links.length,1);assert.equal(r.links[0].title,'Clube');
});
