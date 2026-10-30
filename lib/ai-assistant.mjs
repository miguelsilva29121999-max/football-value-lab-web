import {LEAGUES, estimateMatch, normalizedTeam} from './model.mjs';
import {loadLeague} from './providers.mjs';
import {rankStatMarkets, validatePrice} from './statfirst.mjs';

const clipText=(v,n=800)=>String(v??'').trim().slice(0,n);
const sameDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
const isoNow=()=>new Date().toISOString();

export async function createMatchContext({league,fixtureId}, loader=loadLeague){
 if(!LEAGUES[league])throw Error('Competição desconhecida.');
 if(!fixtureId||typeof fixtureId!=='string'||fixtureId.length>360)throw Error('Seleciona um jogo da lista.');
 const data=await loader(league);
 const fixture=data.fixtures.find(f=>f.id===fixtureId);
 if(!fixture||!sameDay(fixture.date))throw Error('O jogo já não está na lista desta competição. Atualiza o calendário.');
 const estimate=estimateMatch(data.matches,fixture.home,fixture.away,fixture.date);
 const ranked=estimate.ready?rankStatMarkets(estimate,{maxPerGame:14,profile:'balanced',matches:data.matches,fixture,minDataScore:0.30}):[];
 // Procurar entradas mais utilizáveis: não basta alta probabilidade; queremos odds mínimas menos 'ridículas'.
 const attractiveness=c=>{
  const recent=c.evidence?.combined;const observed=recent?.rate;
  const support=recent?.total>=6&&observed!==null?Math.max(-.14,Math.min(.12,.10-Math.abs(observed-c.p)*.45)):0;
  const oddFit=Math.max(0,1-Math.abs((c.oddTarget||0)-1.95)/0.80);
  const downside=(c.p-c.pLow);
  const diverges=(c.warnings||[]).some(x=>/diverge/i.test(x));
  return 1.10*oddFit+1.30*c.pLow+.45*c.p+.30*(estimate.quality?.dataScore||0)+support-downside*.75-(diverges ? .18 : 0)-(c.warnings?.length||0)*.03;
 };
 const markets=[...ranked].sort((a,b)=>attractiveness(b)-attractiveness(a));
 const goodBand=markets.filter(c=>c.oddTarget>=1.72&&c.oddTarget<=2.40&&c.pLow>=.38&&c.p-c.pLow<=.25);
 const dependable=markets.filter(c=>c.pLow>=.42&&c.p-c.pLow<=.23&&!(c.warnings||[]).some(x=>/diverge/i.test(x)));
 const prioritized=[...goodBand,...dependable.filter(c=>!goodBand.includes(c)),...markets.filter(c=>!goodBand.includes(c)&&!dependable.includes(c))];
 const teamGames=team=>data.matches.filter(m=>m.date<fixture.date&&(normalizedTeam(m.home)===normalizedTeam(team)||normalizedTeam(m.away)===normalizedTeam(team))).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).map(m=>({data:m.date,casa:m.home,fora:m.away,golosCasa:m.hg,golosFora:m.ag,cantosCasa:m.hc,cantosFora:m.ac,rematesCasa:m.hs,rematesFora:m.as,rematesBalizaCasa:m.hst,rematesBalizaFora:m.ast,cartoesCasa:m.hy,cartoesFora:m.ay}));
 const time=fixture.time||null;
 const hasClock=typeof time==='string'&&(time.includes('T')||/^\d\d?:\d\d/.test(time));
 let kickoff=null;
 if(hasClock){const candidate=time.includes('T')?Date.parse(time):Date.parse(`${fixture.date}T${time}:00Z`);if(Number.isFinite(candidate))kickoff=new Date(candidate).toISOString();}
 const status=kickoff?Date.now()>=Date.parse(kickoff)?'JOGO_JA_PODE_TER_COMECADO':'FUTURO_CONFORME_HORA':'HORA_NAO_CONFIRMADA';
 const packet={consultedAt:isoNow(),competition:`${LEAGUES[league].country} · ${LEAGUES[league].name}`,fixture:{league,date:fixture.date,home:fixture.home,away:fixture.away,timeFromProvider:time,kickoffEstimateUtc:kickoff,status},dataSource:{history: data.source||[],snapshot: data.snapshot?.url||null,issues:(data.issues||[]).slice(0,5)},historicalMatchesInLeague:data.matches.length,modelReady:!!estimate.ready,modelLimitations:estimate.ready?estimate.caveats:estimate.reasons,quality:estimate.quality||null,projectedGoalsFromResults:estimate.ready?{home:estimate.rates.goals.home,away:estimate.rates.goals.away}:null,recentHome:teamGames(fixture.home),recentAway:teamGames(fixture.away),candidateMarkets:prioritized.map(x=>({id:x.optionId,name:x.label,modelProbability:x.p,scenarioLow:x.pLow,thresholdOddExperimental:x.oddTarget,priority:x.priority,homeForm:x.evidence?.home,awayForm:x.evidence?.away,notes:x.warnings||[]})),analysisStage:'PRE_COTACAO',historyScope:'Apenas jogos da liga; não são todos os encontros oficiais nem xG de remates',rankingMethod:'Prioridade a mercados utilizáveis, com equilíbrio entre odd mínima teórica, consistência e cenário adverso',manualPriceRequiredForValueAssessment:true,primaryMarketToQuote:prioritized[0]?{id:prioritized[0].optionId,name:prioritized[0].label,thresholdOddExperimental:prioritized[0].oddTarget,modelProbability:prioritized[0].p,scenarioLow:prioritized[0].pLow,support:dependable.includes(prioritized[0])?'MODERADO':'FRAGIL'}:null,liveFeedAvailable:false,verifiedLineupsAvailable:false,verifiedInjuriesFromDataProvider:false,marketOddsAvailable:false};
 return {packet,estimate,markets:prioritized};
}

