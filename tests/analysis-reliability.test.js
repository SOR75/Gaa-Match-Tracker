import test from 'node:test';
import assert from 'node:assert/strict';
import {matchFlow,reconstructPossessions,mergeStories} from '../src/match-flow.js';
import {matchFlowMarkup} from '../src/match-flow-ui.js';
import {canonicalAnalysisStream,timelineCSV} from '../src/analysis-stream.js';
import {analysisForScope} from '../src/half-time.js';
import {coachReportModel} from '../src/coach-report.js';
import {playerStatistics} from '../src/analysis.js';
import {bindEventParticipants} from '../src/identity.js';
import {fieldState} from '../src/field-state.js';
import {flowMatch,addFlow,swingMatch} from './helpers/match-flow-match.js';
const chains=m=>reconstructPossessions(canonicalAnalysisStream(m));
const candidates=(m,family)=>matchFlow(m).candidates.filter(c=>c.family===family);
const ko=(m,seconds,half=1)=>addFlow(m,'our-kickout','our',seconds,half,{outcome:'won',kickoutPerspective:'our'});
function direct({restart=20,shot=40,half=1,shotHalf=half}={}){
 const m=flowMatch();addFlow(m,'point','our',10,half);
 addFlow(m,'opposition-kickout','opposition',restart,half,{outcome:'won',kickoutPerspective:'our'});
 addFlow(m,'goal','our',shot,shotHalf);return m;
}
function red(m,seconds=1,half=1){
 const e=addFlow(m,'booked','our',seconds,half,{playerNumber:'8',disciplineVersion:1,matchCode:'LGFA',card:'red'});
 m.events[m.events.indexOf(e)]=bindEventParticipants(e,null,m);return m.events.at(-1);
}
function attributed(m,type,seconds,half=1,extra={}){
 const e=addFlow(m,type,'our',seconds,half,{playerNumber:'8',...extra});
 m.events[m.events.indexOf(e)]=bindEventParticipants(e,null,m);return m.events.at(-1);
}

