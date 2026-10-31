// Fallback de calendário sem chave: TheSportsDB v1 gratuita.
// No plano gratuito, a fonte limita resultados diários; pode apresentar apenas uma amostra.
const two=n=>String(n).padStart(2,'0');
const utcDay=d=>new Date(d).toISOString().slice(0,10);
const lisbonDay=iso=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const leagueMatchers=[
 [/brazil|brasileir|serie a.*brasil/i,'BR1'],[/serie b.*brasil|brasileir.*serie b/i,'BR2'],
 [/argentin.*primera|liga profesional/i,'AR1'],[/primera.*colomb|colomb.*primera/i,'CO1'],
 [/chilean|chile.*primera/i,'CL1'],[/paraguay|paraguai/i,'PY1'],
 [/uruguay|uruguai/i,'UY1'],[/peruvian|peru.*primera/i,'PE1'],
 [/portug.*primeira|primeira liga/i,'P1'],[/premier league|english premier/i,'E0'],
 [/english championship|efl championship/i,'E1'],[/spanish.*la liga|la liga/i,'SP1'],
 [/german bundesliga|bundesliga$/i,'D1'],[/italian serie a|serie a.*ital/i,'I1'],
 [/french ligue 1|ligue 1/i,'F1'],[/major league soccer|united states.*mls/i,'US1'],
 [/copa libertadores/i,'LIB'],[/sudamericana/i,'SUD'],
 [/mexican.*liga mx|liga mx/i,'MX1']
];
export function parseSportsDbEvent(event){
 if(String(event?.strSport||'').toLowerCase()!=='soccer')return null;
 const label=String(event?.strLeague||''),home=String(event?.strHomeTeam||''),away=String(event?.strAwayTeam||'');
 const league=leagueMatchers.find(([re])=>re.test(label))?.[1];
 const raw=String(event?.strTimestamp||'');
 if(!league||!home||!away||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(raw))return null;
 // TheSportsDB regista horas UTC mas pode omitir a letra Z.
 const time=new Date(raw.match(/(?:Z|[+-]\d\d:\d\d)$/)?raw:raw+'Z');
 if(!Number.isFinite(time.valueOf()))return null;
 const status=String(event.strStatus||'').toLowerCase(),unknown=/time to be|tbd|postponed|cancel|pst|canc/.test(status);
 if(unknown)return null;
 // 00:00 pode ser hora por definir; não afirmar que o jogo começa à meia-noite.
 if(raw.slice(11,19)==='00:00:00'&&(!status||status==='ns'))return null;
 const date=lisbonDay(time);
 return {id:[league,date,encodeURIComponent(home),encodeURIComponent(away)].join('|'),
  league,date,home,away,kickoffUtc:time.toISOString(),time:time.toISOString(),
  source:'TheSportsDB (fallback limitado)',timeStatus:'HORARIO_INDICATIVO',state:'pre',completed:false};
}
export async function scanSportsDbNextHours(now=new Date(),hours=5,{fetcher=fetch,timeoutMs=6500}={}){
 const start=new Date(now),end=new Date(start.valueOf()+hours*3600000),days=[];
 let cursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()));
 while(cursor.valueOf()<=end.valueOf()&&days.length<3){days.push(utcDay(cursor));cursor=new Date(cursor.valueOf()+86400000);}
 const result=await Promise.allSettled(days.map(async day=>{
  const url='https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d='+day+'&s=Soccer';
  const res=await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw Error('TheSportsDB HTTP '+res.status);
  const data=await res.json();
  return {day,events:(data?.events||[]).map(parseSportsDbEvent).filter(Boolean)};
 }));
 const out=new Map(),issues=[];
 for(let i=0;i<result.length;i++){
  const r=result[i];if(r.status==='rejected'){issues.push(r.reason.message);continue;}
  for(const match of r.value.events){
   const ts=Date.parse(match.kickoffUtc);
   if(ts>=start.valueOf()&&ts<=end.valueOf())out.set(match.id,match);
  }
 }
 return {matches:[...out.values()].sort((a,b)=>a.kickoffUtc.localeCompare(b.kickoffUtc)),
  checkedDays:result.length-issues.length,failedDays:issues.length,issues,
  source:'TheSportsDB (plano gratuito, amostra limitada)',warning:'A fonte gratuita só disponibiliza um subconjunto dos jogos por dia. Não é cobertura integral nem confirmação live.'};
}
