import test from 'node:test';
import assert from 'node:assert/strict';
import {coachingInsights,recordedPlayerInfluence,selectCoachingFindings} from '../src/coaching-insights.js';
import {canonicalAnalysisStream} from '../src/analysis-stream.js';
import {analysisForScope} from '../src/half-time.js';
import {coachReportModel} from '../src/coach-report.js';
import {halfTimeScreen} from '../src/half-time-ui.js';
import {fullTimeScreen} from '../src/full-time-ui.js';
import {matchFlow} from '../src/match-flow.js';
import {summarize,playerStatistics} from '../src/analysis.js';
import {bindEventParticipants} from '../src/identity.js';
import {flowMatch,addFlow,swingMatch} from './helpers/match-flow-match.js';
import {attacking0311,kickout0311,defence0311} from './helpers/coaching0311.js';
const all=m=>coachingInsights(m),candidates=(m,f)=>all(m).candidates.filter(c=>c.family===f);
for(const [a,as,b,bs,label]of [
 [12,6,7,4,'fewer recorded attempts, similar conversion'],
 [10,7,10,3,'similar attempt volume, lower conversion'],
 [8,3,12,8,'more recorded attempts and stronger conversion'],
 [8,4,12,4,'more recorded attempts without higher scoring output'],
 [12,6,7,5,'fewer recorded attempts, stronger conversion'],
])test('attacking interpretation: '+label,()=>{
 const m=attacking0311(a,as,b,bs),c=candidates(m,'attacking-halves')[0];
 assert.ok(c.title.includes(label));assert.ok(c.detail.includes(`${as}/${a} → ${bs}/${b}`));assert.ok(!/total chances|created|because|possession %/i.test(c.detail));assert.ok(all(m).observations.some(o=>o.id===c.id));
});
test('small samples and immaterial changes cannot produce attacking-half conclusions',()=>{
 assert.equal(candidates(attacking0311(4,4,4,0),'attacking-halves').length,0);
 assert.equal(candidates(attacking0311(10,5,11,6),'attacking-halves').length,0);
 assert.equal(candidates(attacking0311(5,5,7,0),'attacking-halves').length,0); // not clearly similar volume
});
test('a two-pointer is one successful attempt and two scoreboard points throughout interpretation',()=>{
 const m=attacking0311(8,4,12,4),e=m.events.find(e=>e.half===2&&e.outcome==='scored');e.event='two-point';e.scoreValue=2;
 const d=analysisForScope(m,'FULL_MATCH');assert.equal(d.our.attempts,20);assert.equal(d.our.successful,8);assert.equal(d.our.total,9);
 assert.ok(candidates(m,'attacking-halves').every(c=>!c.title.includes('without higher scoring output')));
});
test('location contrasts require classifiable samples and retain unknown locations separately',()=>{
 const m=flowMatch();for(let i=0;i<3;i++)addFlow(m,'point','our',100+i,1,{shotX:.5,shotY:.1});for(let i=0;i<3;i++)addFlow(m,'miss','our',200+i,1,{shotX:.5,shotY:.65});
 addFlow(m,'goal','our',300);const c=candidates(m,'zone-efficiency')[0];assert.ok(c.detail.includes('3/3'));assert.ok(c.detail.includes('0/3'));assert.equal(c.evidenceIds.length,6);
 m.events[0].shotX=null;assert.equal(candidates(m,'zone-efficiency').length,0);
});
test('inside/outside half changes are scoped to the actual zone and require three per half',()=>{
 const m=flowMatch();for(let i=0;i<3;i++){addFlow(m,'point','our',100+i,1,{shotX:.5,shotY:.1});addFlow(m,'miss','our',100+i,2,{shotX:.5,shotY:.1});}
 const c=candidates(m,'zone-halves-inside')[0];assert.ok(c.detail.includes('100%'));assert.ok(c.detail.includes('0%'));assert.equal(c.evidenceIds.length,6);
});
test('Short/Long and H1/H2 kickout contrasts use known outcomes, with unknown separate',()=>{
 const m=kickout0311(),length=candidates(m,'kickout-length-our')[0],halves=candidates(m,'kickout-halves-our')[0];
 assert.ok(length.detail.includes('5/5 (100%)'));assert.ok(length.detail.includes('1/5 (20%)'));assert.ok(length.detail.includes('1 unknown excluded'));assert.ok(halves);assert.equal(length.evidenceIds.length,10);
 assert.equal(analysisForScope(m,'FULL_MATCH').our.kickouts.total,11);
});
test('opposition kickout contrast remains our win rate, not kicking-team retention',()=>{
 const m=kickout0311();for(const e of m.events){e.event='opposition-kickout';e.team='opposition';}
 assert.ok(candidates(m,'kickout-halves-opposition')[0].title.includes('won by us'));
 assert.ok(candidates(m,'kickout-halves-opposition')[0].detail.includes('H1: 5/5'));
});
test('OOP is a loss for the kicking team without a player credit or extra kickout',()=>{
 const m=kickout0311();m.events.find(e=>e.half===2).outcome='out-of-play';
 assert.ok(candidates(m,'kickout-halves-our')[0].detail.includes('0/5 (0%)'));
 const d=analysisForScope(m,'FULL_MATCH');assert.equal(d.our.kickouts.total,11);assert.equal(d.our.kickouts.outOfPlay,1);assert.equal(d.our.kickouts.lost,5);
});
test('unchanged kickout performance and tiny length samples are not observations',()=>{
 const m=kickout0311();for(const e of m.events)if(e.outcome!=='unknown')e.outcome='won';
 assert.equal(candidates(m,'kickout-length-our').length,0);assert.equal(candidates(m,'kickout-halves-our').length,0);
 m.events=m.events.slice(0,4);assert.equal(candidates(m,'kickout-length-our').length,0);
});
test('non-scoring defensive concentration uses attributed blocks, not invented possession or shots',()=>{
 const m=defence0311(),c=all(m).observations.find(o=>o.playerKey);assert.ok(c.title.includes('#4'));assert.match(c.detail,/3 of 4/);assert.match(c.detail,/without a recorded score/);
 const d=analysisForScope(m,'H1');assert.equal(d.our.attempts,0);assert.equal(d.our.turnoversWon,0);assert.ok(d.contributors.some(p=>p.number==='4'));
});
for(const event of ['interception','turnover-won'])test('attributed '+event+' is a separate influence category',()=>{
 const m=flowMatch();for(let i=0;i<3;i++)addFlow(m,event,'our',i+100,1,{playerNumber:'4'});
 const g=all(m).players[0];assert.equal(g.events.size,3);assert.equal(g.categories.size,1);assert.ok(all(m).observations.some(o=>o.playerKey));
});
test('one isolated defensive action does not create a performance finding',()=>{
 const m=flowMatch();addFlow(m,'defensive-block','our',10,1,{playerNumber:'4'});assert.equal(all(m).observations.length,0);
});
test('a Mark is one kickout win, never two independent contributions or observations',()=>{
 const m=flowMatch();for(let i=0;i<4;i++)addFlow(m,'our-kickout','our',100+i,1,{outcome:'won',kickoutPerspective:'our',mark:true,markPlayerNumber:'8',kickoutWinnerNumber:'8'});
 const g=all(m).players[0];assert.equal(g.events.size,4);assert.equal(g.categories.get('Marks').size,4);assert.equal(g.categories.get('kickout wins').size,4);
 assert.equal(all(m).observations.filter(o=>o.playerKey===g.key).length,1);assert.equal(analysisForScope(m,'FULL_MATCH').our.kickouts.total,4);
});
test('keeper-only recorded saves can be a meaningful non-scoring contribution',()=>{
 const m=flowMatch({lineup:true});for(let i=0;i<3;i++)addFlow(m,'miss','opposition',100+i,1,{missReason:'saved'});
 const c=all(m).observations.find(o=>o.family.startsWith('player-saves'));assert.ok(c);assert.ok(c.title.includes('#1'));
 assert.equal(analysisForScope(m,'H1').contributors.find(p=>p.number==='1').recordedSaves,3);
});
test('a Short miss alone does not become an invented goalkeeper-save observation',()=>{
 const m=flowMatch({lineup:true});for(let i=0;i<3;i++)addFlow(m,'miss','opposition',100+i,1,{missReason:'short'});
 assert.ok(!all(m).candidates.some(o=>o.family.startsWith('player-saves')));
});
test('same-name players remain distinct and are not merged to pass a minimum sample',()=>{
 const m=flowMatch({lineup:true});m.players[3].name=m.players[4].name='Same Name';
 for(let i=0;i<4;i++){const e=addFlow(m,'defensive-block','our',100+i,1,{playerNumber:i<2?'4':'5'});m.events[i]=bindEventParticipants(e,null,m);}
 const g=recordedPlayerInfluence(canonicalAnalysisStream(m));assert.equal(g.length,2);assert.ok(g.every(p=>p.events.size===2));assert.equal(all(m).observations.filter(o=>o.playerKey).length,0);
});
test('half-by-half defensive changes use actual categories, not a summed defensive rating',()=>{
 const m=flowMatch();addFlow(m,'interception','our',10);for(let i=0;i<5;i++)addFlow(m,'interception','our',100+i,2);
 const c=candidates(m,'defence-halves-interceptions')[0];assert.ok(c.detail.includes('H1 1 → H2 5'));assert.equal(analysisForScope(m,'FULL_MATCH').our.turnoversWon,0);
});
test('our attacking blocked attempts do not invent opposition defensive-block records',()=>{
 const m=flowMatch();for(let i=0;i<6;i++)addFlow(m,'miss','our',100+i,2,{missReason:'blocked',playerNumber:'10'});
 assert.equal(candidates(m,'defence-halves-blocks').length,0);assert.ok(!all(m).players.some(g=>g.ref.team==='opposition'));
});
test('optional Pass and unrelated record types never create player influence or raise significance',()=>{
 const m=defence0311(),before=all(m).observations.map(o=>[o.title,o.significance]);
 for(let i=0;i<10;i++)addFlow(m,'pass','our',110+i,1,{playerNumber:'4',receiverNumber:'5'});
 assert.deepEqual(all(m).observations.map(o=>[o.title,o.significance]),before);
});
test('selection allows significant other dimensions alongside several major swings, without polarity quotas',()=>{
 const c=(id,dim,score,polarity)=>({id,dimension:dim,significance:score,priority:dim==='momentum'?30:score,team:'our',topic:id,polarity});
 const all=[...Array.from({length:7},(_,i)=>c('swing'+i,'momentum',100,'positive')),c('attack','attack',18,'problem'),c('blocks','defence',17,'positive')];
 const selected=selectCoachingFindings(all);assert.equal(selected.length,5);assert.ok(selected.some(c=>c.id==='attack'));assert.ok(selected.some(c=>c.id==='blocks'));
 assert.ok(selectCoachingFindings(all.filter(c=>c.polarity==='positive')).every(c=>c.polarity==='positive'));
});
test('semantic duplicates for the same player/topic are selected once',()=>{
 const m=defence0311(),c=all(m).observations[0];assert.equal(selectCoachingFindings([c,{...c,id:'another-id'}]).length,1);
});
test('the global observation limit spans dashboard and Match Flow: FT five, HT three',()=>{
 const m=attacking0311(12,6,7,5);
 for(let i=0;i<4;i++)addFlow(m,'defensive-block','our',50+i,1,{playerNumber:'4'});
 const ft=analysisForScope(m,'FULL_MATCH'),ht=analysisForScope(m,'H1');
 for(const [d,max]of [[ft,5],[ht,3]]){assert.ok(d.coachingInsights.observations.length<=max);assert.equal(d.observations.length+d.coachingInsights.flow.observations.length,d.coachingInsights.observations.length);}
 const html=fullTimeScreen(m);assert.ok((html.match(/data-observation=/g)||[]).length+(html.match(/data-flow-story/g)||[]).length<=5);
 assert.ok(halfTimeScreen(m).includes('START SECOND HALF')||halfTimeScreen(m).includes('Second half started'));
});
test('Coach Report and Full-Time use the exact same selected findings',()=>{
 const m=attacking0311(),a=analysisForScope(m,'FULL_MATCH'),r=coachReportModel(m);
 assert.deepEqual(r.coachingInsights.observations.map(o=>o.id),a.coachingInsights.observations.map(o=>o.id));assert.deepEqual(r.observations,a.coachingInsights.observations.map(o=>o.reportText||`${o.title}: ${o.detail}`));
});
test('invalid facts remain excluded and original IDs are retained as evidence',()=>{
 const m=flowMatch({lineup:true});let e=addFlow(m,'booked','our',1,1,{playerNumber:'8',disciplineVersion:1,matchCode:'LGFA',card:'red'});m.events[0]=bindEventParticipants(e,null,m);
 for(let i=0;i<5;i++){e=addFlow(m,'defensive-block','our',100+i,1,{playerNumber:'8'});m.events[m.events.length-1]=bindEventParticipants(e,null,m);}
 assert.ok(all(m).observations.every(o=>!o.evidenceIds.some(id=>m.events.slice(1).some(e=>e.id===id))));assert.equal(analysisForScope(m,'FULL_MATCH').our.defensiveBlocks,0);
});
test('cross-period scoring swings, additional time and Stage 1 evidence survive consolidation',()=>{
 const m=swingMatch(),ins=all(m);assert.ok(ins.observations.some(o=>o.title.includes('11 points unanswered')));
 assert.ok(ins.observations.every(o=>o.evidenceIds.every(id=>m.events.some(e=>e.id===id))));
 const n=flowMatch();addFlow(n,'point','our',1810);addFlow(n,'opposition-kickout','opposition',2000,1,{outcome:'won',kickoutPerspective:'our'});addFlow(n,'goal','our',2300);
 assert.ok(all(n).observations.some(o=>o.family==='direct-restart-score'||o.supporting.some(s=>s.family==='direct-restart-score')));
});
test('momentum continuation uses subsequent recorded scores, never unrecorded tactical explanations',()=>{
 const m=swingMatch(),c=all(m).candidates.find(c=>c.supporting?.some(s=>s.family==='continuation'));
 assert.ok(c);const follow=c.supporting.find(s=>s.family==='continuation');assert.ok(follow.detail.includes('next 3 recorded scores'));assert.ok(follow.evidenceIds.every(id=>m.events.some(e=>e.id===id)));
});
test('unknown timestamps suppress ordered claims without reducing valid aggregate scores',()=>{
 const m=attacking0311();m.events[0].timeMs=null;const raw=JSON.stringify(m);all(m);assert.equal(analysisForScope(m,'FULL_MATCH').our.total,11);assert.equal(JSON.stringify(m),raw);
});
test('ET remains in full-match totals but never becomes H1/H2 attack-comparison data',()=>{
 const m=attacking0311(),before=candidates(m,'attacking-halves')[0];for(let i=0;i<10;i++)addFlow(m,'goal','our',100+i,3);
 assert.deepEqual(candidates(m,'attacking-halves')[0].evidenceIds,before.evidenceIds);assert.equal(analysisForScope(m,'FULL_MATCH').our.total,41);
});
test('scoped insights and reports do not mutate saved events, squads, clock or schema',()=>{
 const m=attacking0311(),raw=JSON.stringify(m);all(m);analysisForScope(m,'H1');analysisForScope(m,'FULL_MATCH');coachReportModel(m);fullTimeScreen(m);assert.equal(JSON.stringify(m),raw);
});

