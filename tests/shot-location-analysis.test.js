import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankMatch,createEvent } from '../src/domain.js';
import { attackingDirection,transformLocation } from '../src/matchday.js';
import { fortyMetreLocationZone,fortyMetreZone,fortyMetreArcPaths } from '../src/pitch-geometry.js';
import { shotLocationAnalysis } from '../src/shot-location-analysis.js';
import { analysisForScope } from '../src/half-time.js';
import { halfTimeScreen } from '../src/half-time-ui.js';
import { fullTimeScreen } from '../src/full-time-ui.js';
import { analysisScreen } from '../src/analysis-ui.js';
const fixture=first=>JSON.parse(readFileSync(`tests/fixtures/field-shot-references/canonical-${first}.json`));
for(const first of ['top','bottom'])for(const team of ['our','opposition'])test(`${first} H1 direction / ${team}: both physical ends capture to the same stored attacking-top location`,()=>{
 const {match,physical}=fixture(first);const before=JSON.stringify(match);
 for(const e of match.events.filter(e=>e.team===team)){
  const tapped=physical.find(p=>p.id===e.id);const canonical=transformLocation(tapped,attackingDirection(match,team,e.half));assert.ok(Math.abs(canonical.shotX-e.shotX)<1e-12);assert.ok(Math.abs(canonical.shotY-e.shotY)<1e-12);
  assert.ok(e.shotY<.5);if(e.event==='two-point')assert.equal(fortyMetreZone(e),'outside');
 }
 assert.equal(JSON.stringify(match),before);
});
for(const first of ['top','bottom'])test(`${first}: H1/H2 overlay, HT/FT/report use attacking-top and never mutate saved events`,()=>{
 const {match}=fixture(first),before=JSON.stringify(match);
 for(const scope of ['H1','H2','FULL_MATCH']){const d=analysisForScope(match,scope);assert.equal(d.shots.length,scope==='FULL_MATCH'?6:3);assert.equal(d.zones.outside.attempts,scope==='FULL_MATCH'?2:1);}
 for(const html of [halfTimeScreen(match),fullTimeScreen(match),analysisScreen(match),analysisScreen(match,{},true)]){assert.match(html,/ATTACKS ↑ TOP/);assert.ok(!html.includes('ATTACKS ↓ BOTTOM'));}
 assert.equal(JSON.stringify(match),before);
});
test('40m circle uses 6 SVG units per metre in both axes, including wide goal-side positions and exact boundary',()=>{
 const p=(x,y)=>({shotX:x/600,shotY:y/900});
 assert.equal(fortyMetreLocationZone(p(300,259.99)),'inside');assert.equal(fortyMetreLocationZone(p(300,260)),'outside');assert.equal(fortyMetreLocationZone(p(300,260.01)),'outside');
 const y=20+Math.sqrt(240**2-100**2);assert.equal(fortyMetreLocationZone(p(400,y)),'outside');assert.equal(fortyMetreLocationZone(p(400,y-.01)),'inside');
 assert.equal(fortyMetreLocationZone(p(25,100)),'outside');assert.equal(fortyMetreLocationZone(p(60,20)),'outside');assert.equal(fortyMetreLocationZone(p(61,20)),'inside');
 assert.deepEqual(fortyMetreArcPaths(),['M60 20A240 240 0 0 0 540 20','M60 880A240 240 0 0 1 540 880']);
});
test('two-pointers are outside or unclassifiable, never silently moved or counted inside; overall scoring is preserved',()=>{
 const m=blankMatch();m.events=[{...createEvent(m,'two-point','our'),shotX:.5,shotY:.35},{...createEvent(m,'two-point','our'),half:2,shotX:.5,shotY:.2},createEvent(m,'two-point','our')];
 const before=JSON.stringify(m);const a=shotLocationAnalysis(m.events);assert.equal(a.zones.outside.attempts,1);assert.equal(a.zones.inside.attempts,0);assert.equal(a.zones.unknown.attempts,2);assert.equal(a.invalidTwoPointers,1);assert.equal(analysisForScope(m,'FULL_MATCH').our.total,6);assert.equal(JSON.stringify(m),before);
});
test('location conversion uses successful attempts rather than score value; unknown locations stay in overall shooting',()=>{
 const m=blankMatch();const e=(type,xy,team='our')=>({...createEvent(m,type,team),...xy});m.events=[e('two-point',{shotX:.5,shotY:.35}),e('miss',{shotX:.4,shotY:.4}),e('goal',{shotX:.5,shotY:.15}),e('miss',{shotX:.45,shotY:.2}),e('point',{}),e('point',{shotX:0,shotY:0}),e('point',{shotX:.5,shotY:.2},'opposition')];
 const a=shotLocationAnalysis(m.events);assert.deepEqual(a.zones.inside,{attempts:2,successful:1,conversion:50});assert.deepEqual(a.zones.outside,{attempts:2,successful:1,conversion:50});assert.equal(a.zones.unknown.attempts,2);assert.equal(analysisForScope(m,'FULL_MATCH').our.attempts,6);assert.equal(shotLocationAnalysis(m.events,'opposition').zones.inside.attempts,1);
});
