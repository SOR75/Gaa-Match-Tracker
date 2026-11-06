import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoringSourceTotals,scoringSourceSummary} from '../src/scoring-sources.js';
import {reportPlayerStatistics,playerReportContributions} from '../src/report-player-data.js';
import {summarize} from '../src/analysis.js';
import {fullMatchReportModel} from '../src/full-match-report-data.js';
import {analysisScreen} from '../src/analysis-ui.js';
import {playerReviews} from '../src/player-insights.js';
import {sourceSquad,sourceMatch,sourceEvent,scoringSourceExample} from './helpers/scoring-source-match.js';
const row=(m,n)=>reportPlayerStatistics(m,'our').find(p=>p.number===String(n));
test('5 Play points + 2 Frees: overall 0-7 (7), 7/11 shooting, concise nonzero sources only',()=>{
 const m=scoringSourceExample(),p=row(m,10);
 assert.deepEqual(playerReportContributions(p),[{label:'Score',value:'0-7 (7)'},{label:'',value:'5 Play, 2 Frees'},{label:'Shots',value:'7/11'}]);
 assert.deepEqual(p.scoringSources['open-play'],{goals:0,points:5,twoPointers:0,total:5,scores:5});
 assert.deepEqual(p.scoringSources.free,{goals:0,points:2,twoPointers:0,total:2,scores:2});
 assert.equal(p.scoringSources.penalty.scores,0);assert.equal(p.attempts,11);
});
test('goal from Play and point from Free retain goal/point notation by source',()=>{
 const m=sourceMatch();sourceEvent(m,10,'goal','open-play');sourceEvent(m,10,'point','free');
 const p=row(m,10);assert.equal(p.total,4);assert.equal(p.successful,2);assert.equal(scoringSourceSummary(p.scoringSources),'1-0 Play, 0-1 Free');
 assert.equal(playerReportContributions(p)[0].value,'1-1 (4)');
});
test('one 2-pointer is one scoring attempt, two points, one source success with explicit 2P notation',()=>{
 const m=sourceMatch();sourceEvent(m,10,'two-point','free');const p=row(m,10);
 assert.equal(p.attempts,1);assert.equal(p.successful,1);assert.equal(p.total,2);assert.equal(p.conversion,100);
 assert.deepEqual(p.scoringSources.free,{goals:0,points:0,twoPointers:1,total:2,scores:1});
 assert.equal(scoringSourceSummary(p.scoringSources),'0-2 Free (1 × 2P)');
 assert.equal(playerReportContributions(p)[0].value,'0-2 (2)');
});
test('Penalty goal is one score worth three; two Penalties pluralise by scoring attempts',()=>{
 const m=sourceMatch();sourceEvent(m,10,'goal','penalty');assert.equal(scoringSourceSummary(row(m,10).scoringSources),'1-0 Penalty');
 sourceEvent(m,10,'point','penalty');const p=row(m,10);assert.equal(p.scoringSources.penalty.total,4);assert.equal(p.scoringSources.penalty.scores,2);assert.equal(scoringSourceSummary(p.scoringSources),'1-1 Penalties');
});
test('45/45s remain independent recorded sources and exclude missed 45 attempts from scoring breakdown',()=>{
 const m=sourceMatch();sourceEvent(m,10,'point','45');assert.equal(scoringSourceSummary(row(m,10).scoringSources),'1 45');
 sourceEvent(m,10,'point','45');sourceEvent(m,10,'miss','45');const p=row(m,10);assert.equal(scoringSourceSummary(p.scoringSources),'2 45s');assert.equal(p.attempts,3);assert.equal(p.successful,2);
});
test('mixed source composition reconciles goals/points/2P/value and successful attempts without duplicate scores',()=>{
 const m=sourceMatch();for(const [type,source] of [['goal','open-play'],['point','free'],['two-point','free'],['goal','penalty'],['point','45'],['point',undefined]])sourceEvent(m,10,type,source);
 const p=row(m,10),s=p.scoringSources;assert.equal(p.total,11);assert.equal(p.successful,6);assert.equal(p.attempts,6);
 for(const key of ['goals','points','twoPointers','total'])assert.equal(Object.values(s).reduce((n,v)=>n+v[key],0),p[key]);
 assert.equal(Object.values(s).reduce((n,v)=>n+v.scores,0),6);assert.equal(s.unknown.total,1);
});
test('missing, empty and unsupported legacy sources preserve overall score without defaulting to Play or mutating events',()=>{
 const events=[{event:'goal',outcome:'scored'},{event:'two-point',outcome:'scored',shotSource:''},{event:'point',outcome:'scored',shotSource:'unavailable'}];
 const before=JSON.stringify(events),s=scoringSourceTotals(events);
 assert.deepEqual(s.unknown,{goals:1,points:1,twoPointers:1,total:6,scores:3});assert.equal(s['open-play'].scores,0);assert.equal(JSON.stringify(events),before);
 assert.equal(summarize(events,'our').total,0); // No fabricated team attribution either.
});
test('explicit legacy scoreOrigin is usable but absent legacy metadata is not inferred',()=>{
 const events=[{event:'point',outcome:'scored',scoreOrigin:'Open play'},{event:'goal',outcome:'scored',scoreOrigin:'Penalty'},{event:'point',outcome:'scored'}];
 const before=JSON.stringify(events),s=scoringSourceTotals(events);assert.equal(s['open-play'].points,1);assert.equal(s.penalty.goals,1);assert.equal(s.unknown.points,1);assert.equal(JSON.stringify(events),before);
});
test('Player Review sums by permanent ID across jerseys, keeps unknown scores in total and 2-pointers as one attempt',()=>{
 const squad=sourceSquad(),a=scoringSourceExample(squad),b=sourceMatch(squad,23,'2026-10-08');
 sourceEvent(b,23,'two-point','open-play');sourceEvent(b,23,'point','free');sourceEvent(b,23,'point');
 const records=[a,b].map(match=>({id:match.id,match})),before=JSON.stringify(records);
 const p=playerReviews(records,[squad]).find(p=>p.playerId===squad.players[0].playerId);
 assert.equal(p.matches.length,2);assert.equal(p.total,11);assert.equal(p.points,9);assert.equal(p.twoPointers,1);assert.equal(p.successful,10);assert.equal(p.attempts,14);assert.equal(p.conversion,71.4);
 assert.deepEqual(p.scoringSources['open-play'],{goals:0,points:5,twoPointers:1,total:7,scores:6});assert.equal(p.scoringSources.free.total,3);assert.equal(p.scoringSources.unknown.total,1);
 assert.deepEqual(p.matches.map(x=>x.jersey),[23,10]);assert.equal(JSON.stringify(records),before);
});
test('same display name never combines permanent players; unlinked legacy source events do not acquire a permanent ID',()=>{
 const squad=sourceSquad();squad.players[1].name=squad.players[0].name;const m=sourceMatch(squad);
 sourceEvent(m,10,'point','free');sourceEvent(m,11,'goal','penalty');
 const legacy={...sourceEvent(m,10,'point','45')};delete legacy.identityVersion;delete legacy.participants;m.events[m.events.length-1]=legacy;
 const p=playerReviews([{id:m.id,match:m}],[squad]);assert.equal(p.find(p=>p.playerId===squad.players[0].playerId).scoringSources.free.total,1);assert.equal(p.find(p=>p.playerId===squad.players[0].playerId).scoringSources['45'].total,0);assert.equal(p.find(p=>p.playerId===squad.players[1].playerId).scoringSources.penalty.total,3);
});
test('Full Match Report preserves full scoring sources without zero source clutter; team totals unchanged',()=>{
 const m=scoringSourceExample(),before=JSON.stringify(m),teamBefore=summarize(m.events,'our');
 const d=fullMatchReportModel(m),html=analysisScreen(m,{},true);
 assert.match(html,/5 Play, 2 Frees/);
 assert.match(html,/1-0 Play, 0-1 Free/);
 assert.match(html,/0-2 Play \(1 × 2P\)/);
 assert.doesNotMatch(html,/0 Penalties|0 Frees|0 45s/);
 assert.doesNotMatch(html,/data-coach-page|Coach Report/);
 assert.deepEqual(d.stats.our,teamBefore);assert.deepEqual(teamBefore.scoresBySource,{'45':1,'open-play':7,free:3,penalty:1});assert.equal(teamBefore.total,18);assert.equal(teamBefore.successful,13);assert.equal(teamBefore.attempts,17);
 assert.equal(JSON.stringify(m),before);
});
test('opposition player source credit stays with their stable identity, independent of an identical home jersey',async()=>{
 const {createEvent,saveEvent}=await import('../src/domain.js');
 const {loadSquadPlayers}=await import('../src/squads.js');
 const m=scoringSourceExample();m.oppositionPlayers=loadSquadPlayers(sourceSquad());
 m.events=saveEvent(m.events,{...createEvent(m,'goal','opposition'),playerNumber:'10',shotSource:'penalty'},m);
 const home=row(m,10),away=reportPlayerStatistics(m,'opposition').find(p=>p.number==='10');
 assert.equal(home.total,7);assert.equal(home.scoringSources.penalty.total,0);
 assert.equal(away.total,3);assert.equal(away.scoringSources.penalty.total,3);assert.equal(away.successful,1);
 assert.notEqual(home.playerId,away.playerId);
});
