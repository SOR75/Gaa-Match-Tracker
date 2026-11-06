import test from 'node:test';
import assert from 'node:assert/strict';
import {ttReference0312,shortReport0312,heavyReport0312} from './helpers/reports0312.js';
import {flowMatch,addFlow} from './helpers/match-flow-match.js';
import {summarize} from '../src/analysis.js';
import {coachingInsights,INSIGHT_RULES} from '../src/coaching-insights.js';
import {fullMatchReportModel} from '../src/full-match-report-data.js';
const report=m=>analysisScreen(m,{},true);
import {analysisScreen} from '../src/analysis-ui.js';
import {reportStatus,kickoutLengthEvidence,smallKickoutContext} from '../src/report-evidence.js';
import {timelineCSV,canonicalAnalysisStream} from '../src/analysis-stream.js';
import {parseCSV} from './helpers/csv.js';
import {completeMatch} from '../src/history.js';

test('synthetic TT reference preserves supplied score, shooting, kickout and defensive aggregates',()=>{
 const m=ttReference0312(),d=fullMatchReportModel(m);
 assert.deepEqual([d.stats.our.total,d.stats.opposition.total],[8,4]);
 assert.deepEqual(d.halves.our.map(s=>[s.successful,s.attempts]),[[4,9],[4,5]]);
 assert.deepEqual(d.halves.our.map(s=>[s.kickouts.won,s.kickouts.total]),[[2,2],[1,3]]);
 const p=d.players.find(p=>p.team==='our'&&String(p.number)==='4');assert.equal(p.defensiveBlocks,3);assert.equal(p.interceptions,3);
});
test('TT kickout deterioration is visible as evidence-backed small-sample context without weakening the five-per-half threshold',()=>{
 const m=ttReference0312(),d=coachingInsights(m);assert.equal(INSIGHT_RULES.kickoutKnown,5);
 assert.ok(!d.candidates.some(c=>c.family==='kickout-halves-our'));
 const c=d.context.find(c=>c.team==='our');assert.match(c.detail,/2\/2 \(100%\).*1\/3 \(33.3%\)/);assert.match(c.detail,/no established trend/);assert.equal(c.evidenceIds.length,5);
 assert.ok(c.evidenceIds.every(id=>m.events.some(e=>e.id===id)));assert.doesNotMatch(report(m),/data-small-sample-context|no established trend/);
});
test('tiny, immaterial and full-sized samples do not get redundant small-sample context',()=>{
 const m=flowMatch();addFlow(m,'our-kickout','our',10,1,{outcome:'won',kickoutPerspective:'our'});addFlow(m,'our-kickout','our',20,2,{outcome:'lost',kickoutPerspective:'our'});assert.equal(smallKickoutContext(m.events).length,0);
 for(let i=0;i<4;i++){addFlow(m,'our-kickout','our',30+i,1,{outcome:'won',kickoutPerspective:'our'});addFlow(m,'our-kickout','our',40+i,2,{outcome:'lost',kickoutPerspective:'our'});}assert.equal(smallKickoutContext(m.events).length,0);
});
test('material qualified team kickout contrast outranks goalkeeper stint outcomes, with no individual distribution claim',()=>{
 const m=flowMatch({lineup:true});for(let i=0;i<10;i++)for(const half of [1,2])addFlow(m,'our-kickout','our',100+i*10,half,{outcome:half===1||i<5?'won':'lost',kickoutPerspective:'our',playerNumber:'1'});
 const d=coachingInsights(m),team=d.observations.findIndex(c=>c.family==='kickout-halves-our'),gk=d.candidates.find(c=>c.family.startsWith('keeper-'));
 assert.ok(team>=0);assert.ok(gk);assert.ok(d.observations[team].selectionScore>(gk.priority??gk.significance));assert.match(gk.detail,/team outcomes.*not evidence of individual distribution quality/);assert.match(gk.title,/Team restart outcomes/);assert.equal(gk.significance,15);
});
test('length categories partition recorded kickouts without reallocating legacy or missing lengths',()=>{
 const m=ttReference0312();const rows=kickoutLengthEvidence(m.events,'our');assert.equal(rows.reduce((n,r)=>n+r.total,0),5);assert.deepEqual(rows.map(r=>r.total),[2,0,1,2]);assert.equal(rows.reduce((n,r)=>n+r.retained,0),3);
});
test('opposition OOP is lost by kicking team, separate unknown outcome remains excluded',()=>{
 const m=flowMatch();for(const [length,outcome]of [['Long','out-of-play'],['Medium','lost'],['','unknown']])addFlow(m,'opposition-kickout','opposition',10,1,{outcome,kickoutLength:length,kickoutPerspective:'our'});
 const rows=kickoutLengthEvidence(m.events,'opposition');assert.equal(rows.find(r=>r.id==='long').retained,0);assert.equal(rows.find(r=>r.id==='medium').retained,1);assert.equal(rows.find(r=>r.id==='unclassified').unknownOutcome,1);
});
test('shot labels clarify overlapping counts without changing attempts, two-pointers or scores',()=>{
 const m=flowMatch();addFlow(m,'two-point','our',10);addFlow(m,'miss','our',20,1,{missReason:'blocked'});addFlow(m,'miss','our',30,1,{missReason:'wide'});
 const s=summarize(m.events,'our');assert.deepEqual([s.total,s.attempts,s.successful,s.misses,s.wides,s.blockedAttempts],[2,3,1,2,1,1]);
 const html=report(m);assert.match(html,/Unsuccessful shots/);assert.match(html,/Wides \(subset\)/);assert.match(html,/One 2-pointer is one successful attempt/);
});
test('extra-time scores remain in actual period rows, without nominal-time cutoffs',()=>{
 const m=flowMatch();addFlow(m,'point','our',2400,1);addFlow(m,'goal','our',800,3);addFlow(m,'two-point','opposition',900,4);
 const d=fullMatchReportModel(m);assert.deepEqual(d.periodScores.map(p=>p.half),[1,2,3,4]);assert.equal(d.stats.our.total,4);assert.equal(d.stats.opposition.total,2);for(const html of [report(m),analysisScreen(m,{},true)]){assert.match(html,/ET1/);assert.match(html,/ET2/);}
});
test('completion terminology is factual and consistent in both reports for completed and legacy matches',()=>{
 const m=shortReport0312();assert.equal(reportStatus(m).scoreLabel,'Recorded score');const done=completeMatch(m,1);assert.equal(reportStatus(done).scoreLabel,'Final score');for(const html of [report(done),analysisScreen(done,{},true)]){assert.match(html,/Completed match/);assert.match(html,/Final score/);}
});
test('report generation and derived context never mutate short, TT or data-heavy match bytes',()=>{
 for(const m of [shortReport0312(),ttReference0312(),heavyReport0312()]){const before=JSON.stringify(m);report(m);analysisScreen(m,{},true);coachingInsights(m);assert.equal(JSON.stringify(m),before);}
});
test('all sixty data-heavy contributors remain in their team sections without fixed thirty-player continuation',()=>{
 const html=report(heavyReport0312());for(const team of ['our','opposition'])for(let n=1;n<=30;n++)assert.ok(html.includes(`Synthetic ${team} Player ${n}`));assert.ok(!html.includes('Player contributions continued'));const d=fullMatchReportModel(heavyReport0312());assert.equal(d.substitutions.length,30);assert.equal(d.minutes.length,60);
});
test('short reports do not reserve an empty map or a zero-only kickout comparison',()=>{
 const html=report(shortReport0312());assert.match(html,/No recorded shot locations to plot/);assert.match(html,/No kickouts recorded/);assert.ok(!html.includes('coach-map-unavailable'));assert.ok(!html.includes('Short retained / known'));
});

