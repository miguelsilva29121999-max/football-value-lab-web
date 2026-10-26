import {LEAGUES, estimateMatch, normalizedTeam, allMarketOptions} from './model.mjs';
import {loadLeague} from './providers.mjs';
import {rankStatMarkets, listEligibleStatMarkets, validatePrice} from './statfirst.mjs';

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
 // Comecar por mercados nao triviais. A odd exigida pelo modelo NAO e a cotacao real.
 const allOptions=new Map(allMarketOptions().map(o=>[o.id,o]));
 const suitable=o=>{
  if(!o)return false;
  if(o.market==='dc'||o.market==='dnb')return false;
  if(o.market==='totals')return o.point>=2.5&&o.point<=4.5;
  if(o.market==='team_goals')return o.point>=1.5&&o.point<=2.5;
  if(o.market==='half_totals')return o.point>=1.5&&o.point<=2.5;
  if(o.market==='corners')return o.point>=8.5&&o.point<=11.5;
  if(o.market==='team_corners')return o.point>=4.5&&o.point<=6.5;
  if(o.market==='shots')return o.point>=19.5&&o.point<=28.5;
  if(o.market==='sot')return o.point>=5.5&&o.point<=11.5;
  return ['h2h','btts'].includes(o.market);
 };
 const snap=(data.snapshot?.rows||[]).find(r=>r.Date&&r.HomeTeam&&r.AwayTeam&&
   normalizedTeam(r.HomeTeam)===normalizedTeam(fixture.home)&&normalizedTeam(r.AwayTeam)===normalizedTeam(fixture.away)&&
   (r.Date===fixture.date||/^\d{2}\/\d{2}\/\d{4}$/.test(r.Date)&&
    r.Date.slice(6)+'-'+r.Date.slice(3,5)+'-'+r.Date.slice(0,2)===fixture.date));
 const quoteNumber=(...keys)=>{for(const k of keys){const v=Number(snap?.[k]);if(Number.isFinite(v)&&v>1.01&&v<40)return v;}return null;};
 const refPrices={home:quoteNumber('AvgH','B365H'),draw:quoteNumber('AvgD','B365D'),away:quoteNumber('AvgA','B365A'),over:quoteNumber('Avg>2.5','B365>2.5'),under:quoteNumber('Avg<2.5','B365<2.5')};
 const marketReference=o=>{
  let prices=[],selected=null;
  if(o.market==='h2h'){prices=[refPrices.home,refPrices.draw,refPrices.away];selected=refPrices[o.selection];}
  else if(o.market==='totals'&&o.point===2.5){prices=[refPrices.over,refPrices.under];selected=refPrices[o.selection];}
  else return null;
  if(!selected||prices.some(p=>!p))return null;
  const denom=prices.reduce((sum,p)=>sum+1/p,0);
  return {indicativeOdd:Number(selected.toFixed(2)),impliedNoVig:Number(((1/selected)/denom).toFixed(3)),source:'Football-Data · snapshot indicativo, NÃO odd atual'};
 };
 const raw=estimate.ready?listEligibleStatMarkets(estimate,{matches:data.matches,fixture,profile:'return',minDataScore:.30,minTargetOdd:1.80,maxTargetOdd:4.50,minProbability:.30}).filter(c=>suitable(allOptions.get(c.optionId))):[];
 const evidenceScore=c=>{
  const n=c.evidence?.combined?.total||0,observed=c.evidence?.combined?.rate;
  const diff=n>=6&&observed!=null?Math.abs(observed-c.p):.12;
  return c.pLow*.8+c.p*.15-.95*(c.p-c.pLow)-.25*diff-(c.warnings?.length||0)*.016;
 };
 const ranked=raw.map(c=>{const r=marketReference(allOptions.get(c.optionId));
  const disagreement=r?Math.abs(r.impliedNoVig-c.p):null;
  return {...c,marketReference:r,modelMarketDisagreement:disagreement,
   realismReview:disagreement!==null&&disagreement>.12,
   selectionScore:evidenceScore(c)-(disagreement!==null?Math.max(0,disagreement-.07)*1.3:0)+Math.max(-.12, .05-Math.abs(c.oddTarget-2.35)*.04)};
 }).sort((a,b)=>Number(a.realismReview)-Number(b.realismReview)||b.selectionScore-a.selectionScore);
 const chosen=[],used=new Set();
 for(const c of ranked){const family=c.market+(c.market==='team_goals'||c.market==='team_corners'?'_'+allOptions.get(c.optionId)?.team:'');
  if(used.has(family))continue;chosen.push(c);used.add(family);if(chosen.length===10)break;
 }
 const prioritized=chosen;
 const teamGames=team=>data.matches.filter(m=>m.date<fixture.date&&(normalizedTeam(m.home)===normalizedTeam(team)||normalizedTeam(m.away)===normalizedTeam(team))).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).map(m=>({data:m.date,casa:m.home,fora:m.away,golosCasa:m.hg,golosFora:m.ag,cantosCasa:m.hc,cantosFora:m.ac,rematesCasa:m.hs,rematesFora:m.as,rematesBalizaCasa:m.hst,rematesBalizaFora:m.ast,cartoesCasa:m.hy,cartoesFora:m.ay}));
 const time=fixture.time||null;
 // Uma hora HH:mm sem fuso não pode ser assumida como UTC.
 const preciseTime=typeof time==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/i.test(time);
 let kickoff=null;
 if(preciseTime){const candidate=Date.parse(time);if(Number.isFinite(candidate))kickoff=new Date(candidate).toISOString();}
 const status=kickoff?Date.now()>=Date.parse(kickoff)?'JOGO_JA_PODE_TER_COMECADO':'FUTURO_CONFORME_HORA':fixture.date===isoNow().slice(0,10)?'INICIO_HOJE_NAO_CONFIRMADO':'HORA_NAO_CONFIRMADA';
 const packet={consultedAt:isoNow(),competition:`${LEAGUES[league].country} · ${LEAGUES[league].name}`,fixture:{league,date:fixture.date,home:fixture.home,away:fixture.away,timeFromProvider:time,kickoffEstimateUtc:kickoff,status},dataSource:{history: data.source||[],snapshot: data.snapshot?.url||null,issues:(data.issues||[]).slice(0,5)},historicalMatchesInLeague:data.matches.length,modelReady:!!estimate.ready,modelLimitations:estimate.ready?estimate.caveats:estimate.reasons,quality:estimate.quality||null,projectedGoalsFromResults:estimate.ready?{home:estimate.rates.goals.home,away:estimate.rates.goals.away}:null,recentHome:teamGames(fixture.home),recentAway:teamGames(fixture.away),candidateMarkets:prioritized.map(x=>({id:x.optionId,name:x.label,modelProbability:x.p,scenarioLow:x.pLow,thresholdOddExperimental:x.oddTarget,priority:x.selectionScore,marketReference:x.marketReference,realismReview:x.realismReview,homeForm:x.evidence?.home,awayForm:x.evidence?.away,notes:x.warnings||[]})),analysisStage:'PRE_COTACAO',historyScope:'Apenas jogos da liga; não são todos os encontros oficiais nem xG de remates',rankingMethod:'Mercados não triviais, cenário adverso e comparação com referência indicativa quando disponível',manualPriceRequiredForValueAssessment:true,minRealOddToConsider:1.70,requiredToRank:'Comparar pelo menos uma odd real, idealmente várias. Sem cotações não há entrada.',primaryMarketToQuote:prioritized[0]?{id:prioritized[0].optionId,name:prioritized[0].label,thresholdOddExperimental:prioritized[0].oddTarget,modelProbability:prioritized[0].p,scenarioLow:prioritized[0].pLow,support:prioritized[0].realismReview?'DIVERGENCIA_COM_MERCADO':'EXPLORATORIO'}:null,liveFeedAvailable:false,verifiedLineupsAvailable:false,verifiedInjuriesFromDataProvider:false,marketOddsAvailable:false};
 return {packet,estimate,markets:prioritized};
}

