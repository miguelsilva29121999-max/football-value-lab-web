const $ = id => document.getElementById(id);
let leagues = {}, fixtures = [], currentFixture = null, packet = null, conversation = [], running = false;
let priceDrafts = new Map();

const statusNote = msg => {
  const box = $('problem');
  if (!msg) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.textContent = msg;
};

// A API da Vercel é privada; o código fica apenas na sessão deste navegador.
const accessKey='fvl_site_code';
let accessPrompt=null;
const readAccess=()=>{try{return sessionStorage.getItem(accessKey)||'';}catch{return '';}};
const saveAccess=value=>{try{if(value)sessionStorage.setItem(accessKey,value);else sessionStorage.removeItem(accessKey);}catch{}};
async function requestWithAccess(url,options={}){
  if(location.protocol==='file:')throw Error('Abre o Football Value Lab através do endereço publicado na Vercel, não diretamente como ficheiro HTML.');
  const send=()=>{
    const headers=new Headers(options.headers||{});
    const code=readAccess();
    if(code)headers.set('x-fvl-access-code',code);
    return fetch(url,{...options,headers,cache:'no-store'});
  };
  let res=await send();
  if(res.status===401){
    saveAccess('');
    if(!accessPrompt){
      accessPrompt=Promise.resolve().then(()=>window.prompt('Football Value Lab — introduz o teu código de acesso privado (SITE_ACCESS_CODE):')||'').finally(()=>{accessPrompt=null;});
    }
    const code=(await accessPrompt).trim();
    if(!code)throw Error('A API é privada. Introduz o código de acesso do site para carregar ligas, jogos e Gemini.');
    saveAccess(code);
    res=await send();
    if(res.status===401){saveAccess('');throw Error('Código de acesso incorreto. Atualiza a página para o introduzir novamente.');}
  }
  return res;
}
const fetchJSON = async (url, options={}) => {
  const res = await requestWithAccess(url,options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if(res.status===503&&data.code==='ACCESS_NOT_CONFIGURED')throw Error('Falta configurar SITE_ACCESS_CODE no projeto Vercel. Não partilhes o código aqui.');
    throw Error(data.error || `Erro HTTP ${res.status} em ${url}`);
  }
  return data;
};
const post = (url, data) => fetchJSON(url, {
  method: 'POST',
  headers: {'content-type':'application/json'},
  body: JSON.stringify(data)
});

function addOption(select, value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  select.appendChild(opt);
}