test('factual report never calls or embeds ranked coaching interpretation',()=>{
 const m=ttReference0312(),d=fullMatchReportModel(m),html=report(m);for(const field of ['observations','coachingInsights','runs'])assert.equal(d[field],undefined);assert.doesNotMatch(html,/data-small-sample-context|data-observation|data-flow-story|Coach Report|established trend/);assert.match(html,/Kickout retention/);assert.match(html,/3\/5 · 60%/);
});
test('excluded scoring facts remain in CSV with original IDs and reasons, not in PDF totals',async()=>{
 const {bindEventParticipants}=await import('../src/identity.js');const m=flowMatch({lineup:true});let e=addFlow(m,'booked','our',1,1,{playerNumber:'8',disciplineVersion:1,matchCode:'LGFA',card:'red'});m.events[0]=bindEventParticipants(e,null,m);e=addFlow(m,'goal','our',10,1,{playerNumber:'8'});m.events[1]=bindEventParticipants(e,null,m);addFlow(m,'point','our',30);
 const before=JSON.stringify(m),d=fullMatchReportModel(m),html=report(m);assert.equal(d.stats.our.total,1);assert.equal(parseCSV(timelineCSV(m)).rows.length,3);assert.equal(d.excludedCount,1);assert.match(html,/excluded from statistics/);assert.ok(timelineCSV(m).includes(m.events[1].id));assert.ok(!html.includes(m.events[1].id));assert.equal(JSON.stringify(m),before);
});
test('legacy missing source/time remains unknown in the complete report without losing its score or ID',()=>{
 const m=flowMatch();const e=addFlow(m,'goal','our',10,1,{shotSource:'',scoreOrigin:'',timeMs:null});delete e.periodElapsedMs;const before=JSON.stringify(m),d=fullMatchReportModel(m),html=report(m);assert.equal(d.stats.our.total,3);assert.equal(canonicalAnalysisStream(m)[0].periodTimeMs,null);assert.equal(canonicalAnalysisStream(m)[0].shot.source,null);assert.match(timelineCSV(m),new RegExp(e.id));assert.ok(!html.includes(e.id));assert.equal(JSON.stringify(m),before);
});
test('recorded substitution and supported minutes use existing identities and real period boundaries',async()=>{
 const {saveEvent,createEvent}=await import('../src/domain.js');const m=flowMatch({lineup:true});const e={...createEvent({...m,clock:{half:2,elapsedMs:600000,startedAt:null}},'substitution','our',0),playerOn:'16',playerOff:'10',timeMs:600000};m.events=saveEvent(m.events,e,m);const d=fullMatchReportModel(m);assert.equal(d.substitutions.length,1);assert.equal(d.minutes.find(p=>p.team==='our'&&p.number===10).timeMs,2400000);assert.equal(d.minutes.find(p=>p.team==='our'&&p.number===16).timeMs,1200000);assert.match(report(m),/our Player 16/);
});
test('missing historical period boundaries are never replaced by nominal durations for playing time',()=>{
 const m=flowMatch({lineup:true});m.clock={half:2,elapsedMs:120000,startedAt:null};const d=fullMatchReportModel(m);assert.ok(d.minutes.length);assert.ok(d.minutes.every(p=>p.timeMs===null));assert.match(report(m),/Unknown/);
});
test('report opening does not accumulate wall-clock playing time while a match is running',()=>{
 const m=flowMatch({lineup:true});m.clock.startedAt=Date.now()-900000;const first=fullMatchReportModel(m).minutes;assert.deepEqual(fullMatchReportModel(m).minutes,first);assert.equal(first[0].timeMs,3600000);
});
test('recorded notes remain exact in CSV, without adding recommendations or raw notes to the main PDF',()=>{
 const m=flowMatch();addFlow(m,'point','our',10,1,{coachObservation:'Coach-entered <advice>',dictatedNote:'Original dictation',notes:'Verbatim note'});const html=report(m);const rows=parseCSV(timelineCSV(m)).rows;assert.equal(rows[0]['Coach Observation'],'Coach-entered <advice>');assert.equal(rows[0]['Dictated Note'],'Original dictation');assert.equal(rows[0].Notes,'Verbatim note');assert.doesNotMatch(html,/Coach-entered|Original dictation|Verbatim note/);
});
test('separate shootout attempt evidence never increments football scores, attempts or minutes',async()=>{
 const {match03108,shootout03108}=await import('./helpers/refinement03108.js');const {recordPenalty,shootoutRef}=await import('../src/shootout.js');const m=shootout03108(match03108());m.shootout=recordPenalty(m.shootout,shootoutRef(m,'our','8'),'scored',0,m);const before=JSON.stringify(m),d=fullMatchReportModel(m),html=report(m);assert.equal(d.stats.our.total,0);assert.equal(d.stats.our.attempts,0);assert.match(html,/Penalty shootout — separate from football/);assert.match(html,/Home 8/);assert.equal(parseCSV(timelineCSV(m)).rows.length,0);assert.equal(JSON.stringify(m),before);
});

test('supported legacy substitution minutes remain available without changing stored appearance flags',()=>{
 const m=heavyReport0312(),before=JSON.stringify(m),d=fullMatchReportModel(m),p=d.minutes.find(p=>p.team==='our'&&p.number===16);assert.equal(p.participation.appeared,false);assert.equal(p.timeMs,1760000);assert.equal(p.evidence,'Recorded field changes (legacy linkage)');assert.match(report(m),/Legacy field changes/);assert.equal(JSON.stringify(m),before);
});
