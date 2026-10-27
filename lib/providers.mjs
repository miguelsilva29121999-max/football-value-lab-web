import {LEAGUES,POLICY,normalizedTeam,estimateMatch,probabilityFor,scoreOffer,marketName,allMarketOptions,policyForMode} from './model.mjs';
import {lisbonToday,filterUpcomingFixtures} from './fixture-time.mjs';
const cache=new Map(),pending=new Map();
const same=(x,y)=>normalizedTeam(x)===normalizedTeam(y);
async function cached(key,ttl,fn){const v=cache.get(key);if(v&&v.exp>Date.now())return v.value;
 if(pending.has(key))return pending.get(key);
 const p=Promise.resolve().then(fn).then(value=>{cache.set(key,{value,exp:Date.now()+ttl});return value;});pending.set(key,p);
 try{return await p;}finally{pending.delete(key);}}
const fetchTimeout=async(url,accept='text/csv',timeout=15000)=>{
 const r=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{Accept:accept,'User-Agent':'FootballValueLab/2.5 (private local research)'}});
 if(!r.ok)throw Error(`Fonte respondeu HTTP ${r.status}`);
 const body=await r.text();if(body.length<30||body.slice(0,100).includes('<!DOCTYPE')||body.slice(0,100).includes('<html'))throw Error('A fonte não devolveu dados CSV válidos.');
 return {body,modified:r.headers.get('last-modified')||null};};
