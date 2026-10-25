// V4 - procura orientada por diversidade de mercados e validação manual.
// Sem cotação REAL, uma seleção nunca é considerada entrada.
import {allMarketOptions,estimateMatch,probabilityFor,normalizedTeam,marketName,LEAGUES} from './model.mjs';
import {loadLeague,findFixture} from './providers.mjs';
import {recentEvidence,targetOdds,validatePrice} from './statfirst.mjs';

const OPTIONS = allMarketOptions().filter(o=>!['cards','dnb'].includes(o.market));
const ALLOWED_IDS = new Map(OPTIONS.map(o=>[o.id,o]));
const TYPES = Object.freeze({
 'h2h':'Resultado / proteção','dc':'Resultado / proteção','btts':'Golos e BTTS',
 'totals':'Golos e BTTS','team_goals':'Golos das equipas','half_totals':'Primeira parte',
 'corners':'Cantos','team_corners':'Cantos','shots':'Remates','sot':'Remates'
});
export const SEARCH_MODES = Object.freeze({
  balanced:{label:'Explorar todas as linhas',minTarget:1.55,maxTarget:4.5,minP:.24},
  higher:{label:'Procurar odds altas',minTarget:2.25,maxTarget:8,minP:.15},
  reliable:{label:'Mercados mais prováveis',minTarget:1.40,maxTarget:2.50,minP:.48}
});
const round=(n,dp=3)=>Number(n.toFixed(dp));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function qualityGroup(option){return TYPES[option.market]||'Outros';}
export function discoverMarkets(estimate,{matches=[],fixture=null,mode='balanced',maxMarkets=14}={}){
 if(!estimate?.ready) return [];
 const cfg=SEARCH_MODES[mode]||SEARCH_MODES.balanced;
 const pool=[];
 for(const o of OPTIONS){
  const p=probabilityFor(estimate,o.market,o.selection,o.point,o.team);
  if(!p||!Number.isFinite(p.win)||p.win<cfg.minP||p.win>.94)continue;
  const odds=targetOdds(p);if(!odds||odds.target>10||odds.target<1.15)continue;
  if(p.low<.065)continue;
  const evidence=fixture?recentEvidence(matches,fixture,o):null;
  const n=evidence?.combined.total||0,rate=evidence?.combined.rate;
  const gap=p.win-p.low;
  const inBand=odds.target>=cfg.minTarget&&odds.target<=cfg.maxTarget;
  const score=100*(.29*estimate.quality.dataScore+.20*p.low+.16*(1-gap)+.14*(n>=6?clamp(n/10,0,1):.30)+.10*(rate===null?.5:1-clamp(Math.abs(rate-p.win),0,1))+.11*(inBand?1:.25));
  const coverage=evidence?`${evidence.home.wins}/${evidence.home.total} casa · ${evidence.away.wins}/${evidence.away.total} fora`:null;
  const warnings=[];
  if(gap>.19)warnings.push('Estimativa sensível às alterações de cenário');
  if(n<6)warnings.push('Pouca amostra recente para este mercado');
  if(n>=6&&rate!=null&&rate+0.18<p.win)warnings.push('Frequência recente abaixo da projeção');
  if((evidence?.restHome??99)<3||(evidence?.restAway??99)<3)warnings.push('Descanso curto');
  pool.push({optionId:o.id,label:marketName(o),market:o.market,family:qualityGroup(o),side:o.selection,point:o.point??null,
   team:o.team??null,probability:round(p.win),low:round(p.low),high:round(p.high),push:round(p.push||0),
   oddFair:odds.fair,oddTarget:odds.target,score:round(score,1),inBand,coverage,
   evidence,warnings,quality:estimate.quality.dataScore});
 }
 pool.sort((a,b)=>Number(b.inBand)-Number(a.inBand)||b.score-a.score||b.probability-a.probability);
 // Diversidade primeiro: uma linha por grupo, depois outra por grupo, sem repetir a mesma seleção em linhas vizinhas.
 const result=[],familyCounts=new Map(),slots=new Set();
 for(const pass of [0,1,2]){
  for(const c of pool){
   if(result.length>=maxMarkets)break;
   const count=familyCounts.get(c.family)||0;
   if(count!==pass)continue;
   const slot=`${c.market}|${c.team||''}|${c.side}`;
   if(slots.has(slot))continue;
   result.push(c);slots.add(slot);familyCounts.set(c.family,count+1);
  }
 }
 return result.slice(0,maxMarkets).map((c,i)=>({...c,rank:i+1}));
}