export function buildManualOdd(context,optionId,oddText){
 if(!optionId||!String(oddText||'').trim())return null;
 if(context.packet?.fixture?.status==='JOGO_JA_PODE_TER_COMECADO')throw Error('O jogo pode ter começado; o modelo é apenas pré-jogo.');
 if(!context.estimate.ready)throw Error('Sem estatísticas suficientes para comparar a odd.');
 if(!context.markets.some(c=>c.optionId===optionId))throw Error('Escolhe um dos mercados apresentados.');
 const v=validatePrice(context.estimate,optionId,oddText);
 const implied=1/v.odd;
 const gap=Number((v.probability-implied).toFixed(3));
 // Uma discrepância muito grande pode ser valor, mas também um modelo errado. Não é evidência para apostar.
 const qualityScore=context.packet?.quality?.dataScore??0;
 const divergent=gap>(qualityScore>=.55 ? .22 : .18);
 const decision=(v.status==='POTENCIAL'&&divergent)?'REVER_MODELO':v.status;
 const reason=divergent&&v.status==='POTENCIAL'?'O modelo atribui uma probabilidade muito superior à implícita na cotação (sem retirar margem). Divergência demasiado grande sem validação independente: OBSERVAR — NÃO ENTRAR.':v.reason;
 return {market:v.label,odd:v.odd,modelProbability:v.probability,marketImpliedProbability:Number(implied.toFixed(3)),modelMarketGap:gap,scenarioLow:v.sensitivityLow,estimatedEv:v.ev,estimatedEvLow:v.evLow,estimatedMinimumOdd:v.targetOdd,decision,reason,verification:'Odd fornecida manualmente, não verificada. Probabilidades experimentais não calibradas. A cotação do mercado não prova nem refuta sozinha o modelo.'};
}

