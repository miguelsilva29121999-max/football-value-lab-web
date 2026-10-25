const $=id=>document.getElementById(id);
let leagues={},fixtures=[],packet=null,currentFixture=null,conversation=[],running=false;
const statusNote=text=>{$('problem').textContent=text;$('problem').hidden=!text;};
const requestWithAccess=async(url,init={})=>{
 const send=()=>{const code=sessionStorage.getItem('fvl_site_code');const headers=new Headers(init.headers||{});if(code)headers.set('x-fvl-access-code',code);return fetch(url,{...init,headers});};
 let r=await send();
 if(r.status===401){const supplied=window.prompt('Football Value Lab — código de acesso privado (configurado na Vercel):');
  if(!supplied)throw Error('Acesso ao site cancelado.');sessionStorage.setItem('fvl_site_code',supplied);r=await send();
  if(r.status===401)sessionStorage.removeItem('fvl_site_code');}
 return r;
};
const fetchJSON=async(url,init)=>{const r=await requestWithAccess(url,init);const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||`Erro HTTP ${r.status}`);return b;};
const post=(path,data)=>fetchJSON(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
function addOption(select,v,label){const opt=document.createElement('option');opt.value=v;opt.textContent=label;select.appendChild(opt);}
function showFixture(){const search=$('filter').value.trim().toLocaleLowerCase('pt-PT'),sel=$('fixture'),previous=sel.value;sel.replaceChildren();addOption(sel,'','Seleciona uma partida');
 const filtered=fixtures.filter(f=>(f.home+' '+f.away).toLocaleLowerCase('pt-PT').includes(search));for(const f of filtered)addOption(sel,f.id,`${f.date} · ${f.home} — ${f.away}`);
 if(filtered.some(f=>f.id===previous))sel.value=previous;else if(filtered.length===1)sel.value=filtered[0].id;
 selectedFixture();}
function selectedFixture(){if($('quote-board')){$('quote-board').hidden=true;$('quote-board').replaceChildren();}currentFixture=fixtures.find(f=>f.id===$('fixture').value)||null;packet=null;conversation=[];$('market').replaceChildren();addOption($('market'),'','Sem mercado escolhido');$('price-verdict').hidden=true;$('price-verdict').replaceChildren();$('chat-title').textContent=currentFixture?currentFixture.home+' — '+currentFixture.away:'Relatório do jogo';
 $('fixture-preview').textContent=currentFixture?`Jogo: ${currentFixture.home} vs. ${currentFixture.away}\nData: ${currentFixture.date}\nHora: ${currentFixture.time||'Não confirmada'}\nFonte: ${currentFixture.source||'calendário'}`:'Seleciona um jogo. Não é possível confirmar que o jogo ainda não começou sem uma hora válida.';
 $('question').disabled=true;$('send').disabled=true;}
async function loadFixtures(){const l=$('league').value;$('fixture').replaceChildren();addOption($('fixture'),'','A carregar...');fixtures=[];packet=null;
 if(!l){showFixture();return;}statusNote('');try{const data=await fetchJSON('/api/fixtures?league='+encodeURIComponent(l));fixtures=data.fixtures||[];showFixture();if(!fixtures.length)statusNote('Esta fonte não tem jogos futuros listados nesta liga. Tenta outra competição.');}catch(e){showFixture();statusNote('Erro a recolher jogos: '+e.message);}}
function showMarketsToQuote(packet){
 const board=$('quote-board');board.replaceChildren();const arr=(packet.candidateMarkets||[]).slice(0,3);
 board.hidden=false;
 if(['JOGO_JA_PODE_TER_COMECADO','INICIO_HOJE_NAO_CONFIRMADO'].includes(packet.fixture?.status)){const warning=document.createElement('p');warning.textContent='Partida de hoje sem hora de início verificável ou já possivelmente iniciada. O site não tem feed live: não apresenta aqui entradas pré-jogo sem confirmar que a partida ainda não começou.';board.appendChild(warning);return;}
 const heading=document.createElement('strong');heading.className='quote-heading';heading.textContent=arr.length?'MERCADOS NÃO TRIVIAIS — SEM ENTRADA AINDA':'SEM MERCADO FUNDAMENTADO';board.appendChild(heading);
 if(!arr.length){const note=document.createElement('p');const why=(packet.modelLimitations||[]).slice(0,3).join(' · ');note.textContent='Sem seleção estatística para este jogo. '+(why||'Histórico insuficiente para calcular os mercados disponíveis.')+' A IA pode analisar o contexto, mas não deve inventar uma aposta.';board.appendChild(note);return;}
 arr.forEach((c,i)=>{const item=document.createElement('button');item.type='button';item.className='quote-item';
  const title=document.createElement('strong');title.textContent=(i===0?'Principal · ':'Alternativa · ')+c.name;
  const details=document.createElement('small');const ref=c.marketReference?` · Referência indicativa ${Number(c.marketReference.indicativeOdd).toFixed(2).replace('.',',')} (não atual)`:' · Sem referência de preço';details.textContent=`Modelo ${(c.modelProbability*100).toFixed(0)}% (não calibrado) · Odd exigida ${Number(c.thresholdOddExperimental).toFixed(2).replace('.',',')} (não é cotação de casa)${ref}`+(c.realismReview?' · DIVERGÊNCIA: rever previsão':'');
  item.append(title,details);item.addEventListener('click',()=>{$('market').value=c.id;$('price').focus();});board.appendChild(item);
 });
 const foot=document.createElement('p');foot.textContent='O modelo NÃO prevê as odds das casas. Estas linhas servem só para procurar preços. Introduz a odd real para verificar se compensa. Se a casa pagar menos, não entrar.';board.appendChild(foot);
}

async function preview(){const id=currentFixture?.id;if(!id)return;try{const b=await post('/api/ai/preview',{league:$('league').value,fixtureId:id});if(id!==currentFixture?.id)return;packet=b.packet;showMarketsToQuote(packet);const m=$('market');m.replaceChildren();addOption(m,'','Sem mercado escolhido');for(const c of packet.candidateMarkets||[])addOption(m,c.id,`${c.name} · mínimo do modelo ${Number(c.thresholdOddExperimental).toFixed(2)}`);if(packet.primaryMarketToQuote?.id)m.value=packet.primaryMarketToQuote.id;$('live-flag').textContent=packet.fixture?.status==='INICIO_HOJE_NAO_CONFIRMADO'?'HORA DE INÍCIO NÃO CONFIRMADA HOJE':packet.fixture?.status==='JOGO_JA_PODE_TER_COMECADO'?'JOGO PODE ESTAR A DECORRER':'PRÉ-JOGO · SEM LIVE FEED';
 const details=packet.quality?` · Jogos encontrados: ${packet.quality.homeGames??0} casa / ${packet.quality.awayGames??0} fora; no recorte: ${packet.quality.homeVenue??0} em casa / ${packet.quality.awayVenue??0} fora`:'';const ready=packet.modelReady?'Modelo numérico disponível, NÃO calibrado.':'Modelo numérico indisponível'+details+'; '+(packet.modelLimitations||[]).join(' · ');
 $('fixture-preview').textContent=`${packet.fixture.home} vs. ${packet.fixture.away}\n${packet.competition} · ${packet.fixture.date}\n${ready}\nHistórico da liga: ${packet.historicalMatchesInLeague} jogos (não inclui todas as competições)\nEstado: ${packet.fixture.status}\nSem feed em direto.`;
 }catch(e){statusNote(e.message);}}
function addMessage(role,text,links=[]){const empty=$('chat').querySelector('.empty-chat');if(empty)empty.remove();const elem=document.createElement('div');elem.className='bubble '+role;const who=document.createElement('div');who.className='who';who.textContent=role==='assistant'?'✦ ASSISTENTE IA':'A TUA PERGUNTA';const body=document.createElement('div');body.className='body';body.textContent=String(text).replace(/^\s*#{1,4}\s*/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'$1');elem.append(who,body);
 if(links.length){const wrap=document.createElement('div');wrap.className='sources';wrap.textContent='Fontes encontradas:';for(const l of links){if(!/^https:\/\//.test(l.url||''))continue;const a=document.createElement('a');a.href=l.url;a.rel='noopener noreferrer';a.target='_blank';a.textContent=l.title||l.url;wrap.appendChild(a);}elem.appendChild(wrap);} $('chat').append(elem);elem.scrollIntoView({block:'end',behavior:'smooth'});return elem;}
function setBusy(v){running=v;$('analyze').disabled=v;$('send').disabled=v||!conversation.length;$('question').disabled=v||!conversation.length;}
async function ask(question='',reset=false){if(running||!currentFixture)return;if($('price').value.trim()&&!$('market').value){statusNote('Para validar uma odd, escolhe primeiro o mercado correspondente. Ou apaga a odd para pedir só a análise.');return;}const selected=currentFixture.id;setBusy(true);statusNote('');const old=$('chat').querySelector('.loading');if(old)old.remove();if(reset){$('chat').replaceChildren();conversation=[];}else if(question){addMessage('user',question);}const spinner=document.createElement('div');spinner.className='loading';spinner.textContent='A analisar dados, consultar fontes e preparar o relatório…';$('chat').append(spinner);
 try{const r=await post('/api/ai/chat',{league:$('league').value,fixtureId:selected,question,history:conversation,searchWeb:$('research').checked&&(reset||/not[ií]ci|les[aã]o|convocad|onze|meteorolog|tempo|atualiz|hoje|[úu]ltima/i.test(question)),optionId:$('market').value||null,odd:$('price').value.trim()||null});spinner.remove();addMessage('assistant',r.text,r.links);if(question)conversation.push({role:'user',content:question});conversation.push({role:'assistant',content:r.text.slice(0,1400)});conversation=conversation.slice(-6);$('question').disabled=false;$('send').disabled=false;}
 catch(e){spinner.remove();statusNote(e.message);addMessage('assistant','Não foi possível completar a análise: '+e.message);}
 finally{setBusy(false);$('question').disabled=!conversation.length;$('send').disabled=!conversation.length;}
}
async function validateCurrentPrice(){
 if(!currentFixture){statusNote('Escolhe um jogo.');return;}
 if(!packet)await preview();
 const optionId=$('market').value,odd=$('price').value.trim();
 if(!optionId||!odd){statusNote('Seleciona o mercado e introduz a odd real da tua casa.');return;}
 try{statusNote('');const r=await post('/api/ai/preview',{league:$('league').value,fixtureId:currentFixture.id,optionId,odd});
  const m=r.manual,v=$('price-verdict');v.replaceChildren();v.hidden=false;
  const title=document.createElement('strong');title.textContent=m.decision==='POTENCIAL'?'POSSÍVEL PREÇO INTERESSANTE — NÃO VALIDADO':'OBSERVAR — NÃO ENTRAR';
  const info=document.createElement('p');const format=n=>Number(n).toFixed(2).replace('.',',');
  info.textContent=`${m.market} · Odd da casa ${format(m.odd)} · Odd exigida pelo modelo ${format(m.estimatedMinimumOdd)} · Prob. implícita ${Math.round(m.marketImpliedProbability*100)}% · Modelo ${Math.round(m.modelProbability*100)}%. ${m.reason}`;
  v.dataset.decision=m.decision;v.append(title,info);
 }catch(e){statusNote('Não foi possível validar a odd: '+e.message);}
}
$('check-price').addEventListener('click',validateCurrentPrice);
$('league').addEventListener('change',loadFixtures);$('filter').addEventListener('input',showFixture);$('fixture').addEventListener('change',()=>{selectedFixture();preview();});$('refresh').addEventListener('click',loadFixtures);
$('analyze').addEventListener('click',async()=>{if(!currentFixture){statusNote('Seleciona primeiro uma partida.');return;}if(!packet)await preview();await ask('',true);});
$('followup').addEventListener('submit',e=>{e.preventDefault();const q=$('question').value.trim();if(!q)return;$('question').value='';ask(q);});
(async()=>{try{const s=await fetchJSON('/api/status');leagues=s.leagues||{};const sel=$('league');sel.replaceChildren();addOption(sel,'','Seleciona uma competição');for(const [code,l] of Object.entries(leagues))addOption(sel,code,`${l.country} · ${l.name}`);
 const ai=await fetchJSON('/api/ai/status');$('api-state').textContent=ai.configured?`Gemini grátis configurado · ${ai.model}`:'Gemini sem chave · configurar GEMINI_API_KEY na Vercel';$('today').textContent=new Date().toLocaleDateString('pt-PT',{day:'2-digit',month:'long',year:'numeric'});
 $('league').value='P1';await loadFixtures();}catch(e){statusNote('Não foi possível inicializar: '+e.message);}})();
