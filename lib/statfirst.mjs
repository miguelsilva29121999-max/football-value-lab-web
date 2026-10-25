// Radar orientado por estatística, sem odds: não declara valor sem cotação real.
import {LEAGUES, allMarketOptions, estimateMatch, probabilityFor, marketName, normalizedTeam} from './model.mjs';
import {loadLeague, findFixture} from './providers.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const round2=v=>Math.round(v*100)/100;
const allowed=new Set(['h2h','dc','dnb','btts','totals','team_goals','half_totals','corners','team_corners','shots','sot']);
const options=allMarketOptions().filter(o=>allowed.has(o.market)); // cartões excluídos da triagem portuguesa
const optionById=new Map(options.map(o=>[o.id,o]));
// Bandas referem-se à odd MINIMA TEORICA pedida pelo modelo, não à cotação real.
// Não implicam que uma casa disponibilize o preço. O perfil apenas ordena o radar.
export const QUOTE_PROFILES=Object.freeze({
 balanced: {label:'Equilibrado · procura 1,75–2,25',minTarget:1.75,maxTarget:2.25,minP:0.52,ideal:1.94},
 accurate: {label:'Maior probabilidade · procura 1,55–1,90',minTarget:1.55,maxTarget:1.90,minP:0.60,ideal:1.75},
 return: {label:'Odds mais altas · procura 1,90–2,80',minTarget:1.90,maxTarget:2.80,minP:0.45,ideal:2.21}
});
export function quoteProfile(key){return QUOTE_PROFILES[key]||QUOTE_PROFILES.balanced;}


