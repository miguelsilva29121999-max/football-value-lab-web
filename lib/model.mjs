// Football Value Lab v2.1. Probabilidades exploratórias; cenários de sensibilidade não são intervalos de confiança.
const clip=(n,a,b)=>Math.max(a,Math.min(b,n));
const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
export const LEAGUES={
 E0:{name:'Premier League',country:'Inglaterra',sport:'soccer_epl',open:'en.1'},
 E1:{name:'Championship',country:'Inglaterra',sport:'soccer_efl_champ',open:'en.2'},
 E2:{name:'League One',country:'Inglaterra',sport:'soccer_england_league1',open:'en.3'},
 E3:{name:'League Two',country:'Inglaterra',sport:'soccer_england_league2',open:'en.4'},
 SC0:{name:'Premiership',country:'Escócia',sport:'soccer_scotland_premiership',open:'sc.1'},
 SC1:{name:'Championship',country:'Escócia',open:'sc.2'},
 D1:{name:'Bundesliga',country:'Alemanha',sport:'soccer_germany_bundesliga',open:'de.1'},
 D2:{name:'2. Bundesliga',country:'Alemanha',sport:'soccer_germany_bundesliga2',open:'de.2'},
 I1:{name:'Serie A',country:'Itália',sport:'soccer_italy_serie_a',open:'it.1'},
 I2:{name:'Serie B',country:'Itália',sport:'soccer_italy_serie_b',open:'it.2'},
 SP1:{name:'La Liga',country:'Espanha',sport:'soccer_spain_la_liga',open:'es.1'},
 SP2:{name:'Segunda División',country:'Espanha',sport:'soccer_spain_segunda_division',open:'es.2'},
 F1:{name:'Ligue 1',country:'França',sport:'soccer_france_ligue_one',open:'fr.1'},
 F2:{name:'Ligue 2',country:'França',sport:'soccer_france_ligue_two',open:'fr.2'},
 N1:{name:'Eredivisie',country:'Países Baixos',sport:'soccer_netherlands_eredivisie',open:'nl.1'},
 B1:{name:'Pro League',country:'Bélgica',sport:'soccer_belgium_first_div',open:'be.1'},
 P1:{name:'Primeira Liga',country:'Portugal',sport:'soccer_portugal_primeira_liga',open:'pt.1'},
 T1:{name:'Süper Lig',country:'Turquia',sport:'soccer_turkey_super_league',open:'tr.1'},
 G1:{name:'Super League',country:'Grécia',sport:'soccer_greece_super_league',open:'gr.1'},
 EC:{name:'National League',country:'Inglaterra',open:'en.5'},
 SC2:{name:'League One',country:'Escócia',open:'sc.3'},
 SC3:{name:'League Two',country:'Escócia',open:'sc.4'}
};
export const POLICY={minOdd:1.55,maxOdd:3.40,minP:0.60,minEv:0.06,probHaircut:0.055,maxOddsAgeHours:3,minGames:10,minVenue:5,halfLifeDays:100,scenarioMin:0.12,scenarioMax:0.35,scenarioBase:0.17,minDataScore:0.52};
// Uma triagem equilibrada é exploratória. Um EV positivo estimado NÃO demonstra valor real.
export const BALANCED_POLICY={...POLICY,mode:'balanced',minCentralP:0.56,minCentralEv:0.07,minEv:-0.12};
export const policyForMode=mode=>mode==='conservative'?POLICY:BALANCED_POLICY;
export function normalizedTeam(value){
 let n=String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\b(fc|afc|cf|sc|ac|the|club|clube|football|futebol|de|do|da|cd|ud|sd)\b/g,' ').replace(/\s+/g,' ').trim();
 const map={
 'man utd':'manchester united','man united':'manchester united','man city':'manchester city','manchester utd':'manchester united','manchester united':'manchester united',
 'brighton and hove albion':'brighton','brighton hove albion':'brighton','brighton':'brighton',
 'tottenham hotspur':'tottenham','spurs':'tottenham','tottenham':'tottenham','wolves':'wolverhampton','wolverhampton wanderers':'wolverhampton',
 'west ham united':'west ham','west ham':'west ham','nottm forest':'nottingham forest','nott forest':'nottingham forest','nottingham forest':'nottingham forest',
 'leeds united':'leeds','newcastle united':'newcastle','ipswich town':'ipswich','hull city':'hull','leicester city':'leicester',
 'internazionale':'inter','inter milan':'inter','inter':'inter','ac milan':'milan','milan':'milan',
 'bayern munchen':'bayern','bayern munich':'bayern','bayern':'bayern','borussia dortmund':'dortmund','bor dortmund':'dortmund',
 'psg':'paris saint germain','paris sg':'paris saint germain','paris saint germain':'paris saint germain',
 'atletico de madrid':'atletico madrid','atletico madrid':'atletico madrid','athletic bilbao':'athletic',
 'real betis':'betis','betis balompie':'betis','sporting lisboa':'sporting','sporting portugal':'sporting',
 'sp lisbon':'sporting','sp lisboa':'sporting','sporting lisbon':'sporting','sporting lisbon portugal':'sporting',
 'sporting clube portugal':'sporting','sporting cp':'sporting','sporting':'sporting',
 'sport lisboa e benfica':'benfica','sl benfica':'benfica','benfica':'benfica','fc porto':'porto','porto':'porto',
 'cs maritimo':'maritimo','maritimo':'maritimo','maritimo madeira':'maritimo',
 'vitoria guimaraes':'vitoria guimaraes','guimaraes':'vitoria guimaraes','sporting braga':'braga','sp braga':'braga','braga':'braga','desportivo nacional':'nacional','nacional madeira':'nacional',
 'olympique marseille':'marseille','olympique lyonnais':'lyon','bayer leverkusen':'leverkusen'
 };return map[n]||n;
}
const same=(a,b)=>normalizedTeam(a)===normalizedTeam(b);
const validNum=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function poissonUnder(lambda,line){
 if(!Number.isFinite(lambda)||lambda<=0||!Number.isFinite(line))return null;
 let p=Math.exp(-lambda),s=p;const n=Math.floor(line);for(let k=1;k<=n;k++){p*=lambda/k;s+=p;}
 return clip(s,0,1);
}
export function poissonGoals(lh,la){
 const h=Array.from({length:18},(_,k)=>{let p=Math.exp(-lh);for(let j=1;j<=k;j++)p*=lh/j;return p;});
 const a=Array.from({length:18},(_,k)=>{let p=Math.exp(-la);for(let j=1;j<=k;j++)p*=la/j;return p;});
 let home=0,draw=0,away=0,mass=0;for(let i=0;i<18;i++)for(let j=0;j<18;j++){const p=h[i]*a[j];mass+=p;if(i>j)home+=p;else if(i===j)draw+=p;else away+=p;}
 return {home:home/mass,draw:draw/mass,away:away/mass,btts:(1-Math.exp(-lh))*(1-Math.exp(-la)),homeLambda:lh,awayLambda:la};
}
function teamGames(matches,team,cutoff){return matches.filter(m=>m.date<cutoff&&(same(team,m.home)||same(team,m.away))).sort((a,b)=>b.date.localeCompare(a.date));}
const CONFIG={goals:['hg','ag'],half:['hhg','hag'],corners:['hc','ac'],yellows:['hy','ay'],shots:['hs','as'],sot:['hst','ast']};
// Decaimento exponencial para dar mais peso a jogos recentes, sem eliminar a época anterior.
function weight(m,cutoff,halfLife=POLICY.halfLifeDays){
 const days=(Date.parse(cutoff+'T00:00:00Z')-Date.parse(m.date+'T00:00:00Z'))/864e5;
 return Math.exp(-Math.LN2*Math.max(0,days)/halfLife);
}
function weightedMean(items,field,cutoff){
 const den=items.reduce((s,m)=>s+weight(m,cutoff),0);
 return den>0?items.reduce((s,m)=>s+weight(m,cutoff)*m[field],0)/den:null;
}
function effectiveCount(items,cutoff){
 const weights=items.map(m=>weight(m,cutoff));const sum=weights.reduce((a,b)=>a+b,0),sumSq=weights.reduce((a,b)=>a+b*b,0);
 return sumSq>0?sum*sum/sumSq:0;
}
function weightedVariance(items,field,cutoff){
 const mean=weightedMean(items,field,cutoff),den=items.reduce((s,m)=>s+weight(m,cutoff),0);
 return mean===null||den===0?null:items.reduce((s,m)=>s+weight(m,cutoff)*(m[field]-mean)**2,0)/den;
}
function fitRates(completed,homeVenue,awayVenue,fields,minVenue,cutoff){
 const [h,a]=fields;
 const complete=list=>list.filter(m=>validNum(m[h])&&validNum(m[a]));
 const lg=complete(completed),hv=complete(homeVenue),av=complete(awayVenue);
 if(lg.length<60||hv.length<minVenue||av.length<minVenue)return {ready:false,coverage:{league:lg.length,home:hv.length,away:av.length}};
 const leagueH=weightedMean(lg,h,cutoff),leagueA=weightedMean(lg,a,cutoff);
 if(!leagueH||!leagueA)return {ready:false,coverage:{league:lg.length,home:hv.length,away:av.length}};
 // Regularização por médias da liga e força defensiva do adversário; recortes por casa e fora.
 const prior=8;
 const smooth=(xs,key,rate)=>{
  const den=xs.reduce((s,m)=>s+weight(m,cutoff),0);
  return (xs.reduce((s,m)=>s+weight(m,cutoff)*m[key],0)+prior*rate)/(den+prior);
 };
 const ha=smooth(hv,h,leagueH),hd=smooth(hv,a,leagueA),aa=smooth(av,a,leagueA),ad=smooth(av,h,leagueH);
 const cap=fields===CONFIG.goals||fields===CONFIG.half?4:fields===CONFIG.corners?16:fields===CONFIG.yellows?8:fields===CONFIG.sot?14:36;
 const home=clip(ha*ad/leagueH,.07,cap),away=clip(aa*hd/leagueA,.07,cap);
 const nHome=effectiveCount(hv,cutoff),nAway=effectiveCount(av,cutoff);
 // Esta amplitude e uma analise de sensibilidade, NAO um intervalo de confianca estatistico.
 const uncertainty=clip(POLICY.scenarioBase+0.40/Math.sqrt(Math.max(2,Math.min(nHome,nAway))),POLICY.scenarioMin,POLICY.scenarioMax);
 // Para contagens muito dispersas, permitimos variancia superior a media.
 // Estima-se uma mistura conservadora entre a dispersao observada e o modelo de Poisson.
 const combinedMean=(leagueH+leagueA)/2;
 const combinedVar=((weightedVariance(lg,h,cutoff)||leagueH)+(weightedVariance(lg,a,cutoff)||leagueA))/2;
 const rawDisp=combinedMean>0?combinedVar/combinedMean:1;
 const dispersion=fields===CONFIG.goals||fields===CONFIG.half?1:clip(1+0.65*(rawDisp-1),1,3.2);
 return {ready:true,home,away,coverage:{league:lg.length,home:hv.length,away:av.length},leagueH,leagueA,dispersion,
  effectiveSamples:{home:Number(nHome.toFixed(1)),away:Number(nAway.toFixed(1))},uncertainty:Number(uncertainty.toFixed(3))};
}
// Cauda inferior de uma binomial negativa parametrizada por media e excesso de dispersao.
// Quando dispersion=1, coincide com o Poisson.
export function countUnder(lambda,line,dispersion=1){
 if(!Number.isFinite(lambda)||lambda<=0||!Number.isFinite(line))return null;
 if(dispersion<=1.0001)return poissonUnder(lambda,line);
 const r=lambda/(dispersion-1),p=r/(r+lambda);
 let term=Math.pow(p,r),sum=term;
 for(let k=1;k<=Math.floor(line);k++){term*=(k-1+r)/k*(1-p);sum+=term;}
 return clip(sum,0,1);
}

