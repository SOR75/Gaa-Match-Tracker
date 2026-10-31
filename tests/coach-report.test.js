import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {coachReportModel,recordedScoringRuns,coachReportObservations} from '../src/coach-report.js';
import {coachReportMarkup,coachReportScreen} from '../src/coach-report-ui.js';
import {analysisScreen} from '../src/analysis-ui.js';import {blankMatch,createEvent} from '../src/domain.js';import {reportMatch} from './helpers/report-match.js';
for(const pattern of ['balanced','uneven'])test(`coach ${pattern}: existing analytics, five sections, meaningful players, source/location stats and raw-data immutability`,()=>{
 const m=reportMatch(pattern),raw=JSON.stringify(m),d=coachReportModel(m),html=coachReportScreen(m);
 assert.equal((html.match(/data-coach-page=/g)||[]).length,5);assert.ok(!d.players.some(p=>Number(p.number)>=16));assert.ok(!d.players.some(p=>p.number==='1'));assert.equal(m.players.length,26);assert.ok(d.players.some(p=>p.number==='7'&&p.passesReceived));assert.match(html,/Full Match Data/);assert.match(html,/Coach report shot map/);assert.match(html,/ATTACKS ↑ TOP/);assert.ok(d.observations.length>=3&&d.observations.length<=5);assert.equal(JSON.stringify(m),raw);
 for(const team of ['our','opposition']){assert.equal(d.stats[team].total,d.halves[team].reduce((a,h)=>a+h.total,0));assert.equal(d.sources[team].reduce((a,s)=>a+s.attempts,0),d.stats[team].attempts);}
});
test('blank and legacy matches omit missing metadata, invent no keepers/players/observations, preserve full detailed information',()=>{
 const m=blankMatch(),d=coachReportModel(m),html=coachReportScreen(m);assert.equal(d.keepers.length,0);assert.equal(d.players.length,0);assert.equal(d.observations.length,0);assert.ok(!html.includes('Not recorded'));assert.match(html,/No recorded goalkeeper identity/);assert.match(analysisScreen(m,{},true),/Player shooting analysis/);assert.match(analysisScreen(m,{},'coach'),/Coach Report/);
});
test('scoring runs require complete consecutive scoring evidence within a half and distinct times; no tactical claims',()=>{
 const m=blankMatch();const e=(team,t,half=1,type='point')=>({...createEvent(m,type,team),timeMs:t,half});
 const events=[e('our',1000),e('our',2000,1,'goal'),e('our',3000),e('opposition',4000),e('our',5000),e('our',6000,2),e('our',7000,2)];const r=recordedScoringRuns(events);assert.equal(r.length,1);assert.equal(r[0].points,5);assert.equal(r[0].start,1000);assert.equal(r[0].end,3000);assert.deepEqual(recordedScoringRuns([e('our',0),e('our',0,1,'goal'),e('our',0)]),[]);
});
for(const slug of ['sml','rynaghs'])test(`${slug}: real PDF-snapshot facts reconcile without invented shots/locations/attribution`,()=>{
 const d=JSON.parse(readFileSync(`tests/fixtures/coach-report/${slug}-pdf-snapshot.json`));assert.equal(createHash('sha256').update(readFileSync(`tests/fixtures/coach-report/${slug}-source.pdf`)).digest('hex'),d.sourcePdfSha256);assert.deepEqual([d.stats.our.total,d.stats.opposition.total],slug==='sml'?[16,32]:[21,14]);assert.equal(d.shots.length,0);assert.equal(d.location.our,null);assert.ok(d.mapUnavailable);assert.equal(d.players.length,27);assert.ok(coachReportMarkup(d).includes('PDF-snapshot review'));assert.deepEqual(coachReportObservations(d),d.observations);assert.deepEqual(recordedScoringRuns(d.printedScoringSequence),d.runs);
 for(const t of ['our','opposition']){assert.equal(d.stats[t].total,d.halves[t].reduce((a,h)=>a+h.total,0));assert.ok(d.players.filter(p=>p.team===t).reduce((a,p)=>a+p.total,0)<=d.stats[t].total);assert.equal(d.keepers.find(g=>g.team===t).gkKickouts,d.stats[t].kickouts.total);}
});
test('report escapes all supplied names/metadata and never makes a missing location into a location bucket',()=>{
 const m=blankMatch();m.setup.ourTeam='<script>alert(1)</script>';m.events=[createEvent(m,'two-point','our')];const d=coachReportModel(m);assert.equal(d.location.our.zones.unknown.attempts,1);assert.ok(!coachReportScreen(m).includes('<script>'));assert.equal(d.stats.our.total,2);
});
