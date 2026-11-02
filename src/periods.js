// Canonical timed periods. Numeric half is a compatibility ordering key only.
export const PERIODS = ['H1','H2','ET1','ET2'];
export const periodId = value => typeof value === 'string' && PERIODS.includes(value) ? value : PERIODS[(value?.half ?? value)-1] || 'H1';
export const periodNumber = value => PERIODS.indexOf(periodId(value))+1;
export const periodLabel = value => periodId(value);
export const runningElapsed = (clock,now=Date.now()) => clock.elapsedMs+(clock.startedAt===null?0:Math.max(0,now-clock.startedAt));
export const periodReferenceMs = (match,half=match.clock.half) => half>2?600000:match.setup.halfLength*60000;
export function completedDuration(clock,half) {
 const n=periodNumber(half),record=clock.periods?.[periodId(n)];
 const value=record?.completedDurationMs ?? clock.completedHalves?.[n];
 return Number.isFinite(value)&&value>=0?value:null;
}
export function syncPeriod(clock) {
 const id=periodId(clock);
 return {...clock,periodVersion:1,period:id,phase:clock.phase||'PLAY',periods:{...clock.periods,[id]:{...clock.periods?.[id],id,elapsedMs:clock.elapsedMs,startedAt:clock.startedAt,completedDurationMs:completedDuration(clock,clock.half)}}};
}
export function pausePeriod(clock,now=Date.now()) {
 return syncPeriod({...clock,elapsedMs:runningElapsed(clock,now),startedAt:null});
}
export function togglePeriod(clock,now=Date.now()) {
 if(['SHOOTOUT','INTERVAL','REVIEW'].includes(clock.phase)||completedDuration(clock,clock.half)!==null)return clock;
 return syncPeriod(clock.startedAt===null?{...clock,startedAt:now}:pausePeriod(clock,now));
}
export function completePeriod(clock,now=Date.now()) {
 const paused=pausePeriod(clock,now),duration=completedDuration(clock,clock.half)??paused.elapsedMs,id=periodId(clock);
 return {...paused,elapsedMs:duration,completedHalves:{...clock.completedHalves,[clock.half]:duration},periods:{...paused.periods,[id]:{...paused.periods[id],elapsedMs:duration,startedAt:null,completedDurationMs:duration}}};
}
export function advancePeriod(clock,half,now=Date.now()) {
 if(![1,2,3,4].includes(half))throw new Error('Unknown timed period');
 if(half===clock.half)return clock;
 const frontier=clock.activeHalf||clock.half;
 let saved=half>clock.half&&clock.phase!=='REVIEW'?completePeriod(clock,now):pausePeriod(clock,now);
 const id=periodId(half),record=saved.periods?.[id],completed=completedDuration(saved,half);
 const resumePhase=half<frontier&&clock.phase!=='REVIEW'?clock.phase:clock.resumePhase;
 const phase=half<frontier?'REVIEW':clock.phase==='REVIEW'&&half===frontier&&['INTERVAL','SHOOTOUT'].includes(resumePhase)?resumePhase:completed!==null?'REVIEW':'PLAY';
 return syncPeriod({...saved,half,period:id,activeHalf:Math.max(frontier,half),elapsedMs:completed??record?.elapsedMs??0,startedAt:null,phase,...(resumePhase?{resumePhase}:{})});
}
export function shootoutClock(clock,now=Date.now()) {return {...completePeriod(clock,now),phase:'SHOOTOUT'};}
export function continuousPlayingMs(match,point=null,now=Date.now()) {
 point=point||playingEnd(match,now);
 const half=point.half??periodNumber(point.period);let total=point.timeMs??point.periodElapsedMs??0;
 for(let h=1;h<half;h++){const duration=completedDuration(match.clock,h);if(duration===null)return null;total+=duration;}
 return total;
}
export function playingEnd(match,now=Date.now()) {
 const half=Math.max(match.clock.activeHalf||match.clock.half,...match.events.map(e=>e.half));
 const record=match.clock.periods?.[periodId(half)];
 const timeMs=half===match.clock.half?runningElapsed(match.clock,now):record?.elapsedMs??0;
 const completed=completedDuration(match.clock,half);
 if(completed!==null)return {half,timeMs:completed};
 const latest=match.events.filter(e=>e.half===half).reduce((max,e)=>Math.max(max,e.timeMs),0);
 return {half,timeMs:Math.max(timeMs,latest)};
}
export function durationBetween(match,from,to) {
 if(from.half===to.half)return Math.max(0,to.timeMs-from.timeMs);
 let total=-from.timeMs+to.timeMs;
 for(let h=from.half;h<to.half;h++){const duration=completedDuration(match.clock,h);if(duration===null)return null;total+=duration;}
 return Math.max(0,total);
}
export function validPeriodClock(clock) {
 if(clock.periodVersion===undefined)return [1,2].includes(clock.half);
 return clock.periodVersion===1&&[1,2,3,4].includes(clock.half)&&periodId(clock)===clock.period&&['PLAY','REVIEW','INTERVAL','SHOOTOUT'].includes(clock.phase)&&(clock.activeHalf===undefined||([1,2,3,4].includes(clock.activeHalf)&&clock.activeHalf>=clock.half))&&clock.periods?.[clock.period]&&Object.entries(clock.periods).every(([id,r])=>PERIODS.includes(id)&&r.id===id&&Number.isFinite(r.elapsedMs)&&r.elapsedMs>=0&&(r.startedAt===null||Number.isFinite(r.startedAt))&&(r.completedDurationMs===null||(Number.isFinite(r.completedDurationMs)&&r.completedDurationMs>=0)));
}
