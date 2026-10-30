const $ = id => document.getElementById(id);
let leagues = {}, fixtures = [], currentFixture = null, packet = null, conversation = [], running = false;

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

const fetchJSON = async (url, options={}) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(data.error || `Erro HTTP ${res.status}`);
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

function showMarketsToQuote(packetData){
  const board = $('quote-board');
  board.replaceChildren();
  board.hidden = false;
  const arr = (packetData.candidateMarkets || []).slice(0, 4);
  renderPrimaryHero(arr[0]);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="board-head">
      <div>
        <div class="section-tag">MERCADOS SELECIONADOS</div>
        <h3>${arr.length ? 'Entradas para comparar na tua casa' : 'Sem entrada justificada'}</h3>
        <div class="board-sub">Aqui tens uma seleção principal e alternativas. O foco já não é despejar estatísticas; é mostrar-te mercados concretos com a odd mínima exigida pelo modelo.</div>
      </div>
      <div class="tag info">Histórico liga: ${packetData.historicalMatchesInLeague || 0} jogos</div>
    </div>`;
  board.appendChild(wrapper);

  if (!arr.length) {
    const empty = document.createElement('div');
    empty.className = 'decision-panel';
    empty.dataset.decision = 'OBSERVAR';
    empty.innerHTML = `<div class="decision-title">SEM ENTRADA JUSTIFICADA</div><div class="decision-body">Não foi possível destacar um mercado utilizável com os dados atuais. Podes ainda conversar com o assistente, mas o site não deve inventar uma aposta.</div>`;
    board.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'entry-grid';
  arr.forEach((c, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `entry-card ${index===0 ? 'main' : ''}`;
    card.innerHTML = `
      <div class="entry-kicker">${index===0 ? 'SELEÇÃO PRINCIPAL' : 'ALTERNATIVA ' + index}</div>
      <div class="entry-title">${c.name}</div>
      <div class="entry-desc">${buildEntryDescription(c, index)}</div>
      <div class="entry-metrics">
        <div class="mini"><div class="label">Probabilidade</div><div class="value">${toPct(c.modelProbability)}</div></div>
        <div class="mini"><div class="label">Cenário baixo</div><div class="value">${toPct(c.scenarioLow)}</div></div>
        <div class="mini"><div class="label">Odd mínima</div><div class="value">${toOdd(c.thresholdOddExperimental)}</div></div>
      </div>
      <div class="entry-actions">
        <span class="tag good">Para cotar</span>
        <span class="tag info">Clique para validar</span>
        ${(c.notes||[]).length ? '<span class="tag warn">Atenção ao risco</span>' : ''}
      </div>`;
    card.addEventListener('click', () => {
      $('market').value = c.id;
      $('price').focus();
      document.querySelectorAll('.entry-card').forEach(el => el.classList.remove('selected'));
      card.classList.add('selected');
    });
    grid.appendChild(card);
  });
  board.appendChild(grid);

  const selected = $('market');
  if (arr[0]?.id) selected.value = arr[0].id;
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
  selectedFixture();
}

function selectedFixture(){
  currentFixture = fixtures.find(f => f.id === $('fixture').value) || null;
  packet = null;
  conversation = [];
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
    fixtures = data.fixtures || [];
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
    showMarketsToQuote(packet);
    const marketSelect = $('market');
    marketSelect.replaceChildren();
    addOption(marketSelect, '', 'Sem mercado escolhido');
    (packet.candidateMarkets || []).forEach(c => addOption(marketSelect, c.id, `${c.name} · odd mínima ${toOdd(c.thresholdOddExperimental)}`));
    if (packet.primaryMarketToQuote?.id) marketSelect.value = packet.primaryMarketToQuote.id;

    const ready = packet.modelReady ? 'Modelo numérico disponível, ainda não calibrado.' : 'Modelo numérico indisponível.';
    $('fixture-preview').textContent = `${packet.fixture.home} vs. ${packet.fixture.away}\n${packet.competition} · ${packet.fixture.date}\n${ready}\nHistórico da liga: ${packet.historicalMatchesInLeague} jogos\nEstado: ${packet.fixture.status}\nSem feed em direto.`;
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
  try {
    const status = await fetchJSON('/api/status');
    leagues = status.leagues || {};
    const select = $('league');
    select.replaceChildren();
    addOption(select, '', 'Seleciona uma competição');
    for (const [code, league] of Object.entries(leagues)) {
      addOption(select, code, `${league.country} · ${league.name}`);
    }
    const ai = await fetchJSON('/api/ai/status');
    $('api-state').textContent = ai.configured ? `Gemini configurado · ${ai.model}` : 'Gemini sem chave · configurar GEMINI_API_KEY';
    $('today').textContent = new Date().toLocaleDateString('pt-PT', {day:'2-digit', month:'long', year:'numeric'});
    if (leagues.P1) {
      $('league').value = 'P1';
      await loadFixtures();
    }
  } catch (e) {
    statusNote('Não foi possível inicializar: ' + e.message);
  }
})();
