import test from 'node:test';import assert from 'node:assert/strict';
import {createMatchContext,buildManualOdd,getResponseText,askFootballAI} from '../lib/ai-assistant.mjs';
const fixture={id:'P1|2026-11-10|Benfica|Porto',date:'2026-11-10',home:'Benfica',away:'Porto',time:null,source:'fixture'};
const loader=async()=>({fixtures:[fixture],matches:[{date:'2026-10-20',home:'Benfica',away:'Porto',hg:2,ag:1}],historicalGames:1,source:['https://example.com/sample.csv'],issues:[]});
const request={league:'P1',fixtureId:fixture.id};
test('contexto nao recomenda mercado sem histórico suficiente e indica falta de live',async()=>{
 const r=await createMatchContext(request,loader);
 assert.equal(r.packet.modelReady,false);assert.equal(r.packet.liveFeedAvailable,false);assert.equal(r.packet.fixture.status,'HORA_NAO_CONFIRMADA');assert.equal(r.packet.candidateMarkets.length,0);
});
test('jogo inexistente deve ser rejeitado',async()=>{await assert.rejects(()=>createMatchContext({league:'P1',fixtureId:'falso'},loader),/já não está/);});
test('chave de API obrigatoria sem resposta ficticia',async()=>{const {packet}=await createMatchContext(request,loader);await assert.rejects(()=>askFootballAI({packet,apiKey:''}),/Configura/);});
test('mensagem e citacoes extraidas',()=>{const r=getResponseText({output:[{type:'message',content:[{type:'output_text',text:'Análise correta',annotations:[{url:'https://sports.example.com/a',title:'Notícia'}]}]}]});assert.equal(r.text,'Análise correta');assert.equal(r.links[0].title,'Notícia');});
test('fetch OpenAI mock guarda chave apenas no cabeçalho e envia dados',async()=>{
 const {packet}=await createMatchContext(request,loader);let payload,auth;
 const fetcher=async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(init.body);auth=init.headers.Authorization;return {ok:true,json:async()=>({model:'gpt-5-mini',output:[{type:'message',content:[{type:'output_text',text:'SEM ENTRADA JUSTIFICADA'}]}]})};};
 const r=await askFootballAI({packet,apiKey:'sk-test-123456789123456789',model:'gpt-5-mini',fetcher,searchWeb:true});
 assert.equal(r.text,'SEM ENTRADA JUSTIFICADA');assert.equal(auth,'Bearer sk-test-123456789123456789');assert.equal(payload.tools[0].type,'web_search');assert.equal(payload.tool_choice,'required');assert.equal(JSON.stringify(payload).includes('sk-test-'),false);
});
test('chat sem web nao faz pesquisa e aceita pergunta',async()=>{const {packet}=await createMatchContext(request,loader);let payload;
 const fetcher=async(url,init)=>{payload=JSON.parse(init.body);return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Sem noticias verificadas.'}]}]})};};
 const r=await askFootballAI({packet,apiKey:'sk-test-123456789123456789',fetcher,searchWeb:false,question:'E os cantos?'});
 assert.equal(r.usedWebSearch,false);assert.equal(payload.tools,undefined);assert.match(JSON.stringify(payload),/E os cantos/);
});
test('sem estimativa nao é possível validar odd',async()=>{const match=await createMatchContext(request,loader);assert.throws(()=>buildManualOdd(match,'totals_over_2.5','1.85'),/Sem estatísticas/);});