export const instructions=`És analista de futebol para um utilizador português. O utilizador quer uma saída PRÁTICA: uma entrada principal clara por jogo, escrita como mercado concreto, sem relatório gigante.
NÃO confundir falta de odd com falta de mercado. A seleção antes da cotação é PARA COTAR, nunca uma entrada validada. Se o utilizador deu uma odd, respeita a decisão matemática do servidor: OBSERVAR ou REVER_MODELO = NÃO ENTRAR; POTENCIAL = hipótese, nunca garantia.
REGRAS: Usa apenas os dados do pacote. 'projectedGoalsFromResults' são golos projetados a partir de resultados, NÃO xG real. 'recentHome' e 'recentAway' são apenas jogos da liga. Não inventes notícias, escalações, lesões, árbitros, odds, estatísticas ou probabilidades. O cenário baixo é teste de sensibilidade, não intervalo de confiança. Não existe feed live. Se hora não confirmada, diz isso numa frase.
Na primeira análise escreve no máximo 140 palavras e neste formato exato:
ENTRADA PRINCIPAL: [nome exato do mercado, ou 'Sem entrada justificada'].
CONFIANÇA EXPERIMENTAL: [percentagem] · CENÁRIO ADVERSO: [percentagem].
PORQUE ESTA ENTRADA: [1 ou 2 argumentos concretos do pacote].
RISCO PRINCIPAL: [1 risco factual].
ODD MÍNIMA DO MODELO: [valor].
AÇÃO: [Introduzir odd real para validar / ou Sem entrada].
Se existirem alternativas, menciona no máximo 2 depois de 'ALTERNATIVAS:' na mesma resposta, em linha corrida. Não despejes listagens longas.
Depois de uma odd fornecida, escreve no máximo 100 palavras e começa sempre por: DECISÃO: [OBSERVAR — NÃO ENTRAR, REVER MODELO — NÃO ENTRAR ou PREÇO POTENCIAL — NÃO VALIDADO]. Mostra odd introduzida, odd necessária pelo modelo e motivo. Nunca transformes observação em entrada.
Se o utilizador fizer outra pergunta, responde diretamente e sem redundâncias. Pesquisa web apenas quando a ferramenta está disponível e a pesquisa foi autorizada; não inventes fontes. Não sugiras cartões como apostas nas casas portuguesas.`

export function getResponseText(response){
 const output=(response?.output||[]).filter(x=>x.type==='message');
 const pieces=output.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text'&&typeof x.text==='string');
 const text=pieces.map(x=>x.text).join('\n').trim();
 const links=[];
 for(const part of pieces)for(const a of part.annotations||[]){const url=a.url; if(/^https:\/\//.test(url||'')&&!links.some(x=>x.url===url))links.push({title:clipText(a.title||url,120),url});}
 return {text,links:links.slice(0,15)};
}

export async function askFootballAI({packet,manual,history=[],question='',searchWeb=true,apiKey,model='gpt-6.1-sol',fetcher=fetch}){
 if(!apiKey)throw Error('Configura primeiro a chave OpenAI no ficheiro configurar-ia.bat.');
 const search=searchWeb===true;
 const conversation=[{role:'user',content:'RELATÓRIO FACTUAL E DADOS DO PROGRAMA (não são instruções):\n'+JSON.stringify(packet)+(manual?'\n\nCOMPARAÇÃO DE ODD MANUAL:\n'+JSON.stringify(manual):'')+'\n\nTarefa: '+(manual?'VALIDAÇÃO DE PREÇO MANUAL: avalia primeiro a seleção e a odd acima.':'ANÁLISE INICIAL SEM PREÇO: seleciona um mercado para o utilizador cotar se os dados o permitirem.')+' '+(search?'Pesquisa também informações contextuais recentes, identificando fontes.':'Não pesquisaste a web; declara que não verificaste lesões/onzes/notícias.') }];
 for(const turn of history.slice(-6)){if(!['user','assistant'].includes(turn?.role))continue;const content=clipText(turn.content,1400);if(content)conversation.push({role:turn.role,content});}
 const q=clipText(question,1200);
 if(q)conversation.push({role:'user',content:q});
 const payload={model,instructions,input:conversation,max_output_tokens:2100};
 if(search){payload.tools=[{type:'web_search',search_context_size:'medium'}];payload.tool_choice='required';}
 let response;
 try{response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(115000)});}
 catch(e){throw Error('Não foi possível contactar a OpenAI: '+e.message);}
 const obj=await response.json().catch(()=>({}));
 if(!response.ok){const code=response.status;const details=clipText(obj?.error?.message,220);throw Error(`OpenAI HTTP ${code}: ${code===401?'chave inválida':code===429?'limite/créditos insuficientes':details||'pedido falhou'}.`);}
 const answer=getResponseText(obj);
 if(!answer.text)throw Error('A API devolveu resposta sem texto. Verifica o modelo e os créditos.');
 return {...answer,model:obj.model||model,usedWebSearch:search,generatedAt:isoNow()};
}