export function targetOdds(prob,desiredEV=0.07){
 const p=prob?.win,push=prob?.push||0;
 if(!Number.isFinite(p)||p<=0||p>=1||push<0||p+push>1.00001)return null;
 return {fair:round2((1-push)/p), target:Math.ceil(((1-push+desiredEV)/p)*100-1e-9)/100};
}
function group(o){return o.market+(o.team?'_'+o.team:'');}
// Forma recente é um controlo independente, não a probabilidade verdadeira do mercado.
const same=(a,b)=>normalizedTeam(a)===normalizedTeam(b);
function matchOutcome(m,o){
 const h=m.hg,a=m.ag;
 if(!Number.isFinite(h)||!Number.isFinite(a))return null;
 const result=h>a?'home':h===a?'draw':'away';
 if(o.market==='h2h')return result===o.selection?'win':'loss';
 if(o.market==='dc')return ({'1X':result!=='away','X2':result!=='home','12':result!=='draw'})[o.selection]?'win':'loss';
 if(o.market==='dnb')return result==='draw'?'push':result===o.selection?'win':'loss';
 if(o.market==='btts')return ((h>0&&a>0)===(o.selection==='yes'))?'win':'loss';
 const sides={totals:['hg','ag'],team_goals:[o.team==='home'?'hg':'ag'],half_totals:['hhg','hag'],corners:['hc','ac'],team_corners:[o.team==='home'?'hc':'ac'],shots:['hs','as'],sot:['hst','ast']};
 const fields=sides[o.market];if(!fields)return null;
 const nums=fields.map(k=>m[k]);if(nums.some(v=>!Number.isFinite(v)))return null;
 const value=nums.reduce((a,b)=>a+b,0);
 return (o.selection==='over'?value>o.point:value<o.point)?'win':'loss';
}
export function recentEvidence(matches,fixture,o,{take=5}={}){
 const valid=(matches||[]).filter(m=>m.date<fixture.date).sort((a,b)=>b.date.localeCompare(a.date));
 const home=valid.filter(m=>same(m.home,fixture.home)).slice(0,take);
 const away=valid.filter(m=>same(m.away,fixture.away)).slice(0,take);
 const summarize=list=>{
  const obs=list.map(m=>matchOutcome(m,o)).filter(v=>v!==null);
  const wins=obs.filter(v=>v==='win').length,pushes=obs.filter(v=>v==='push').length;
  return {wins,pushes,total:obs.length,rate:obs.length?round2(wins/obs.length):null};
 };
 const days=m=>m?Math.round((Date.parse(fixture.date+'T00:00:00Z')-Date.parse(m.date+'T00:00:00Z'))/86400000):null;
 return {home:summarize(home),away:summarize(away),restHome:days(home[0]),restAway:days(away[0]),
  // Dados dos dois recortes, não inferência de odds nem validação preditiva.
  combined: (()=>{const a=[...home,...away].map(m=>matchOutcome(m,o)).filter(x=>x!==null);return {wins:a.filter(x=>x==='win').length,total:a.length,rate:a.length?round2(a.filter(x=>x==='win').length/a.length):null};})()};
}
function priorityScore(prob,quality,odds,evidence,profile){
 const downside=Math.max(0,prob.win-prob.low),q=quality?.dataScore??0;
 // Primeiro comparar mercados com odd minima coerente com o perfil;
 // depois consistencia e probabilidade: mercados quase certos ja nao dominam.
 const priceFit=clamp(1-Math.abs(odds.target-profile.ideal)/1.0,0,1);
 const support=evidence?.combined?.rate;
 const n=evidence?.combined?.total||0;
 const agreement=support==null||n<6?.45:clamp(.5+(support-prob.win),0,1);
 const restPenalty=(evidence?.restHome!=null&&evidence.restHome<3||evidence?.restAway!=null&&evidence.restAway<3)?7:0;
 const priceDistance=odds.target<profile.minTarget?profile.minTarget-odds.target:odds.target>profile.maxTarget?odds.target-profile.maxTarget:0;
 return round2(100*(.30*priceFit+.16*prob.win+.18*prob.low+.18*q+.10*(1-downside)+.08*agreement)-restPenalty-20*priceDistance);
}
function candidateList(estimate,{matches=[],fixture=null,profile='balanced',minDataScore=.40}={}){
 if(!estimate?.ready||(estimate.quality?.dataScore??0)<minDataScore)return [];
 const cfg=quoteProfile(profile),eligible=[];
 for(const o of options){
  const prob=probabilityFor(estimate,o.market,o.selection,o.point,o.team);
  if(!prob||!Number.isFinite(prob.win)||!Number.isFinite(prob.low)||prob.win<cfg.minP)continue;
  const odds=targetOdds(prob);if(!odds||odds.target<1.55||odds.target>3.3)continue;
  const gap=prob.win-prob.low;
  if(prob.low<.27||gap>.40)continue;
  const statKind={h2h:'goals',dc:'goals',dnb:'goals',btts:'goals',totals:'goals',team_goals:'goals',half_totals:'half',corners:'corners',team_corners:'corners',shots:'shots',sot:'sot'}[o.market];
  const samples=estimate.rates?.[statKind]?.coverage||{};
  const evidence=fixture?recentEvidence(matches,fixture,o):null;
  const shortEvidence=!!evidence&&(evidence.home.total<3||evidence.away.total<3);
  const contrary=!!evidence&&evidence.combined.total>=6&&evidence.combined.rate<.35;
  const inBand=odds.target>=cfg.minTarget&&odds.target<=cfg.maxTarget;
  eligible.push({optionId:o.id,label:marketName(o),market:o.market,group:group(o),p:round2(prob.win),push:round2(prob.push||0),pLow:round2(prob.low),pHigh:round2(prob.high),oddFair:odds.fair,oddTarget:odds.target,inTargetBand:inBand,
   priority:priorityScore(prob,estimate.quality,odds,evidence,cfg)-(shortEvidence?4:0)-(contrary?8:0),samples:{home:samples.home??0,away:samples.away??0},
   sensitivity:gap>.18?'Elevada':'Moderada',dataScore:estimate.quality?.dataScore??0,evidence,
   warnings:[...(shortEvidence?['Poucos jogos com esta estatística nos recortes recentes.']:[]),...(contrary?['A frequência recente diverge da probabilidade do modelo.']:[]),...(gap>.22?['A estimativa muda bastante nos cenários de sensibilidade.']:[])]});
 }
 eligible.sort((a,b)=>Number(b.inTargetBand)-Number(a.inTargetBand)||b.priority-a.priority||b.p-a.p);
 return eligible;
}
export function rankStatMarkets(estimate,{maxPerGame=4,profile='balanced',minDataScore=.40,matches=[],fixture=null}={}){
 const eligible=candidateList(estimate,{matches,fixture,profile,minDataScore});
 const inBand=eligible.filter(e=>e.inTargetBand);
 const sorted=inBand.length?inBand:eligible;
 const chosen=[],used=new Set();
 for(const e of sorted){if(used.has(e.group))continue;chosen.push(e);used.add(e.group);if(chosen.length>=maxPerGame)break;}
 // Se houver poucas escolhas na faixa, as restantes ficam como alternativas identificadas.
 if(chosen.length<maxPerGame&&inBand.length){for(const e of eligible){if(used.has(e.group))continue;chosen.push(e);used.add(e.group);if(chosen.length>=maxPerGame)break;}}
 return chosen.map((x,i)=>({...x,position:i===0?'PRINCIPAL':'ALTERNATIVA',
  verdict:i===0?(x.inTargetBand?'PRIMEIRA OPÇÃO NA FAIXA PARA COTAR':'SEM MERCADOS NA FAIXA · APENAS ALTERNATIVA'):'ALTERNATIVA PARA COTAR'}));
}
export function validatePrice(estimate,optionId,inputOdd){
 const option=optionById.get(String(optionId));if(!option)throw Error('Mercado não disponível para validação manual.');
 const odd=Number(String(inputOdd).replace(',','.'));
 if(!Number.isFinite(odd)||odd<=1.01||odd>30)throw Error('Odd introduzida inválida.');
 const prob=probabilityFor(estimate,option.market,option.selection,option.point,option.team);
 if(!prob)throw Error('Não existem dados suficientes para calcular este mercado.');
 const threshold=targetOdds(prob);if(!threshold)throw Error('Estimativa inválida.');
 const ev=prob.win*odd+(prob.push||0)-1;
 // Mesmo no modo sem odds automáticas, a sensibilidade é visível e não uma prova de valor.
 const evLow=prob.scenarios?.length?Math.min(...prob.scenarios.map(s=>s.win*odd+(s.push||0)-1)):prob.low*odd+(prob.push||0)-1;
 const status=ev<0.07?'OBSERVAR':evLow<-.20?'OBSERVAR':'POTENCIAL';
 return {status,label:marketName(option),odd,breakEven:round2((1-(prob.push||0))/odd),shortfall:round2(Math.max(0,threshold.target-odd)),probability:round2(prob.win),push:round2(prob.push||0),sensitivityLow:round2(prob.low),sensitivityHigh:round2(prob.high),fairOdd:threshold.fair,targetOdd:threshold.target,ev:round2(ev),evLow:round2(evLow),
  reason:status==='POTENCIAL'?'O preço superou a triagem experimental; confirmar mercado, contexto e disponibilidade. Não é aposta validada.':ev<0.07?'A casa paga menos do que a odd mínima experimental. Não entrar: procura outra linha/mercado ou descarta o jogo.':'Cenário adverso demasiado frágil. Não entrar.'};
}
export async function scanStatFirst(leagues,{maxPerLeague=30,maxPerGame=4,profile='balanced'}={}){
 const selectedProfile=quoteProfile(profile),profileKey=Object.hasOwn(QUOTE_PROFILES,profile)?profile:'balanced';const reports=[],failures=[];let fixtureCount=0,eligibleCount=0,withoutHistory=0,withoutCandidates=0;const sourceIssues=[];
 for(const code of leagues){
  try{
   const data=await loadLeague(code),now=new Date().toISOString().slice(0,10);
   const fixtures=data.fixtures.filter(f=>f.date>=now).slice(0,maxPerLeague);
   fixtureCount+=fixtures.length;sourceIssues.push(...(data.issues||[]).map(x=>`${code}: ${x}`));
   for(const f of fixtures){
    const e=estimateMatch(data.matches,f.home,f.away,f.date);
    const entry={fixture:{league:code,date:f.date,home:f.home,away:f.away,id:f.id,time:f.time||null,timeKnown:!!f.timeKnown},leagueName:LEAGUES[code].name,country:LEAGUES[code].country,quality:e.quality,candidates:[],reason:null};
    if(!e.ready){withoutHistory++;entry.reason=(e.reasons||['Histórico insuficiente.']).join(' ');reports.push(entry);continue;}
    entry.candidates=rankStatMarkets(e,{maxPerGame,profile:profileKey,matches:data.matches,fixture:f});
    if(!entry.candidates.length){withoutCandidates++;entry.reason='Sem mercado com dados e probabilidade suficientes, mesmo antes de consultar odds reais.';}
    entry.inBand=entry.candidates.filter(c=>c.inTargetBand).length;
    if(entry.candidates.length&&!entry.inBand)entry.reason='Nenhum mercado na faixa de odds pretendida. Primeira opção apenas alternativa para comparar; pode ser pouco interessante ao preço real.';
    eligibleCount+=entry.candidates.length;
    reports.push(entry);
   }
   if(!fixtures.length)failures.push({league:code,detail:'Sem jogos futuros nesta fonte no período disponível.'});
  }catch(err){failures.push({league:code,detail:err.message});}
 }
 // Ordenação por data de jogo e força da melhor hipótese; não ocultar jogos sem candidatos.
 reports.sort((a,b)=>a.fixture.date.localeCompare(b.fixture.date)||((b.candidates[0]?.priority??-1)-(a.candidates[0]?.priority??-1)));
 const withCandidates=reports.filter(g=>g.candidates.length).length;
 return {mode:'STAT_FIRST',profile:profileKey,quoteBand:{min:selectedProfile.minTarget,max:selectedProfile.maxTarget},leagues,fixturesSeen:fixtureCount,withoutHistory,withoutCandidates,candidatesFound:eligibleCount,gamesWithCandidates:withCandidates,
  games:reports.slice(0,120),gamesTruncated:Math.max(0,reports.length-120),failures,sourceIssues:sourceIssues.slice(0,10),
  limitations:['Cada jogo recebe a melhor seleção modelável, quando existem dados suficientes; não existe garantia de uma aposta com valor em todos os encontros.',
  'A frequência dos últimos cinco jogos é uma verificação descritiva, não previsão validada.',
  'A odd mínima é calculada a partir de uma probabilidade não calibrada; não prevê a odd oferecida pelas casas. Um mercado só tem valor se a odd real compensar.',
  'A faixa escolhida é da odd mínima TEÓRICA, nunca uma cotação observada. Quando não há seleções na faixa, indica-se claramente.',
  'Lesões, onzes, árbitros e meteorologia não são verificados nesta versão.',
  'O modelo não foi calibrado; o cenário baixo é sensibilidade, não intervalo de confiança.',
  'Confirma que o jogo ainda não começou, sobretudo se a fonte não indicar hora.']};
}
export async function checkStatManual({league,fixture,optionId,odd}){
 if(!LEAGUES[league])throw Error('Competição inválida.');
 const data=await loadLeague(league);
 const f=findFixture(data.fixtures,fixture||{});
 if(!f)throw Error('Jogo não encontrado no calendário atual. Atualiza o radar.');
 if(f.date<new Date().toISOString().slice(0,10))throw Error('Este jogo já passou.');
 const e=estimateMatch(data.matches,f.home,f.away,f.date);
 if(!e.ready)throw Error('Histórico insuficiente para esta partida.');
 return {fixture:f,quality:e.quality,validation:validatePrice(e,optionId,odd)};
}
