// Analysis-only eligibility projection. Replay the complete ledger before scoping;
// a H2 return/replacement can depend on a H1 card. Never rewrite stored events.
import {fieldState} from './field-state.js';
export function validAnalysisEvents(match) {
 const {invalidEvents}=fieldState(match,{now:0});
 return match.events.filter(e=>!invalidEvents.has(e.id));
}
export const knownEventTime=e=>Number.isInteger(e.half)&&e.half>=1&&e.half<=4&&Number.isFinite(e.timeMs)&&e.timeMs>=0;
