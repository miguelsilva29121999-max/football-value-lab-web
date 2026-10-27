// Data civil no fuso horário do jogo (Portugal continental por omissão).
// Não inferir que a hora UTC é a hora de início de uma partida.
export function lisbonToday(now=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function filterUpcomingFixtures(fixtures,now=new Date()){
 const today=lisbonToday(now);
 const seen=new Set();
 return (fixtures||[]).filter(f=>{
  if(!f||typeof f.date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.date)||f.date<today)return false;
  const key=[f.league||'',f.date,String(f.home||'').toLowerCase(),String(f.away||'').toLowerCase()].join('|');
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>a.date.localeCompare(b.date)||(a.home||'').localeCompare(b.home||''));
}