function toPct(v){ return Number.isFinite(v) ? `${Math.round(v*100)}%` : '—'; }
function toOdd(v){ return Number.isFinite(Number(v)) ? Number(v).toFixed(2).replace('.', ',') : '—'; }
function sanitize(text=''){
  return String(text)
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .trim();
}
function hashCode(str=''){
  let h=0;
  for(const ch of str) h=((h<<5)-h)+ch.charCodeAt(0), h|=0;
  return Math.abs(h);
}
function badgeLetters(name=''){
  const parts = String(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'FV';
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}
function badgeStyle(name=''){
  const hue = hashCode(name) % 360;
  return `background:linear-gradient(135deg,hsl(${hue} 75% 72%),hsl(${(hue+45)%360} 70% 60%));`;
}

function setBusy(v){
  running = v;
  $('analyze').disabled = v;
  $('send').disabled = v || !conversation.length;
  $('question').disabled = v || !conversation.length;
}

function resetStage(){
  $('match-stage').classList.add('empty');
  $('match-stage').innerHTML = `
    <div class="section-tag">03 / OPORTUNIDADE DO JOGO</div>
    <div class="stage-empty">
      <div class="stage-orb">✦</div>
      <h2>À espera de um jogo</h2>
      <p>Quando escolheres uma partida, esta área passa a mostrar o confronto, a entrada principal, as alternativas e o racional do motor.</p>
    </div>`;
  const board = $('quote-board');
  board.hidden = true;
  board.replaceChildren();
}

function renderMatchStageFromFixture(){
  if (!currentFixture) return resetStage();
  $('match-stage').classList.remove('empty');
  $('match-stage').innerHTML = `
    <div class="section-tag">03 / OPORTUNIDADE DO JOGO</div>
    <div class="match-overview">
      <div class="teams-row">
        <div class="team-block">
          <div class="team-crest" style="${badgeStyle(currentFixture.home)}">${badgeLetters(currentFixture.home)}</div>
          <div>
            <div class="team-name">${currentFixture.home}</div>
            <div class="team-sub">Casa</div>
          </div>
        </div>
        <div class="vs-chip">${currentFixture.date || ''}</div>
        <div class="team-block right">
          <div>
            <div class="team-name">${currentFixture.away}</div>
            <div class="team-sub">Fora</div>
          </div>
          <div class="team-crest" style="${badgeStyle(currentFixture.away)}">${badgeLetters(currentFixture.away)}</div>
        </div>
      </div>
      <div class="top-pick">
        <div>
          <div class="top-pick-title">SELEÇÃO PRINCIPAL</div>
          <div class="pick-name">A aguardar modelação</div>
          <div class="pick-why">Escolhe o jogo e carrega em <b>Gerar entrada principal</b>. O sistema vai procurar uma oportunidade concreta e mostrar também alternativas.</div>
          <div class="pick-risk"><b>Risco principal:</b> ainda sem análise gerada.</div>
        </div>
        <div class="pick-stats">
          <div class="stat-card"><div class="label">Prob. modelo</div><div class="value">—</div></div>
          <div class="stat-card"><div class="label">Cenário baixo</div><div class="value">—</div></div>
          <div class="stat-card"><div class="label">Odd mínima</div><div class="value small">—</div></div>
          <div class="stat-card"><div class="label">Estado</div><div class="value small">Pré-jogo</div></div>
        </div>
      </div>
    </div>`;
}

function buildEntryDescription(candidate, position){
  const notes = (candidate.notes || []).filter(Boolean);
  let base = position === 0
    ? 'É a linha mais utilizável do motor neste jogo, com melhor equilíbrio entre probabilidade, cenário adverso e atratividade potencial.'
    : 'Alternativa modelada para o mesmo jogo, útil se a seleção principal estiver mal cotada na tua casa.';
  if (notes.length) base += ` Atenção: ${notes[0]}`;
  return base;
}

function renderPrimaryHero(primary){
  const stage = $('match-stage');
  if (!packet || !currentFixture) return;
  const projected = packet.projectedGoalsFromResults || {};
  stage.classList.remove('empty');
  stage.innerHTML = `
    <div class="section-tag">03 / OPORTUNIDADE DO JOGO</div>
    <div class="match-overview">
      <div class="teams-row">
        <div class="team-block">
          <div class="team-crest" style="${badgeStyle(packet.fixture.home)}">${badgeLetters(packet.fixture.home)}</div>
          <div>
            <div class="team-name">${packet.fixture.home}</div>
            <div class="team-sub">Casa · ${packet.competition}</div>
          </div>
        </div>
        <div class="vs-chip">${packet.fixture.date} · ${packet.fixture.status.replaceAll('_',' ')}</div>
        <div class="team-block right">
          <div>
            <div class="team-name">${packet.fixture.away}</div>
            <div class="team-sub">Fora · sem live feed</div>
          </div>
          <div class="team-crest" style="${badgeStyle(packet.fixture.away)}">${badgeLetters(packet.fixture.away)}</div>
        </div>
      </div>
      <div class="top-pick">
        <div>
          <div class="top-pick-title">ENTRADA PRINCIPAL PARA COTAR</div>
          <div class="pick-name">${primary ? primary.name : 'Sem entrada justificada'}</div>
          <div class="pick-why">${primary ? buildEntryDescription(primary, 0) : 'O motor não encontrou um mercado suficientemente utilizável com os dados atuais.'}</div>
          <div class="pick-risk"><b>Risco principal:</b> ${primary?.notes?.[0] || 'probabilidades experimentais não calibradas; confirma sempre contexto e odd real.'}</div>
        </div>
        <div class="pick-stats">
          <div class="stat-card"><div class="label">Prob. modelo</div><div class="value">${primary ? toPct(primary.modelProbability) : '—'}</div></div>
          <div class="stat-card"><div class="label">Cenário baixo</div><div class="value">${primary ? toPct(primary.scenarioLow) : '—'}</div></div>
          <div class="stat-card"><div class="label">Odd mínima</div><div class="value small">${primary ? toOdd(primary.thresholdOddExperimental) : '—'}</div></div>
          <div class="stat-card"><div class="label">Golos proj.</div><div class="value small">${Number.isFinite(projected.home)&&Number.isFinite(projected.away) ? `${projected.home.toFixed(2).replace('.',',')} / ${projected.away.toFixed(2).replace('.',',')}` : '—'}</div></div>
        </div>
      </div>
    </div>`;
}

const isNoKickoff=fixture=>['INICIO_HOJE_NAO_CONFIRMADO','JOGO_JA_PODE_TER_COMECADO'].includes(fixture?.status);
function renderHistory(data){
 const root=$('history-content');if(!root)return;
 root.replaceChildren();
 const h=data.historySummary;
 if(!h){root.textContent='O fornecedor não devolveu um resumo verificável do histórico.';return;}
 const intro=document.createElement('p');
 intro.textContent='Histórico da liga: '+h.totalLeagueGames+' partidas. São apenas encontros anteriores à data do jogo, não jogos de todas as competições.';
 root.append(intro);
 const value=v=>v?.value==null?'sem dados':toOdd(v.value)+' ('+v.coverage+'/'+v.total+' jogos)';
 for(const [venue,team] of [['Casa',h.home],['Fora',h.away]]){
  const card=document.createElement('div');card.className='history-team';
  const title=document.createElement('strong');title.textContent=team.team+' · '+venue+' · '+team.leagueGames+' jogos de liga';card.append(title);
  const stat=document.createElement('p'),a=team.lastFive.averages;
  stat.textContent='Últimos 5 — golos marcados: '+value(a.scored)+' · sofridos: '+value(a.conceded)+' · cantos: '+value(a.corners)+' · remates: '+value(a.shots);
  card.append(stat);
  const games=document.createElement('p');games.className='history-games';
  games.textContent=team.lastFive.games.map(m=>m.date+' '+m.home+' '+m.hg+'–'+m.ag+' '+m.away).join('  •  ')||'Sem partidas anteriores registadas.';
  card.append(games);
  const venueStat=document.createElement('p'),recent=team.lastFiveAtVenue;
  venueStat.textContent='Últimos '+recent.games.length+' '+(venue==='Casa'?'em casa':'fora')+': golos marcados '+value(recent.averages.scored)+', sofridos '+value(recent.averages.conceded);
  card.append(venueStat);root.append(card);
 }
 const note=document.createElement('p');
 note.textContent='Dados em falta não são considerados zero; amostras e probabilidades não estão calibradas.';
 root.append(note);
}
function showMarketsToQuote(data){
 const board=$('quote-board');board.replaceChildren();board.hidden=false;
 const arr=(data.candidateMarkets||[]).slice(0,8),locked=isNoKickoff(data.fixture);
 renderPrimaryHero(arr[0]);
 if(locked){
  const heading=$('match-stage').querySelector('.top-pick-title');
  if(heading)heading.textContent='SELEÇÃO HISTÓRICA · SEM VALIDAÇÃO PRÉ-JOGO';
 }
 const head=document.createElement('div');head.className='board-head';
 const title=document.createElement('div');
 const kicker=document.createElement('div');kicker.className='section-tag';kicker.textContent='MERCADOS SELECIONADOS';
 const h3=document.createElement('h3');h3.textContent=arr.length?'Entradas para comparar na tua casa':'Sem mercado fundamentado';
 const description=document.createElement('p');description.className='board-sub';
 description.textContent=locked?'Os mercados abaixo são apenas históricos: sem hora de início confirmada hoje, não podem ser validados como pré-jogo.':'Introduz a odd real em vários cartões. Só depois da comparação escolhemos a melhor hipótese — sem prometer uma aposta lucrativa.';
 title.append(kicker,h3,description);head.append(title);board.append(head);
 if(!arr.length){
  const none=document.createElement('div');none.className='decision-panel';
  const reasons=(data.modelLimitations||[]).filter(Boolean).slice(0,3).join(' · ');
  const q=data.quality||{};
  none.textContent='Não há mercado numérico para validar neste jogo. Casa: '+(q.homeGames??0)+' jogos ('+(q.homeVenue??0)+' em casa); fora: '+(q.awayGames??0)+' jogos ('+(q.awayVenue??0)+' fora). '+(reasons||'Consulta o histórico e escolhe um jogo com melhor cobertura.');
  board.append(none);return;
 }
 const grid=document.createElement('div');grid.className='entry-grid';
 arr.forEach((candidate,index)=>{
  const card=document.createElement('article');card.className='entry-card'+(index===0?' main':'');card.dataset.optionId=candidate.id;
  const kicker=document.createElement('div');kicker.className='entry-kicker';kicker.textContent=index===0?'SELEÇÃO PRINCIPAL PARA COTAR':'ALTERNATIVA '+index;
  const title=document.createElement('div');title.className='entry-title';title.textContent=candidate.name;
  const explain=document.createElement('div');explain.className='entry-desc';explain.textContent=buildEntryDescription(candidate,index);
  card.append(kicker,title,explain);
  const metrics=document.createElement('div');metrics.className='entry-metrics';
  for(const [label,value] of [['Probabilidade',toPct(candidate.modelProbability)],['Cenário baixo',toPct(candidate.scenarioLow)],['Odd mínima',toOdd(candidate.thresholdOddExperimental)]]){
   const box=document.createElement('div');box.className='mini';
   const l=document.createElement('div');l.className='label';l.textContent=label;
   const v=document.createElement('div');v.className='value';v.textContent=value;box.append(l,v);metrics.append(box);
  }
  card.append(metrics);
  if(candidate.historicalAudit?.status==='DESFAVORAVEL'){
   const warning=document.createElement('div');warning.className='tag warn';warning.textContent='Aviso: histórico preditivo desfavorável';card.append(warning);
  }
  const action=document.createElement('div');action.className='entry-quote';
  const label=document.createElement('label');label.textContent=locked?'Jogo de hoje: cotação bloqueada':'Odd real da casa';
  const input=document.createElement('input');input.className='entry-odd';input.inputMode='decimal';input.autocomplete='off';input.placeholder='Ex.: 1,95';input.disabled=locked;
  input.setAttribute('aria-label','Odd da casa para '+candidate.name);input.value=priceDrafts.get(candidate.id)||'';
  input.addEventListener('input',()=>{
   if(input.value.trim())priceDrafts.set(candidate.id,input.value.trim());else priceDrafts.delete(candidate.id);
   const verdict=$('batch-verdict');verdict.hidden=true;verdict.replaceChildren();
   for(const e of grid.querySelectorAll('.entry-decision'))e.remove();
   for(const e of grid.querySelectorAll('.entry-card'))delete e.dataset.decision;
  });
  label.append(input);
  const select=document.createElement('button');select.type='button';select.className='card-select';
  select.textContent='Selecionar mercado';select.addEventListener('click',()=>{
   $('market').value=candidate.id;$('price').value=input.value;
   grid.querySelectorAll('.entry-card').forEach(e=>e.classList.remove('selected'));card.classList.add('selected');
   $('price').focus();
  });
  action.append(label,select);card.append(action);grid.append(card);
 });
 board.append(grid);
 if(!locked){
  const compare=document.createElement('button');compare.type='button';compare.className='compare-all';
  compare.textContent='✓ Comparar odds e escolher a melhor hipótese';
  compare.addEventListener('click',compareQuotedMarkets);board.append(compare);
 }else{
  const warning=document.createElement('p');warning.className='entry-desc';
  warning.textContent='Dados históricos disponíveis; não existe feed live nem hora de início verificada para uma entrada pré-jogo.';
  board.append(warning);
 }
}
async function compareQuotedMarkets(){
 if(!packet||!currentFixture)return statusNote('Seleciona uma partida primeiro.');
 if(isNoKickoff(packet.fixture))return statusNote('Sem hora de início verificável não é possível validar entradas pré-jogo.');
 const offers=[...priceDrafts.entries()].filter(([,value])=>String(value).trim()).map(([optionId,odd])=>({optionId,odd}));
 if(!offers.length)return statusNote('Introduz pelo menos uma odd real num dos cartões.');
 try{
  statusNote('');
  const fixtureId=currentFixture.id;
  const results=await post('/api/ai/preview',{league:$('league').value,fixtureId,offers});
  if(currentFixture?.id!==fixtureId)return;
  const block=$('batch-verdict');block.hidden=false;block.replaceChildren();
  const primary=results.bestCandidate||results.bestTheoreticalInReview||null;
  block.dataset.decision=results.bestCandidate?'POTENCIAL':results.bestTheoreticalInReview?'REVER_MODELO':'OBSERVAR';
  const heading=document.createElement('strong');
  heading.textContent=results.bestCandidate?'MELHOR PREÇO EXPERIMENTAL · NÃO VALIDADO':results.bestTheoreticalInReview?'ODD SUPERA MÍNIMO · MODELO EM REVISÃO':'SEM ENTRADA AOS PREÇOS INTRODUZIDOS';
  block.append(heading);
  if(primary){
   const line=document.createElement('p');
   line.textContent=primary.market+' · Odd da casa '+toOdd(primary.odd)+' · Mínimo do modelo '+toOdd(primary.estimatedMinimumOdd)+' · EV central '+toPct(primary.estimatedEv)+' · Cenário adverso '+toPct(primary.estimatedEvLow)+'.';
   block.append(line);
   $('market').value=primary.optionId;$('price').value=String(primary.odd).replace('.',',');
  }
  const note=document.createElement('p');note.textContent=results.notice;block.append(note);
  for(const item of results.offers||[]){
   const card=[...$('quote-board').querySelectorAll('.entry-card')].find(c=>c.dataset.optionId===item.optionId);
   if(!card)continue;
   card.dataset.decision=item.decision;
   const badge=document.createElement('div');badge.className='entry-decision';badge.dataset.decision=item.decision;
   badge.textContent=(item.decision==='POTENCIAL'?'PREÇO EXPERIMENTAL FAVORÁVEL':item.decision==='REVER_MODELO'?'MODELO EM REVISÃO — NÃO ENTRAR':'NÃO ENTRAR')+' · '+item.reason;
   card.append(badge);
  }
 }catch(error){statusNote('Não foi possível comparar as odds: '+error.message);}
}

function addMessage(role, text, links = []){
  const empty = $('chat').querySelector('.empty-chat');
  if (empty) empty.remove();
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = `<div class="who">${role === 'assistant' ? '✦ ASSISTENTE IA' : 'A TUA PERGUNTA'}</div><div class="body"></div>`;
  bubble.querySelector('.body').textContent = sanitize(text);
  if (links.length) {
    const sourceBox = document.createElement('div');
    sourceBox.className = 'sources';
    sourceBox.textContent = 'Fontes encontradas:';
    links.forEach(link => {
      if (!/^https:\/\//.test(link?.url || '')) return;
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.title || link.url;
      sourceBox.appendChild(a);
    });
    bubble.appendChild(sourceBox);
  }
  $('chat').appendChild(bubble);
  bubble.scrollIntoView({behavior:'smooth',block:'end'});
}

function showFixture(){
  const search = $('filter').value.trim().toLocaleLowerCase('pt-PT');
  const select = $('fixture');
  const previous = select.value;
  select.replaceChildren();
  addOption(select, '', 'Seleciona uma partida');
  const filtered = fixtures.filter(f => (`${f.home} ${f.away}`).toLocaleLowerCase('pt-PT').includes(search));
  filtered.forEach(f => addOption(select, f.id, `${f.date} · ${f.home} — ${f.away}`));
  if (filtered.some(f => f.id === previous)) select.value = previous;
  else if (filtered.length === 1) select.value = filtered[0].id;
  if(currentFixture?.id===select.value&&select.value)return;
  selectedFixture();
  if(currentFixture)preview();
}

function selectedFixture(){
  currentFixture = fixtures.find(f => f.id === $('fixture').value) || null;
  packet = null;
  conversation = [];
  priceDrafts = new Map();
  const h=$('history-content');if(h)h.textContent='Seleciona um jogo para consultar o histórico.';
  $('batch-verdict').hidden=true;$('batch-verdict').replaceChildren();
  $('market').replaceChildren();
  addOption($('market'), '', 'Sem mercado escolhido');
  $('price-verdict').hidden = true;
  $('price-verdict').replaceChildren();
  $('chat-title').textContent = currentFixture ? `${currentFixture.home} — ${currentFixture.away}` : 'Discussão do jogo';
  $('question').disabled = true;
  $('send').disabled = true;

  $('fixture-preview').textContent = currentFixture
    ? `Jogo: ${currentFixture.home} vs. ${currentFixture.away}\nData: ${currentFixture.date}\nHora: ${currentFixture.time || 'Não confirmada'}\nFonte: ${currentFixture.source || 'calendário'}`
    : 'Seleciona um jogo. Não é possível confirmar que o jogo ainda não começou sem uma hora válida.';

  $('chat').innerHTML = `<div class="empty-chat"><div class="stage-orb">✦</div><h3>Assistente pronto</h3><p>Depois de gerar a seleção principal, podes pedir explicações, cenários alternativos e comentários ao preço da tua casa.</p></div>`;
  renderMatchStageFromFixture();
  $('quote-board').hidden = true;
  $('quote-board').replaceChildren();
}

async function loadFixtures(){
  const league = $('league').value;
  $('fixture').replaceChildren();
  addOption($('fixture'), '', 'A carregar...');
  fixtures = [];
  packet = null;
  if (!league) {
    showFixture();
    return;
  }
  statusNote('');
  try {
    const data = await fetchJSON('/api/fixtures?league=' + encodeURIComponent(league));
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    fixtures = (data.fixtures||[]).filter(f=>typeof f.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(f.date)&&f.date>=today);
    showFixture();
    if (!fixtures.length) statusNote('Esta fonte não tem jogos futuros listados nesta liga. Tenta outra competição.');
  } catch (e) {
    showFixture();
    statusNote('Erro a recolher jogos: ' + e.message);
  }
}

async function preview(){
  const id = currentFixture?.id;
  if (!id) return;
  try {
    const data = await post('/api/ai/preview', {league:$('league').value, fixtureId:id});
    if (id !== currentFixture?.id) return;
    packet = data.packet;
    renderHistory(packet);
    showMarketsToQuote(packet);
    const marketSelect = $('market');
    marketSelect.replaceChildren();
    addOption(marketSelect, '', 'Sem mercado escolhido');
    (packet.candidateMarkets || []).forEach(c => addOption(marketSelect, c.id, `${c.name} · odd mínima ${toOdd(c.thresholdOddExperimental)}`));
    if (packet.primaryMarketToQuote?.id) marketSelect.value = packet.primaryMarketToQuote.id;

    const ready = packet.modelReady ? 'Modelo numérico disponível (experimental; sem calibração).' : 'Modelo numérico com cobertura insuficiente.';
    const q=packet.quality||{};
    const home=`Casa ${packet.fixture.home}: ${q.homeGames??0} jogos (${q.homeVenue??0} em casa)`;
    const away=`Fora ${packet.fixture.away}: ${q.awayGames??0} jogos (${q.awayVenue??0} fora)`;
    const reasons=packet.modelReady?'':('\nLimitações: '+(packet.modelLimitations||[]).join('; '));
    $('fixture-preview').textContent = `${packet.fixture.home} vs. ${packet.fixture.away}\n${packet.competition} · ${packet.fixture.date}\n${home}\n${away}\n${ready} · ${(packet.candidateMarkets||[]).length} mercados para cotar${reasons}\nHistórico geral da liga: ${packet.historicalMatchesInLeague} jogos\nEstado: ${packet.fixture.status} · Sem feed em direto.`;
  } catch (e) {
    statusNote(e.message);
  }
}

async function validateCurrentPrice(){
  if (!currentFixture) {
    statusNote('Escolhe um jogo.');
    return;
  }
  if (!packet) await preview();
  const optionId = $('market').value;
  const odd = $('price').value.trim();
  if (!optionId || !odd) {
    statusNote('Seleciona o mercado e introduz a odd real da tua casa.');
    return;
  }
  try {
    statusNote('');
    const data = await post('/api/ai/preview', {league:$('league').value, fixtureId:currentFixture.id, optionId, odd});
    const manual = data.manual;
    const verdict = $('price-verdict');
    verdict.hidden = false;
    verdict.dataset.decision = manual.decision;
    verdict.innerHTML = `
      <strong>${manual.decision === 'POTENCIAL' ? 'PREÇO POTENCIAL — NÃO VALIDADO' : manual.decision === 'REVER_MODELO' ? 'REVER MODELO — NÃO ENTRAR' : 'OBSERVAR — NÃO ENTRAR'}</strong>
      <div>${manual.market}</div>
      <div><b>Odd da tua casa:</b> ${toOdd(manual.odd)} · <b>Odd mínima do modelo:</b> ${toOdd(manual.estimatedMinimumOdd)}</div>
      <div><b>Prob. modelo:</b> ${toPct(manual.modelProbability)} · <b>Prob. implícita do mercado:</b> ${toPct(manual.marketImpliedProbability)}</div>
      <div>${manual.reason}</div>`;
  } catch (e) {
    statusNote('Não foi possível validar a odd: ' + e.message);
  }
}

async function ask(question='', reset=false){
  if (running || !currentFixture) return;
  if ($('price').value.trim() && !$('market').value) {
    statusNote('Para validar uma odd, escolhe primeiro o mercado correspondente. Ou apaga a odd para pedir só a análise.');
    return;
  }
  setBusy(true);
  statusNote('');

  if (reset) {
    $('chat').innerHTML = '';
    conversation = [];
  } else if (question) {
    addMessage('user', question);
  }

  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'A analisar os dados do jogo, a procurar o melhor mercado e a preparar a resposta…';
  $('chat').appendChild(loading);

  try {
    const response = await post('/api/ai/chat', {
      league: $('league').value,
      fixtureId: currentFixture.id,
      question,
      history: conversation,
      searchWeb: $('research').checked && (reset || /not[ií]ci|les[aã]o|convocad|onze|meteorolog|tempo|atualiz|hoje|última|ultima/i.test(question)),
      optionId: $('market').value || null,
      odd: $('price').value.trim() || null
    });
    loading.remove();
    addMessage('assistant', response.text, response.links);
    if (question) conversation.push({role:'user', content:question});
    conversation.push({role:'assistant', content:String(response.text).slice(0, 1400)});
    conversation = conversation.slice(-6);
    $('question').disabled = false;
    $('send').disabled = false;
  } catch (e) {
    loading.remove();
    statusNote(e.message);
    addMessage('assistant', 'Não foi possível completar a análise: ' + e.message);
  } finally {
    setBusy(false);
    $('question').disabled = !conversation.length;
    $('send').disabled = !conversation.length;
  }
}

$('check-price').addEventListener('click', validateCurrentPrice);
$('league').addEventListener('change', loadFixtures);
$('filter').addEventListener('input', showFixture);
$('fixture').addEventListener('change', async () => { selectedFixture(); await preview(); });
$('refresh').addEventListener('click', loadFixtures);
$('analyze').addEventListener('click', async () => {
  if (!currentFixture) {
    statusNote('Seleciona primeiro uma partida.');
    return;
  }
  if (!packet) await preview();
  await ask('', true);
});
$('followup').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('question').value.trim();
  if (!q) return;
  $('question').value = '';
  ask(q);
});

(async () => {
  $('today').textContent = new Date().toLocaleDateString('pt-PT', {timeZone:'Europe/Lisbon',day:'2-digit',month:'long',year:'numeric'});
  try {
    const status=await fetchJSON('/api/status');
    leagues=status.leagues||{};
    const select=$('league');
    select.replaceChildren();
    addOption(select,'','Seleciona uma competição');
    for(const [code,league] of Object.entries(leagues))
      addOption(select,code,`${league.country} · ${league.name}`);
    if(leagues.P1){
      select.value='P1';
      await loadFixtures();
    }
  }catch(e){
    const select=$('league');
    select.replaceChildren();
    addOption(select,'','Ligação indisponível — verifica o acesso');
    $('api-state').textContent='Sem ligação à API';
    statusNote('Não foi possível carregar as competições: '+e.message);
    return;
  }
  try{
    const ai=await fetchJSON('/api/ai/status');
    $('api-state').textContent=ai.configured?`Gemini configurado · ${ai.model}`:'Gemini sem chave · verificar configuração na Vercel';
  }catch(e){
    $('api-state').textContent='Gemini não verificado';
    statusNote('Competições carregadas, mas não foi possível consultar o estado da IA: '+e.message);
  }
})();