test('long elapsed gaps and incidental records do not discard a recorded win followed by a score',()=>{
 const m=flowMatch();ko(m,1);addFlow(m,'booked','our',60);addFlow(m,'booked','our',90);addFlow(m,'point','our',1500);
 const c=chains(m)[0];assert.equal(c.scoreIds.length,1);assert.equal(c.confidence,'PROBABLE');assert.equal(c.confirmedScoreIds.length,0);
});
test('neither 90 seconds nor any larger gap proves or disproves possession continuity',()=>{
 for(const end of [91,91.001,1000,2000]){const m=flowMatch();ko(m,1);addFlow(m,'point','our',end);const c=chains(m)[0];assert.equal(c.scoreIds.length,1);assert.equal(c.confidence,'PROBABLE');}
});
for(const [a,b] of [[1,2],[2,3],[3,4]])test(`possession/direct sequences never bridge period ${a} to ${b}`,()=>{
 const m=flowMatch();ko(m,100,a);addFlow(m,'point','our',10,b);assert.equal(chains(m)[0].scoreIds.length,0);
 assert.equal(candidates(direct({half:a,shotHalf:b}),'direct-restart-score').length,0);
});
test('direct recorded restart order is retained regardless of elapsed gap, with no possession or causation claim',()=>{
 for(const input of [{restart:70,shot:160},{restart:90,shot:110},{restart:500,shot:2000}]){
  const c=candidates(direct(input),'direct-restart-score')[0];assert.ok(c);assert.equal(c.metrics.seconds,input.shot-10);
  assert.match(c.detail,/not continuous possession or tactical causation/);
 }
});
for(const time of [null,undefined,NaN,-1])test(`unknown/invalid time ${String(time)} cannot establish continuity or late context`,()=>{
 const m=direct();m.events[1].timeMs=time;
 assert.equal(candidates(m,'direct-restart-score').length,0);
 assert.equal(chains(m).length,0);
 const n=flowMatch();addFlow(n,'point','our',1790,2,{timeMs:time});
 assert.equal(candidates(n,'lead-change').length,0);
 const e=canonicalAnalysisStream(n)[0];assert.equal(e.continuousTimeMs,null);assert.equal(e.periodTimeMs,null);
 assert.equal(e.scoreAfter.our,1); // Missing timing does not erase a factual score.
});
test('a valid recorded sequence does not need unknown preceding period durations',()=>{
 const m=direct({half:4});m.clock.completedHalves={};
 assert.ok(canonicalAnalysisStream(m).every(e=>e.continuousTimeMs===null));
 assert.equal(candidates(m,'direct-restart-score').length,1);
});
test('unknown intervening timing prevents a direct sequence even when its endpoints are known',()=>{
 const m=direct();addFlow(m,'booked','our',25,1,{timeMs:null});
 m.events.splice(2,0,m.events.pop());assert.equal(candidates(m,'direct-restart-score').length,0);
});
function restarts(times,halves=times.map(()=>1)){
 const m=flowMatch();times.forEach((t,i)=>{ko(m,t,halves[i]);if(i<times.length-1)addFlow(m,'two-point','our',t+1,halves[i]);});return m;
}
test('repeated recorded restart wins are not discarded at three-minute or six-minute boundaries',()=>{
 for(const times of [[10,190,370],[10,191,372],[10,1000,1900]])assert.equal(candidates(restarts(times),'restarts').length,1);
});
for(const [a,b] of [[1,2],[2,3],[3,4]])test(`repeat restart spell is split at ${a}/${b} while scoring evidence survives`,()=>{
 const m=restarts([10,30,10],[a,a,b]);assert.equal(candidates(m,'restarts').length,0);
 assert.equal(canonicalAnalysisStream(m).at(-1).scoreAfter.our,4);
});
test('same-period source evidence remains countable across long gaps without asserting continuous possession',()=>{
 const m=flowMatch();for(const t of [10,1000]){addFlow(m,'interception','our',t);addFlow(m,'goal','our',t+10);}
 const c=candidates(m,'opportunities')[0];assert.equal(c.metrics.sequences,2);assert.equal(c.metrics.confirmed,0);assert.match(c.detail,/continuous possession is not established/);
});
test('substitution window extends beyond five minutes but never across periods',()=>{
 const build=(times,half=1)=>{const m=flowMatch({lineup:true});addFlow(m,'substitution','our',1,1,{playerOn:'18',playerOff:'8'});for(const t of times)addFlow(m,'two-point','our',t,half);return m;};
 for(const times of [[10,20,301],[10,20,602],[10,20,2000]]){
  const c=candidates(build(times),'personnel')[0];assert.ok(c);assert.equal(c.metrics.scoringSwing,6);assert.match(c.detail,/Following the substitution/);assert.ok(!c.detail.includes('#18'));
 }
 assert.equal(candidates(build([10,20,30],2),'personnel').length,0);
});
test('numerical spells stop at periods or strength changes, never merely at elapsed gaps',()=>{
 const m=flowMatch({lineup:true});red(m);addFlow(m,'two-point','opposition',10);addFlow(m,'two-point','opposition',191);
 assert.equal(candidates(m,'numerical').length,1);
 m.events.at(-1).half=2;assert.equal(candidates(m,'numerical').length,0);
});
test('legitimate broad cross-period scoring swings survive without invented elapsed time',()=>{
 const m=swingMatch();m.clock.completedHalves={};
 const c=candidates(m,'scoring-run').find(c=>c.team==='opposition');
 assert.equal(c.window.from.period,'H1');assert.equal(c.window.to.period,'H2');
 assert.equal(c.metrics.durationMs,null);assert.ok(!c.detail.includes(' in '));
 const n=flowMatch();n.clock.completedHalves={};
 for(let i=0;i<6;i++)addFlow(n,'point','our',i+1);
 for(let i=0;i<4;i++)addFlow(n,'point','opposition',20+i);
 addFlow(n,'point','our',30);
 for(let i=0;i<5;i++)addFlow(n,'point','opposition',40+i,2);
 const swing=candidates(n,'score-swing');assert.ok(swing.length);
 assert.ok(swing.every(c=>c.evidenceIds.every(id=>n.events.some(e=>e.id===id))));
});
test('scoring order can describe an unanswered run across a long quiet gap, without claiming possession',()=>{
 const m=flowMatch();addFlow(m,'goal','our',1);addFlow(m,'point','our',1500);
 const c=candidates(m,'scoring-run')[0];assert.equal(c.metrics.points,4);
 assert.ok(c.detail.includes('recorded'));assert.equal(c.evidenceType,'CORRELATED_WINDOW');
 assert.equal(chains(m).length,0);
});
test('invalid attributed scores, kickouts and contributions agree across canonical flow, dashboard and report',()=>{
 const m=flowMatch({lineup:true});red(m);const bad=attributed(m,'goal',10);
 attributed(m,'our-kickout',20,1,{outcome:'won',kickoutPerspective:'our'});
 addFlow(m,'point','our',30);const raw=JSON.stringify(m);
 assert.equal(fieldState(m).invalidEvents.has(bad.id),true);
 const stream=canonicalAnalysisStream(m),dashboard=analysisForScope(m,'FULL_MATCH'),report=coachReportModel(m);
 assert.equal(stream.at(-1).scoreAfter.our,1);assert.equal(stream.find(e=>e.id===bad.id).valid,false);
 for(const s of [dashboard.our,report.stats.our]){assert.equal(s.total,1);assert.equal(s.attempts,1);assert.equal(s.kickouts.total,0);}
 assert.equal(report.sources.our.reduce((n,r)=>n+r.attempts,0),1);
 assert.ok(report.players.every(p=>p.successful===0));
 assert.ok(!matchFlow(m).observations.some(o=>o.evidenceIds.includes(bad.id)));
 assert.ok(timelineCSV(m).includes(bad.id)); // Review evidence stays exportable.
 assert.equal(JSON.stringify(m),raw);
});
test('invalid event is a barrier, not a fact to skip in a direct sequence',()=>{
 const m=flowMatch({lineup:true});red(m);
 addFlow(m,'point','opposition',10);addFlow(m,'our-kickout','our',20,1,{outcome:'lost',kickoutPerspective:'our'});
 attributed(m,'pass',25);addFlow(m,'goal','opposition',30);
 assert.equal(candidates(m,'direct-restart-score').length,0);
});
test('valid H2 return and contributions are evaluated with H1 discipline context',()=>{
 const m=flowMatch({lineup:true});const e=attributed(m,'booked',1700,1,{disciplineVersion:1,matchCode:'LGFA',card:'yellow',sinBinDurationMs:600000});
 attributed(m,'discipline-return',600,2,{disciplineVersion:1,cardId:e.id});attributed(m,'point',601,2);
 assert.equal(fieldState(m).invalidEvents.size,0);
 assert.equal(analysisForScope(m,'H2').contributors.find(p=>p.number==='8').successful,1);
 assert.equal(coachReportModel(m).stats.our.successful,1);
});
test('invalid substitution without any versioned card is consistently excluded from analysis',()=>{
 const m=flowMatch({lineup:true});addFlow(m,'substitution','our',1,1,{playerOn:'18',playerOff:'22'});
 assert.equal(canonicalAnalysisStream(m)[0].valid,false);
 assert.equal(analysisForScope(m,'FULL_MATCH').events.length,0);
 assert.equal(coachReportModel(m).substitutions.length,0);
});
test('recording extra incidental event types never raises the same scoring phase significance',()=>{
 const sparse=swingMatch(),dense=structuredClone(sparse);
 addFlow(dense,'booked','our',1400);addFlow(dense,'goalkeeper-change','our',1420);
 const a=matchFlow(sparse).candidates,b=matchFlow(dense).candidates;
 for(const c of a){const other=b.find(d=>d.id===c.id);assert.ok(other,c.id);assert.equal(other.significance,c.significance,c.id);assert.deepEqual(other.rank,c.rank);}
 assert.deepEqual(matchFlow(sparse).observations.map(o=>o.id),matchFlow(dense).observations.map(o=>o.id));
});
test('incidental passes inside a direct restart sequence preserve rank while enriching evidence',()=>{
 const m=direct(),before=candidates(m,'direct-restart-score')[0];
 addFlow(m,'pass','our',30,1,{playerNumber:'4',receiverNumber:'11'});
 const after=candidates(m,'direct-restart-score')[0];assert.equal(after.significance,before.significance);assert.equal(after.evidenceIds.length,before.evidenceIds.length+1);
});
test('important single late lead change retains the existing significance threshold',()=>{
 const m=flowMatch();addFlow(m,'point','our',1790,2);const c=matchFlow(m).observations.find(c=>c.family==='lead-change');
 assert.equal(c.significance,13);
});
test('deduplication preserves evidence union, opposite-team stories and unchanged limits',()=>{
 const f=matchFlow(swingMatch());assert.ok(f.observations.length<=5);assert.ok(matchFlow(swingMatch(),{scope:'H1'}).observations.length<=3);
 assert.ok(f.observations.some(c=>c.team==='our'));assert.ok(f.observations.some(c=>c.team==='opposition'));
 const a=f.candidates.find(c=>c.family==='scoring-run'),b={...a,id:'support',significance:a.significance-1,family:'support',evidenceIds:['additional']};
 const merged=mergeStories([a,b]);assert.equal(merged.length,1);assert.ok(merged[0].evidenceIds.includes('additional'));
 assert.equal(merged[0].significance,a.significance);
});
test('all analysis projections remain read-only with corrected historical facts',()=>{
 const m=flowMatch({lineup:true});red(m);attributed(m,'point',2);const raw=JSON.stringify(m);
 matchFlow(m);analysisForScope(m,'H1');analysisForScope(m,'H2');coachReportModel(m);playerStatistics(m,'our');
 assert.equal(JSON.stringify(m),raw);
});
test('five FT and three HT slots are enforced with more than five independent significant stories',()=>{
 const m=flowMatch();for(let i=0;i<12;i++){const t=i%2?'opposition':'our';addFlow(m,'goal',t,20*i+1);addFlow(m,'two-point',t,20*i+2);}
 assert.ok(matchFlow(m).candidates.length>5);
 assert.equal(matchFlow(m).observations.length,5);
 assert.equal(matchFlow(m,{scope:'H1'}).observations.length,3);
});
test('unknown-time clue in recording order breaks a source/shot chain even if numeric sorting moves it',()=>{
 const m=flowMatch();ko(m,10);addFlow(m,'booked','our',20,1,{timeMs:null});addFlow(m,'goal','our',30);
 assert.equal(chains(m).at(-1).scoreIds.length,0);
});
test('unknown timestamp cannot extend a substitution spell or reduced-strength spell',()=>{
 const m=flowMatch({lineup:true});addFlow(m,'substitution','our',1,1,{playerOn:'18',playerOff:'8'});
 addFlow(m,'booked','our',2,1,{timeMs:null});for(let i=0;i<3;i++)addFlow(m,'two-point','our',10+i);
 assert.equal(candidates(m,'personnel').length,0);
 const n=flowMatch({lineup:true});red(n);addFlow(n,'two-point','opposition',10);
 addFlow(n,'booked','our',20,1,{timeMs:null});addFlow(n,'two-point','opposition',30);
 assert.equal(candidates(n,'numerical').length,0);
});
test('deleting a prerequisite substitution excludes its dependent substitution and credited score everywhere',()=>{
 const m=flowMatch({lineup:true});const first=addFlow(m,'substitution','our',1,1,{playerOn:'18',playerOff:'8'});
 addFlow(m,'substitution','our',2,1,{playerOn:'17',playerOff:'18'});
 attributed(m,'goal',10,1,{playerNumber:'17'});
 assert.equal(fieldState(m).invalidEvents.size,0);
 m.events=m.events.filter(e=>e.id!==first.id);
 assert.equal(fieldState(m).invalidEvents.size,2);
 assert.equal(canonicalAnalysisStream(m).at(-1).scoreAfter.our,0);
 assert.equal(analysisForScope(m,'H1').our.total,0);
 assert.equal(coachReportModel(m).stats.our.total,0);
});

