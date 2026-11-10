import test from 'node:test';
import assert from 'node:assert/strict';
import {blankMatch,createEvent,saveEvent} from '../src/domain.js';
import {advancePeriod,startPeriod,togglePeriod,pausePeriod,completePeriod,periodHasStarted,validPeriodClock} from '../src/periods.js';
import {captureContext,captureReason,assertNewCapture} from '../src/capture-policy.js';
import {historySnapshot} from '../src/history.js';
const fixture=()=>{const m=blankMatch();m.setup.ourTeam='Synthetic home';m.setup.opposition='Synthetic away';return m;};
for(const half of [1,2,3,4])test(`capture ${half}: unstarted blocked; explicit start and zero-time manual pause allowed`,()=>{
 const m=fixture();for(let h=2;h<=half;h++)m.clock=advancePeriod(m.clock,h,1000);
 const e=createEvent(m,'point','our',1000),context=captureContext(m);
 assert.match(captureReason(m),/Start/);assert.throws(()=>assertNewCapture(m,e,context),/Start/);
 m.clock=startPeriod(m.clock,1000);assert.equal(periodHasStarted(m.clock),true);assert.equal(captureReason(m),'');
 m.clock=pausePeriod(m.clock,1000);assert.equal(m.clock.elapsedMs,0);assert.equal(captureReason(m),'');
 const clock=JSON.stringify(m.clock);assertNewCapture(m,e,context);saveEvent(m.events,e,m);assert.equal(JSON.stringify(m.clock),clock);
 assert.equal(validPeriodClock(m.clock),true);
});
for(const phase of ['INTERVAL','REVIEW','SHOOTOUT'])test(`${phase} blocks ordinary new capture`,()=>{const m=fixture();m.clock={...startPeriod(m.clock,1000),phase};assert.match(captureReason(m),/ended/);});
test('legacy completed lifecycle blocks even without duration boundaries',()=>{const m=fixture();m.clock.elapsedMs=1800000;m.lifecycle={status:'completed'};assert.match(captureReason(m),/completed/);});
test('legacy start evidence is current-period clock only, never recorded events or earlier periods',()=>{
 const m=fixture();m.events=[createEvent(m,'point','our',0)];assert.match(captureReason(m),/Start/);
 m.clock.elapsedMs=500;assert.equal(captureReason(m),'');m.clock=advancePeriod(m.clock,2,1000);assert.match(captureReason(m),/Start/);
 m.clock.startedAt=1000;assert.equal(captureReason(m),'');
});
test('start flag survives snapshots and JSON reload, including paused zero-time periods',()=>{const m=fixture();m.clock=pausePeriod(startPeriod(m.clock,1000),1000);const before=JSON.stringify(m);const snap=historySnapshot({match:m,archivedAt:new Date(2000).toISOString()});assert.equal(periodHasStarted(snap.clock),true);assert.equal(captureReason(JSON.parse(JSON.stringify(snap))),'');assert.equal(JSON.stringify(m),before);});
test('pending capture cannot change match or period; duplicate new insertions rejected',()=>{
 const m=fixture();m.clock=startPeriod(m.clock,1000);const e=createEvent(m,'point','our',1000),c=captureContext(m);
 assert.throws(()=>assertNewCapture({...m,id:'different'},e,c),/another match/);
 assert.throws(()=>assertNewCapture({...m,clock:advancePeriod(m.clock,2,1000)},e,c),/another match/);
 m.events=[e];assert.throws(()=>assertNewCapture(m,e,c),/already/);
});
test('completed period blocks despite PLAY and positive time; no automatic clock restart',()=>{const m=fixture();m.clock=completePeriod(startPeriod(m.clock,1000),61000);const before=JSON.stringify(m.clock);assert.match(captureReason(m),/ended/);assert.deepEqual(togglePeriod(m.clock,999999),m.clock);assert.equal(JSON.stringify(m.clock),before);});
test('repeated explicit start cannot reset an already running period',()=>{const c=startPeriod(fixture().clock,1000);assert.deepEqual(startPeriod(c,9000),c);});
test('optional period start metadata rejects invalid types but leaves old snapshots valid',()=>{const c=startPeriod(fixture().clock,1000);assert.equal(validPeriodClock(c),true);assert.equal(validPeriodClock({...c,periods:{H1:{...c.periods.H1,hasStarted:'yes'}}}),false);delete c.periods.H1.hasStarted;assert.equal(validPeriodClock(c),true);});
