// Live capture permission is separate from corrections and historical replay.
import {completedDuration,periodHasStarted,periodId} from './periods.js';
import {pendingETChoices} from './field-state.js';
export const captureContext = match => ({matchId:match.id,half:match.clock.half});
export const matchFinished = match => match.lifecycle?.status === 'completed';
export function captureReason(match) {
 if(matchFinished(match))return 'The match is completed. Edit an existing event to make a correction.';
 const c=match.clock;
 if(['INTERVAL','REVIEW','SHOOTOUT'].includes(c.phase)||completedDuration(c,c.half)!==null)return 'This period has ended. Start the next period or edit an existing event.';
 if((c.activeHalf||c.half)!==c.half)return 'Return to the active period before recording play.';
 if(pendingETChoices(match).length)return 'Complete Extra Time player choices before starting the period.';
 if(!periodHasStarted(c))return `Start ${periodId(c)} before recording play.`;
 return '';
}
export function assertNewCapture(match,event,context) {
 if(!context||context.matchId!==match.id||context.half!==match.clock.half||event.half!==context.half||(event.period&&event.period!==periodId(match.clock)))throw Error('This capture belongs to another match or period. Close it and start a new capture.');
 if(match.events.some(e=>e.id===event.id))throw Error('This event has already been recorded.');
 const administrative=['discipline-et-choice','discipline-replacement'].includes(event.event);
 if(administrative){
  const c=match.clock;
  if(matchFinished(match)||c.half!==3||c.phase!=='PLAY'||(c.activeHalf||3)!==3||periodHasStarted(c)||completedDuration(c,3)!==null||!pendingETChoices(match).some(p=>p.card.id===event.cardId))throw Error('This Extra Time decision is no longer available.');
 }else{
  const reason=captureReason(match);if(reason)throw Error(reason);
 }
}