export function buildManualOdd(context,optionId,oddText){
 if(!optionId||!String(oddText||'').trim())return null;
 if(['JOGO_JA_PODE_TER_COMECADO','INICIO_HOJE_NAO_CONFIRMADO'].includes(context.packet?.fixture?.status))throw Error('Não há hora de início confirmada ou o jogo pode ter começado hoje. Sem feed live não é seguro validar como pré-jogo.');
 if(!context.estimate.ready)throw Error('Sem estatísticas suficientes para comparar a odd.');
 if(!context.markets.some(c=>c.optionId===optionId))throw Error('Escolhe um dos mercados apresentados.');
 const v=validatePrice(context.estimate,optionId,oddText);
 const implied=1/v.odd;
 const gap=Number((v.probability-implied).toFixed(3));
 // Uma discrepância muito grande pode ser valor, mas também um modelo errado. Não é evidência para apostar.
 const divergent=gap>.14;
 const lowPrice=v.odd<1.70;
 const decision=lowPrice?'OBSERVAR':(v.status==='POTENCIAL'&&divergent)?'REVER_MODELO':v.status;
 const reason=lowPrice?'Odd inferior a 1,70, fora do perfil de procura. Não entrar; uma cotação baixa não é compensada por uma previsão de alta probabilidade.':divergent&&v.status==='POTENCIAL'?'O modelo atribui uma probabilidade muito superior à implícita na cotação (sem retirar margem). Divergência demasiado grande sem validação independente: OBSERVAR — NÃO ENTRAR.':v.reason;
 return {market:v.label,odd:v.odd,modelProbability:v.probability,marketImpliedProbability:Number(implied.toFixed(3)),modelMarketGap:gap,scenarioLow:v.sensitivityLow,estimatedEv:v.ev,estimatedEvLow:v.evLow,estimatedMinimumOdd:v.targetOdd,decision,reason,verification:'Odd fornecida manualmente, não verificada. Probabilidades experimentais não calibradas. A cotação do mercado não prova nem refuta sozinha o modelo.'};
}

