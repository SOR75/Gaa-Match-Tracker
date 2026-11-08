import test from 'node:test';
import assert from 'node:assert/strict';
import {flowMatch,addFlow} from './helpers/match-flow-match.js';
import {coachingInsights,selectCoachingFindings} from '../src/coaching-insights.js';
import {summarize} from '../src/analysis.js';
function scoring(){const m=flowMatch({lineup:true});for(let i=0;i<5;i++)addFlow(m,'point','our',60+i*40,1,{playerNumber:'14',shotSource:i<3?'free':'open-play'});return m;}
test('five points with three frees is expressed factually in both HT and FT with recorded evidence',()=>{
 const m=scoring(),before=JSON.stringify(m);
 for(const scope of ['H1','FULL_MATCH']){const result=coachingInsights(m,{scope}),c=result.observations.find(o=>o.family.startsWith('scoring-contribution'));assert.ok(c);assert.match(c.detail,/contributed five points/);assert.match(c.detail,/three points from frees/);assert.match(c.detail,/two points from open play/);assert.equal(c.evidenceIds.length,5);assert.ok(c.evidenceIds.every(id=>m.events.some(e=>e.id===id)));assert.ok(result.observations.length<=(scope==='H1'?3:5));}
 assert.equal(JSON.stringify(m),before);assert.equal(summarize(m.events,'our').total,5);
});
test('goals, two-pointers, penalties and 45s retain event counts and source provenance',()=>{
 const m=flowMatch();for(const [type,source] of [['goal','penalty'],['two-point','open-play'],['point','45']])addFlow(m,type,'our',m.events.length*100,1,{playerNumber:'14',shotSource:source});
 const c=coachingInsights(m).candidates.find(o=>o.family.startsWith('scoring-contribution'));assert.match(c.detail,/six points from 3 successful attempts/);assert.match(c.detail,/one goal from penalties/);assert.match(c.detail,/one two-pointer from open play/);assert.match(c.detail,/one point from 45s/);assert.equal(summarize(m.events,'our').attempts,3);
});
test('legacy unknown sources are not defaulted to open play or excluded from player score',()=>{
 const m=scoring();for(const e of m.events){delete e.shotSource;delete e.scoreOrigin;}
 const c=coachingInsights(m).candidates.find(o=>o.family.startsWith('scoring-contribution'));assert.match(c.detail,/five points/);assert.doesNotMatch(c.detail,/open play|from frees|including/);
});
test('complementary contributions can qualify without duplicating a player or counting a Mark twice',()=>{
 const m=flowMatch();for(const type of ['defensive-block','defensive-block','interception'])addFlow(m,type,'our',m.events.length*60,1,{playerNumber:'4'});
 const result=coachingInsights(m),c=result.observations.find(o=>o.playerKey);assert.ok(c);assert.match(c.detail,/one interception and two blocks/);assert.equal(c.evidenceIds.length,3);assert.equal(result.observations.filter(o=>o.playerKey===c.playerKey).length,1);
 const k=flowMatch();addFlow(k,'our-kickout','our',10,1,{outcome:'won',kickoutPerspective:'our',mark:true,markPlayerNumber:'8',kickoutWinnerNumber:'8'});assert.equal(coachingInsights(k).observations.length,0);
});
test('same player cannot occupy scoring and defensive headings; meaningful team findings retain priority',()=>{
 const m=scoring();for(let i=0;i<3;i++)addFlow(m,'defensive-block','our',400+i*10,1,{playerNumber:'14'});
 for(const scope of ['H1','FULL_MATCH']){const result=coachingInsights(m,{scope}),keys=result.observations.filter(o=>o.playerKey).map(o=>o.playerKey);assert.equal(new Set(keys).size,keys.length);assert.ok(result.observations.length<=(scope==='H1'?3:5));}
});
test('one routine contribution never creates a player finding, and existing evidence thresholds remain unchanged',()=>{
 const m=flowMatch();addFlow(m,'interception','our',10,1,{playerNumber:'4'});assert.equal(coachingInsights(m).observations.length,0);
});

test('initials and punctuation in player names cannot truncate source evidence in the visible observation',()=>{
 const m=scoring();m.players[13].name='A. Murphy';const c=coachingInsights(m).observations.find(o=>o.family.startsWith('scoring-contribution'));assert.match(c.reportText,/A\. Murphy contributed five points/);assert.match(c.reportText,/three points from frees/);
});

test('individual deduplication survives different topics/dimensions while preserving another player',()=>{
 const candidate=(id,playerKey,dimension,significance)=>({id,team:'our',topic:id,playerKey,dimension,significance,presentation:'summary',evidenceIds:[id],supporting:[]});
 const rows=selectCoachingFindings([candidate('scoring','player-a','attack',18),candidate('blocks','player-a','defence',17),candidate('other-player','player-b','defence',16)]);assert.deepEqual(rows.map(o=>o.id),['scoring','other-player']);
});