test('unknown scoring times remain in totals without an invented ordered run or 00:00',()=>{
 const m=flowMatch();addFlow(m,'goal','our',1,2,{timeMs:null});addFlow(m,'two-point','our',2,2,{timeMs:null});
 const flow=matchFlow(m);assert.equal(flow.observations.length,0);
 const html=matchFlowMarkup(m);assert.ok(!html.includes('H2 00:00'));
 assert.equal(canonicalAnalysisStream(m).at(-1).scoreAfter.our,5);
});

test('an untimed opposing score cannot be sorted out of an apparent unanswered run',()=>{
 const m=flowMatch();addFlow(m,'goal','our',10);addFlow(m,'point','opposition',20,1,{timeMs:null});addFlow(m,'two-point','our',30);
 assert.equal(candidates(m,'scoring-run').length,0);assert.equal(candidates(m,'lead-change').length,0);
 assert.equal(analysisForScope(m,'FULL_MATCH').our.total,5);assert.equal(analysisForScope(m,'FULL_MATCH').opposition.total,1);
 addFlow(m,'goal','our',10,2);addFlow(m,'two-point','our',30,2);
 const run=candidates(m,'scoring-run')[0];assert.equal(run.metrics.points,5);assert.equal(run.metrics.marginBefore,4);assert.equal(run.metrics.marginAfter,9);
 assert.equal(run.window.from.period,'H2');
});

