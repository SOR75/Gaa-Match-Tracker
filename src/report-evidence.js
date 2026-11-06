// Report-only projections and labels. Never amend a match or assign missing data.
import {summarize} from './analysis.js';
import {isKickout} from './domain.js';
import {completed} from './history.js';
export const SHOT_CATEGORY_NOTE='Attempts = successful attempts + all unsuccessful attempts. Wides and blocked attempts are subsets of unsuccessful attempts, not extra attempts. One 2-pointer is one successful attempt worth two scoreboard points.';
export function reportStatus(match){
 if(match&&completed(match))return {label:'Completed match',scoreLabel:'Final score'};
 if(match?.clock?.startedAt!=null)return {label:'Match in progress',scoreLabel:'Recorded score'};
 return {label:'Recorded match — completion unconfirmed',scoreLabel:'Recorded score'};
}
export function kickoutLengthEvidence(events,team){
 const rows=events.filter(e=>e.team===team&&isKickout(e)),kind=e=>{
  const value=String(e.kickoutLength||'').toLowerCase();
  return ['short','long','medium'].includes(value)?value:'unclassified';
 };
 return ['short','long','medium','unclassified'].map(id=>{
  const group=rows.filter(e=>kind(e)===id),k=summarize(group,team).kickouts;
  return {id,label:{short:'Short',long:'Long',medium:'Medium (legacy)',unclassified:'Unclassified / not recorded'}[id],total:k.total,retained:team==='our'?k.won:k.lost,known:k.won+k.lost,retention:k.retention,unknownOutcome:k.unknown};
 });
}
// Context is deliberately not a ranked trend: preserve the five-per-half gate.
export function smallKickoutContext(events,setup={}){
 return ['our','opposition'].flatMap(team=>{
  const a=summarize(events.filter(e=>e.half===1),team).kickouts,b=summarize(events.filter(e=>e.half===2),team).kickouts,an=a.won+a.lost,bn=b.won+b.lost;
  if(!an||!bn||an>=5&&bn>=5||an+bn<5||Math.abs(b.retention-a.retention)<25)return [];
  const label=(team==='our'?setup.ourTeam:setup.opposition)||(team==='our'?'Our team':'Opposition');
  return [{id:'small-kickout-'+team,kind:'small-sample',team,detail:`${label} kickout retention: H1 ${team==='our'?a.won:a.lost}/${an} (${a.retention}%) → H2 ${team==='our'?b.won:b.lost}/${bn} (${b.retention}%). Small samples: fewer than five known kickouts in at least one half; no established trend inferred.`,evidenceIds:events.filter(e=>e.team===team&&e.half<=2&&isKickout(e)&&summarize([e],team).kickouts.unknown===0).map(e=>e.id)}];
 });
}
