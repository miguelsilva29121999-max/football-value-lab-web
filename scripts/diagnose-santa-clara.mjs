import {loadLeague} from '../lib/providers.mjs';
import {estimateMatch,normalizedTeam} from '../lib/model.mjs';
import {createMatchContext} from '../lib/ai-assistant.mjs';
const date='2026-10-26';
const data=await loadLeague('P1',new Date(date+'T12:00:00Z'));
const santa=['Santa Clara','CD Santa Clara','Santa Clara Açores'].map(normalizedTeam);
const benfica=['Benfica','Sport Lisboa e Benfica','SL Benfica'].map(normalizedTeam);
const santaGames=data.matches.filter(m=>[normalizedTeam(m.home),normalizedTeam(m.away)].some(x=>santa.includes(x))&&m.date<date);
const benficaGames=data.matches.filter(m=>[normalizedTeam(m.home),normalizedTeam(m.away)].some(x=>benfica.includes(x))&&m.date<date);
const match=data.fixtures.find(f=>f.date===date&&santa.includes(normalizedTeam(f.home))&&benfica.includes(normalizedTeam(f.away)));
const est=estimateMatch(data.matches,match?.home||'CD Santa Clara',match?.away||'Sport Lisboa e Benfica',date);
console.log('P1_SOURCE_DIAGNOSTIC',JSON.stringify({sources:data.source,issues:data.issues,matchCount:data.matches.length,
date,match:match?{id:match.id,home:match.home,away:match.away,date:match.date,time:match.time}:null,
aliases:{santa,benfica},santaGames:santaGames.length,benficaGames:benficaGames.length,
santaRecent:santaGames.slice(-6).map(m=>[m.date,m.home,m.away,m.hg,m.ag]),benficaRecent:benficaGames.slice(-6).map(m=>[m.date,m.home,m.away,m.hg,m.ag]),
modelReady:est.ready,reasons:est.reasons||[],quality:est.quality||null}));

if(match){const t=Date.now();const {packet}=await createMatchContext({league:'P1',fixtureId:match.id},async()=>data);console.log('SANTA_PREVIEW_DIAGNOSTIC',JSON.stringify({elapsedMs:Date.now()-t,modelReady:packet.modelReady,status:packet.fixture.status,candidates:packet.candidateMarkets.length,history:packet.historySummary&&{homeGames:packet.historySummary.home.leagueGames,awayGames:packet.historySummary.away.leagueGames,homeLastFive:packet.historySummary.home.lastFive.games.length,awayLastFive:packet.historySummary.away.lastFive.games.length,homeCornersCoverage:packet.historySummary.home.lastFive.averages.corners.coverage,awayShotsCoverage:packet.historySummary.away.lastFive.averages.shots.coverage}}));}