test('untimed attempts cannot manufacture a before/after finishing improvement',()=>{
 const m=flowMatch();for(let i=0;i<5;i++)addFlow(m,'miss','our',i+1);for(let i=0;i<5;i++)addFlow(m,'point','our',i+10);
 assert.equal(candidates(m,'shooting-change').length,1);
 m.events[0].timeMs=null;assert.equal(candidates(m,'shooting-change').length,0);
 assert.equal(analysisForScope(m,'FULL_MATCH').our.attempts,10);
 assert.equal(analysisForScope(m,'FULL_MATCH').our.successful,5);
});

test('incidental records cannot inflate numerical-spell rank or add late context',()=>{
 const m=flowMatch({lineup:true});red(m);addFlow(m,'two-point','opposition',10);addFlow(m,'two-point','opposition',250);
 const sparse=candidates(m,'numerical')[0];assert.ok(sparse);
 addFlow(m,'booked','opposition',150);addFlow(m,'pass','opposition',200,1,{playerNumber:'4',receiverNumber:'11'});
 assert.equal(candidates(m,'numerical')[0].significance,sparse.significance);
 const n=flowMatch({lineup:true});red(n,1400,2);addFlow(n,'two-point','opposition',1401,2);addFlow(n,'two-point','opposition',1402,2);
 const before=candidates(n,'numerical')[0];addFlow(n,'booked','opposition',1500,2);
 const after=candidates(n,'numerical')[0];assert.equal(after.significance,before.significance);assert.deepEqual(after.window,before.window);
});

