// Auditoria cronologica do modelo: cada previsao usa apenas jogos anteriores.
// Nao e calibracao de probabilidades nem prova de rentabilidade.
// Para limitar o custo nas funcoes gratuitas, examina ate maxGames jogos recentes.
import {estimateMatch, probabilityFor} from './model.mjs';
const round=n=>Math.round(n*10000)/10000;
const coreDefs=[
 {key:'h2h_home',market:'h2h',selection:'home',outcome:m=>+(m.hg>m.ag)},
 {key:'h2h_draw',market:'h2h',selection:'draw',outcome:m=>+(m.hg===m.ag)},
 {key:'h2h_away',market:'h2h',selection:'away',outcome:m=>+(m.hg<m.ag)},
 {key:'btts_yes',market:'btts',selection:'yes',outcome:m=>+(m.hg>0&&m.ag>0)},
 {key:'btts_no',market:'btts',selection:'no',outcome:m=>+(m.hg===0||m.ag===0)},
 {key:'over25',market:'totals',selection:'over',point:2.5,outcome:m=>+(m.hg+m.ag>=3)},
 {key:'under25',market:'totals',selection:'under',point:2.5,outcome:m=>+(m.hg+m.ag<=2)}
];
export function metricForMarket(o){
 if(!o)return null;
 if(o.market==='h2h')return 'h2h_'+o.selection;
 if(o.market==='btts')return 'btts_'+o.selection;
 if(o.market==='totals'&&o.point===2.5)return o.selection==='over'?'over25':'under25';
 if(['totals','team_goals','half_totals','corners','team_corners','shots','sot'].includes(o.market)&&Number.isFinite(o.point)&&['over','under'].includes(o.selection))return ['other',o.market,o.selection,String(o.point),o.team||''].join('_');
 return null; // Mercados nao calculados nao herdam indevidamente a qualidade de outros.
}
function matchOutcomeForOption(m,o){
 const fields={totals:['hg','ag'],team_goals:[o.team==='home'?'hg':'ag'],half_totals:['hhg','hag'],
  corners:['hc','ac'],team_corners:[o.team==='home'?'hc':'ac'],shots:['hs','as'],sot:['hst','ast']}[o.market];
 if(!fields)return null;
 if(fields.some(f=>!Number.isFinite(m[f])))return null;
 const sum=fields.reduce((a,f)=>a+m[f],0);
 return +(o.selection==='over'?sum>o.point:sum<o.point);
}
function bin(p){return Math.min(4,Math.floor(p*5));}
export function auditForecasts(matches,{maxGames=65,minPrior=80,minObservations=25,markets=[]}={}){
 const defs=[...coreDefs],keys=new Set(defs.map(d=>d.key));
 for(const option of markets.slice(0,90)){
  const key=metricForMarket(option);
  if(!key||keys.has(key))continue;
  keys.add(key);
  defs.push({key,market:option.market,selection:option.selection,point:option.point,team:option.team,
   outcome:m=>matchOutcomeForOption(m,option)});
 }
 const all=(matches||[]).filter(m=>m&&/^\d{4}-\d{2}-\d{2}$/.test(m.date||'')&&Number.isInteger(m.hg)&&Number.isInteger(m.ag)&&m.hg>=0&&m.ag>=0)
   .sort((a,b)=>a.date.localeCompare(b.date));
 const stats=Object.fromEntries(defs.map(d=>[d.key,{n:0,bsModel:0,bsBaseline:0,pred:0,actual:0,base:0,bins:Array.from({length:5},()=>({n:0,pred:0,actual:0}))}]));
 let examined=0;
 for(let i=Math.max(minPrior,all.length-maxGames);i<all.length;i++){
  const match=all[i],past=all.slice(0,i).filter(m=>m.date<match.date);
  if(past.length<minPrior)continue;
  const prediction=estimateMatch(past,match.home,match.away,match.date);
  if(!prediction.ready)continue;
  examined++;
  for(const def of defs){
   const raw=probabilityFor(prediction,def.market,def.selection,def.point??null,def.team??null);
   if(!raw||!Number.isFinite(raw.win))continue;
   const p=raw.win,y=def.outcome(match);
   if(y===null)continue; // Colunas estatisticas em falta nao sao derrotas.
   const priorResults=past.map(m=>def.outcome(m)).filter(x=>x!==null);
   if(priorResults.length<60)continue;
   const prior= Math.min(.99,Math.max(.01,(priorResults.reduce((a,v)=>a+v,0)+5)/(priorResults.length+10)));
   const x=stats[def.key];x.n++;x.bsModel+=(p-y)**2;x.bsBaseline+=(prior-y)**2;x.pred+=p;x.actual+=y;x.base+=prior;
   const b=x.bins[bin(p)];b.n++;b.pred+=p;b.actual+=y;
  }
 }
 const output={};
 for(const def of defs){
  const x=stats[def.key],n=x.n;
  if(!n){output[def.key]={n:0,status:'SEM_AMOSTRA'};continue;}
  const brier=x.bsModel/n,baseline=x.bsBaseline/n,gap=x.pred/n-x.actual/n;
  // Brier mede erro probabilistico, nao isoladamente calibracao.
  const skill=baseline>0?1-brier/baseline:null;
  const status=n<minObservations?'AMOSTRA_INSUFICIENTE':(skill!==null&&skill<-.04||Math.abs(gap)>.12)?'DESFAVORAVEL':(skill!==null&&skill<.02||Math.abs(gap)>.07)?'INCONCLUSIVO':'MELHOR_QUE_BASELINE';
  output[def.key]={n,status,brier:round(brier),baselineBrier:round(baseline),brierSkill:skill===null?null:round(skill),
   meanPredicted:round(x.pred/n),observedFrequency:round(x.actual/n),meanBaseline:round(x.base/n),bias:round(gap),
   bins:x.bins.map(b=>({n:b.n,predicted:b.n?round(b.pred/b.n):null,observed:b.n?round(b.actual/b.n):null}))};
 }
 return {method:'avaliacao cronologica sem dados posteriores ao jogo avaliado; baseline com frequencia historica anterior',examined,marketResults:output,
  warnings:['A avaliacao historica nao comprova desempenho futuro ou lucro.','Brier Score agrega calibracao e discriminacao; nao equivale sozinho a uma curva de calibracao.','Alguns mercados nao tem historico auditado nesta versao.']};
}
