// A temporal boundary, not another statistics engine or stored score snapshot.
// Corrections to H1/H2 still recalculate; later periods cannot enter this view.
import {completedDuration,periodId} from './periods.js';
export const normalTimePending=match=>!!match&&match.clock.half===2&&match.clock.phase==='INTERVAL'&&(match.clock.activeHalf||2)<=2&&!match.events.some(e=>e.half>2)&&match.lifecycle?.status!=='completed';
export const hasNormalTimeBoundary=match=>completedDuration(match.clock,2)!==null;
export function normalTimeMatch(match){
 const result=structuredClone(match);
 result.events=result.events.filter(e=>e.half<=2);
 const duration=completedDuration(match.clock,2);
 const recorded=match.clock.periods?.H2?.elapsedMs;
 const latest=result.events.filter(e=>e.half===2).reduce((n,e)=>Math.max(n,e.timeMs),0);
 result.clock={...result.clock,half:2,activeHalf:2,elapsedMs:duration??(Number.isFinite(recorded)?recorded:match.clock.half===2?match.clock.elapsedMs:latest),startedAt:null,phase:'INTERVAL'};
 if(result.clock.periodVersion===1){
  result.clock.period='H2';
  result.clock.periods=Object.fromEntries(Object.entries(result.clock.periods||{}).filter(([id])=>['H1','H2'].includes(id)));
  result.clock.periods.H2={...result.clock.periods.H2,id:periodId(2),elapsedMs:result.clock.elapsedMs,startedAt:null,completedDurationMs:duration};
 }
 result.clock.completedHalves=Object.fromEntries(Object.entries(result.clock.completedHalves||{}).filter(([h])=>Number(h)<=2));
 delete result.clock.resumePhase;
 delete result.shootout;delete result.result;
 return result;
}