for(const half of [1,2,3,4])test(`additional time in period ${half} supports factual sequences beyond all former inference limits`,()=>{
 const m=flowMatch(),reference=half<=2?1800:600;
 m.clock={half:4,elapsedMs:2000000,startedAt:null,completedHalves:{1:3000000,2:3000000,3:1500000}};
 addFlow(m,'point','our',reference+10,half);
 const restart=addFlow(m,'opposition-kickout','opposition',reference+200,half,{outcome:'won',kickoutPerspective:'our'});
 const shot=addFlow(m,'goal','our',reference+500,half);
 const c=candidates(m,'direct-restart-score')[0];assert.ok(c);assert.equal(c.metrics.seconds,490);assert.match(c.detail,/not continuous possession or tactical causation/);
 const chain=chains(m).find(c=>c.sourceId===restart.id);assert.equal(chain.confidence,'PROBABLE');assert.deepEqual(chain.scoreIds,[shot.id]);assert.equal(chain.confirmedScoreIds.length,0);
 assert.equal(analysisForScope(m,['H1','H2','ET1','ET2'][half-1]).our.total,4);
});

for(const stop of [
 {event:'interception',team:'opposition'},
 {event:'turnover-lost',team:'our'},
 {event:'opposition-kickout',team:'opposition',extra:{outcome:'lost',kickoutPerspective:'our'}},
 {event:'pass',team:'opposition',extra:{playerNumber:'4',receiverNumber:'11'}},
 {event:'miss',team:'opposition',extra:{missReason:'blocked'}},
 {event:'possession',team:'our',extra:{outcome:''}},
 {event:'our-kickout',team:'our',extra:{outcome:'out-of-play',kickoutPerspective:'our'}},
])test(`known intervening ${stop.event} breaks inferred win-to-score attribution`,()=>{
 const m=flowMatch(),source=ko(m,10);addFlow(m,stop.event,stop.team,500,1,stop.extra);addFlow(m,'goal','our',1500);
 const initial=chains(m).find(c=>c.sourceId===source.id);assert.equal(initial.scoreIds.length,0);assert.equal(initial.confirmedScoreIds.length,0);
});

