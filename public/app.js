const el=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dec=(v,n=2)=>Number(v).toLocaleString('pt-PT',{minimumFractionDigits:n,maximumFractionDigits:n});
const pc=x=>Number.isFinite(x)?Math.round(x*100)+'%':'—';
const date=x=>{const d=new Date(String(x)+'T12:00:00Z');return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short'}).format(d):x;};
let info={},league='E0',fixtures=[],lastFixture=null,currentScreen='lab';
const mode=()=>el('mode')?.value||'balanced';
const selected=new Set(['E0','E1','P1','SP1','D1','I1','F1','N1','B1','T1']);
const notify=(s,isError=false)=>{const node=el('notification');node.hidden=!s;node.classList.toggle('error',isError);node.textContent=s||'';};
const empty=(title,body,ico='◎')=>`<div class="empty"><span class="empty-icon">${esc(ico)}</span><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
const loading=(txt)=>`<div class="loading"><span class="spin"></span>${esc(txt)}</div>`;
const requestWithAccess=async(uri,opt={})=>{
 const send=()=>{const code=sessionStorage.getItem('fvl_site_code');const headers=new Headers(opt.headers||{});if(code)headers.set('x-fvl-access-code',code);return fetch(uri,{...opt,headers});};
 let r=await send();
 if(r.status===401){const supplied=window.prompt('Football Value Lab — código de acesso privado (configurado na Vercel):');
  if(!supplied)throw Error('Acesso ao site cancelado.');sessionStorage.setItem('fvl_site_code',supplied);r=await send();
  if(r.status===401)sessionStorage.removeItem('fvl_site_code');}
 return r;
};
const api=async(uri,opt={})=>{const r=await requestWithAccess(uri,opt);let data;try{data=await r.json();}catch{throw Error('O servidor respondeu num formato inesperado.');}if(!r.ok)throw Error(data.error||'Erro de consulta.');return data;};
function renderChips(){el('league-chips').innerHTML=Object.entries(info.leagues||{}).map(([code,l])=>`<label class="league-chip"><input type="checkbox" value="${esc(code)}" ${selected.has(code)?'checked':''}>${esc(l.name)} <span style="color:#849bad">${esc(l.country)} · ${l.sport?'odds API configurável':'só calendário/ficheiro'}</span></label>`).join('');
 el('selected-count').textContent='('+selected.size+')';for(const cb of el('league-chips').querySelectorAll('input'))cb.onchange=()=>{cb.checked?selected.add(cb.value):selected.delete(cb.value);el('selected-count').textContent='('+selected.size+')';};}
function statusLabel(x){return x==='POTENCIAL'?'<span class="tag">CANDIDATO EXPERIMENTAL*</span>':x==='OBSERVAR'?'<span class="tag warn">OBSERVAR — COM ODD</span>':x==='INDICATIVA'?'<span class="tag warn">PREÇO INDICATIVO</span>':x==='CONFIRMAR'?'<span class="tag warn">VALIDAR ODD MANUAL</span>':'<span class="tag neutral">REJEITADA</span>';}
function compareBadge(o){
 if(o.marketCheck==='COMPARADO')return '<span class="market-mark">✓ Comparado com outras casas</span>';
 if(o.marketCheck==='DIVERGENCIA')return '<span class="market-mark caution">! Divergência modelo / casas</span>';
 if(o.marketCheck==='SEM_CONSENSO'&&o.sourceType==='api')return '<span class="market-mark caution">Sem 2 casas comparáveis</span>';
 return '';
}
function marketNote(o){
 if(!o.benchmark)return '';
 return `<div class="market-note"><b>Referência do mercado:</b> ${pc(o.benchmark.fair)} sem margem aproximada (${o.benchmark.bookmakers} casas).
  <b>Diferença de preço:</b> ${o.benchmarkEdge>=0?'+':''}${dec(o.benchmarkEdge*100,1)}% vs. consenso.
  ${o.signalBasis==='COMPARACAO_CASAS'?'Candidato descoberto por comparação entre casas.':'Modelo e mercado podem discordar.'}
  Este consenso não é uma probabilidade verdadeira nem garante valor.</div>`;
}
function oddsCard(o){let isGood=o.status==='POTENCIAL';return `<article class="result ${isGood?'good':''}"><div class="resulttop"><div><div class="fixture-title">${esc(o.label)}</div><div class="fixture-meta">${esc(o.bookmaker||'')} · ${o.sourceType==='snapshot'?'Preço de ficheiro, não atualizado em tempo real':o.sourceType==='manual'?'Cotação introduzida por ti':esc(o.lastUpdate||'Hora não indicada')}</div></div>${statusLabel(o.status)}</div>${compareBadge(o)}
  <div class="odds-grid"><div><small>ODD</small><b>${dec(o.odd)}</b></div><div><small>PROB. MODELO</small><b>${pc(o.p)}</b></div><div><small>PIOR CENÁRIO*</small><b>${pc(o.pEffective)}</b></div><div><small>ODD JUSTA*</small><b>${dec(o.oddFair)}</b></div><div><small>EV NO PIOR CENÁRIO*</small><b class="${o.evSafe>0?'positive':''}">${o.evSafe>=0?'+':''}${dec(o.evSafe*100,1)}%</b></div></div>
  <p class="smalltext">${o.status==='INDICATIVA'?'Este preço não é atual. Confirma a linha e a odd na casa antes de considerar o mercado.':o.status==='CONFIRMAR'?'A odd manual nao foi verificada. Compara na casa de apostas antes de considerar este mercado.':o.status==='POTENCIAL'?'Passa os critérios experimentais. CONFIRMAR disponibilidade e condicoes: nao equivale a entrada validada.':o.status==='OBSERVAR'?'Preço atual com vantagem central estimada, mas falhou parte dos filtros de robustez. Não é entrada recomendada. '+esc(o.why||''):esc(o.why||'Não supera todos os filtros.')} ${Number.isFinite(o.ev)?' EV central estimado: '+(o.ev>=0?'+':'')+dec(o.ev*100,1)+'%.':''}${o.push>0?'Existe reembolso no empate ('+pc(o.push)+').':''}${Number.isFinite(o.pLow)?' Variação de cenários: '+pc(o.pLow)+' a '+pc(o.pHigh)+'.':''}${(o.otherBookmakers||[]).length?' Precos alternativos: '+o.otherBookmakers.slice(0,3).map(v=>esc(v.name)+' '+dec(v.odd)).join(' · ')+'.':''}</p>${marketNote(o)}</article>`;}
function quality(m){const q=m.quality||{};return `<div class="metric-row"><span class="metric-chip">Casa — jogos<strong>${q.homeGames??0}</strong></span><span class="metric-chip">Fora — jogos<strong>${q.awayGames??0}</strong></span><span class="metric-chip">Em casa<strong>${q.homeVenue??0}</strong></span><span class="metric-chip">Fora do estádio<strong>${q.awayVenue??0}</strong></span><span class="metric-chip">Histórico da liga<strong>${q.leagueGames??0}</strong></span><span class="metric-chip">Qualidade dos dados (não do modelo)<strong>${q.dataScore!=null?Math.round(100*q.dataScore)+'%':'—'}</strong></span></div>`;}
function coverage(m){return `<div class="agent-list">${Object.entries(m.rates||{}).map(([key,r])=>{
 const names={goals:'Golos',half:'Golos ao intervalo',corners:'Cantos',yellows:'Cartões amarelos',shots:'Remates',sot:'Remates à baliza'};
 return `<div class="agent"><b>${esc(names[key]||key)} ${r.ready?'· disponível':'· insuficiente'}</b><p>${r.ready?`Expectativa casa ${dec(r.home)} · fora ${dec(r.away)}. Recortes com dados: ${r.coverage.home} em casa, ${r.coverage.away} fora. Amostra efetiva: ${r.effectiveSamples?.home??'—'} / ${r.effectiveSamples?.away??'—'}. Variação de teste: ±${Math.round((r.uncertainty??0)*100)}%. ${key==='goals'||key==='half'?'Distribuição Poisson.':'Dispersão modelada: '+dec(r.dispersion)+'.'}`:`Registos com estes dados: ${r.coverage?.home??0} em casa, ${r.coverage?.away??0} fora. Não calculamos probabilidades deste mercado.`}</p></div>`;
 }).join('')}</div>`;}
function manualForm(){const groupNames={h2h:'RESULTADO FINAL',dc:'DUPLA HIPÓTESE',dnb:'EMPATE ANULA',btts:'AMBAS MARCAM',totals:'GOLOS TOTAIS',team_goals:'GOLOS EQUIPA',half_totals:'PRIMEIRA PARTE',corners:'CANTOS',team_corners:'CANTOS EQUIPA',cards:'CARTÕES AMARELOS',shots:'REMATES',sot:'REMATES À BALIZA'};
 const groups={};for(const option of info.markets||[])(groups[option.market]??=[]).push(option);
 const select=Object.entries(groups).map(([k,list])=>`<optgroup label="${esc(groupNames[k]||k)}">${list.map(o=>`<option value="${esc(o.id)}" ${o.market==='totals'&&o.point===2.5&&o.selection==='over'?'selected':''}>${esc(o.label)}</option>`).join('')}</optgroup>`).join('');
 return `<section class="manual"><div class="manual-title"><h3>↗ Testar qualquer mercado contra uma odd atual</h3><small>${(info.markets||[]).length} seleções modeladas · nem todas têm dados</small></div><form id="manual-form"><select class="market-selector" id="manual-option" aria-label="Mercado">${select}</select><input id="manual-odd" placeholder="Odd: 1,85" inputmode="decimal" required aria-label="Odd"><button class="action" type="submit">Avaliar odd ↗</button></form><div class="hint">Confirma a odd e o mercado na casa de apostas. O sistema não sabe se uma odd introduzida manualmente ainda está disponível.</div></section>`;}
function bindManual(){const f=el('manual-form');if(!f)return;f.onsubmit=async e=>{e.preventDefault();if(!lastFixture)return;
 const manual={optionId:el('manual-option').value,odd:el('manual-odd').value};try{el('manual-results').innerHTML=loading('A calcular com esta odd...');
 const r=await api('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league,fixture:lastFixture,manual,mode:mode()})});
 el('manual-results').innerHTML=r.offers.length?`<h3 class="subhead">Comparação com a tua odd</h3>${r.offers.map(oddsCard).join('')}`:empty('Não é possível avaliar este mercado','Não existem dados suficientes, ou este mercado não pode ser estimado nesta liga.','∅');
 }catch(err){notify(err.message,true);el('manual-results').innerHTML='';}};}
function renderAnalysis(result){const m=result.estimate,f=result.fixture;lastFixture=f;
 let html=`<section class="result resultbox"><div class="resulttop"><div><div class="overline">ANÁLISE · ${esc(date(f.date))} · ${esc(result.leagueInfo?.name||'')}</div><h2>${esc(f.home)} <span style="color:#7e95a7">vs.</span> ${esc(f.away)}</h2></div><span class="tag neutral">PRÉ-JOGO</span></div>${quality(m)}`;
 if(m.ready){html+=`<div class="metric-row"><span class="metric-chip">Golos esperados casa<strong>${dec(m.rates.goals.home)}</strong></span><span class="metric-chip">Golos esperados fora<strong>${dec(m.rates.goals.away)}</strong></span><span class="metric-chip">Vitória casa*<strong>${pc(m.prob.home)}</strong></span><span class="metric-chip">Empate*<strong>${pc(m.prob.draw)}</strong></span><span class="metric-chip">Vitória fora*<strong>${pc(m.prob.away)}</strong></span></div>`;
  html+=`<div class="warning-line">Probabilidades exploratórias, não calibradas. ${esc(m.caveats?.join(' ')||'')}</div>`;
 }else html+=`<div class="warning-line">Estimativa indisponível: ${esc((m.reasons||[]).join(' '))}</div>`;
 html+=`<button class="details-toggle" id="coverage-toggle">Ver a cobertura de cada estatística ↓</button><div id="coverage-panel" class="hide">${coverage(m)}</div></section>`;
 if(result.oddsProblem)html+=`<div class="warning-line">${esc(result.oddsProblem)}</div>`;
 const good=result.offers.filter(x=>x.status==='POTENCIAL'),watch=result.offers.filter(x=>x.status==='OBSERVAR'),manual=result.offers.filter(x=>x.status==='CONFIRMAR'),hint=result.offers.filter(x=>x.status==='INDICATIVA');
 if(good.length)html+=`<h3 class="subhead">Candidatos experimentais com odds da API (${good.length})</h3>${good.slice(0,10).map(oddsCard).join('')}`;
 if(watch.length)html+=`<h3 class="subhead">Observação com preço atual (${watch.length}) — não são entradas</h3>${watch.slice(0,8).map(oddsCard).join('')}`;
 if(manual.length)html+=`<h3 class="subhead">Avaliação manual — confirmar preço (${manual.length})</h3>${manual.slice(0,6).map(oddsCard).join('')}`;
 if(hint.length)html+=`<h3 class="subhead">Preços CSV para confirmar (${hint.length})</h3>${hint.slice(0,8).map(oddsCard).join('')}`;
 if(!good.length&&!watch.length&&!manual.length&&!hint.length)html+=empty('Não há candidatos com valor identificado','Não apareceu vantagem que cumpra os filtros ou faltam preços atuais. Podes testar qualquer outro mercado com uma odd manual.','∅');
 const failed=result.offers.filter(x=>x.status==='REJEITAR');if(failed.length)html+=`<button class="details-toggle" id="rejected-toggle">Ver ${failed.length} mercados excluídos ↓</button><div id="rejected-panel" class="hide">${failed.slice(0,12).map(oddsCard).join('')}</div>`;
 html+=manualForm()+'<div id="manual-results"></div>';
 el('analysis-panel').innerHTML=html;bindManual();for(const [b,d] of [['coverage-toggle','coverage-panel'],['rejected-toggle','rejected-panel']])if(el(b))el(b).onclick=()=>el(d).classList.toggle('hide');}
function renderRadar(result){const all=result.items.flatMap(x=>x.items.map(a=>({...a,leagueName:x.name,leagueCode:x.league,country:x.country}))).filter(x=>x.top.length);
 all.sort((a,b)=>Number(b.top.some(x=>x.status==='POTENCIAL'))-Number(a.top.some(x=>x.status==='POTENCIAL'))||(b.top[0]?.benchmarkEdge||0)-(a.top[0]?.benchmarkEdge||0)||(b.top[0]?.evSafe||0)-(a.top[0]?.evSafe||0));
 let html=`<div class="radar-summary"><div><small>Jogos com dados</small><strong>${result.analyzed}</strong></div><div><small>Preços processados</small><strong>${result.totalOffersChecked??0}</strong></div><div><small>Candidatos experimentais</small><strong>${result.totalCandidates}</strong></div><div><small>Em observação / Indicativos</small><strong>${result.totalWatch??0} / ${result.totalIndicative??0}</strong></div></div>`;
 html+=`<div class="warning-line">${esc(result.note)} Os cenários representam testes de sensibilidade, não intervalos de confiança. Candidato experimental significa hipótese para verificar, não entrada validada; OBSERVAR = NÃO ENTRAR.</div>`;
 html+=`<div class="market-note"><b>Diagnóstico da procura:</b> ${result.advancedFetched||0} jogos aprofundados · ${result.diagnostic?.reviewed||0} mercados/linhas avaliados · ${result.diagnostic?.rejected||0} rejeitados · ${result.diagnostic?.missingPrices||0} jogos sem odds reconhecidas · ${result.diagnostic?.noConsensus||0} seleções sem consenso comparável. Se aparecem poucos candidatos, a causa pode ser cobertura da API, compatibilidade das linhas ou ausência de preço vantajoso — não é necessariamente falta de jogos.</div>`;
 const dia=result.diagnostic||{};
 const names={ODD_FORA_INTERVALO:'Odd fora do intervalo',PROBABILIDADE:'Probabilidade insuficiente',VALOR_ESPERADO:'Valor esperado insuficiente',CENARIO_ADVERSO:'Cenário adverso desfavorável',DIVERGENCIA_MERCADO:'Modelo discorda das casas',COBERTURA_INSUFICIENTE:'Cobertura estatística fraca',ODD_SEM_HORA:'Preço sem hora'};
 const ranked=Object.entries(dia.failures||{}).sort((a,b)=>b[1]-a[1]);
 const markets=Object.entries(dia.marketsEvaluated||{}).sort((a,b)=>b[1]-a[1]);
 const feedError=(dia.leaguesWithFeedErrors||[]).map(x=>`${esc(x.league)}: ${esc(x.message)}`).join(' · ');
 html+=`<section class="result resultbox"><div class="overline">AUDITORIA DO RADAR</div><h3>Onde desaparecem as oportunidades?</h3><button class="smallbtn" id="copy-diagnostic" type="button">Copiar diagnóstico para partilhar ↗</button><div class="radar-summary"><div><small>Jogos recebidos da API</small><strong>${dia.feedGames||0}</strong></div><div><small>Jogos sem modelo pronto</small><strong>${dia.insufficientHistory||0}</strong></div><div><small>Preços sem modelo compatível</small><strong>${dia.notEvaluable||0}</strong></div><div><small>Cotações agrupadas por seleção</small><strong>${dia.groupedBookmakerPrices||0}</strong></div><div><small>Preços com modelo compatível</small><strong>${dia.modelCompatiblePrices||0}</strong></div><div><small>Ligas sem identificador de odds</small><strong>${(dia.leaguesWithoutOdds||[]).length}</strong></div></div>
 <p class="hint">As odds de várias casas para a mesma seleção são agrupadas numa comparação. Essas cotações já têm modelo e não são falhas. Os motivos de rejeição podem acumular-se na mesma seleção.</p>
 <div class="mini-list">${ranked.length?ranked.slice(0,7).map(([k,n])=>`<div class="mini-pick"><span>${esc(names[k]||k)}</span><b>${n}</b></div>`).join(''):'<div class="mini-pick"><span>Ainda não existem rejeições classificadas para este lote</span></div>'}</div>
 <div class="overline" style="margin-top:16px">MERCADOS SEM ESTATÍSTICAS COMPATÍVEIS</div><div class="mini-list">${Object.entries(dia.unsupportedMarkets||{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([m,n])=>`<div class="mini-pick"><span>${esc(m)}</span><b>${n}</b></div>`).join('')||'<div class="mini-pick">Todos os preços reconhecidos tinham um modelo compatível.</div>'}</div>
 <div class="overline" style="margin-top:16px">AMOSTRAS DE JOGOS SEM HISTÓRICO / MODELO PRONTO</div><div class="mini-list">${(dia.historySamples||[]).slice(0,8).map(g=>`<div class="mini-pick"><span><b>${esc(g.league)}</b> · ${esc(g.home)} vs. ${esc(g.away)} · ${esc(g.date)}<br>Jogos encontrados: casa ${g.homeGames}, fora ${g.awayGames}</span><span>${esc((g.reasons||[]).join('; '))}</span></div>`).join('')||'<div class="mini-pick">Nenhuma falha de histórico registada neste lote.</div>'}</div>
 <div class="overline" style="margin-top:16px">MERCADOS EFETIVAMENTE AVALIADOS</div><div class="mini-list">${markets.length?markets.map(([name,num])=>`<div class="mini-pick"><span>${esc(name)}</span><b>${num}</b></div>`).join(''):'<div class="mini-pick">Nenhum mercado com dados compatíveis</div>'}</div>
 ${(dia.leaguesWithoutOdds||[]).length?`<p class="hint">Sem chave de odds configurada na aplicação para: ${esc(dia.leaguesWithoutOdds.join(', '))}. Só poderão surgir preços indicativos, quando existirem.</p>`:''}
 ${feedError?`<p class="hint">Erros do fornecedor de odds: ${feedError}</p>`:''}
 <p class="hint"><b>Portugal:</b> o feed europeu inclui casas de diferentes países e não confirma a disponibilidade legal ou efetiva das odds numa casa portuguesa. Nunca tratar estas cotações como entradas executáveis sem confirmação.</p></section>`;
 if(!all.length)html+=empty('Não foram encontrados sinais com a cobertura atual',result.totalOffersChecked?('Foram avaliados '+result.totalOffersChecked+' preços, mas nenhum passou os filtros. Não forçamos entradas: escolhe mais jogos, mercados avançados ou procura melhores odds noutras casas.'):('Não surgiram odds compatíveis. Se ainda não configuraste The Odds API, o radar só usa preços CSV quando existem. Não existe entrada verificável sem preço atual.'),'∅');
 else html+=all.slice(0,30).map(x=>`<section class="result resultbox"><div class="resulttop"><div><div class="overline">${esc(x.leagueName)} · ${esc(date(x.fixture.date))}</div><div class="fixture-title">${esc(x.fixture.home)} vs. ${esc(x.fixture.away)}</div></div><span class="tag ${x.oddsKind==='snapshot'?'warn':''}">${x.oddsKind==='snapshot'?'ODDS INDICATIVAS':'ODDS DA API'}</span></div><div class="mini-list" style="margin-top:14px">${x.top.map(o=>`<div class="mini-pick"><b>${esc(o.label)} · ${o.status==='POTENCIAL'?'CANDIDATO EXPERIMENTAL':o.status==='OBSERVAR'?'OBSERVAR, NÃO ENTRAR':'PREÇO INDICATIVO'}</b><span>Odd ${dec(o.odd)} · P central ${pc(o.p)} · EV central* ${o.ev>=0?'+':''}${dec(o.ev*100,1)}% · EV cenário adverso* ${o.evSafe>=0?'+':''}${dec(o.evSafe*100,1)}% · ${esc(o.bookmaker)}${o.benchmark?' · Consenso '+pc(o.benchmark.fair)+' ('+o.benchmark.bookmakers+' casas) · Diferença preço '+(o.benchmarkEdge>=0?'+':'')+dec(o.benchmarkEdge*100,1)+'%':' · Sem consenso comparável'}</span></div>`).join('')}</div><button class="smallbtn radar-open" data-league="${esc(x.leagueCode)}" data-fixture="${esc(x.fixture.id)}">Analisar este jogo ↗</button></section>`).join('');
 html+=`<h3 class="subhead">Cobertura por liga</h3><div class="mini-list">${result.items.map(x=>`<div class="mini-pick"><span>${esc(x.country)} · <b>${esc(x.name)}</b></span><span>${x.totalEvents} jogos · ${x.analyzed} analisados · ${x.offersChecked||0} preços · ${x.advancedFetched||0} jogos aprofundados · ${x.candidates} sinais · ${x.watch||0} observar · ${x.indicative||0} indicativos · ${x.insufficient||0} sem histórico suficiente${x.error?' · '+esc(x.error):''}</span></div>`).join('')}${result.errors.map(x=>`<div class="mini-pick"><span>${esc(info.leagues[x.league]?.name||x.league)}</span><span>${esc(x.message)}</span></div>`).join('')}</div>`;
 el('radar-panel').innerHTML=html;
 const copy=el('copy-diagnostic');if(copy)copy.onclick=async()=>{
  const safe={hora:new Date().toISOString(),versao:'3.1',modo:mode(),resumo:{ligas:result.leagues,analisados:result.analyzed,candidatos:result.totalCandidates,emObservacao:result.totalWatch,precos:result.totalOffersChecked},diagnostico:result.diagnostic,porLiga:result.items.map(x=>({liga:x.name,jogos:x.totalEvents,analisados:x.analyzed,precos:x.offersChecked,candidatos:x.candidates,diagnostico:x.diagnostic}))};
  try{await navigator.clipboard.writeText(JSON.stringify(safe,null,2));copy.textContent='Diagnóstico copiado ✓';}
  catch{copy.textContent='Cópia indisponível neste navegador';}
 };
 for(const btn of el('radar-panel').querySelectorAll('.radar-open'))btn.onclick=async()=>{
  league=btn.dataset.league;el('league').value=league;await loadFixtures();el('fixture').value=btn.dataset.fixture;
  if(!el('fixture').value){notify('O jogo está no feed de odds mas não entrou no calendário da liga. Tenta outro encontro.',true);return;}
  showScreen('match');await analyze();};}
function showScreen(screen){currentScreen=screen;for(const b of document.querySelectorAll('.nav'))b.classList.toggle('active',b.dataset.screen===screen);
 el('lab-screen').hidden=screen!=='lab';el('stat-screen').hidden=screen!=='stats';el('radar-screen').hidden=screen!=='radar';el('radar-shared').hidden=screen==='match';el('odds-mode-panel').hidden=screen==='stats'||screen==='lab';el('match-screen').hidden=screen!=='match';if(info.leagues){el('min-prob').textContent=screen==='stats'||screen==='lab'?'Sem odds':mode()==='balanced'?'Equilibrado':'Conservador';el('api-state').textContent=screen==='stats'||screen==='lab'?'Introdução manual':info.configured?'API configurada':'Sem API';}notify('');}
async function loadFixtures(){const select=el('fixture');select.innerHTML='<option value="">A carregar encontros...</option>';fixtures=[];
 try{const r=await api('/api/fixtures?league='+encodeURIComponent(league));fixtures=r.fixtures;
 select.innerHTML=fixtures.length?fixtures.map(f=>`<option value="${esc(f.id)}">${esc(date(f.date))} · ${esc(f.home)} — ${esc(f.away)}</option>`).join(''):'<option value="">Sem jogos futuros nesta fonte</option>';
 if(!fixtures.length)notify('Não aparecem jogos futuros nesta competição. O calendário depende da atualização dos fornecedores.',true);
 }catch(e){select.innerHTML='<option value="">Fonte indisponível</option>';notify(e.message,true);}}
async function analyze(){const fixture=fixtures.find(f=>f.id===el('fixture').value);if(!fixture){notify('Seleciona um jogo do calendário.',true);return;}
 const btn=el('analyze');btn.disabled=true;notify('');el('analysis-panel').innerHTML=loading('A verificar históricos, modelos e odds...');
 try{const result=await api('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league,fixture,extended:el('extended').checked,mode:mode()})});renderAnalysis(result);}catch(e){notify(e.message,true);el('analysis-panel').innerHTML=empty('Não foi possível completar a análise',e.message,'!');}finally{btn.disabled=false;}}
async function scan(){if(!selected.size){notify('Seleciona pelo menos uma competição.',true);return;}
 const advanced=el('radar-extended').checked;const deepGames=Number(el('deep-games').value)||4;if(selected.size>(advanced?3:12)){notify(advanced?'O radar avançado permite no máximo 3 ligas por pedido, por consumir mais créditos.':'Seleciona no máximo 12 ligas por pesquisa. As restantes podem ser consultadas num segundo lote.',true);return;}
 if(advanced&&!info.configured){notify('O radar aprofundado exige uma chave de odds da API. Desativa-o ou configura a chave.',true);return;}
 if(advanced){const upper=selected.size*deepGames*11;if(!window.confirm(`O radar aprofundado poderá usar até cerca de ${upper} créditos adicionais (mais a pesquisa normal) se houver cobertura para os 11 mercados. Prosseguir?`))return;}
 const btn=el('scan');btn.disabled=true;notify('');el('radar-panel').innerHTML=loading(`A investigar ${selected.size} competições em sequência. A primeira recolha pode ser demorada...`);
 try{const result=await api('/api/radar?leagues='+encodeURIComponent([...selected].join(','))+'&advanced='+advanced+'&deepGames='+deepGames+'&mode='+encodeURIComponent(mode()));renderRadar(result);}
 catch(e){notify(e.message,true);el('radar-panel').innerHTML=empty('Erro na pesquisa',e.message,'!');}finally{btn.disabled=false;}}
function formatEvidence(v){return v?.total?`${v.wins}/${v.total}${v.pushes?' · '+v.pushes+' reembolsos':''}`:'Sem registos';}
function statCandidateItem(c,gi,ci){
 const first=c.position==='PRINCIPAL',e=c.evidence||{},warnings=c.warnings||[];
 return `<div class="stat-candidate ${first?'main-pick':''}"><div class="stat-candidate-main"><div><b>${esc(c.label)}</b><small>Amostra estatística: ${c.samples.home} casa · ${c.samples.away} fora · Sensibilidade ${esc(c.sensitivity.toLowerCase())}</small></div><span class="tag ${c.inTargetBand&&first?'primary-pick':'neutral'}">${first?(c.inTargetBand?'1.ª OPÇÃO NA FAIXA · PARA COTAR':'FORA DA FAIXA · SÓ PARA COMPARAR'):'ALTERNATIVA · PARA COTAR'}</span></div>
 <div class="stat-form-summary"><span><strong>Últimos jogos em casa</strong><b>${formatEvidence(e.home)}</b></span><span><strong>Últimos jogos fora</strong><b>${formatEvidence(e.away)}</b></span><span><strong>Descanso até ao jogo</strong><b>${e.restHome==null?'—':e.restHome+' dias'} / ${e.restAway==null?'—':e.restAway+' dias'}</b></span></div>
 <p class="evidence-note">${!c.inTargetBand?'<b>Fora da faixa de odds escolhida.</b> Não foi encontrado um mercado principal nessa faixa. ':''}As frequências referem-se à seleção neste tipo de encontro (casa/fora), não são a probabilidade real prevista. ${warnings.length?esc(warnings.join(' ')):'As frequências recentes são apenas um dado adicional.'}</p>
 <div class="stat-measures"><span><small>Estimativa do modelo*</small><b>${pc(c.p)}</b></span><span><small>Cenário baixo*</small><b>${pc(c.pLow)}</b></span><span><small>Odd justa*</small><b>${dec(c.oddFair)}</b></span><span class="target"><small>Odd mínima para avaliar*</small><b>${dec(c.oddTarget)}</b></span></div>
 <form class="stat-price-form" data-i="${gi}" data-j="${ci}"><label for="stat-price-${gi}-${ci}">Odd da tua casa:</label><input id="stat-price-${gi}-${ci}" inputmode="decimal" placeholder="ex.: 1,85" required><button class="action" type="submit">Validar preço ↗</button></form><div class="stat-validation" aria-live="polite"></div></div>`;
}
function statValidation(r){const v=r.validation;return `<div class="${v.status==='POTENCIAL'?'watch-line':'warning-line'}"><b>${v.status==='POTENCIAL'?'PREÇO PASSOU A TRIAGEM — NÃO É ENTRADA VALIDADA':'OBSERVAR — NÃO ENTRAR'}</b><div class="stat-facts">Odd ${dec(v.odd)} · Odd mínima teórica ${dec(v.targetOdd)} · Prob. mínima para não perder ${pc(v.breakEven)} · P do modelo* ${pc(v.probability)} · EV central* ${v.ev>=0?'+':''}${dec(v.ev*100,1)}% · EV cenário baixo* ${v.evLow>=0?'+':''}${dec(v.evLow*100,1)}%</div><p>${v.shortfall>0?'A odd da casa está '+dec(v.shortfall)+' abaixo da odd mínima experimental. ':''}${esc(v.reason)} Lesões, onzes, notícias e precisão do modelo não estão verificados. A cotação foi introduzida manualmente.</p></div>`;}
function renderStatRadar(r){
 const list=r.games||[];
 let html=`<div class="radar-summary"><div><small>Jogos no calendário</small><strong>${r.fixturesSeen??0}</strong></div><div><small>Jogos com 1.ª opção</small><strong>${r.gamesWithCandidates??0}</strong></div><div><small>Mercados alternativos</small><strong>${Math.max(0,(r.candidatesFound||0)-(r.gamesWithCandidates||0))}</strong></div><div><small>Sem dados/mercado suficiente</small><strong>${(r.withoutHistory??0)+(r.withoutCandidates??0)}</strong></div></div><div class="market-note"><b>Nova lógica:</b> para cada jogo analisável, uma <b>1.ª escolha dentro da faixa pretendida</b>, quando existir, e alternativas. Prioriza a odd mínima teórica do perfil selecionado, consistência casa/fora e amplitude de cenários. Não prevê preços de casas. <b>Não é uma entrada automaticamente boa</b>: só podemos avaliar valor quando introduzires a odd, e as probabilidades ainda não foram validadas.</div>`;
 if(!list.length)html+=empty('Não há jogos no calendário nesta seleção','Experimenta outras ligas ou datas. Não serão criadas apostas sem jogos ou históricos.','∅');
 else html+=list.map((g,gi)=>`<section class="result resultbox stat-game ${g.candidates.length?'':'no-data'}"><div class="resulttop"><div><div class="overline">${esc(g.country)} · ${esc(g.leagueName)} · ${esc(date(g.fixture.date))}</div><div class="fixture-title">${esc(g.fixture.home)} vs. ${esc(g.fixture.away)}</div></div><span class="tag ${g.candidates.length?'neutral':'warn'}">${g.candidates.length?Math.round((g.quality?.dataScore??0)*100)+'% cobertura':'SEM SELEÇÃO FUNDAMENTADA'}</span></div>
 ${g.candidates.length?`<p class="source-hint">Primeira escolha abaixo. A seleção é para procurar preço, não para apostar automaticamente. Sem verificação de lesões, onzes, notícias ou hora de início${g.fixture.time?' (hora indicada: '+esc(g.fixture.time)+')':''}.</p><div class="stat-market-list">${statCandidateItem(g.candidates[0],gi,0)}${g.candidates.length>1?`<details class="alternative-list"><summary>Ver ${g.candidates.length-1} alternativas estatísticas para este jogo</summary>${g.candidates.slice(1).map((c,i)=>statCandidateItem(c,gi,i+1)).join('')}</details>`:''}</div>`:
 `<p class="warning-line">${esc(g.reason||'Não há histórico ou mercado com dados suficientes para avaliar de forma responsável.')} Não vou inventar uma recomendação para este encontro.</p>`}</section>`).join('');
 if(r.gamesTruncated)html+=`<p class="warning-line">Existem mais ${r.gamesTruncated} jogos fora desta página. Seleciona menos ligas por pesquisa para os analisar.</p>`;
 if(r.failures?.length)html+=`<h3 class="subhead">Ligas sem calendário utilizável</h3><div class="mini-list">${r.failures.map(x=>`<div class="mini-pick"><span>${esc(info.leagues[x.league]?.name||x.league)}</span><span>${esc(x.detail)}</span></div>`).join('')}</div>`;
 html+=`<p class="hint">* Probabilidades experimentais sem calibração preditiva. «Primeira escolha» significa melhor opção relativa entre as que o modelo conseguiu calcular, não uma aposta com valor comprovado. Cartões não aparecem neste radar para Portugal.</p>`;
 el('stat-panel').innerHTML=html;
 for(const form of el('stat-panel').querySelectorAll('.stat-price-form'))form.onsubmit=async ev=>{
  ev.preventDefault();const g=list[Number(form.dataset.i)],c=g?.candidates[Number(form.dataset.j)];if(!g||!c)return;
  const dest=form.parentElement.querySelector('.stat-validation'),odd=form.querySelector('input').value;
  const btn=form.querySelector('button');btn.disabled=true;dest.innerHTML=loading('A verificar odd introduzida...');
  try{const data=await api('/api/stats-validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league:g.fixture.league,fixture:g.fixture,optionId:c.optionId,odd})});dest.innerHTML=statValidation(data);}
  catch(err){dest.innerHTML=`<div class="warning-line">${esc(err.message)}</div>`;}finally{btn.disabled=false;}
 };
}
async function scanStat(){if(!selected.size){notify('Seleciona pelo menos uma competição.',true);return;}
 if(selected.size>12){notify('Seleciona no máximo 12 ligas por pesquisa.',true);return;}
 const profile=el('quote-profile').value;
 const btn=el('stat-scan');btn.disabled=true;notify('');el('stat-panel').innerHTML=loading('A consultar históricos e a ordenar mercados, sem pedidos à API de odds...');
 try{const r=await api('/api/stats-radar?leagues='+encodeURIComponent([...selected].join(','))+'&profile='+encodeURIComponent(profile));renderStatRadar(r);}
 catch(err){notify(err.message,true);el('stat-panel').innerHTML=empty('Não foi possível executar o radar',err.message,'!');}finally{btn.disabled=false;}}

// V4: pesquisa diversificada e múltiplas. Guardar apenas nesta sessão de análise.
let labGames=[],slip=[],validatedOffers=[];
function labMarket(m,gi,mi){
 const evidence=m.evidence?.combined;
 return `<article class="lab-market"><div class="stat-candidate-main"><div><b>${esc(m.label)}</b><small>${esc(m.family)} · Casa/Fora recentes: ${esc(m.coverage||'sem recorte')}</small></div><span class="tag neutral">PARA COTAR</span></div>
 <div class="lab-stats"><span>Estimativa*: <b>${pc(m.probability)}</b></span><span>Cenário baixo*: <b>${pc(m.low)}</b></span><span>Odd mínima experimental*: <b>${dec(m.oddTarget)}</b></span><span>Qualidade dos dados: <b>${pc(m.quality)}</b></span></div>
 ${m.warnings?.length?`<p class="smalltext">Atenção: ${esc(m.warnings.join(' · '))}</p>`:''}
 <form class="lab-market-form" data-game="${gi}" data-market="${mi}"><label>Odd real:</label><input required inputmode="decimal" placeholder="1,85" aria-label="Odd da casa"><button type="submit" class="action">Comparar preço</button></form><div class="lab-price-response"></div></article>`;
}
function renderLab(report){
 labGames=report.games||[];
 let html=`<div class="radar-summary"><div><small>Jogos recebidos</small><strong>${report.seen||0}</strong></div><div><small>Com mercados modeláveis</small><strong>${report.withMarkets||0}</strong></div><div><small>Mercados apresentados</small><strong>${labGames.reduce((n,g)=>n+g.markets.length,0)}</strong></div><div><small>Sem dados suficientes</small><strong>${report.missing||0}</strong></div></div>`;
 if(!labGames.length)html+=empty('Sem jogos futuros','Experimenta mais ligas. Não vamos inventar jogos ou preços.');
 else html+=labGames.map((g,gi)=>`<section class="result resultbox"><div class="resulttop"><div><div class="overline">${esc(g.leagueName)} · ${esc(date(g.fixture.date))}</div><div class="fixture-title">${esc(g.fixture.home)} vs. ${esc(g.fixture.away)}</div></div><span class="tag neutral">${g.markets.length} linhas para cotar</span></div>
 ${g.markets.length?`<p class="source-hint">Várias hipóteses para explorar; o valor só pode ser estudado com a odd real. Estatísticas anteriores à partida, sem notícias ou lesões verificadas.</p>
 <div class="lab-list">${g.markets.slice(0,3).map((m,mi)=>labMarket(m,gi,mi)).join('')}</div>${g.markets.length>3?`<details class="alternative-list"><summary>Ver mais ${g.markets.length-3} mercados e linhas deste jogo</summary><div class="lab-list">${g.markets.slice(3).map((m,i)=>labMarket(m,gi,i+3)).join('')}</div></details>`:''}`:
 `<div class="warning-line">${esc(g.reason||'Dados insuficientes.')}</div>`}</section>`).join('');
 if(report.truncated)html+=`<p class="warning-line">Existem mais ${report.truncated} jogos. Pesquisa menos ligas para os veres.</p>`;
 if(report.errors?.length)html+=`<h3 class="subhead">Avisos das fontes</h3>${report.errors.map(e=>`<p class="warning-line">${esc(e.league)}: ${esc(e.message)}</p>`).join('')}`;
 html+=`<div class="market-note">* Probabilidades, cenários e odds mínimas são estimativas não calibradas. Odds introduzidas manualmente não podem ser verificadas automaticamente. Não há garantia de boas entradas em todos os jogos.</div>`;
 el('lab-results').innerHTML=html;
 for(const form of el('lab-results').querySelectorAll('.lab-market-form'))form.onsubmit=async ev=>{
  ev.preventDefault();const gi=Number(form.dataset.game),mi=Number(form.dataset.market),g=labGames[gi],m=g?.markets[mi];if(!m)return;
  const price=form.querySelector('input').value,out=form.parentElement.querySelector('.lab-price-response');
  const button=form.querySelector('button');button.disabled=true;out.innerHTML=loading('A calcular...');
  try{
   const data=await api('/api/stats-validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({league:g.fixture.league,fixture:g.fixture,optionId:m.optionId,odd:price})});
   const v=data.validation;
   const item={key:`${g.fixture.date}|${g.fixture.home}|${g.fixture.away}`,fixture:g.fixture,league:g.fixture.league,optionId:m.optionId,label:m.label,odd:v.odd,p:v.probability,ev:v.ev,status:v.status,pLow:v.sensitivityLow};
   validatedOffers=validatedOffers.filter(x=>!(x.key===item.key&&x.optionId===item.optionId));validatedOffers.push(item);
   out.innerHTML=`<div class="${v.status==='POTENCIAL'?'market-note':'warning-line'}"><b>${v.status==='POTENCIAL'?'PREÇO PASSOU A TRIAGEM EXPERIMENTAL':'OBSERVAR — NÃO ENTRAR'}</b><p>Odd ${dec(v.odd)} · Probabilidade ${pc(v.probability)} · EV central* ${v.ev>=0?'+':''}${dec(v.ev*100,1)}% · EV cenário baixo* ${v.evLow>=0?'+':''}${dec(v.evLow*100,1)}%</p><p>${esc(v.reason)}</p><button class="lab-add smallbtn" type="button">Adicionar ao construtor (simulação) +</button></div>`;
   out.querySelector('.lab-add').onclick=()=>{const key=`${g.fixture.date}|${g.fixture.home}|${g.fixture.away}`;
    if(slip.some(x=>x.key===key)){out.insertAdjacentHTML('beforeend','<p class="warning-line">Já existe uma seleção deste jogo no boletim. Remove-a antes de trocar a linha.</p>');return;}
    if(slip.length>=4){out.insertAdjacentHTML('beforeend','<p class="warning-line">Máximo de 4 jogos diferentes no boletim.</p>');return;}
    slip.push(item);renderSlip();
   };
  }catch(err){out.innerHTML=`<div class="warning-line">${esc(err.message)}</div>`;}finally{button.disabled=false;}
 };
}
function renderSlip(){
 const node=el('lab-slip-items');
 node.innerHTML=slip.length?slip.map((s,i)=>`<div class="mini-pick"><div><b>${esc(s.fixture.home)} vs. ${esc(s.fixture.away)}</b><p class="smalltext">${esc(s.label)} · Odd ${dec(s.odd)} · EV individual* ${s.ev>=0?'+':''}${dec(s.ev*100,1)}% · ${s.status==='POTENCIAL'?'Triagem experimental':'Observar — não entrar'}</p></div><button class="smallbtn" data-index="${i}" type="button">Remover ×</button></div>`).join(''):
 `<div class="empty"><span class="empty-icon">⊕</span><h3>Sem seleções no boletim</h3><p>Compara primeiro as odds reais dos mercados acima e adiciona de dois a quatro jogos diferentes.</p></div>`;
 for(const b of node.querySelectorAll('button[data-index]'))b.onclick=()=>{slip.splice(Number(b.dataset.index),1);renderSlip();el('lab-multiple-result').innerHTML='';};
 if(slip.length>=2)el('lab-multiple-odd').placeholder='Produto individual: '+dec(slip.reduce((a,b)=>a*b.odd,1));
}
function autoMultiple(){
 const count=Number(el('lab-auto-size').value),dest=el('lab-auto-status');
 const options=validatedOffers.filter(x=>x.status==='POTENCIAL'&&x.ev>0&&x.pLow>.15)
  .sort((a,b)=>(b.ev-.35*(b.p-b.pLow))-(a.ev-.35*(a.p-a.pLow)));
 const chosen=[],seen=new Set();
 for(const o of options){if(seen.has(o.key))continue;chosen.push(o);seen.add(o.key);if(chosen.length===count)break;}
 if(chosen.length<count){dest.innerHTML='<div class="warning-line">Ainda não existem preços experimentais suficientes de jogos diferentes. Compara mais odds antes de construir a múltipla; não vamos inventar seleções.</div>';return;}
 slip=chosen;renderSlip();dest.innerHTML=`<div class="market-note">Sugestão montada com ${count} jogos diferentes e preços introduzidos por ti. Confirma cada cotação, verifica a odd combinada que a casa oferece e avalia a múltipla. Não é uma entrada validada.</div>`;
 el('lab-multiple-result').innerHTML='';
}
async function calculateSlip(ev){ev.preventDefault();const out=el('lab-multiple-result');
 if(slip.length<2){out.innerHTML='<div class="warning-line">Adiciona pelo menos dois jogos diferentes.</div>';return;}
 const odd=el('lab-multiple-odd').value;out.innerHTML=loading('A verificar os jogos e calcular a múltipla...');
 try{
  const r=await api('/api/multiple-evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legs:slip.map(({fixture,league,optionId,odd})=>({fixture,league,optionId,odd})),totalOdd:odd})});
  const v=r.evaluation;out.innerHTML=`<div class="${v.verdict==='HIPOTESE'?'market-note':'warning-line'}"><b>${v.verdict==='HIPOTESE'?'MÚLTIPLA PASSOU A TRIAGEM EXPERIMENTAL — NÃO VALIDADA':'OBSERVAR — NÃO ENTRAR'}</b><div class="lab-stats"><span>Odd total: <b>${dec(v.odd)}</b></span><span>Prob. conjunta*: <b>${pc(v.probability)}</b></span><span>EV central*: <b>${v.ev>=0?'+':''}${dec(v.ev*100,1)}%</b></span><span>EV adverso*: <b>${v.evScenarioLow>=0?'+':''}${dec(v.evScenarioLow*100,1)}%</b></span><span>Odd de equilíbrio*: <b>${dec(1/v.probability)}</b></span></div><p>${esc(v.why)}</p><p>${esc(v.cautions.join(' '))}</p></div>`;
 }catch(err){out.innerHTML=`<div class="warning-line">${esc(err.message)}</div>`;}
}
async function scanLab(){if(!selected.size||selected.size>12){notify('Seleciona entre 1 e 12 ligas.',true);return;}
 const btn=el('lab-scan');btn.disabled=true;notify('');slip=[];validatedOffers=[];renderSlip();el('lab-multiple-result').innerHTML='';
 el('lab-results').innerHTML=loading('A consultar jogos, históricos e mercados em várias ligas...');
 try{renderLab(await api('/api/market-lab?leagues='+encodeURIComponent([...selected].join(','))+'&mode='+encodeURIComponent(el('lab-mode').value)));}
 catch(e){notify(e.message,true);el('lab-results').innerHTML=empty('O radar não conseguiu concluir a pesquisa',e.message,'!');}
 finally{btn.disabled=false;}
}

async function init(){el('topdate').textContent=new Intl.DateTimeFormat('pt-PT',{dateStyle:'full'}).format(new Date());
 for(const b of document.querySelectorAll('.nav'))b.onclick=()=>showScreen(b.dataset.screen);
 el('reload').onclick=()=>loadFixtures();el('analyze').onclick=analyze;el('scan').onclick=scan;el('stat-scan').onclick=scanStat;el('lab-scan').onclick=scanLab;el('lab-auto').onclick=autoMultiple;el('lab-multiple-form').onsubmit=calculateSlip;
 const updateCost=()=>{
  const enabled=el('radar-extended').checked;
  el('deep-games').disabled=!enabled;
  el('depth-panel').classList.toggle('inactive',!enabled);
  const n=Number(el('deep-games').value)||4;
  el('depth-cost').textContent=enabled?`Radar aprofundado ATIVO: até ${n*11} créditos adicionais por liga × número de ligas selecionadas. A cobrança real depende do fornecedor.`:'Radar aprofundado DESATIVADO: não há pedidos de mercados adicionais. Ativa a caixa acima para pesquisar estes mercados.';
 };
 el('radar-extended').onchange=updateCost;
 el('deep-games').onchange=updateCost;updateCost();
 el('default-leagues').onclick=()=>{selected.clear();['E0','E1','P1','SP1','D1','I1','F1','N1','B1','T1'].forEach(x=>selected.add(x));renderChips();};
 el('all-leagues').onclick=()=>{selected.clear();Object.keys(info.leagues||{}).forEach(x=>selected.add(x));renderChips();notify('Para poupar recursos, pesquisa as ligas em lotes de até 12.');};
 el('no-leagues').onclick=()=>{selected.clear();renderChips();};
 try{info=await api('/api/status');el('league-count').textContent=Object.keys(info.leagues).length;
 el('market-count').textContent=new Set(info.markets.map(x=>x.market)).size;
 el('min-prob').textContent=mode()==='balanced'?'Equilibrado':'Conservador';
 const modeSelect=el('mode');if(modeSelect)modeSelect.onchange=()=>{el('min-prob').textContent=mode()==='balanced'?'Equilibrado':'Conservador';notify('Modo alterado. Executa novamente o radar ou a análise para atualizar as classificações.');};
 el('league').innerHTML=Object.entries(info.leagues).map(([k,l])=>`<option value="${esc(k)}">${esc(l.country)} · ${esc(l.name)}</option>`).join('');
 el('league').value=league;el('league').onchange=async()=>{league=el('league').value;await loadFixtures();};
 renderChips();el('api-state').textContent=info.configured?'API configurada':'Sem API';
 el('connection-short').textContent=info.configured?'API odds configurada':'Dados CSV + odds manuais';
 await loadFixtures();renderSlip();showScreen('lab');
 }catch(e){notify('Não foi possível inicializar a aplicação: '+e.message,true);console.error('[Football Value Lab] Erro de inicialização',e);}}
init();
