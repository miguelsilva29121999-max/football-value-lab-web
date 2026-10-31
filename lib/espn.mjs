// Fonte complementar de calendário e resultados, sem chave.
// Endpoint ESPN não oficial: disponibilidade/cobertura e formato podem mudar.
// As horas são publicadas pelo fornecedor, não uma verificação live.
export const ESPN_CODES = Object.freeze({
 E0:'eng.1',E1:'eng.2',E2:'eng.3',E3:'eng.4',EC:'eng.5',
 SC0:'sco.1',SC1:'sco.2',SC2:'sco.3',SC3:'sco.4',
 D1:'ger.1',D2:'ger.2',I1:'ita.1',I2:'ita.2',
 SP1:'esp.1',SP2:'esp.2',F1:'fra.1',F2:'fra.2',
 N1:'ned.1',B1:'bel.1',P1:'por.1',T1:'tur.1',G1:'gre.1',
 BR1:'bra.1',BR2:'bra.2',AR1:'arg.1',AR_CUP:'arg.copa',
 CL1:'chi.1',CO1:'col.1',PY1:'par.1',PE1:'per.1',
 UY1:'uru.1',BO1:'bol.1',EQ1:'ecu.1',VE1:'ven.1',
 MX1:'mex.1',MX2:'mex.2',US1:'usa.1',USL:'usa.usl.1',
 LIB:'conmebol.libertadores',SUD:'conmebol.sudamericana'
});
const memo=new Map(),inflight=new Map();
const dayString=d=>new Date(d).toISOString().slice(0,10);
const isoDay=d=>dayString(d).replaceAll('-','');
const shift=(date,days)=>new Date(new Date(date).valueOf()+days*86400000);
const localDay=iso=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const integerScore=v=>{
 const n=Number(v && typeof v==='object'?v.value:v);
 return v===null||v===undefined||v===''||!Number.isInteger(n)||n<0||n>40?null:n;
};
export function parseEspnEvent(event,league){
 const contest=event?.competitions?.[0];
 const players=contest?.competitors||[];
 const home=players.find(p=>p.homeAway==='home'),away=players.find(p=>p.homeAway==='away');
 const kickoff=event?.date||contest?.date;
 if(!home?.team||!away?.team||!kickoff||!Number.isFinite(Date.parse(kickoff)))return null;
 const date=localDay(kickoff),homeName=home.team.displayName||home.team.name,awayName=away.team.displayName||away.team.name;
 if(!homeName||!awayName)return null;
 const state=event?.status?.type?.state||contest?.status?.type?.state||'';
 const completed=event?.status?.type?.completed===true||contest?.status?.type?.completed===true;
 const hg=integerScore(home.score),ag=integerScore(away.score);
 return {
  id:[league,date,encodeURIComponent(homeName),encodeURIComponent(awayName)].join('|'),
  league,date,home:homeName,away:awayName,time:new Date(kickoff).toISOString(),
  kickoffUtc:new Date(kickoff).toISOString(),source:'ESPN',
  timeStatus:'HORARIO_PUBLICADO_NAO_LIVE',state,completed,hg,ag
 };
}
// A ESPN descontinuou dates=YYYYMMDD-YYYYMMDD em setembro de 2026.
// Datas isoladas e meses (YYYYMM) continuam válidos. Cache por dia/mês.
async function oneEspnBucket(slug,period,{fetcher=fetch,timeoutMs=6500,ttlMs=4*60_000}={}){
 const key='score:'+slug+':'+period,found=memo.get(key);
 if(found&&found.until>Date.now())return found.value;
 if(inflight.has(key))return inflight.get(key);
 const work=(async()=>{
  const url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+encodeURIComponent(slug)+'/scoreboard?dates='+period+'&limit=750';
  const response=await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw Error('ESPN '+slug+': HTTP '+response.status+' (data '+period+')');
  const data=await response.json();
  if(!Array.isArray(data?.events))throw Error('ESPN '+slug+': resposta sem jogos ('+period+').');
  const value={events:data.events,url};
  memo.set(key,{value,until:Date.now()+ttlMs});
  return value;
 })();
 inflight.set(key,work);
 try{return await work;}finally{inflight.delete(key);}
}
function calendarBuckets(from,to){
 const start=new Date(from),end=new Date(to);
 if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf())||end<start)throw Error('Intervalo de calendário inválido.');
 const days=Math.floor((Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate())-
   Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()))/86400000)+1;
 if(days<=15){
  return Array.from({length:days},(_,i)=>isoDay(shift(start,i)));
 }
 const periods=[];
 let y=start.getUTCFullYear(),m=start.getUTCMonth();
 while(y<end.getUTCFullYear()||(y===end.getUTCFullYear()&&m<=end.getUTCMonth())){
  periods.push(String(y)+String(m+1).padStart(2,'0'));
  m++;if(m===12){m=0;y++;}
 }
 return periods;
}
export async function fetchEspnEvents(league,from,to,{fetcher=fetch,timeoutMs=6500,ttlMs=4*60_000}={}){
 const slug=ESPN_CODES[league];if(!slug)throw Error('Liga sem identificador ESPN.');
 const periods=calendarBuckets(from,to);
 const responses=[];
 // Em janelas longas, consultar até 3 meses em paralelo, sem disparar dezenas de pedidos.
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,periods.length)},async()=>{
  for(;;){
   const i=cursor++;if(i>=periods.length)return;
   try{responses[i]={ok:true,value:await oneEspnBucket(slug,periods[i],{fetcher,timeoutMs,ttlMs})};}
   catch(error){responses[i]={ok:false,error};}
  }
 }));
 const accepted=responses.filter(x=>x?.ok);
 if(!accepted.length)throw new Error(responses.filter(Boolean).map(x=>x.error?.message).join('; ')||'ESPN sem resposta.');
 const low=new Date(from).valueOf()-86400000,high=new Date(to).valueOf()+86400000;
 const matches=new Map();
 for(const item of accepted)for(const raw of item.value.events){
  const e=parseEspnEvent(raw,league);
  if(e&&Date.parse(e.kickoffUtc)>=low&&Date.parse(e.kickoffUtc)<=high)matches.set(e.id,e);
 }
 return {events:[...matches.values()],url:accepted.map(x=>x.value.url).join(' ; '),partial:accepted.length!==periods.length,
  failedBuckets:periods.length-accepted.length};
}
const uniqueEvents=events=>[...new Map(events.map(x=>[x.id,x])).values()];
export async function loadEspnLeague(league,now=new Date()){
 const today=new Date(now),historyFrom=shift(today,-210),futureTo=shift(today,21);
 const [past,future]=await Promise.allSettled([
  fetchEspnEvents(league,historyFrom,shift(today,-1),{ttlMs:45*60_000,timeoutMs:10000}),
  fetchEspnEvents(league,shift(today,-1),futureTo,{timeoutMs:10000})
 ]);
 const ok=[past,future].filter(r=>r.status==='fulfilled').map(r=>r.value);
 if(!ok.length)throw Error('ESPN indisponível para '+league+': '+[past,future].filter(r=>r.status==='rejected').map(r=>r.reason.message).join('; '));
 const all=uniqueEvents(ok.flatMap(v=>v.events));
 const matches=all.filter(e=>e.completed&&e.hg!==null&&e.ag!==null&&Date.parse(e.kickoffUtc)<today.valueOf()).map(e=>({
  date:e.date,home:e.home,away:e.away,hg:e.hg,ag:e.ag,hhg:null,hag:null,hc:null,ac:null,hy:null,ay:null,hs:null,as:null,hst:null,ast:null
 })).sort((a,b)=>a.date.localeCompare(b.date));
 const fixtures=all.filter(e=>!e.completed&&e.state!=='in'&&e.state!=='post'&&Date.parse(e.kickoffUtc)>today.valueOf()).map(e=>({
  id:e.id,league,date:e.date,home:e.home,away:e.away,time:e.time,kickoffUtc:e.kickoffUtc,
  source:'ESPN',timeKnown:true,timeStatus:e.timeStatus
 })).sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc)).slice(0,90);
 const issues=[past,future].filter(x=>x.status==='rejected').map(x=>x.reason.message);
 return {matches,fixtures,source:ok.map(x=>x.url),snapshot:null,issues,historicalGames:matches.length};
}
export async function scanNextHours(leagues,now=new Date(),hours=5){
 const start=new Date(now),end=new Date(start.valueOf()+hours*3600000);
 const from=shift(start,-0.25),to=shift(end,0.25);
 const requested=leagues.filter(k=>ESPN_CODES[k]);
 // Diagnóstico rápido: se nenhum destes três endpoints responder, não insistir em 40 ligas.
 const probes=['E0','BR1','P1'].filter(k=>requested.includes(k));
 const probeResults=await Promise.allSettled(probes.map(league=>fetchEspnEvents(league,from,to,{timeoutMs:5500})));
 if(probes.length&&probeResults.every(x=>x.status==='rejected')){
  const issues=probeResults.map((x,i)=>({league:probes[i],error:x.reason?.message||'Sem resposta'}));
  return {matches:[],requestedLeagues:requested.length,checkedLeagues:0,failedLeagues:requested.length,
   issues,fetchedAt:start.toISOString(),hours,source:'ESPN',warning:'A ESPN não respondeu aos pedidos iniciais.'};
 }
 // Pool limitado: evita dezenas de pedidos simultâneos à mesma fonte.
 const results=new Array(requested.length);
 let next=0;
 const worker=async()=>{
  for(;;){
   const i=next++;
   if(i>=requested.length)return;
   try{
    results[i]={status:'fulfilled',value:{league:requested[i],...await fetchEspnEvents(requested[i],from,to,{timeoutMs:8500})}};
   }catch(error){results[i]={status:'rejected',reason:error};}
  }
 };
 await Promise.all(Array.from({length:Math.min(8,requested.length)},worker));
 const matches=[],problems=[],sources=[];
 for(let i=0;i<results.length;i++){
  const r=results[i];
  if(r.status==='rejected'){problems.push({league:requested[i],error:r.reason.message});continue;}
  sources.push(r.value.url);
  for(const e of r.value.events){
   const ts=Date.parse(e.kickoffUtc);
   if(ts>=start.valueOf()&&ts<=end.valueOf()&&!e.completed&&e.state!=='in'&&e.state!=='post'){
    matches.push(e);
   }
  }
 }
 const seen=new Map();
 for(const e of matches)seen.set(e.id,e);
 const sorted=[...seen.values()].sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc));
 return {
  matches:sorted,requestedLeagues:requested.length,checkedLeagues:results.length-problems.length,
  failedLeagues:problems.length,issues:problems.slice(0,8),
  fetchedAt:start.toISOString(),hours,source:'ESPN (API pública não oficial)',
  warning:'Horários publicados pela ESPN, não confirmados por feed live. Apenas jogos previstos para começar; podem existir alterações, adiamentos e ligas não cobertas.'
 };
}
