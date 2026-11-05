// Shared read-only coaching interpretation. No capture defaults or stored fields.
import {matchFlow,mergeStories} from './match-flow.js';
import {summarize,percentage} from './analysis.js';
import {shotLocationAnalysis} from './shot-location-analysis.js';
import {PERIODS,periodNumber,completedDuration,continuousPlayingMs} from './periods.js';
import {fortyMetreZone} from './pitch-geometry.js';

export const INSIGHT_RULES=Object.freeze({attemptsPerHalf:5,attemptDifference:3,attemptRatio:.25,conversionGap:15,similarConversion:10,zoneAttempts:3,zoneGap:20,kickoutKnown:5,kickoutGap:25,playerActions:3,teamActions:3});
const other=t=>t==='our'?'opposition':'our';
const name=(m,t)=>(t==='our'?m.setup.ourTeam:m.setup.opposition)||(t==='our'?'Our team':'Opposition');
const scored=e=>(e.shot?.scoreValue||0)>0;
const finiteTime=e=>Number.isFinite(e.periodTimeMs)&&e.scoreOrderKnown!==false;
const refKey=p=>p?`${p.team}:${p.playerId?'player:'+p.playerId:p.matchPlayerId?'match:'+p.matchPlayerId:p.jerseyNumber!==null?'legacy:'+p.jerseyNumber:''}`:null;
const playerLabel=p=>[p.jerseyNumber!==null?'#'+p.jerseyNumber:'',(p.name||p.nameSnapshot)].filter(Boolean).join(' ')||'Recorded player';
const totalRate=(events,team)=>summarize(events,team);
function finding(stream,{id,dimension,team,title,detail,evidence,significance=15,polarity='positive',topic=id,playerKey=null}){
 const ids=new Set(evidence),rows=stream.filter(e=>e.valid&&ids.has(e.id));if(!rows.length)return null;
 const at=e=>({id:e.id,period:e.period,timeMs:e.periodTimeMs,continuousTimeMs:e.continuousTimeMs});
 return {id:`insight:${id}:${team}`,family:id,families:[id],dimension,team,title,detail,topic,playerKey,significance,polarity,
  kind:id.startsWith('zone-')||id.startsWith('kickout-length')?'opportunity':polarity==='problem'?'watch':'working',presentation:'summary',confidence:'OBSERVED',evidenceType:'RECORDED_COMPARISON',
  reportText:`${title}: ${detail.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()||detail}`,
  evidenceIds:rows.map(e=>e.id),window:{from:at(rows[0]),to:at(rows.at(-1))},from:rows[0].index,to:rows.at(-1).index,supporting:[]};
}
function attacking(match,stream,events,scope){
 const result=[],r=INSIGHT_RULES;
 for(const team of ['our','opposition']){
  const shots=stream.filter(e=>e.valid&&e.team===team&&e.shot),h1=events.filter(e=>e.half===1),h2=events.filter(e=>e.half===2),a=totalRate(h1,team),b=totalRate(h2,team);
  if(scope==='FULL_MATCH'&&a.attempts>=r.attemptsPerHalf&&b.attempts>=r.attemptsPerHalf){
   const change=b.attempts-a.attempts,gap=b.conversion-a.conversion,volume=Math.abs(change)>=r.attemptDifference&&Math.abs(change)/a.attempts>=r.attemptRatio;
   let meaning='';
   if(volume&&change<0)meaning=Math.abs(gap)<=r.similarConversion?'Fewer recorded attempts, similar conversion':gap>=r.conversionGap?'Fewer recorded attempts, stronger conversion':gap<=-r.conversionGap?'Fewer recorded attempts and lower conversion':'';
   if(!volume&&Math.abs(change)/a.attempts<=r.attemptRatio&&Math.abs(gap)>=r.conversionGap)meaning=gap<0?'Similar attempt volume, lower conversion':'Similar attempt volume, stronger conversion';
   if(volume&&change>0)meaning=gap>=r.conversionGap?'More recorded attempts and stronger conversion':b.total<=a.total?'More recorded attempts without higher scoring output':gap<=-r.conversionGap?'More recorded attempts, lower conversion':'';
   if(meaning){const good=b.total>a.total||b.total===a.total&&gap>0;
    result.push(finding(stream,{id:'attacking-halves',dimension:'attack',topic:'shooting-performance',team,title:`${name(match,team)} — ${meaning.toLowerCase()}`,
     detail:`Recorded attempts ${change<0?'fell':change>0?'rose':'were unchanged'} from ${a.attempts} in H1 to ${b.attempts} in H2; conversion ${a.conversion}% → ${b.conversion}% (${a.successful}/${a.attempts} → ${b.successful}/${b.attempts}). Score value: ${a.total} → ${b.total} points.`,
     evidence:shots.filter(e=>e.half<=2).map(e=>e.id),significance:17+(Math.abs(b.total-a.total)>=4?2:0),polarity:(team==='our')===good?'positive':'problem'}));}
  }
  const localEvents=events.filter(e=>e.team===team),zones=shotLocationAnalysis(localEvents,team).zones;
  if(zones.inside.attempts>=r.zoneAttempts&&zones.outside.attempts>=r.zoneAttempts&&Math.abs(zones.inside.conversion-zones.outside.conversion)>=r.zoneGap){
   result.push(finding(stream,{id:'zone-efficiency',dimension:'attack',team,title:`${name(match,team)} — inside/outside 40m contrast`,
    detail:`Located attempts: inside ${zones.inside.successful}/${zones.inside.attempts} (${zones.inside.conversion}%); outside ${zones.outside.successful}/${zones.outside.attempts} (${zones.outside.conversion}%). Unlocated attempts are excluded.`,
    evidence:shots.filter(e=>['inside','outside'].includes(fortyMetreZone({event:e.event,shotX:e.shot.x,shotY:e.shot.y}))).map(e=>e.id),polarity:team==='our'?'positive':'problem'}));
  }
  if(scope==='FULL_MATCH')for(const zone of ['inside','outside']){
   const x=shotLocationAnalysis(h1,team).zones[zone],y=shotLocationAnalysis(h2,team).zones[zone];
   if(x.attempts>=r.zoneAttempts&&y.attempts>=r.zoneAttempts&&Math.abs(y.conversion-x.conversion)>=r.zoneGap)
    result.push(finding(stream,{id:'zone-halves-'+zone,dimension:'attack',topic:'zone-halves',team,title:`${name(match,team)} — ${zone}-40m conversion changed`,detail:`H1 ${x.successful}/${x.attempts} (${x.conversion}%) → H2 ${y.successful}/${y.attempts} (${y.conversion}%), using located ${zone}-40m attempts only.`,evidence:shots.filter(e=>e.half<=2&&fortyMetreZone({event:e.event,shotX:e.shot.x,shotY:e.shot.y})===zone).map(e=>e.id),significance:16,polarity:(team==='our')===(y.conversion>x.conversion)?'positive':'problem'}));
  }
 }
 return result;
}
function kickouts(match,stream,scope){
 const result=[],r=INSIGHT_RULES,known=rows=>rows.filter(e=>e.valid&&e.kickout&&['won','lost','out-of-play'].includes(e.kickout.outcome));
 const ourWins=e=>e.kickout.outcome==='out-of-play'?e.team==='opposition':e.kickout.winner==='our';
 for(const kickingTeam of ['our','opposition']){
  const all=stream.filter(e=>e.valid&&e.kickout&&e.team===kickingTeam),rows=known(all),success=ourWins;
  const label=kickingTeam==='our'?'Our kickout retention':'Opposition kickouts won by us';
  const emit=(id,a,b,aLabel,bLabel)=>{
   if(a.length<r.kickoutKnown||b.length<r.kickoutKnown)return;
   const aw=a.filter(success).length,bw=b.filter(success).length,ar=percentage(aw,a.length),br=percentage(bw,b.length),gap=br-ar;
   if(Math.abs(gap)<r.kickoutGap)return;
   result.push(finding(stream,{id,dimension:'kickouts',team:'our',title:`${label} — ${aLabel}/${bLabel} contrast`,
    detail:`${aLabel}: ${aw}/${a.length} (${ar}%); ${bLabel}: ${bw}/${b.length} (${br}%). Known outcomes only${all.length>rows.length?`; ${all.length-rows.length} unknown excluded`:''}. Out of Play counts as a loss for the kicking team.`,evidence:[...a,...b].map(e=>e.id),significance:17,polarity:id.includes('halves')?(gap>0?'positive':'problem'):'positive'}));
  };
  emit('kickout-length-'+kickingTeam,rows.filter(e=>e.kickout.length==='short'),rows.filter(e=>e.kickout.length==='long'),'Short','Long');
  if(scope==='FULL_MATCH')emit('kickout-halves-'+kickingTeam,rows.filter(e=>e.half===1),rows.filter(e=>e.half===2),'H1','H2');
 }
 return result;
}
// Each contribution is a set of event IDs. A Mark is a subset of its kickout,
// never an additional possession/action. Optional Pass counts are not influence.
export function recordedPlayerInfluence(stream){
 const groups=new Map();
 const credit=(p,category,e)=>{const key=refKey(p);if(!key||!p||p.jerseyNumber===null&&!p.matchPlayerId&&!p.playerId)return;
  if(!groups.has(key))groups.set(key,{key,ref:p,categories:new Map(),events:new Set()});
  const g=groups.get(key);if(!g.categories.has(category))g.categories.set(category,new Set());g.categories.get(category).add(e.id);g.events.add(e.id);
 };
 for(const e of stream.filter(e=>e.valid)){
  if(scored(e))credit(e.primaryPlayer,'scores',e);
  if(e.turnover)credit(e.participants.turnoverWinner||(e.event==='turnover-won'?e.primaryPlayer:null),'turnovers',e);
  if(e.interception)credit(e.primaryPlayer,'interceptions',e);
  if(e.block&&!e.shot||e.shot&&e.team==='opposition'&&e.shot.missReason==='blocked')credit(e.participants.blocker||(e.event==='defensive-block'?e.primaryPlayer:null),'blocks',e);
  if(e.kickout?.winner){const primary=e.primaryPlayer;
   const legacyWinner=primary?.team===e.kickout.winner&&(!e.goalkeeper||e.goalkeeper.team!==primary.team||String(e.goalkeeper.jerseyNumber)!==String(primary.jerseyNumber))?primary:null;
   const p=e.participants.kickoutWinner||e.kickout.markWinner||legacyWinner;credit(p,'kickout wins',e);if(e.kickout.mark)credit(p,'Marks',e);}
  if(e.shot?.missReason==='saved')credit(e.goalkeeper,'saves',e);
  if(e.kickout&&e.kickout.winner===e.team)credit(e.goalkeeper,'retained goalkeeper kickouts',e);
 }
 return [...groups.values()];
}
function defensiveAndPlayer(match,stream,scope,flow){
 const result=[],r=INSIGHT_RULES,players=recordedPlayerInfluence(stream);
 const categories=['turnovers','interceptions','blocks','kickout wins','Marks','saves'];
 for(const g of players){
  const p=g.ref,team=p.team,allScores=stream.filter(e=>e.valid&&e.team===team&&scored(e)),ownScores=allScores.filter(e=>g.categories.get('scores')?.has(e.id)),value=ownScores.reduce((n,e)=>n+e.shot.scoreValue,0),total=allScores.reduce((n,e)=>n+e.shot.scoreValue,0);
  if(ownScores.length>=3&&value>=total*.5)result.push(finding(stream,{id:'scoring-contribution-'+g.key,topic:'player-'+g.key,dimension:'players',playerKey:g.key,team,title:`${playerLabel(p)} — concentrated scoring contribution`,detail:`${value} of ${total} recorded team points came from ${ownScores.length} successful attempts by ${playerLabel(p)}.`,evidence:ownScores.map(e=>e.id),significance:15+Math.min(3,Math.floor(value/4)),polarity:team==='our'?'positive':'problem'}));
  for(const category of categories){
   const ids=[...(g.categories.get(category)||[])];if(ids.length<r.playerActions)continue;
   if(category==='kickout wins'&&g.categories.get('Marks')?.size===ids.length)continue;
   const teamIds=new Set(players.filter(x=>x.ref.team===team).flatMap(x=>[...(x.categories.get(category)||[])]));
   if(category!=='saves'&&(teamIds.size<r.teamActions||ids.length/teamIds.size<.5))continue;
   const oppKnown=stream.filter(e=>e.valid&&e.team==='opposition'&&e.kickout&&['won','lost','out-of-play'].includes(e.kickout.outcome));
   const oppRetained=oppKnown.filter(e=>e.kickout.winner==='opposition'),oppCredit=oppRetained.filter(e=>ids.includes(e.id));
   const context=team==='opposition'&&category==='kickout wins'&&oppCredit.length>=3?` ${name(match,'opposition')} retained ${oppRetained.length} of ${oppKnown.length} opposition kickouts with a known outcome. ${playerLabel(p)} was credited on ${oppCredit.length} of those.`:'';
   const spell=flow.observations.find(o=>o.team===team&&ids.filter(id=>o.evidenceIds.includes(id)).length>=2);
   result.push(finding(stream,{id:'player-'+category+'-'+g.key,topic:'player-'+g.key,dimension:category==='kickout wins'||category==='Marks'?'kickouts':'defence',playerKey:g.key,team,
    title:`${playerLabel(p)} — ${category==='kickout wins'?'kickout contribution':category==='Marks'?'kickout Marks':'recorded '+category}`,
    detail:`${category==='Marks'?`${ids.length} kickout Marks: `:''}${playerLabel(p)} accounted for ${ids.length} of ${teamIds.size} attributed ${category}${!(g.categories.get('scores')?.size)?', without a recorded score':''}.${spell?' At least two occurred during the recorded '+spell.title.toLowerCase()+'.':''} These are recorded actions, not a player rating.${context}`,evidence:ids,significance:15+(spell?2:0),polarity:team==='our'?'positive':'problem'}));
  }
  const kept=[...(g.categories.get('retained goalkeeper kickouts')||[])],taken=stream.filter(e=>e.valid&&e.kickout&&refKey(e.goalkeeper)===g.key&&['won','lost','out-of-play'].includes(e.kickout.outcome));
  if(taken.length>=8&&kept.length/taken.length>=.75)result.push(finding(stream,{id:'keeper-'+g.key,topic:'player-'+g.key,dimension:'kickouts',playerKey:g.key,team,title:`${playerLabel(p)} — goalkeeper restart contribution`,detail:`${kept.length}/${taken.length} kickouts with known outcomes were retained while ${playerLabel(p)} was the recorded goalkeeper. This does not identify the receiver or establish a scoring chain.`,evidence:taken.map(e=>e.id),significance:15,polarity:team==='our'?'positive':'problem'}));
 }
 for(const team of ['our','opposition'])for(const category of ['turnovers','interceptions','blocks'])if(scope==='FULL_MATCH'){
  // Team comparison includes unattributed factual actions, not just roster rows.
  const actions=stream.filter(e=>e.valid&&(category==='turnovers'?e.turnover?.winningTeam===team:category==='interceptions'?e.interception&&e.team===team:team==='our'&&(e.event==='defensive-block'||e.team==='opposition'&&e.shot?.missReason==='blocked')));
  const h1=actions.filter(e=>e.half===1),h2=actions.filter(e=>e.half===2);
  if(h1.length+h2.length>=6&&Math.abs(h2.length-h1.length)>=3)result.push(finding(stream,{id:'defence-halves-'+category,dimension:'defence',team,title:`${name(match,team)} — recorded ${category} changed`,detail:`H1 ${h1.length} → H2 ${h2.length} recorded ${category}. This describes the recorded defensive actions, not possession share.`,evidence:[...h1,...h2].map(e=>e.id),significance:16,polarity:(team==='our')===(h2.length>h1.length)?'positive':'problem'}));
 }
 return {result,players};
}
function flowFindings(flow){
 return flow.observations.map(o=>{
  const dimension=['scoring-run','score-swing','lead-change','personnel'].includes(o.family)?'momentum':o.family==='shooting-change'?'attack':o.family==='numerical'?'defence':'kickouts';
  const next=[];for(const e of flow.stream.filter(e=>e.index>o.to)){if(!e.valid||!finiteTime(e))break;if(scored(e))next.push(e);if(next.length===3)break;}
  const net=next.reduce((n,e)=>n+(e.team===o.team?e.shot.scoreValue:-e.shot.scoreValue),0);
  const continuation=next.length>=2&&Math.abs(net)>=3?{family:'continuation',detail:`Across the next ${next.length} recorded scores, the margin moved ${Math.abs(net)} points ${net>0?'further towards':'back against'} this team.`,evidenceIds:next.map(e=>e.id)}:null;
  let brief=o.detail;
  if(o.family==='scoring-run')brief=`Margin ${o.metrics.marginBefore} → ${o.metrics.marginAfter}.`;
  if(o.family==='score-swing')brief=`${o.metrics.pointsFor} scored, ${o.metrics.pointsAgainst} conceded.`;
  if(o.family==='shooting-change')brief=`${o.metrics.beforeScores}/${o.metrics.beforeAttempts} → ${o.metrics.afterScores}/${o.metrics.afterAttempts} attempts converted.`;
  if(o.family==='personnel')brief=`Following the substitution: +${o.metrics.scoringSwing} net points across ${o.metrics.scoringEvents} recorded scores; causation not established.`;
  if(o.family==='direct-restart-score')brief=`${o.metrics.seconds} seconds between scores; recorded order, not continuous possession.`;
  return {...o,reportText:`${o.title}: ${brief}`,dimension,presentation:'flow',topic:o.family==='shooting-change'?'shooting-performance':o.id,priority:13+Math.min(17,Math.max(0,o.significance-13)*.4),supporting:[...o.supporting,...(continuation?[continuation]:[])],evidenceIds:[...new Set([...o.evidenceIds,...(continuation?.evidenceIds||[])])]};
 });
}
export function selectCoachingFindings(candidates,limit=5){
 const remaining=candidates.filter(Boolean).filter(c=>c.significance>=13),selected=[],dimensions=new Map(),topics=new Set();
 while(remaining.length&&selected.length<limit){
  remaining.sort((a,b)=>((b.priority??b.significance)-6*(dimensions.get(b.dimension)||0))-((a.priority??a.significance)-6*(dimensions.get(a.dimension)||0))||b.significance-a.significance||a.id.localeCompare(b.id));
  const next=remaining.shift(),key=next.team+':'+next.topic;if(topics.has(key))continue;
  const duplicate=next.presentation==='summary'&&selected.find(o=>o.presentation==='summary'&&o.team===next.team&&o.dimension===next.dimension&&o.evidenceIds.length===next.evidenceIds.length&&o.evidenceIds.every(id=>next.evidenceIds.includes(id)));
  if(duplicate){duplicate.supporting=[...duplicate.supporting,{family:next.family,detail:next.detail,evidenceIds:next.evidenceIds}];topics.add(key);continue;}
  topics.add(key);selected.push({...next,selectionScore:(next.priority??next.significance)-6*(dimensions.get(next.dimension)||0)});dimensions.set(next.dimension,(dimensions.get(next.dimension)||0)+1);
 }
 return selected;
}
export function coachingInsights(match,{scope='FULL_MATCH'}={}){
 if(!['FULL_MATCH',...PERIODS].includes(scope))throw new Error('Unknown coaching analysis scope');
 const flow=matchFlow(match,{scope});
 if(scope!=='FULL_MATCH'){const half=periodNumber(scope),timeMs=completedDuration(match.clock,half)??flow.stream.reduce((n,e)=>Math.max(n,e.periodTimeMs??0),0);flow.end={half,timeMs,continuousTimeMs:continuousPlayingMs(match,{half,timeMs},0)};}
 const validIds=new Set(flow.stream.filter(e=>e.valid).map(e=>e.id)),events=match.events.filter(e=>validIds.has(e.id));
 const eligible=mergeStories(flow.candidates).filter(o=>o.level!=='CONTEXT'&&o.significance>=(scope==='FULL_MATCH'?13:15));
 const evidenceFlow={...flow,observations:eligible};
 const players=defensiveAndPlayer(match,flow.stream,scope,evidenceFlow),candidates=[...flowFindings(evidenceFlow),...attacking(match,flow.stream,events,scope),...kickouts(match,flow.stream,scope),...players.result];
 const observations=selectCoachingFindings(candidates,scope==='FULL_MATCH'?5:3);
 return {scope,stream:flow.stream,candidates,observations,flow:{...flow,observations:observations.filter(o=>o.presentation==='flow')},players:players.players};
}