export function estimateMatch(matches,home,away,date){
 const cutoff=date.slice(0,10),completed=matches.filter(m=>m.date<cutoff).sort((a,b)=>b.date.localeCompare(a.date));
 const homeAll=teamGames(completed,home,cutoff),awayAll=teamGames(completed,away,cutoff);
 const homeVenue=homeAll.filter(m=>same(home,m.home)).slice(0,18);
 const awayVenue=awayAll.filter(m=>same(away,m.away)).slice(0,18);
 let quality={homeGames:homeAll.length,awayGames:awayAll.length,homeVenue:homeVenue.length,awayVenue:awayVenue.length,leagueGames:completed.length,
  latestHome:homeAll[0]?.date||null,latestAway:awayAll[0]?.date||null};
 const reasons=[];if(homeAll.length<POLICY.minGames||awayAll.length<POLICY.minGames)reasons.push('Menos de 10 jogos recentes por equipa.');
 if(homeVenue.length<POLICY.minVenue||awayVenue.length<POLICY.minVenue)reasons.push('Menos de 5 jogos em casa/fora.');
 if(completed.length<60)reasons.push('Amostra da liga ainda curta.');
 for(const [name,dateLast] of [['casa',quality.latestHome],['fora',quality.latestAway]]){
  const gap=dateLast?(Date.parse(cutoff+'T00:00:00Z')-Date.parse(dateLast+'T00:00:00Z'))/864e5:999;
  if(gap>55)reasons.push(`Dados da equipa ${name} desatualizados (${Math.round(gap)} dias).`);
 }
 if(reasons.length)return {ready:false,reasons,quality};
 const rates={};for(const [key,fields] of Object.entries(CONFIG))rates[key]=fitRates(completed,homeVenue,awayVenue,fields,key==='goals'?5:6,cutoff);
 if(!rates.goals.ready)return {ready:false,reasons:['Dados de golos insuficientes para o modelo.'],quality,rates};
 if(rates.goals.home>3.75||rates.goals.away>3.75)return {ready:false,reasons:['Estimativa de golos fora do intervalo plausível.'],quality,rates};
 // Qualidade de recolha nao equivale a confianca/poder preditivo do modelo.
 const recency=[quality.latestHome,quality.latestAway].map(d=>(Date.parse(cutoff+'T00:00:00Z')-Date.parse(d+'T00:00:00Z'))/864e5);
 const recencyScore=clip(1-Math.max(...recency)/100,0,1);
 const venueScore=clip(Math.min(homeVenue.length,awayVenue.length)/16,0,1);
 const dataScore=Number((.45*venueScore+.35*clip(Math.min(homeAll.length,awayAll.length)/25,0,1)+.20*recencyScore).toFixed(2));
 quality={...quality,dataScore,qualityLabel:dataScore>=.78?'Boa cobertura':dataScore>=.52?'Cobertura moderada':'Cobertura fraca'};
 return {ready:true,quality,rates,prob:poissonGoals(rates.goals.home,rates.goals.away),
  caveats:['Probabilidades exploratorias: sem validacao nem calibracao preditiva.',
  'Amplitude de cenarios = teste de sensibilidade, NAO intervalo de confianca.',
  'Cantos, cartoes e remates usam sobredispersao estimada; onzes, lesoes e arbitro nao incluidos.']};
}
export const MARKET_GROUPS=[
 {key:'h2h',label:'Resultado final'},{key:'dc',label:'Dupla hipótese'},{key:'dnb',label:'Empate anula'},
 {key:'btts',label:'Ambas marcam'},{key:'totals',label:'Golos totais'},{key:'team_goals',label:'Golos por equipa'},
 {key:'half_totals',label:'Golos na 1.ª parte'},{key:'corners',label:'Cantos totais'},
 {key:'team_corners',label:'Cantos por equipa'},{key:'cards',label:'Cartões amarelos'},
 {key:'shots',label:'Remates totais'},{key:'sot',label:'Remates à baliza'}
];
const val=(estimate,stat)=>{const r=estimate.rates?.[stat];return r?.ready?r:null;};
// Retorna p de vitória e push separado (empate anula aposta). Nunca mistura reembolso com vitória.
// Calcula a probabilidade central e cenarios adversos (variando parametros do jogo).
// Nao existe garantia de cobertura estatistica; a amplitude e uma regra de prudencia.
export function probabilityFor(estimate,market,selection,point=null,team=null){
 if(!estimate?.ready)return null;
 const goals=['h2h','dc','dnb','btts'].includes(market);
 const kind={h2h:'goals',dc:'goals',dnb:'goals',btts:'goals',totals:'goals',team_goals:'goals',half_totals:'half',corners:'corners',team_corners:'corners',cards:'yellows',shots:'shots',sot:'sot'}[market];
 const r=estimate.rates?.[kind];if(!r?.ready)return null;
 const countMarket=!goals;
 if(countMarket&&(!Number.isFinite(Number(point))||!['over','under'].includes(selection)))return null;
 const limits=[1-r.uncertainty,1,1+r.uncertainty];
 const scenario=(h,a)=>{
  if(goals){const g=poissonGoals(h,a);if(market==='h2h')return {win:g[selection]??null,push:0};
   if(market==='dc')return {win:{'1X':g.home+g.draw,'X2':g.away+g.draw,'12':g.home+g.away}[selection]??null,push:0};
   if(market==='dnb')return {win:g[selection]??null,push:g.draw};
   if(market==='btts')return {win:selection==='yes'?g.btts:selection==='no'?1-g.btts:null,push:0};}
  const total=!['team_goals','team_corners'].includes(market);
  const lambda=total?h+a:team==='home'?h:team==='away'?a:null;
  if(lambda===null)return null;
  const under=countUnder(lambda,Number(point),r.dispersion);
  if(under===null)return null;
  return {win:selection==='under'?under:1-under,push:0};
 };
 const central=scenario(r.home,r.away);
 if(!central||central.win===null)return null;
 const scenarios=[];
 for(const fh of limits)for(const fa of limits){const s=scenario(r.home*fh,r.away*fa);if(s?.win!=null)scenarios.push(s);}
 return {...central,scenarios,low:Math.min(...scenarios.map(x=>x.win)),high:Math.max(...scenarios.map(x=>x.win)),
  uncertainty:r.uncertainty,dispersion:r.dispersion,coverage:r.coverage};
}
export function scoreOffer(probResult,odd,policy=POLICY){
 const p=probResult?.win,push=probResult?.push||0;
 if(!Number.isFinite(p)||p<=0||p>=1||!Number.isFinite(odd)||odd<=1||push<0||p+push>1.00001)return {status:'REJEITAR',why:'Dados de probabilidade/odd inválidos.'};
 const scenarios=probResult.scenarios?.length?probResult.scenarios:[{win:Math.max(.001,p-policy.probHaircut),push}];
 const worst=[...scenarios].sort((a,b)=>(a.win*odd+a.push-1)-(b.win*odd+b.push-1))[0];
 const conservative=worst.win,ev=p*odd+push-1,evSafe=worst.win*odd+worst.push-1;
 const oddsFair=(1-push)/p;
 const effective=conservative/Math.max(.001,1-worst.push);
 const centralEffective=p/Math.max(.001,1-push);
 const fails=[];
 if(odd<policy.minOdd||odd>policy.maxOdd)fails.push('Odd fora do intervalo pretendido.');
 if(policy.mode==='balanced'){
  if(centralEffective<policy.minCentralP)fails.push('Probabilidade central insuficiente.');
  if(ev<policy.minCentralEv)fails.push('Vantagem central estimada insuficiente.');
  if(evSafe<policy.minEv)fails.push('Estimativa demasiado sensível ao cenário adverso.');
 }else{
  if(effective<policy.minP)fails.push('Probabilidade no cenário adverso insuficiente.');
  if(evSafe<policy.minEv)fails.push('Sem margem de valor no cenário adverso.');
 }
 const validOdds=odd>=policy.minOdd&&odd<=policy.maxOdd;
 const failureCodes=[];
 if(!validOdds)failureCodes.push('ODD_FORA_INTERVALO');
 if(policy.mode==='balanced'){
  if(centralEffective<policy.minCentralP)failureCodes.push('PROBABILIDADE');
  if(ev<policy.minCentralEv)failureCodes.push('VALOR_ESPERADO');
  if(evSafe<policy.minEv)failureCodes.push('CENARIO_ADVERSO');
 }else{
  if(effective<policy.minP)failureCodes.push('PROBABILIDADE');
  if(evSafe<policy.minEv)failureCodes.push('CENARIO_ADVERSO');
 }
 
 // A lista de observação exige odd REAL e EV central positivo. A origem da odd
 // é verificada noutra camada. Nunca promove automaticamente a uma aposta.
 const watch=policy.mode==='balanced'&&validOdds&&centralEffective>=0.53&&ev>=0.035&&evSafe>=-0.30;
 const status=fails.length?(watch?'OBSERVAR':'REJEITAR'):'POTENCIAL';
 return {status,why:fails.join(' '),failureCodes,odd,p,push,
  pLow:probResult.low??conservative,pHigh:probResult.high??p,pConservative:conservative,pEffective:effective,ev,evSafe,
  breakEven:(1-push)/odd,oddFair:oddsFair,robustness:Math.max(0,ev-evSafe),uncertainty:probResult.uncertainty??null,
  neededOddCentral:(1-push+0.07)/p,neededOddScenario:(1-worst.push+0.06)/Math.max(.001,worst.win)};
}