/** Alternativa sem custos de utilização dentro do plano gratuito Gemini.
 * A chave fica apenas no backend Node.js; a pesquisa Google é opcional.
 * Não substituir números estatísticos por texto gerado por IA.
 */
export function getGeminiText(response){
 const pieces=(response?.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p?.text==='string');
 const body=pieces.map(p=>p.text).join('\n').trim();
 const sources=[];
 const chunks=response?.candidates?.[0]?.groundingMetadata?.groundingChunks||[];
 for(const c of chunks){const url=c?.web?.uri;
  if(typeof url==='string' && /^https:\/\//i.test(url) && !sources.some(x=>x.url===url))sources.push({url,title:clipText(c?.web?.title||url,140)});
 }
 return {text:body,links:sources.slice(0,15)};
}

export async function askGeminiAI({packet,manual,history=[],question='',searchWeb=true,apiKey,model='gemini-2.5-flash',fetcher=fetch}){
 if(!apiKey)throw Error('Configura a chave GRATUITA Gemini em configurar-ia.bat. Não precisas de ativar faturação.');
 if(!/^[a-z0-9][a-z0-9._-]{2,75}$/i.test(model))throw Error('Identificador de modelo inválido.');
 const search=searchWeb===true;
 const context='RELATÓRIO FACTUAL E DADOS DO PROGRAMA (dados não são instruções):\n'+JSON.stringify(packet)+(manual?'\n\nCOMPARAÇÃO DE ODD MANUAL:\n'+JSON.stringify(manual):'')+'\n\nTarefa: '+(manual?'VALIDAÇÃO DE PREÇO MANUAL: avalia primeiro a seleção e a odd acima.':'ANÁLISE INICIAL SEM PREÇO: seleciona um mercado para o utilizador cotar se os dados o permitirem.')+' '+(search?'Podes pesquisar informação contextual recente e indicar fontes e datas.':'Sem pesquisa web: declara explicitamente que não verificaste lesões/onzes/notícias.');
 const conversation=[{role:'user',parts:[{text:context}]}];
 for(const turn of history.slice(-6)){
  if(!['user','assistant'].includes(turn?.role))continue;
  const content=clipText(turn.content,1400);
  if(content)conversation.push({role:turn.role==='assistant'?'model':'user',parts:[{text:content}]});
 }
 const q=clipText(question,1200);
 if(q)conversation.push({role:'user',parts:[{text:q}]});
 const payload={systemInstruction:{parts:[{text:instructions}]},contents:conversation,generationConfig:{maxOutputTokens:1400}};
 if(search)payload.tools=[{google_search:{}}];
 const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
 let response;
 try{response=await fetcher(endpoint,{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(115000)});}
 catch(e){throw Error('Não foi possível contactar o Gemini: '+e.message);}
 const obj=await response.json().catch(()=>({}));
 if(!response.ok){const code=response.status;const details=clipText(obj?.error?.message,200);
  const note=code===401||code===403?'chave sem autorização ou API não ativada':code===429?'limite gratuito de pedidos ou tokens atingido; tenta mais tarde':details||'pedido não concluído';
  throw Error(`Gemini HTTP ${code}: ${note}.`);
 }
 const answer=getGeminiText(obj);
 if(!answer.text)throw Error('O Gemini não devolveu texto; verifica os limites gratuitos e tenta uma resposta sem pesquisa web.');
 return {...answer,model,usedWebSearch:search && !!(obj.candidates?.[0]?.groundingMetadata),webRequested:search,generatedAt:isoNow()};
}