export function compareManualOffers(context,offers){
 if(!Array.isArray(offers)||offers.length<1||offers.length>12)throw Error('Introduz entre 1 e 12 cotações de mercados distintos.');
 const used=new Set(),evaluated=[];
 for(const entry of offers){
  const optionId=String(entry?.optionId??''),odd=String(entry?.odd??'').trim();
  if(!optionId||used.has(optionId))throw Error('Mercado repetido ou inválido.');
  used.add(optionId);
  const market=buildManualOdd(context,optionId,odd);
  evaluated.push({optionId,...market});
 }
 const order={POTENCIAL:0,REVER_MODELO:1,OBSERVAR:2,REJEITAR:3};
 evaluated.sort((a,b)=>(order[a.decision]??4)-(order[b.decision]??4)||b.estimatedEvLow-a.estimatedEvLow||b.estimatedEv-a.estimatedEv);
 const potential=evaluated.filter(x=>x.decision==='POTENCIAL');
 return {bestCandidate:potential[0]||null,offers:evaluated,count:evaluated.length,
  finalStatus:potential.length?'PRECO_EXPERIMENTAL_A_CONFIRMAR':'SEM_ENTRADA',
  notice:potential.length?'A comparação é experimental: sem calibração do modelo, não é vantagem comprovada nem recomendação de apostar.':'Nenhuma das odds introduzidas passou a triagem. Não entrar neste jogo com estes preços.'};
}

export const instructions=`És analista de futebol para um utilizador português. O utilizador quer encontrar uma ENTRADA COM ODD REAL e não um relatório gigante. Sem odds inseridas, NÃO é possível escolher uma boa entrada: apresenta apenas mercados a comparar, sem classificar como entrada.
NÃO confundir falta de odd com falta de mercado. Evita linhas triviais como 0,5 golos por equipa ou dupla hipótese a preço muito baixo. Nunca apresentes a odd mínima estatística como preço normal de mercado; só uma odd real confirma a viabilidade. A seleção antes da cotação é PARA COTAR, nunca uma entrada validada. Se o utilizador deu uma odd, respeita a decisão matemática do servidor: OBSERVAR ou REVER_MODELO = NÃO ENTRAR; POTENCIAL = apenas hipótese, nunca garantia.
REGRAS: Usa apenas os dados no pacote. 'projectedGoalsFromResults' são golos projetados a partir de resultados, NÃO xG de qualidade de remate. 'recentHome' e 'recentAway' são apenas jogos DA LIGA, não todos os oficiais. Não inventes notícias, escalações, lesões, árbitros, odds, estatísticas ou probabilidades. O cenário baixo é teste de sensibilidade, não intervalo de confiança. Não existe feed live. Se a data do jogo é hoje e a hora é desconhecida, não presumas que ainda está por começar e não recomendes uma entrada pré-jogo.
Na primeira análise escreve no máximo 90 palavras. Dá 2 a 3 mercados para consultar odds se existirem, deixando explícito que não são entradas:
MERCADOS A COTAR: [até 3 nomes do pacote, sem prometer valor, sem repetir linha igual].
PROBABILIDADE EXPERIMENTAL: [percentagem] e CENÁRIO ADVERSO: [percentagem].
PORQUÊ: [até 2 argumentos CONCRETOS do pacote; se não existirem não inventar].
RISCO PRINCIPAL: [1 risco factual; se marketReference mostrar divergência, salienta-a e pede revisão].
PRÓXIMO PASSO: [preencher várias odds reais no quadro Comparar Odds e avaliar todas; só depois falar em potencial entrada].
Não listar automaticamente 3 mercados nem transcrever os jogos. Só responder em detalhe quando o utilizador o pedir.
Depois de uma odd fornecida, escreve no máximo 95 palavras e começa sempre por: DECISÃO: [OBSERVAR — NÃO ENTRAR, REVER MODELO — NÃO ENTRAR ou PREÇO POTENCIAL — NÃO VALIDADO]. Mostra odd introduzida, odd necessária pelo modelo e motivo. Nunca transformes observação em entrada.
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