export const MARKET_LINES={totals:[0.5,1.5,2.5,3.5,4.5,5.5],team_goals:[0.5,1.5,2.5,3.5],half_totals:[0.5,1.5,2.5,3.5],corners:[6.5,7.5,8.5,9.5,10.5,11.5,12.5],team_corners:[2.5,3.5,4.5,5.5,6.5,7.5],cards:[2.5,3.5,4.5,5.5,6.5,7.5],shots:[16.5,19.5,22.5,25.5,28.5],sot:[5.5,7.5,9.5,11.5,13.5]};
export function marketName(o){
 const l=String(o.point).replace('.',',');
 const side=o.team==='home'?'Casa':o.team==='away'?'Fora':'';
 if(o.market==='h2h')return {home:'Vitória casa',draw:'Empate',away:'Vitória fora'}[o.selection]||'?';
 if(o.market==='dc')return 'Dupla hipótese '+o.selection;
 if(o.market==='dnb')return 'Empate anula — '+(o.selection==='home'?'Casa':'Fora');
 if(o.market==='btts')return o.selection==='yes'?'Ambas marcam — Sim':'Ambas marcam — Não';
 const metric={totals:'golos',team_goals:'golos',half_totals:'golos 1.ª parte',corners:'cantos',team_corners:'cantos',cards:'cartões amarelos',shots:'remates',sot:'remates à baliza'}[o.market]||'?';
 return `${o.selection==='over'?'Mais':'Menos'} de ${l} ${metric}${side?' — '+side:''}`;
}
export function allMarketOptions(){
 const entries=[...['home','draw','away'].map(selection=>({market:'h2h',selection})),...['1X','X2','12'].map(selection=>({market:'dc',selection})),...['home','away'].map(selection=>({market:'dnb',selection})),...['yes','no'].map(selection=>({market:'btts',selection}))];
 for(const [market,lines] of Object.entries(MARKET_LINES))for(const point of lines)for(const selection of ['over','under']){
  if(['team_goals','team_corners'].includes(market))for(const team of ['home','away'])entries.push({market,point,selection,team});
  else entries.push({market,point,selection});
 }
 return entries.map((o,i)=>({...o,id:String(i),label:marketName(o)}));
}