test('identical period/length kickout evidence becomes one finding with supporting contrast',()=>{
 const m=kickout0311(),selected=all(m).observations.filter(o=>o.dimension==='kickouts');assert.equal(selected.length,1);assert.ok(selected[0].supporting.some(s=>s.family.startsWith('kickout-length')));
});
test('same-player jersey changes use recorded stable identity, never display name as a key',()=>{
 const m=flowMatch({lineup:true});for(let i=0;i<3;i++){const e=addFlow(m,'interception','our',100+i,1,{playerNumber:'4'});m.events[i]=bindEventParticipants(e,null,m);}
 const before=all(m).players[0].key;m.players[3].number=24;m.players[3].name='Corrected';assert.equal(all(m).players[0].key,before);assert.equal(all(m).players[0].events.size,3);
});
test('eligible goalkeeper restart contribution requires eight known outcomes and never invents receivers',()=>{
 const m=flowMatch({lineup:true});for(let i=0;i<8;i++)addFlow(m,'our-kickout','our',100+i,1,{outcome:i<6?'won':'lost',kickoutPerspective:'our',playerNumber:'1'});
 const selected=all(m).observations.find(o=>o.family.startsWith('keeper-'));assert.ok(selected);assert.match(selected.detail,/6\/8/);assert.ok(!all(m).players.some(g=>g.categories.has('kickout wins')));
 m.events.pop();assert.ok(!all(m).observations.some(o=>o.family.startsWith('keeper-')));
});
test('shared scope rejects unknown analysis modes instead of manufacturing a period',()=>{assert.throws(()=>coachingInsights(flowMatch(),{scope:'typo'}),/Unknown coaching/);});

test('legacy number-only kickout winner appears in key contributors without linking a permanent identity',()=>{
 const m=flowMatch();for(let i=0;i<3;i++)addFlow(m,'our-kickout','our',100+i,1,{outcome:'won',kickoutPerspective:'our',playerNumber:'9'});
 const p=analysisForScope(m,'H1').contributors.find(p=>p.number==='9');assert.ok(p);assert.equal(p.recordedKickoutWins,3);assert.equal(p.matchPlayerId,null);assert.equal(m.players.length,0);
});
