import {continuousPlayingMs,playingEnd,completedDuration} from './periods.js';
import {fieldState,disciplineKey,disciplinePlayerKey} from './field-state.js';
export {fieldState,cardOptions,sinBinDuration,disciplineKey,disciplinePlayerKey,orderedFacts,validDisciplineEvent,eventRef,pendingETChoices,etTransitionOpen,assertEventEligibility} from './field-state.js';
export const disciplineState=fieldState;
export function disciplinePlayerState(match,player,team='our',options){return fieldState(match,options).players.get(disciplinePlayerKey(player,team))?.state||null;}
export function pointAtPlayingTime(match,total){for(let half=1;half<=4;half++){const duration=completedDuration(match.clock,half);if(duration===null)return half<=(match.clock.activeHalf||match.clock.half)?{half,timeMs:total}:null;if(total<=duration)return{half,timeMs:total};total-=duration;}return null;}
export function eligibilityEntries(match,now=Date.now()){const end=continuousPlayingMs(match,null,now);return fieldState(match,{now}).history.filter(h=>h.eligibleAt!==null&&end!==null&&h.eligibleAt<=end&&(!h.closed||continuousPlayingMs(match,h.closed,now)>=h.eligibleAt)).map(bin=>({card:bin.card,ref:bin.ref,point:pointAtPlayingTime(match,bin.eligibleAt),eligibleAt:bin.eligibleAt})).filter(x=>x.point);}
export function disciplineAbsenceMs(match,player,team,from,to,now=Date.now()){
 const changes=fieldState(match,{now}).changes.filter(c=>disciplineKey(c.ref,match)===disciplinePlayerKey(player,team));if(!changes.length)return 0;
 const a=continuousPlayingMs(match,from,now),b=continuousPlayingMs(match,to,now);if(a===null||b===null)return null;
 let inactive=null,total=0;for(const c of changes){const t=continuousPlayingMs(match,c.event,now);if(t===null)return null;if(!c.active&&inactive===null)inactive=t;if(c.active&&inactive!==null){total+=Math.max(0,Math.min(b,t)-Math.max(a,inactive));inactive=null;}}if(inactive!==null)total+=Math.max(0,b-Math.max(a,inactive));return total;
}
export const currentDisciplinePoint=(match,now=Date.now())=>playingEnd(match,now);
export const substitutionDisciplineConflict=(match,event)=>fieldState(match).invalidEvents.has(event.id);
