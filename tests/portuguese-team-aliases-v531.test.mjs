import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedTeam,estimateMatch} from '../lib/model.mjs';

test('Names from Portuguese calendar and CSV refer to the same Braga and Nacional',()=>{
 assert.equal(normalizedTeam('Sporting Clube de Braga'),normalizedTeam('Sp Braga'));
 assert.equal(normalizedTeam('Sporting Clube de Braga'),normalizedTeam('Braga'));
 assert.equal(normalizedTeam('CD Nacional'),normalizedTeam('Nacional'));
 assert.equal(normalizedTeam('Clube Desportivo Nacional'),normalizedTeam('Nacional'));
});

test('Nacional vs Braga can estimate markets from CSV team aliases',()=>{
 const matches=[];
 for(let i=0;i<120;i++){
  const date=new Date(Date.UTC(2026,5,25+i)).toISOString().slice(0,10);
  const [home,away]=[
   ['Nacional','Sp Braga'],['Nacional','Benfica'],
   ['Porto','Sp Braga'],['Vitoria Guimaraes','Porto']
  ][i%4];
  matches.push({date,home,away,hg:i%3,ag:(i+1)%3,hhg:0,hag:1,hc:5,ac:4,hy:2,ay:2,hs:11,as:10,hst:4,ast:3});
 }
 const result=estimateMatch(matches,'CD Nacional','Sporting Clube de Braga','2026-10-25');
 assert.equal(result.ready,true,JSON.stringify(result.reasons||[]));
 assert.ok(result.quality.homeGames>=10);
 assert.ok(result.quality.awayGames>=10);
});
