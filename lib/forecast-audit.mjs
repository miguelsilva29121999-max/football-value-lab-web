// Auditoria cronologica do modelo: cada previsao usa apenas jogos anteriores.
// Nao e calibracao de probabilidades nem prova de rentabilidade.
// Para limitar o custo nas funcoes gratuitas, examina ate maxGames jogos recentes.
import {estimateMatch, probabilityFor} from './model.mjs';
const round=n=>Math.round(n*10000)/10000;
const defs=[
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
 return null; // Mercados sem auditoria nao herdam indevidamente a qualidade de outros.
}
function bin(p){return Math.min(4,Math.floor(p*5));}
export function auditForecasts(matches,{maxGames=65,minPrior=80,minObservations=25}={}){
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
   const raw=probabilityFor(prediction,def.market,def.selection,def.point??null);
   if(!raw||!Number.isFinite(raw.win))continue;
   const p=raw.win,y=def.outcome(match);
   const prior= Math.min(.99,Math.max(.01,(past.reduce((a,m)=>a+def.outcome(m),0)+5)/(past.length+10)));
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