test('explicitly linked and merely next-recorded scores remain distinct even after a long stoppage',()=>{
 const make=linked=>{const m=flowMatch(),source=ko(m,10),shot=addFlow(m,'goal','our',1500);if(linked)source.directScoreLink=shot.id;return {m,source,shot};};
 const inferred=make(false),confirmed=make(true);
 assert.equal(chains(inferred.m)[0].confidence,'PROBABLE');assert.deepEqual(chains(inferred.m)[0].confirmedScoreIds,[]);
 assert.equal(chains(confirmed.m)[0].confidence,'CONFIRMED');assert.deepEqual(chains(confirmed.m)[0].confirmedScoreIds,[confirmed.shot.id]);
 const m=flowMatch(),source=ko(m,10);addFlow(m,'interception','opposition',500);const shot=addFlow(m,'goal','our',1500);source.directScoreLink=shot.id;
 assert.equal(chains(m).find(c=>c.sourceId===source.id).scoreIds.length,0); // A contradictory recorded fact wins over the link.
});

test('ten-minute post-substitution net advantage is restored without individual or causal attribution',()=>{
 const m=flowMatch({lineup:true});addFlow(m,'substitution','our',600,2,{playerOn:'18',playerOff:'8'});
 for(const [t,type]of [[720,'goal'],[960,'point'],[1200,'point']])addFlow(m,type,'our',t,2);
 const c=candidates(m,'personnel')[0];assert.ok(c);assert.equal(c.metrics.scoringSwing,5);assert.equal(c.metrics.scoringEvents,3);
 assert.match(c.detail,/Following the substitution/);assert.match(c.detail,/net scoring advantage/);assert.match(c.detail,/does not establish/);assert.ok(!c.detail.includes('#18'));
 assert.ok(matchFlow(m).observations.some(o=>o.family==='personnel'||o.supporting.some(s=>s.family==='personnel')));
});

test('substitution window uses all recorded scores until the next same-team substitution',()=>{
 const m=flowMatch({lineup:true}),first=addFlow(m,'substitution','our',1,1,{playerOn:'18',playerOff:'8'});
 for(let i=0;i<8;i++)addFlow(m,'point','our',100+i*200);
 const second=addFlow(m,'substitution','our',1700,1,{playerOn:'17',playerOff:'18'});
 for(let i=0;i<3;i++)addFlow(m,'goal','our',1800+i*200);
 const c=candidates(m,'personnel').find(c=>c.evidenceIds.includes(first.id));assert.equal(c.metrics.scoringEvents,8);assert.equal(c.metrics.scoringSwing,8);assert.ok(!c.evidenceIds.includes(second.id));
});

test('all three local-period boundaries stop substitution windows even during recorded additional time',()=>{
 for(const half of [1,2,3]){
  const m=flowMatch({lineup:true});addFlow(m,'substitution','our',1,half,{playerOn:'18',playerOff:'8'});
  addFlow(m,'point','our',half<=2?2100:900,half);
  for(let i=0;i<3;i++)addFlow(m,'goal','our',100+i,half+1);
  assert.equal(candidates(m,'personnel').length,0);
 }
});
