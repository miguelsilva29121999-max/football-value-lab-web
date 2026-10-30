import {loadLeague} from '../lib/providers.mjs';
import {estimateMatch,normalizedTeam} from '../lib/model.mjs';
import {createMatchContext} from '../lib/ai-assistant.mjs';
const gameDate='2026-10-30';
const data=await loadLeague('P1',new Date(gameDate+'T20:00:00Z'));
const fixture=data.fixtures.find(f=>f.date===gameDate&&/casa pia/i.test(f.home)&&/sporting/i.test(f.away));
const counts=(n)=>data.matches.filter(m=>m.date<gameDate&&[normalizedTeam(m.home),normalizedTeam(m.away)].includes(normalizedTeam(n)));
const clubNames=[...new Set(data.matches.flatMap(m=>[m.home,m.away]).filter(n=>/pia|sport|lisbo|lisbon/i.test(n)))].sort();
const aliases=clubNames.map(n=>({original:n,normalized:normalizedTeam(n),count:counts(n).length}));
console.log('CASA_SPORTING_SOURCE',JSON.stringify({date:gameDate,fixtures:data.fixtures.length,matchCount:data.matches.length,source:data.source,issues:data.issues,
fixture:fixture||null,aliases,homeCount:fixture?counts(fixture.home).length:null,awayCount:fixture?counts(fixture.away).length:null}));
if(fixture){
 const estimated=estimateMatch(data.matches,fixture.home,fixture.away,gameDate);
 console.log('CASA_SPORTING_ESTIMATE',JSON.stringify({ready:estimated.ready,reasons:estimated.reasons,quality:estimated.quality}));
 const {packet}=await createMatchContext({league:'P1',fixtureId:fixture.id},async()=>data);
 console.log('CASA_SPORTING_PACKET',JSON.stringify({ready:packet.modelReady,limits:packet.modelLimitations,history:{home:packet.historySummary.home.leagueGames,away:packet.historySummary.away.leagueGames},markets:packet.candidateMarkets.slice(0,6),status:packet.fixture.status}));
}