export async function scanMarketLab(leagues,{mode='balanced',maxPerLeague=30,maxMarkets=14}={}){
 if(!SEARCH_MODES[mode])throw Error('Tipo de procura inválido.');
 const games=[],errors=[];let seen=0,missing=0;
 for(const league of leagues){
  try{
   const data=await loadLeague(league);
   const today=new Date().toISOString().slice(0,10);
   for(const f of data.fixtures.filter(f=>f.date>=today).slice(0,maxPerLeague)){
    seen++;
    const estimate=estimateMatch(data.matches,f.home,f.away,f.date);
    const fixture={league,date:f.date,home:f.home,away:f.away,id:f.id,time:f.time||null,timeKnown:!!f.timeKnown};
    const markets=discoverMarkets(estimate,{fixture,matches:data.matches,mode,maxMarkets});
    if(!markets.length)missing++;
    games.push({fixture,leagueName:LEAGUES[league].name,country:LEAGUES[league].country,quality:estimate.quality||null,
     reason:!estimate.ready?estimate.reasons.join(' '):!markets.length?'Sem mercados modeláveis com informação suficiente.':null,markets});
   }
  }catch(err){errors.push({league,message:err.message});}
 }
 games.sort((a,b)=>a.fixture.date.localeCompare(b.fixture.date)||b.markets.length-a.markets.length);
 return {version:'4.0',mode,seen,games:games.slice(0,140),truncated:Math.max(0,games.length-140),withMarkets:seen-missing,missing,errors,
   disclaimer:'São hipóteses para pedir odds. Não são entradas nem probabilidades calibradas; nenhuma combinação garante lucro.'};
}

const fixtureKey = f => [f.date,normalizedTeam(f.home),normalizedTeam(f.away)].join('|');
export function evaluateMultiple(legs,totalOdd){
 if(!Array.isArray(legs)||legs.length<2||legs.length>4)throw Error('A múltipla deve ter entre 2 e 4 jogos diferentes.');
 const odd=Number(String(totalOdd).replace(',','.'));
 if(!Number.isFinite(odd)||odd<=1.01||odd>2000)throw Error('Odd total inválida.');
 const ids=new Set();let p=1,pLow=1,productOdd=1;
 for(const l of legs){
  if(!l.fixture||!l.prob||!Number.isFinite(l.prob.win)||!Number.isFinite(l.prob.low))throw Error('Seleção sem estimativa completa.');
  const key=fixtureKey(l.fixture);if(ids.has(key))throw Error('Não combines duas seleções do mesmo jogo; a correlação não está modelada.');
  ids.add(key);
  if((l.prob.push||0)>0)throw Error('Este construtor ainda não suporta mercados com reembolso.');
  const legOdd=Number(String(l.odd).replace(',','.'));
  if(!Number.isFinite(legOdd)||legOdd<=1.01||legOdd>50)throw Error('Odd individual inválida.');
  p*=l.prob.win;pLow*=l.prob.low;productOdd*=legOdd;
 }
 const ev=p*odd-1,evLow=pLow*odd-1;
 const verdict=legs.some(l=>l.prob.win*Number(l.odd)-1<=0)?'OBSERVAR':ev<0.07?'OBSERVAR':evLow<-.40?'OBSERVAR':'HIPOTESE';
 return {numberOfLegs:legs.length,probability:round(p,5),scenarioLow:round(pLow,5),breakEven:round(1/odd,5),
  odd,productOfLegOdds:round(productOdd,3),ev:round(ev,5),evScenarioLow:round(evLow,5),
  verdict,why:verdict==='HIPOTESE'?'Triagem experimental positiva, dependente de estimativas não calibradas. Não é uma aposta validada.':
   'O preço ou a robustez não compensam segundo a triagem. Observar — não entrar.',
  cautions:['Probabilidades multiplicadas sob hipótese simplificadora de independência entre jogos.',
   'Uma múltipla NÃO cria valor por si; o preço de cada perna também importa.',
   'Confirma a odd total final e que todas as seleções continuam disponíveis antes do início.']};
}
export async function evaluateMultipleRequest({legs,totalOdd}={}){
 if(!Array.isArray(legs)||legs.length<2||legs.length>4)throw Error('Escolhe entre 2 e 4 seleções.');
 const dataCache=new Map(),prepared=[];
 for(const l of legs){
  const league=String(l?.league||''),optionId=String(l?.optionId||'');
  if(!LEAGUES[league]||!ALLOWED_IDS.has(optionId))throw Error('Seleção ou competição inválida.');
  if(!dataCache.has(league))dataCache.set(league,await loadLeague(league));
  const data=dataCache.get(league),fixture=findFixture(data.fixtures,l.fixture||{});
  if(!fixture)throw Error('Não foi possível confirmar um dos jogos. Atualiza o radar.');
  const now=new Date();if(fixture.date<now.toISOString().slice(0,10))throw Error('Não é possível avaliar jogos passados.');
  const est=estimateMatch(data.matches,fixture.home,fixture.away,fixture.date);
  if(!est.ready)throw Error('Histórico insuficiente para uma das seleções.');
  const opt=ALLOWED_IDS.get(optionId),prob=probabilityFor(est,opt.market,opt.selection,opt.point,opt.team);
  if(!prob)throw Error('Estatísticas insuficientes para esse mercado.');
  prepared.push({fixture,odd:l.odd,prob,market:marketName(opt),league});
 }
 const evaluation=evaluateMultiple(prepared,totalOdd);
 return {evaluation,legs:prepared.map(l=>({fixture:l.fixture,league:l.league,market:l.market,odd:Number(String(l.odd).replace(',','.')),
  p:round(l.prob.win),pLow:round(l.prob.low)}))};
}
