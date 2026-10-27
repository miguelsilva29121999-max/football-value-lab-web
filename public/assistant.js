const $=id=>document.getElementById(id);
const localToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatOdd=n=>Number.isFinite(Number(n))?Number(n).toFixed(2).replace('.',','):'—';
const formatPct=n=>Number.isFinite(Number(n))?(Number(n)*100).toFixed(1).replace('.',',')+'%':'—';
const textEl=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
let leagues={},fixtures=[],packet=null,currentFixture=null,conversation=[],running=false;
let priceDrafts=new Map();
const statusNote=value=>{$('problem').textContent=value;$('problem').hidden=!value;};
const requestWithAccess=async(url,init={})=>{
 const send=()=>{const code=sessionStorage.getItem('fvl_site_code');const headers=new Headers(init.headers||{});if(code)headers.set('x-fvl-access-code',code);return fetch(url,{...init,headers});};
 let res=await send();
 if(res.status===401){
  const code=window.prompt('Football Value Lab — código de acesso privado da Vercel:');
  if(!code)throw Error('Acesso ao site cancelado.');
  sessionStorage.setItem('fvl_site_code',code);res=await send();
  if(res.status===401)sessionStorage.removeItem('fvl_site_code');
 }
 return res;
};
const fetchJSON=async(url,init)=>{const res=await requestWithAccess(url,init);const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Erro HTTP '+res.status);return data;};
const post=(url,data)=>fetchJSON(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const addOption=(select,value,label)=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);};
function setDecision(status,headline,explanation,metrics=[]){
 const d=$('decision-summary');d.replaceChildren();d.dataset.status=status;
 d.append(textEl('span',status==='POTENCIAL'?'PREÇO EXPERIMENTAL · NÃO VALIDADO':status==='REVER_MODELO'?'REVISÃO NECESSÁRIA':status==='SEM_ENTRADA'?'DECISÃO · NÃO ENTRAR':'AVALIAÇÃO DA PARTIDA','decision-eyebrow'),
  textEl('h3',headline),textEl('p',explanation));
 if(metrics.length){const row=textEl('div','','decision-metrics');for(const m of metrics)row.append(textEl('span',m));d.append(row);}
}
function clearEvaluation(){
 $('batch-verdict').hidden=true;$('batch-verdict').replaceChildren();
 $('price-verdict').hidden=true;$('price-verdict').replaceChildren();
 for(const card of $('quote-board').querySelectorAll('.quote-item')){delete card.dataset.evaluation;const v=card.querySelector('.quote-outcome');if(v)v.remove();}
 setDecision('PENDING','Ainda não há uma entrada avaliada','Introduz odds reais da tua casa nos mercados abaixo e carrega em «Comparar odds». O modelo não sabe que preços estão disponíveis.');
}
function validFixtures(rows){
 const today=localToday(),seen=new Set();
 return (rows||[]).filter(f=>{
  if(!f?.date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.date)||f.date<today)return false;
  const key=f.date+'|'+String(f.home).toLowerCase()+'|'+String(f.away).toLowerCase();
  if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>a.date.localeCompare(b.date)||(a.home||'').localeCompare(b.home||''));
}
function showFixture(){
 const search=$('filter').value.trim().toLocaleLowerCase('pt-PT'),sel=$('fixture');
 const previous=sel.value;const filtered=fixtures.filter(f=>(f.home+' '+f.away).toLocaleLowerCase('pt-PT').includes(search));
 sel.replaceChildren();addOption(sel,'','Seleciona uma partida');
 for(const f of filtered)addOption(sel,f.id,f.date+' · '+f.home+' — '+f.away);
 if(filtered.some(f=>f.id===previous))sel.value=previous;
 else if(filtered.length===1)sel.value=filtered[0].id;
 $('fixture-count').textContent=filtered.length+' jogos futuros'+(search?' encontrados':'');
 if(currentFixture?.id===sel.value&&sel.value)return;
 selectedFixture();
 if(currentFixture)preview();
}
function selectedFixture(){
 currentFixture=fixtures.find(f=>f.id===$('fixture').value)||null;
 packet=null;conversation=[];priceDrafts=new Map();
 $('quote-board').replaceChildren();$('batch-verdict').hidden=true;$('batch-verdict').replaceChildren();
 $('market').replaceChildren();addOption($('market'),'','Seleciona um mercado');
 $('price').value='';$('price-verdict').hidden=true;$('price-verdict').replaceChildren();
 $('market-count').textContent='0 mercados';$('chat').replaceChildren();
 $('chat-title').textContent=currentFixture?'Análise IA · '+currentFixture.home+' vs. '+currentFixture.away:'Assistente de análise';
 $('question').disabled=true;$('send').disabled=true;
 $('fixture-preview').textContent=currentFixture?currentFixture.home+' — '+currentFixture.away+' · '+currentFixture.date+' · Hora '+(currentFixture.time||'por confirmar'):'Escolhe uma partida futura para começar.';
 $('live-flag').textContent='SEM FEED LIVE';
 $('history-panel').replaceChildren();$('history-panel').append(textEl('p','Seleciona um jogo para consultar os resultados anteriores da liga.','empty-hint'));
 $('quote-board').append(textEl('div','Seleciona uma partida para carregar os mercados.','empty-markets'));
 setDecision('PENDING','Primeiro, escolhe a partida','Os mercados disponíveis e a sua cobertura estatística vão aparecer depois de selecionares o jogo.');
}
async function loadFixtures(){
 const league=$('league').value;
 fixtures=[];currentFixture=null;packet=null;statusNote('');
 $('fixture').replaceChildren();addOption($('fixture'),'','A carregar jogos futuros…');
 if(!league){showFixture();return;}
 try{
  const data=await fetchJSON('/api/fixtures?league='+encodeURIComponent(league));
  fixtures=validFixtures(data.fixtures);
  showFixture();
  if(!fixtures.length)statusNote('Sem partidas futuras nesta competição. Podes escolher outra liga ou atualizar o calendário.');
  else if(data.issues?.length)console.info('Cobertura do calendário:',data.issues);
 }catch(error){showFixture();statusNote('Falha a carregar calendário: '+error.message);}
}
function renderHistory(data){
 const el=$('history-panel');el.replaceChildren();
 const h=data.historySummary;
 if(!h){el.append(textEl('p','Sem histórico verificável nesta fonte.','empty-hint'));return;}
 el.append(textEl('p','Amostra da liga: '+h.totalLeagueGames+' partidas. Só jogos anteriores à data do encontro; não são todas as competições.','history-intro'));
 const display=v=>v?.value==null?'indisponível':formatOdd(v.value)+' ('+v.coverage+'/'+v.total+' jogos)';
 for(const [name,team] of [['Casa',h.home],['Fora',h.away]]){
  const card=textEl('article','','history-team');
  card.append(textEl('b',team.team+' · '+name+' · '+team.leagueGames+' jogos no histórico'));
  const a=team.lastFive.averages;
  card.append(textEl('p','Últimos cinco da liga · Golos marcados: '+display(a.scored)+' · Sofridos: '+display(a.conceded)+' · Cantos: '+display(a.corners),'history-statline'));
  card.append(textEl('p','Remates: '+display(a.shots)+' · À baliza: '+display(a.shotsOnTarget),'history-statline'));
  const games=team.lastFive.games.map(m=>m.date+'  '+m.home+' '+m.hg+'–'+m.ag+' '+m.away).join('  •  ');
  card.append(textEl('p',games||'Sem jogos anteriores registados.','history-games'));
  const venue=team.lastFiveAtVenue.averages;
  card.append(textEl('p','Últimos jogos '+(name==='Casa'?'em casa':'fora')+': '+team.lastFiveAtVenue.games.length+' · Golos marcados '+display(venue.scored)+' · Sofridos '+display(venue.conceded),'history-note'));
  el.append(card);
 }
 el.append(textEl('p','As médias usam apenas partidas com a respetiva estatística disponível. Não se substituem ausências de dados por zero.','history-note'));
}
const isNoKickoff=fixture=>['INICIO_HOJE_NAO_CONFIRMADO','JOGO_JA_PODE_TER_COMECADO'].includes(fixture?.status);
function renderCard(market,index,locked){
 const card=textEl('article','','quote-item');card.dataset.id=market.id;
 card.append(textEl('span',(index===0?'1.ª HIPÓTESE PARA COTAR':String(index+1)+'.ª HIPÓTESE')+' · NÃO É ENTRADA VALIDADA','quote-tag'));
 card.append(textEl('strong',market.name));
 const stats=textEl('div','','quote-stats');
 for(const [label,value] of [['Prob. do modelo',formatPct(market.modelProbability)],['Mínimo matemático',formatOdd(market.thresholdOddExperimental)]]){
  const stat=textEl('div','','quote-metric');stat.append(textEl('span',label),textEl('b',value));stats.append(stat);
 }
 card.append(stats);
 const audit=market.historicalAudit;
 let note='';
 if(market.realismReview)note='O modelo diverge de preços indicativos: verificar probabilidade.';
 else if(audit?.status==='DESFAVORAVEL')note='Aviso: previsões anteriores deste mercado tiveram desempenho desfavorável.';
 else if(audit?.n>=25)note='Auditoria: '+audit.n+' previsões · Brier '+Number(audit.brier).toFixed(3)+' vs. referência '+Number(audit.baselineBrier).toFixed(3)+'.';
 else note='Probabilidade ainda não calibrada; sem referência preditiva suficiente.';
 card.append(textEl('div',note,'quote-meta'+(market.realismReview||audit?.status==='DESFAVORAVEL'?' warning':'')));
 if(market.marketReference)card.append(textEl('div','Referência indicativa: '+formatOdd(market.marketReference.indicativeOdd)+' (não é cotação atual).','quote-meta'));
 if(locked){card.append(textEl('div','Apenas consulta histórica · validar hora de início.','quote-outcome review'));return card;}
 const entry=textEl('div','','quote-entry');entry.append(textEl('label','Odd real da casa'));
 const input=document.createElement('input');input.className='quote-odd';input.inputMode='decimal';input.autocomplete='off';input.placeholder='Ex.: 2,05';
 input.setAttribute('aria-label','Odd real para '+market.name);input.value=priceDrafts.get(market.id)||'';
 input.addEventListener('input',()=>{
  if(input.value.trim())priceDrafts.set(market.id,input.value);
  else priceDrafts.delete(market.id);
  clearEvaluation();
 });
 entry.append(input);card.append(entry);
 return card;
}
function showMarketsToQuote(data){
 const board=$('quote-board');board.replaceChildren();
 const markets=(data.candidateMarkets||[]).slice(0,8),locked=isNoKickoff(data.fixture);
 $('market-count').textContent=markets.length+' mercados para cotar';
 if(locked){
  setDecision('REVER_MODELO','Dados disponíveis, mas sem validação pré-jogo','A partida é de hoje e não temos hora de início verificável, ou já pode estar a decorrer. Podes consultar estatísticas, mas não validar uma odd como se o jogo ainda não tivesse começado.');
 }else clearEvaluation();
 board.append(textEl('h3',locked?'ESTIMATIVAS HISTÓRICAS · SEM ENTRADA':'MERCADOS PARA COMPARAR · SEM ODD AINDA','quote-heading'));
 if(!markets.length){
  board.append(textEl('div','Este jogo não tem mercados com suporte suficiente no motor atual. Consulta as estatísticas abaixo; não iremos criar uma entrada fictícia.','empty-markets'));return;
 }
 markets.forEach((market,i)=>board.append(renderCard(market,i,locked)));
 if(!locked){
  const button=textEl('button','Comparar odds e escolher a melhor hipótese','compare-all');button.type='button';button.addEventListener('click',compareQuotedMarkets);board.append(button);
  board.append(textEl('p','Introduz os preços em vários cartões para comparar. O resultado é experimental: um EV positivo não significa lucro comprovado.','quote-note'));
 }
}
function renderComparison(payload){
 const results=$('batch-verdict');results.replaceChildren();results.hidden=false;
 const first=payload.bestCandidate||payload.bestTheoreticalInReview||null;
 const status=payload.bestCandidate?'POTENCIAL':payload.bestTheoreticalInReview?'REVER_MODELO':'SEM_ENTRADA';
 if(first){
  setDecision(status,first.market,status==='POTENCIAL'?'Esta é a melhor hipótese experimental entre as odds que introduziste. Não é uma entrada validada e o modelo ainda precisa de calibração.':'A odd supera o mínimo matemático, mas a previsão precisa de revisão. NÃO ENTRAR até termos melhor evidência.',
   ['Odd da casa '+formatOdd(first.odd),'Mínimo teórico '+formatOdd(first.estimatedMinimumOdd),'EV central '+formatPct(first.estimatedEv),'Cenário adverso '+formatPct(first.estimatedEvLow)]);
 }else{
  setDecision('SEM_ENTRADA','Sem entrada com estes preços','Nenhuma das odds introduzidas passou a triagem. É melhor rejeitar o jogo do que forçar uma aposta pouco fundamentada.');
 }
 results.append(textEl('strong',status==='POTENCIAL'?'COMPARAÇÃO · HIPÓTESE EXPERIMENTAL':status==='REVER_MODELO'?'COMPARAÇÃO · REVISÃO DO MODELO':'COMPARAÇÃO · SEM ENTRADA'));
 const map=new Map();
 for(const offer of payload.offers){
  map.set(String(offer.optionId),offer);
  const state=offer.decision==='POTENCIAL'?'Preço supera triagem — ainda não validado':offer.decision==='REVER_MODELO'?'Previsão em revisão — não entrar':'Não entrar';
  const p=textEl('p',state+' · '+offer.market+' · Casa '+formatOdd(offer.odd)+' / mínimo '+formatOdd(offer.estimatedMinimumOdd)+' · EV central '+formatPct(offer.estimatedEv)+'. '+offer.reason);
  results.append(p);
 }
 for(const card of $('quote-board').querySelectorAll('.quote-item')){
  const offer=map.get(card.dataset.id);if(!offer)continue;
  card.dataset.evaluation=offer.decision;
  const state=offer.decision==='POTENCIAL'?'Preço experimentalmente interessante · não validado':offer.decision==='REVER_MODELO'?'Odd passa, previsão em revisão — não entrar':'Não entrar com este preço';
  card.append(textEl('div',state,'quote-outcome '+(offer.decision==='POTENCIAL'?'pass':offer.decision==='REVER_MODELO'?'review':'reject')));
 }
 results.append(textEl('p',payload.notice,'quote-note'));
 if(payload.bestCandidate){
  $('market').value=String(payload.bestCandidate.optionId);
  $('price').value=String(payload.bestCandidate.odd).replace('.',',');
 }
 $('decision-summary').scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function compareQuotedMarkets(){
 if(!currentFixture||!packet)return statusNote('Seleciona um jogo e carrega o quadro de mercados.');
 if(isNoKickoff(packet.fixture))return statusNote('Sem hora de início confirmada não podemos validar odds como pré-jogo.');
 const offers=[...priceDrafts.entries()].map(([optionId,odd])=>({optionId,odd})).filter(x=>String(x.odd).trim());
 if(!offers.length)return statusNote('Introduz pelo menos uma odd da tua casa num dos cartões.');
 const button=$('quote-board').querySelector('.compare-all');if(button)button.disabled=true;
 try{statusNote('');const result=await post('/api/ai/preview',{league:$('league').value,fixtureId:currentFixture.id,offers});renderComparison(result);}
 catch(err){statusNote('Falha ao comparar preços: '+err.message);}
 finally{if(button)button.disabled=false;}
}
async function preview(){
 const id=currentFixture?.id;if(!id)return;
 try{
  const response=await post('/api/ai/preview',{league:$('league').value,fixtureId:id});
  if(currentFixture?.id!==id)return;
  packet=response.packet;showMarketsToQuote(packet);renderHistory(packet);
  const select=$('market');select.replaceChildren();addOption(select,'','Seleciona um mercado');
  for(const m of packet.candidateMarkets||[])addOption(select,m.id,m.name+' · mínimo '+formatOdd(m.thresholdOddExperimental));
  $('live-flag').textContent=packet.fixture?.status==='INICIO_HOJE_NAO_CONFIRMADO'?'HORA NÃO CONFIRMADA HOJE':packet.fixture?.status==='JOGO_JA_PODE_TER_COMECADO'?'PODERÁ ESTAR A DECORRER':'PRÉ-JOGO · SEM FEED LIVE';
  const scope=packet.modelReady?'Estatísticas de liga disponíveis · Probabilidades experimentais':'Cobertura insuficiente: '+(packet.modelLimitations||[]).join('; ');
  $('fixture-preview').textContent=packet.fixture.home+' — '+packet.fixture.away+' · '+packet.fixture.date+' · '+scope;
 }catch(err){statusNote('Falha na análise inicial: '+err.message);}
}
function addMessage(role,text,links=[]){
 const empty=$('chat').querySelector('.empty-chat');if(empty)empty.remove();
 const item=textEl('div','','bubble '+role);item.append(textEl('div',role==='assistant'?'✦ GEMINI · ANÁLISE':'A TUA PERGUNTA','who'));
 const clean=String(text).replace(/^\s*#{1,4}\s*/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'$1');
 item.append(textEl('div',clean,'body'));
 const sources=(links||[]).filter(x=>/^https:\/\//.test(x?.url||''));
 if(sources.length){const wrap=textEl('div','Fontes consultadas:','sources');for(const source of sources.slice(0,7)){const a=document.createElement('a');a.href=source.url;a.textContent=source.title||source.url;a.rel='noopener noreferrer';a.target='_blank';wrap.append(a);}item.append(wrap);}
 $('chat').append(item);$('chat').scrollTop=$('chat').scrollHeight;
}
function setBusy(value){
 running=value;$('analyze').disabled=value;$('send').disabled=value||!conversation.length;$('question').disabled=value||!conversation.length;
}
async function ask(question='',reset=false){
 if(running||!currentFixture)return;
 if(!packet)await preview();
 if(!packet)return;
 if($('price').value.trim()&&!$('market').value){statusNote('Para incluir uma odd na pergunta, seleciona primeiro o mercado correspondente.');return;}
 const id=currentFixture.id;statusNote('');setBusy(true);
 if(reset){conversation=[];$('chat').replaceChildren();}else if(question)addMessage('user',question);
 const busy=textEl('div','A consultar o Gemini e a reunir o contexto…','loading');$('chat').append(busy);
 try{
  const r=await post('/api/ai/chat',{league:$('league').value,fixtureId:id,question,history:conversation,
   searchWeb:$('research').checked&&(reset||/not[ií]ci|les[aã]o|convocad|onze|meteorolog|tempo|atualiz|hoje|[úu]ltima/i.test(question)),
   optionId:$('market').value||null,odd:$('price').value.trim()||null});
  busy.remove();if(currentFixture?.id!==id)return;
  addMessage('assistant',r.text,r.links);
  if(question)conversation.push({role:'user',content:question});
  conversation.push({role:'assistant',content:r.text.slice(0,1400)});conversation=conversation.slice(-6);
 }catch(err){busy.remove();statusNote(err.message);if(currentFixture?.id===id)addMessage('assistant','Não foi possível completar a análise: '+err.message);}
 finally{setBusy(false);$('question').disabled=!conversation.length;$('send').disabled=!conversation.length;}
}
async function validateCurrentPrice(){
 if(!currentFixture)return statusNote('Escolhe primeiro o jogo.');
 if(!packet)await preview();
 if(!packet)return;
 const optionId=$('market').value,odd=$('price').value.trim();
 if(!optionId||!odd)return statusNote('Seleciona um mercado e introduz a odd real.');
 try{
  const response=await post('/api/ai/preview',{league:$('league').value,fixtureId:currentFixture.id,optionId,odd});
  const data=response.manual,out=$('price-verdict');out.replaceChildren();out.hidden=false;
  out.append(textEl('strong',data.decision==='POTENCIAL'?'Preço experimentalmente interessante · não validado':data.decision==='REVER_MODELO'?'Preço passa, mas previsão em revisão':'Não entrar com este preço'),
    textEl('p','Casa '+formatOdd(data.odd)+' · mínimo do modelo '+formatOdd(data.estimatedMinimumOdd)+' · EV central '+formatPct(data.estimatedEv)+'. '+data.reason));
 }catch(err){statusNote('Não foi possível validar a odd: '+err.message);}
}
$('check-price').addEventListener('click',validateCurrentPrice);
$('league').addEventListener('change',loadFixtures);
$('filter').addEventListener('input',showFixture);
$('fixture').addEventListener('change',()=>{selectedFixture();preview();});
$('refresh').addEventListener('click',loadFixtures);
$('analyze').addEventListener('click',async()=>{if(!currentFixture)return statusNote('Seleciona primeiro uma partida.');if(!packet)await preview();if(packet)await ask('',true);});
$('followup').addEventListener('submit',event=>{event.preventDefault();const question=$('question').value.trim();if(!question)return;$('question').value='';ask(question);});
document.querySelectorAll('.sidebar nav .nav').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidebar nav .nav').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
(async()=>{
 try{
  const data=await fetchJSON('/api/status');leagues=data.leagues||{};const select=$('league');select.replaceChildren();
  addOption(select,'','Seleciona uma competição');for(const [code,l] of Object.entries(leagues))addOption(select,code,l.country+' · '+l.name);
  const ai=await fetchJSON('/api/ai/status');$('api-state').textContent=ai.configured?'Gemini configurado · '+ai.model:'Gemini sem chave · configurar na Vercel';
  $('today').textContent=new Date().toLocaleDateString('pt-PT',{timeZone:'Europe/Lisbon',day:'2-digit',month:'long',year:'numeric'});
  select.value='P1';await loadFixtures();
 }catch(error){statusNote('Não foi possível iniciar a aplicação: '+error.message);}
})();