export function parseCSV(raw){
 const rows=[];let row=[],field='',quoted=false;
 const str=String(raw).replace(/^\uFEFF/,'');
 for(let i=0;i<str.length;i++){
  const c=str[i];if(c==='"'){if(quoted&&str[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(field);field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&str[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>v.trim()))rows.push(row);row=[];}
  else field+=c;
 }
 row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 const heads=rows.shift()?.map(x=>x.trim())||[];
 if(!heads.includes('Date')||!heads.includes('HomeTeam'))throw Error('CSV sem colunas de jogos esperadas.');
 return rows.map(r=>Object.fromEntries(heads.map((h,i)=>[h,(r[i]||'').trim()])));
}
export function toDate(date){let m;
 const s=String(date||'').trim();
 if((m=/^(\d{4})-(\d\d)-(\d\d)/.exec(s)))return `${m[1]}-${m[2]}-${m[3]}`;
 if((m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s))){const year=Number(m[3])<100?2000+Number(m[3]):Number(m[3]);
  const mo=Number(m[2]),dd=Number(m[1]);if(dd>=1&&dd<=31&&mo>=1&&mo<=12)return `${year}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}
 return null;}
const num=v=>v===undefined||v===null||String(v).trim()===''?null:Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const matchFields={hg:'FTHG',ag:'FTAG',hhg:'HTHG',hag:'HTAG',hc:'HC',ac:'AC',hy:'HY',ay:'AY',hs:'HS',as:'AS',hst:'HST',ast:'AST'};
export function normalizeCSVMatch(row){
 const date=toDate(row.Date);if(!date||!row.HomeTeam||!row.AwayTeam||num(row.FTHG)===null||num(row.FTAG)===null)return null;
 const v={date,home:row.HomeTeam,away:row.AwayTeam};for(const [to,from] of Object.entries(matchFields))v[to]=num(row[from]);
 if(!Number.isInteger(v.hg)||!Number.isInteger(v.ag)||v.hg>30||v.ag>30)return null;
 return v;}
export function seasonsFor(day){const y=Number(day.slice(0,4)),m=Number(day.slice(5,7));const start=m>=7?y:y-1;return [start,start-1];}
async function csvSeason(league,start){const code=`${String(start).slice(2)}${String(start+1).slice(2)}`;
 const url=`https://www.football-data.co.uk/mmz4281/${code}/${league}.csv`;
 return cached(`season:${league}:${code}`,2*3600e3,async()=>{const data=await fetchTimeout(url);const rows=parseCSV(data.body);return {matches:rows.map(normalizeCSVMatch).filter(Boolean),fixtures:rows.filter(r=>num(r.FTHG)===null&&num(r.FTAG)===null).map(r=>fixtureRow(r,league)).filter(Boolean),url,modified:data.modified};});}
export async function loadFixturesSnapshot(){
 const url='https://www.football-data.co.uk/matches/fixtures.csv';
 return cached('fixtures:football-data',25*60e3,async()=>{
  const {body,modified}=await fetchTimeout(url);const rows=parseCSV(body);
  return {rows,modified,url};
 });}
const normalizeOpen=row=>{
 const score=row.score?.ft;const date=toDate(row.date);if(!date||!Array.isArray(score)||score.length!==2||score.some(x=>!Number.isInteger(x)||x<0))return null;
 return {date,home:row.team1,away:row.team2,hg:score[0],ag:score[1],hhg:null,hag:null,hc:null,ac:null,hy:null,ay:null,hs:null,as:null,hst:null,ast:null};
};
async function openFootball(league,year){const file=LEAGUES[league]?.open;if(!file)return null;
 const season=`${year}-${String(year+1).slice(2)}`,url=`https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${file}.json`;
 return cached(`open:${league}:${season}`,2*3600e3,async()=>{
  const r=await fetch(url,{signal:AbortSignal.timeout(14000)});if(!r.ok)throw Error('OpenFootball indisponível.');
  const data=await r.json();if(!Array.isArray(data.matches))throw Error('Formato OpenFootball inesperado.');
  return {matches:data.matches.map(normalizeOpen).filter(Boolean),fixtures:data.matches.filter(x=>x.date&&x.team1&&x.team2&&!x.score?.ft).map(x=>({league,date:toDate(x.date),home:x.team1,away:x.team2,source:'OpenFootball',timeKnown:false})),url};
 });}
const fixtureRow=(r,league)=>{
 const date=toDate(r.Date);if(!date||!r.HomeTeam||!r.AwayTeam)return null;
 return {id:`${league}|${date}|${encodeURIComponent(r.HomeTeam)}|${encodeURIComponent(r.AwayTeam)}`,
 league,date,home:r.HomeTeam,away:r.AwayTeam,time:r.Time||null,source:'Football-Data',timeKnown:!!r.Time};};
export async function loadLeague(league,now=new Date()){
 if(!LEAGUES[league])throw Error('Competição inválida.');
 const today=lisbonToday(now),starts=seasonsFor(today);
 const [season0,season1,snapshot]=await Promise.allSettled([csvSeason(league,starts[0]),csvSeason(league,starts[1]),loadFixturesSnapshot()]);
 const seasons=[season0,season1].filter(r=>r.status==='fulfilled').map(r=>r.value),issues=[];
 for(const r of [season0,season1])if(r.status==='rejected')issues.push(r.reason.message);
 const fixturesRows=snapshot.status==='fulfilled'?snapshot.value.rows.filter(r=>r.Div===league):[];
 const fromCSV=fixturesRows.map(r=>fixtureRow(r,league)).filter(Boolean).filter(f=>f.date>=today);
 const fileFixtures=seasons.flatMap(s=>s.fixtures||[]).filter(f=>f.date>=today);
 let fallback=null;if(!seasons.length||!fromCSV.length){
  try{fallback=await openFootball(league,starts[0]);}catch(e){issues.push(e.message);}
 }
 const unique=new Map();for(const m of [...(fallback?.matches||[]),...seasons.flatMap(x=>x.matches)]){
  if(m.date>today)continue;const key=`${m.date}|${normalizedTeam(m.home)}|${normalizedTeam(m.away)}`;const prev=unique.get(key);
  if(!prev||Object.values(m).filter(v=>v!==null).length>Object.values(prev).filter(v=>v!==null).length)unique.set(key,m);
 }
 const fixtures=new Map();for(const f of [...(fallback?.fixtures||[]),...fileFixtures,...fromCSV]){
  if(!f.date)continue;const id=`${league}|${f.date}|${encodeURIComponent(f.home)}|${encodeURIComponent(f.away)}`;
  fixtures.set(`${f.date}|${normalizedTeam(f.home)}|${normalizedTeam(f.away)}`,{...f,id});
 }
 const matches=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
 if(!matches.length&&fixtures.size===0)throw Error(`Nenhum jogo disponível nesta competição. ${issues.join(' ')}`);
 const planned=filterUpcomingFixtures([...fixtures.values()],now).slice(0,80);
 return {matches,fixtures:planned,source:seasons.map(s=>s.url),snapshot:snapshot.status==='fulfilled'?{rows:fixturesRows,modified:snapshot.value.modified,url:snapshot.value.url}:null,
  issues,historicalGames:matches.length};
}
export function findFixture(fixtures,info){return fixtures.find(f=>f.date===info.date&&same(f.home,info.home)&&same(f.away,info.away))||null;}
const fixtureOffers=(fixture,rows)=>{
 const r=rows?.find(r=>toDate(r.Date)===fixture.date&&same(r.HomeTeam,fixture.home)&&same(r.AwayTeam,fixture.away));if(!r)return [];
 const q=[];
 for(const [selection,columns] of Object.entries({home:['B365H','AvgH'],draw:['B365D','AvgD'],away:['B365A','AvgA']})){
  const c=columns.find(c=>num(r[c])>1);if(c)q.push({market:'h2h',selection,price:Number(r[c]),bookmaker:`Ficheiro Football-Data · ${c}`});
 }
 for(const selection of ['over','under']){
  const columns=selection==='over'?['B365>2.5','Avg>2.5']:['B365<2.5','Avg<2.5'];const c=columns.find(c=>num(r[c])>1);
  if(c)q.push({market:'totals',selection,point:2.5,price:Number(r[c]),bookmaker:`Ficheiro Football-Data · ${c}`});
 }
 return q.map(x=>({...x,sourceType:'snapshot',lastUpdate:null}));};
async function oddsReq(url){const r=await fetch(url,{signal:AbortSignal.timeout(17000)});const info=await r.json().catch(()=>({}));
 if(!r.ok){const description=r.status===401?'Chave inválida.':r.status===429?'Limite de créditos ou pedidos atingido.':r.status===422?'Competição/mercado sem suporte.':info.message||`HTTP ${r.status}`;
  throw Error(description);}
 return {data:info,remaining:r.headers.get('x-requests-remaining'),used:r.headers.get('x-requests-used')};}
export async function oddsSports(key){if(!key)return [];
 return cached('oddsports:'+key.slice(-7),2*3600e3,async()=>{
  const url=`https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(key)}`;
  const r=await oddsReq(url);return r.data;
 });}
export async function fetchOdds(league,key){if(!key)throw Error('Sem chave de odds atualizadas.');
 const sport=LEAGUES[league]?.sport;if(!sport)throw Error('Esta competição não tem identificador conhecido no feed de odds.');
 return cached(`odds:${league}:${key.slice(-7)}`,15*60e3,async()=>{
  const par=new URLSearchParams({apiKey:key,regions:'eu',markets:'h2h,totals',oddsFormat:'decimal',dateFormat:'iso'});
  const feed=await oddsReq(`https://api.the-odds-api.com/v4/sports/${sport}/odds/?${par}`);
  if(!Array.isArray(feed.data))throw Error('Formato de odds inesperado.');
  return {events:feed.data,remaining:feed.remaining,used:feed.used,updatedAt:new Date().toISOString()};
 });}
export async function fetchExtraOdds(league,event,key){if(!key||!event?.id)throw Error('Jogo sem identificador no feed de odds.');
 const sport=LEAGUES[league]?.sport;if(!sport)throw Error('Sem odds para esta liga.');
 return cached(`extra:${sport}:${event.id}:${key.slice(-7)}`,15*60e3,async()=>{
  // Consulta adicional opcional: consome vários créditos, só depois de ação do utilizador.
  const par=new URLSearchParams({apiKey:key,regions:'eu',markets:'btts,double_chance,draw_no_bet,team_totals,alternate_team_totals,alternate_totals,totals_h1,alternate_totals_h1,alternate_totals_corners,alternate_team_totals_corners,alternate_totals_cards',oddsFormat:'decimal'});
  let r;try {r=await oddsReq(`https://api.the-odds-api.com/v4/sports/${sport}/events/${encodeURIComponent(event.id)}/odds?${par}`);}
  catch(e){if(!/mercado sem suporte|sem suporte/i.test(e.message))throw e;
   // Alguns campeonatos não suportam os 11 mercados: voltar a tentar um conjunto nuclear.
   par.set('markets','btts,draw_no_bet,alternate_totals,alternate_totals_corners');
   r=await oddsReq(`https://api.the-odds-api.com/v4/sports/${sport}/events/${encodeURIComponent(event.id)}/odds?${par}`);}
  if(!r.data||typeof r.data!=='object')throw Error('Sem mercados adicionais.');return {event:r.data,remaining:r.remaining};
 });}
export function eventFixture(event,fixtures){
 if(!event?.commence_time)return null;
 const dt=Date.parse(event.commence_time);if(!Number.isFinite(dt))return null;
 const dates=[-1,0,1].map(n=>new Date(dt+n*864e5).toISOString().slice(0,10));
 return fixtures.find(f=>dates.includes(f.date)&&same(f.home,event.home_team)&&same(f.away,event.away_team))||null;
}
export function eventAsFixture(event,league){const date=event.commence_time?.slice(0,10);if(!date)return null;
 return {id:`${league}|${date}|${encodeURIComponent(event.home_team)}|${encodeURIComponent(event.away_team)}`,league,date,home:event.home_team,away:event.away_team,
  time:event.commence_time,source:'Feed de odds (jogo não confirmado por calendário)',timeKnown:true};}
function parseOffer(event,market,outcome,bookmaker,now){
 const n=String(outcome.name||''),lo=n.toLowerCase(),p=Number(outcome.point),description=String(outcome.description||'');
 const mk=market.key;let result=null;
 if(mk==='h2h'||mk==='h2h_3_way'){
  if(same(n,event.home_team))result={market:'h2h',selection:'home'};
  else if(same(n,event.away_team))result={market:'h2h',selection:'away'};
  else if(/draw|empate/i.test(n))result={market:'h2h',selection:'draw'};
 }else if(mk==='totals'||mk==='alternate_totals')result={market:'totals',selection:/^over/i.test(n)?'over':/^under/i.test(n)?'under':null,point:p};
 else if(mk==='btts')result={market:'btts',selection:/^(yes|sim)$/i.test(n)?'yes':/^(no|não|nao)$/i.test(n)?'no':null};
 else if(mk==='draw_no_bet')result={market:'dnb',selection:same(n,event.home_team)?'home':same(n,event.away_team)?'away':null};
 else if(mk==='double_chance'){
  const value=lo.replace(/[^a-z0-9]/g,'');let sel=null;if(/1x|homeordraw|homedraw/.test(value))sel='1X';if(/x2|draworaway|drawaway/.test(value))sel='X2';if(/12|homeoraway|homeaway/.test(value))sel='12';result={market:'dc',selection:sel};
 }else if(mk==='team_totals'||mk==='alternate_team_totals')result={market:'team_goals',selection:/^over/i.test(n)?'over':/^under/i.test(n)?'under':null,point:p,team:same(description,event.home_team)?'home':same(description,event.away_team)?'away':null};
 else if(mk==='totals_h1'||mk==='alternate_totals_h1')result={market:'half_totals',selection:/^over/i.test(n)?'over':/^under/i.test(n)?'under':null,point:p};
 else if(mk==='alternate_team_totals_corners')result={market:'team_corners',selection:/^over/i.test(n)?'over':/^under/i.test(n)?'under':null,point:p,team:same(description,event.home_team)?'home':same(description,event.away_team)?'away':null};
 else if(mk==='alternate_totals_corners'||mk==='totals_corners')result={market:'corners',selection:/^over/i.test(n)?'over':/^under/i.test(n)?'under':null,point:p};
 else if(mk==='alternate_totals_cards'||mk==='totals_cards')result={market:'cards',selection:/^over/i.test(n)?'over':/^under/i.test(n)?'under':null,point:p};
 if(!result||!result.selection||['team_goals','team_corners'].includes(result.market)&&!result.team)return null;
 if('point' in result&&(!Number.isFinite(result.point)||result.point%1!==0.5))return null;
 const price=Number(outcome.price);if(!Number.isFinite(price)||price<=1)return null;
 return {...result,price,bookmaker:bookmaker.title||bookmaker.key||'Casa',lastUpdate:market.last_update||bookmaker.last_update||null,sourceType:'api'};
}
export function marketsFromEvent(event,now=new Date()){
 const all=[],bookmakers=event.bookmakers||[];
 for(const b of bookmakers)for(const m of b.markets||[]){
  const update=m.last_update||b.last_update,age=update?(now.getTime()-Date.parse(update))/3600e3:Infinity;
  if(!Number.isFinite(age)||age>POLICY.maxOddsAgeHours||age<-.3)continue;
  // Apostas de 2 vias em mercados de resultado final não devem ser confundidas com 1X2 (3 vias).
  if(m.key==='h2h'&&!m.outcomes?.some(x=>/draw|empate/i.test(x.name||'')))continue;
  for(const o of m.outcomes||[]){const parsed=parseOffer(event,m,o,b,now);if(parsed)all.push(parsed);}
 }
 return all;
}
// Verificacao de preco contra varias casas. A probabilidade 'sem margem' e um
// consenso de mercado, nao uma probabilidade verdadeira ou modelo validado.
// Utiliza apenas resultados mutuamente exclusivos da MESMA casa/linha.
export function marketConsensus(offers){
 const groups=new Map();
 const valid=new Set(['h2h','totals','btts','team_goals','corners','cards','team_corners','half_totals','shots','sot']);
 for(const o of offers){
  if(o.sourceType!=='api'||!valid.has(o.market)||!(o.price>1)||!o.bookmaker)continue;
  const family=`${o.market}|${o.point??''}|${o.team??''}`;
  const book=String(o.bookmaker).toLowerCase().trim();
  const k=family+'|'+book;
  if(!groups.has(k))groups.set(k,{family,book,market:o.market,outcomes:new Map()});
  const group=groups.get(k),previous=group.outcomes.get(o.selection);
  if(!previous||o.price>previous)group.outcomes.set(o.selection,o.price);
 }
 const perSelection=new Map();
 for(const group of groups.values()){
  const expected=group.market==='h2h'?['home','draw','away']:
   group.market==='btts'?['yes','no']:['over','under'];
  if(expected.some(x=>!group.outcomes.has(x)))continue;
  const imps=expected.map(x=>1/group.outcomes.get(x));
  const overround=imps.reduce((a,b)=>a+b,0);
  // Mercados desfasados, mal mapeados e casas sem equilibrio plausivel nao entram no consenso.
  if(overround<0.985||overround>1.25)continue;
  expected.forEach((selection,i)=>{
   const key=group.family+'|'+selection;
   if(!perSelection.has(key))perSelection.set(key,[]);
   perSelection.get(key).push({book:group.book,fair:imps[i]/overround,overround});
  });
 }
 return perSelection;
}
const midpoint=values=>{const a=[...values].sort((x,y)=>x-y),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;};
export function benchmarkOffer(offer,consensus){
 if(!consensus)return null;
 const key=`${offer.market}|${offer.point??''}|${offer.team??''}|${offer.selection}`;
 const full=consensus.get(key)||[];
 const other=full.filter(x=>x.book!==String(offer.bookmaker).toLowerCase().trim());
 // Pelo menos duas casas independentes de referencia quando ha tres no total.
 const sample=other.length>=2?other:full;
 if(sample.length<2)return null;
 const fair=midpoint(sample.map(x=>x.fair));
 const disagreement=midpoint(sample.map(x=>Math.abs(x.fair-fair)));
 return {fair,bookmakers:sample.length,marketEv:fair*offer.price-1,
  oddsFair:1/fair,dispersion:disagreement};
}
// Decisao dupla: o modelo nao se sobrepoe cegamente ao mercado; uma
// discrepancia de preco entre casas pode, por si, justificar investigacao.
// Mantem sempre 'experimental': nunca equivale a uma aposta comprovada.
export function reviewAgainstMarket(result,reference,policy){
 if(!reference)return {...result,marketCheck:'SEM_CONSENSO'};
 const gap=result.p-reference.fair;
 const evidence=reference.bookmakers>=2&&Number.isFinite(reference.marketEv);
 let status=result.status,why=result.why||'',signalBasis='MODELO';
 if(evidence&&status==='POTENCIAL'&&gap>0.14&&reference.marketEv<0.02){
  status='OBSERVAR';why+=' Modelo muito mais otimista que o consenso das casas, sem preco superior ao mercado.'; result={...result,failureCodes:[...(result.failureCodes||[]),'DIVERGENCIA_MERCADO']};
 }
 // A segunda via procura uma odd claramente melhor que o preco justo sem margem
 // das outras casas, exigindo que o modelo nao contradiga completamente essa referencia.
 const priceLane=policy.mode==='balanced'&&evidence&&
  result.odd>=policy.minOdd&&result.odd<=policy.maxOdd&&
  reference.marketEv>=0.045&&result.p>=0.58&&result.ev>=0.025&&
  result.p>=reference.fair-0.04&&result.evSafe>=-0.20;
 if(priceLane&&status!=='POTENCIAL'){
  status='POTENCIAL';signalBasis='COMPARACAO_CASAS';
  why='Preco superior ao consenso sem margem, e modelo nao o contraria fortemente. Pior cenario pode ser negativo; verificar cotacao antes de qualquer decisao.';
 }else if(priceLane)signalBasis='MODELO_E_MERCADO';
 return {...result,status,why:why.trim(),signalBasis,marketCheck:Math.abs(gap)>0.14?'DIVERGENCIA':'COMPARADO',
  benchmark:reference,modelMarketGap:gap,benchmarkEdge:reference.marketEv,
  priceForMarketEdge5:1.05/reference.fair};
}

// Avalia as melhores ofertas por mercado, preservando as alternativas de preço.
// Apenas fontes API com timestamp verificavel podem ser 'POTENCIAL'.
export function evaluateOffers(estimate,offers,mode='conservative',audit=null){
 if(!estimate.ready)return [];
 const seen=new Map(),policy=policyForMode(mode),consensus=marketConsensus(offers);
 if(audit)Object.assign(audit,{received:offers.length,compatible:0,unsupported:0,grouped:0,unsupportedMarkets:{}});
 for(const o of offers){
  const prob=probabilityFor(estimate,o.market,o.selection,o.point,o.team);
  if(prob===null||prob.win===null){
   if(audit){audit.unsupported++;audit.unsupportedMarkets[o.market]=(audit.unsupportedMarkets[o.market]||0)+1;}
   continue;
  }
  if(audit)audit.compatible++;
  const scored=scoreOffer(prob,o.price,policy);
  let result={...o,...scored,label:marketName(o),dataScore:estimate.quality?.dataScore??0};
  if(o.sourceType==='api')result=reviewAgainstMarket(result,benchmarkOffer(o,consensus),policy);
  if(['POTENCIAL','OBSERVAR'].includes(result.status)&&result.dataScore<POLICY.minDataScore){
   result.status='REJEITAR';result.why='Cobertura de dados insuficiente para candidatura.';result.failureCodes=[...(result.failureCodes||[]),'COBERTURA_INSUFICIENTE'];
  }
  // Preços históricos ou manuais não são sinais verificados, mesmo se o cálculo passar.
  if(['POTENCIAL','OBSERVAR'].includes(result.status)&&o.sourceType==='snapshot')result.status='INDICATIVA';
  if(['POTENCIAL','OBSERVAR'].includes(result.status)&&o.sourceType==='manual')result.status='CONFIRMAR';
  if(['POTENCIAL','OBSERVAR'].includes(result.status)&&o.sourceType==='api'&&!o.lastUpdate){
   result.status='REJEITAR';result.why='Cotação sem hora de atualização.';result.failureCodes=[...(result.failureCodes||[]),'ODD_SEM_HORA'];
  }
  const id=`${o.market}|${o.selection}|${o.point??''}|${o.team??''}|${o.sourceType||''}`;
  const prev=seen.get(id);
  if(!prev){seen.set(id,{...result,otherBookmakers:[]});continue;}
  if(result.odd>prev.odd){seen.set(id,{...result,otherBookmakers:[{name:prev.bookmaker,odd:prev.odd},...(prev.otherBookmakers||[])]});}
  else prev.otherBookmakers.push({name:result.bookmaker,odd:result.odd});
 }
 const rank={POTENCIAL:0,OBSERVAR:1,CONFIRMAR:2,INDICATIVA:3,REJEITAR:4};
 const unique=[...seen.values()].sort((a,b)=>(rank[a.status]??4)-(rank[b.status]??4)||pickScore(b)-pickScore(a));
 if(audit)audit.grouped=Math.max(0,audit.compatible-unique.length);
 return unique;
}
export function pickScore(x){
 const priceEdge=Number.isFinite(x.benchmarkEdge)?x.benchmarkEdge:0;
 const central=Number.isFinite(x.ev)?x.ev:0;
 const worst=Number.isFinite(x.evSafe)?x.evSafe:0;
 return (x.signalBasis==='COMPARACAO_CASAS'||x.signalBasis==='MODELO_E_MERCADO'?0.07:0)+
  .75*Math.max(-.30,priceEdge)+.20*central+.25*worst;
}
export function diversifyPicks(picks,limit=2){
 const selected=[],families=new Set();
 for(const x of [...picks].sort((a,b)=>pickScore(b)-pickScore(a))){
  // Evita multiplas linhas relacionadas da mesma familia no mesmo encontro.
  const family=x.market==='team_goals'?'team_goals_'+x.team:x.market==='team_corners'?'team_corners_'+x.team:x.market;
  if(families.has(family))continue;
  selected.push(x);families.add(family);if(selected.length>=limit)break;
 }
 return selected;
}

export async function analyzeFixture(league,fixture,options={}){
 const info=await loadLeague(league);let match=findFixture(info.fixtures,fixture);
 if(!match&&options.oddsKey){try{const feed=await fetchOdds(league,options.oddsKey);const found=feed.events.find(e=>same(e.home_team,fixture.home)&&same(e.away_team,fixture.away)&&[fixture.date].includes(e.commence_time?.slice(0,10)));if(found)match=eventAsFixture(found,league);}catch{}}
 if(!match)throw Error('O jogo não foi encontrado no calendário da fonte.');
 const today=new Date().toISOString().slice(0,10);
 if(match.date<today)throw Error('O encontro ja passou; nao se calcula uma aposta pre-jogo com odds atuais.');
 if(match.timeKnown&&String(match.time||'').includes('T')&&Date.parse(match.time)<=Date.now())throw Error('O encontro ja comecou; analises live nao estao disponiveis.');
 const estimate=estimateMatch(info.matches,match.home,match.away,match.date);
 const result={fixture:match,estimate,oddsProblem:null,source:info.source,offers:[],leagueInfo:LEAGUES[league],oddsKind:'none',availableMarkets:Object.keys(estimate.rates||{}).filter(k=>estimate.rates[k]?.ready)};
 let raw=[];
 if(options.manualOffers?.length){raw=options.manualOffers.map(o=>({...o,sourceType:'manual',bookmaker:'Odd introduzida manualmente',lastUpdate:null}));result.oddsKind='manual';}
 else if(options.oddsKey){
  try{const feed=await fetchOdds(league,options.oddsKey);const event=feed.events.find(e=>eventFixture(e,[match]));
   if(event&&Date.parse(event.commence_time)>Date.now()){
    raw=marketsFromEvent(event);result.oddsKind='api';
    if(options.extended){try{const extra=await fetchExtraOdds(league,event,options.oddsKey);raw.push(...marketsFromEvent(extra.event));}
     catch(e){result.oddsProblem='Mercados adicionais não disponíveis: '+e.message;}}
   }else result.oddsProblem='Sem jogo correspondente com odds atuais pré-jogo.';
  }catch(e){result.oddsProblem=e.message;}
 }
 if(!raw.length&&info.snapshot?.rows){raw=fixtureOffers(match,info.snapshot.rows);result.oddsKind='snapshot';
  if(raw.length)result.oddsProblem=(result.oddsProblem?result.oddsProblem+' ':'')+'Preços de ficheiro indicativos, não confirmados em direto.';}
 if(!raw.length&&!result.oddsProblem)result.oddsProblem='Sem odds obtidas; introduz um preço atual para comparar.';
 result.offers=evaluateOffers(estimate,raw,options.mode||'balanced');result.approved=diversifyPicks(result.offers.filter(o=>o.status==='POTENCIAL'));result.watch=diversifyPicks(result.offers.filter(o=>o.status==='OBSERVAR'));result.manualToVerify=result.offers.filter(o=>o.status==='CONFIRMAR');result.mode=options.mode||'balanced';
 return result;
}
export async function scanLeague(league,key,opts={}){
 const data=await loadLeague(league);let events=[],kind='snapshot',remaining=null,error=null;
 if(key&&LEAGUES[league]?.sport){try{const feed=await fetchOdds(league,key);events=feed.events;kind='api';remaining=feed.remaining;}catch(e){error=e.message;}}
 const rows=[];let unmatched=0,analyzed=0,allCandidates=0,allWatch=0,allIndicative=0,offerCount=0,advancedFetched=0;
 let availableCredits=remaining===null?null:Number(remaining);if(!Number.isFinite(availableCredits))availableCredits=null;
 const advancedLimit=opts.advanced?Math.max(2,Math.min(6,Number(opts.deepGames)||4)):0;
 const diagnostic={reviewed:0,rejected:0,modelEligible:0,noConsensus:0,missingPrices:0,unsupported:0,
  started:0,insufficientHistory:0,unsupportedOddsLeague:!LEAGUES[league]?.sport,
  feedGames:events.length,apiError:error||null,apiConfigured:!!key,
  feedWithMarkets:0,marketsSeen:{},marketsEvaluated:{},failures:{},bookmakers:[],notEvaluable:0,
  modelCompatiblePrices:0,groupedBookmakerPrices:0,unsupportedMarkets:{},historyReasons:{},historySamples:[],
  oddsActual:kind==='api'};
 const seenBooks=new Set();
 const targets=kind==='api'&&events.length?events.map(e=>({fixture:eventFixture(e,data.fixtures)||eventAsFixture(e,league),event:e})).filter(x=>x.fixture):
  data.fixtures.filter(f=>f.date>=new Date().toISOString().slice(0,10)).map(f=>({fixture:f,event:null}));
 // Nos pedidos avancados, investigar os dois encontros com melhor combinacao
 // de cobertura e aproximacao de preco, nao os dois primeiros devolvidos pela API.
 const rankedTargets=opts.advanced&&kind==='api'?[...targets].map(t=>{
  const est=estimateMatch(data.matches,t.fixture.home,t.fixture.away,t.fixture.date);
  const base=est.ready?evaluateOffers(est,marketsFromEvent(t.event),opts.mode||'balanced'):[];
  const best=base.filter(x=>Number.isFinite(x.ev)).sort((a,b)=>pickScore(b)-pickScore(a))[0];
  return {...t,selectionRank:est.ready?(est.quality?.dataScore||0)*.3+Math.max(-.2,Math.min(.30,pickScore(best||{}))):-.999};
 }).sort((a,b)=>b.selectionRank-a.selectionRank):targets;
 for(const {fixture,event} of rankedTargets.slice(0,60)){
  if(event&&Date.parse(event.commence_time)<Date.now()){diagnostic.started++;continue;}
  const estimate=estimateMatch(data.matches,fixture.home,fixture.away,fixture.date);if(!estimate.ready){
   unmatched++;diagnostic.insufficientHistory++;
   for(const reason of estimate.reasons||[])diagnostic.historyReasons[reason]=(diagnostic.historyReasons[reason]||0)+1;
   if(diagnostic.historySamples.length<6)diagnostic.historySamples.push({league:LEAGUES[league].name,home:fixture.home,away:fixture.away,date:fixture.date,
    homeGames:estimate.quality?.homeGames??0,awayGames:estimate.quality?.awayGames??0,reasons:estimate.reasons||[]});
   continue;
  }
  analyzed++;
  let offers=event?marketsFromEvent(event):fixtureOffers(fixture,data.snapshot?.rows);
  if(event&&opts.advanced&&advancedFetched<advancedLimit){
   if(availableCredits!==null&&availableCredits<14){error=error||'Radar aprofundado interrompido por quota reduzida; mantidos os preços já disponíveis.';}
   else {try{const extra=await fetchExtraOdds(league,event,key);offers.push(...marketsFromEvent(extra.event));advancedFetched++;if(extra.remaining!==null&&Number.isFinite(Number(extra.remaining)))availableCredits=Number(extra.remaining);}
   catch(e){error=error||('Mercados avançados: '+e.message);advancedFetched++;}}
  }
  offerCount+=offers.length;
  if(offers.length)diagnostic.feedWithMarkets++;
  for(const o of offers){seenBooks.add(o.bookmaker);diagnostic.marketsSeen[o.market]=(diagnostic.marketsSeen[o.market]||0)+1;}
  const audit={};
  const evaluated=evaluateOffers(estimate,offers,opts.mode||'balanced',audit);
  diagnostic.reviewed+=evaluated.length;
  // Crucial: diferentes casas com a MESMA seleção são agrupadas; isso NÃO significa falta de modelo.
  diagnostic.notEvaluable+=audit.unsupported;
  diagnostic.modelCompatiblePrices+=audit.compatible;
  diagnostic.groupedBookmakerPrices+=audit.grouped;
  for(const [market,n] of Object.entries(audit.unsupportedMarkets))diagnostic.unsupportedMarkets[market]=(diagnostic.unsupportedMarkets[market]||0)+n;
  for(const e of evaluated){
   diagnostic.marketsEvaluated[e.market]=(diagnostic.marketsEvaluated[e.market]||0)+1;
   if(e.status==='REJEITAR'||e.status==='OBSERVAR')for(const code of [...new Set(e.failureCodes||[])])
    diagnostic.failures[code]=(diagnostic.failures[code]||0)+1;
  }
  diagnostic.rejected+=evaluated.filter(x=>x.status==='REJEITAR').length;
  diagnostic.modelEligible+=evaluated.filter(x=>x.status==='POTENCIAL').length;
  diagnostic.noConsensus+=evaluated.filter(x=>x.marketCheck==='SEM_CONSENSO').length;
  if(!offers.length)diagnostic.missingPrices++;
  if(offers.length&&!evaluated.length)diagnostic.unsupported++;
  const strong=diversifyPicks(evaluated.filter(x=>x.status===(event?'POTENCIAL':'INDICATIVA')),4);
  const watch=event?diversifyPicks(evaluated.filter(x=>x.status==='OBSERVAR'),3):[];
  // Aprovados aparecem sempre antes de observados; nao os esconder por pontuacao.
  const selectedFamilies=new Set(strong.map(x=>x.market==='team_goals'||x.market==='team_corners'?x.market+'_'+x.team:x.market));
  const top=[...strong,...watch.filter(x=>!selectedFamilies.has(x.market==='team_goals'||x.market==='team_corners'?x.market+'_'+x.team:x.market))].slice(0,4);
  if(event&&kind==='api'){allCandidates+=strong.length;allWatch+=watch.length;}
  else allIndicative+=strong.length;
  if(top.length||opts.includeEmpty)rows.push({fixture,top,allEvaluated:evaluated.length,quality:estimate.quality,oddsKind:event?'api':'snapshot',watchCount:watch.length});
 }
 diagnostic.bookmakers=[...seenBooks].sort();
 rows.sort((a,b)=>pickScore(b.top[0]||{})-pickScore(a.top[0]||{}));
 return {league,name:LEAGUES[league].name,country:LEAGUES[league].country,items:rows,totalEvents:targets.length,analyzed,insufficient:unmatched,candidates:allCandidates,watch:allWatch,indicative:allIndicative,offersChecked:offerCount,oddsKind:kind,remaining,error,
  historySize:data.historicalGames,source:data.source,issues:data.issues,advancedFetched,diagnostic};
}
export async function scanLeagues(leagues,key,opts={}){
 const items=[],errors=[];for(const league of leagues){
  try{items.push(await scanLeague(league,key,opts));}catch(e){errors.push({league,message:e.message});}
 }
 return {leagues,items,errors,deepGames:opts.advanced?Math.max(2,Math.min(6,Number(opts.deepGames)||4)):0,advancedFetched:items.reduce((a,b)=>a+b.advancedFetched,0),diagnostic:{reviewed:items.reduce((a,b)=>a+b.diagnostic.reviewed,0),rejected:items.reduce((a,b)=>a+b.diagnostic.rejected,0),missingPrices:items.reduce((a,b)=>a+b.diagnostic.missingPrices,0),noConsensus:items.reduce((a,b)=>a+b.diagnostic.noConsensus,0),unsupported:items.reduce((a,b)=>a+b.diagnostic.unsupported,0),
  feedGames:items.reduce((a,b)=>a+b.diagnostic.feedGames,0),insufficientHistory:items.reduce((a,b)=>a+b.diagnostic.insufficientHistory,0),notEvaluable:items.reduce((a,b)=>a+b.diagnostic.notEvaluable,0),
  modelCompatiblePrices:items.reduce((a,b)=>a+b.diagnostic.modelCompatiblePrices,0),groupedBookmakerPrices:items.reduce((a,b)=>a+b.diagnostic.groupedBookmakerPrices,0),
  historySamples:items.flatMap(x=>x.diagnostic.historySamples).slice(0,15),
  historyReasons:Object.fromEntries([...new Set(items.flatMap(x=>Object.keys(x.diagnostic.historyReasons)))].map(code=>[code,items.reduce((a,b)=>a+(b.diagnostic.historyReasons[code]||0),0)])),
  unsupportedMarkets:Object.fromEntries([...new Set(items.flatMap(x=>Object.keys(x.diagnostic.unsupportedMarkets)))].map(code=>[code,items.reduce((a,b)=>a+(b.diagnostic.unsupportedMarkets[code]||0),0)])),
  leaguesWithoutOdds:items.filter(x=>x.diagnostic.unsupportedOddsLeague).map(x=>x.name),
  leaguesWithFeedErrors:items.filter(x=>x.diagnostic.apiError).map(x=>({league:x.name,message:x.diagnostic.apiError})),
  failures:Object.fromEntries([...new Set(items.flatMap(x=>Object.keys(x.diagnostic.failures)))].map(code=>[code,items.reduce((a,b)=>a+(b.diagnostic.failures[code]||0),0)])),
  marketsSeen:Object.fromEntries([...new Set(items.flatMap(x=>Object.keys(x.diagnostic.marketsSeen)))].map(code=>[code,items.reduce((a,b)=>a+(b.diagnostic.marketsSeen[code]||0),0)])),
  marketsEvaluated:Object.fromEntries([...new Set(items.flatMap(x=>Object.keys(x.diagnostic.marketsEvaluated)))].map(code=>[code,items.reduce((a,b)=>a+(b.diagnostic.marketsEvaluated[code]||0),0)]))},totalCandidates:items.reduce((a,b)=>a+b.candidates,0),totalIndicative:items.reduce((a,b)=>a+b.indicative,0),totalWatch:items.reduce((a,b)=>a+b.watch,0),totalOffersChecked:items.reduce((a,b)=>a+b.offersChecked,0),analyzed:items.reduce((a,b)=>a+b.analyzed,0),checked:items.reduce((a,b)=>a+b.totalEvents,0),
  note:key?('Cotacões da API com data válida; modo equilibrado é uma triagem experimental, não demonstra vantagem real.'+(opts.advanced?` Mercados adicionais consultados em ${items.reduce((a,b)=>a+b.advancedFetched,0)} jogos, com pedidos de API sujeitos a quota.`:'')):'Sem API de odds: não podem existir sinais com preço atual verificado. Apenas preços CSV indicativos.'};
}
export {allMarketOptions};
