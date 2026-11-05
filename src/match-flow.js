// Deterministic, evidence-led match stories. This module never writes match data.
import {canonicalAnalysisStream, analysisEnd} from './analysis-stream.js';
import {scoreTimelineWindows} from './score-windows.js';
const other=t=>t==='our'?'opposition':'our';
const teamName=(m,t)=>(t==='our'?m.setup.ourTeam:m.setup.opposition)||(t==='our'?'Our team':'Opposition');
const score=e=>(e.shot?.scoreValue||0)>0;
const margin=(e,t,when='scoreAfter')=>e[when][t]-e[when][other(t)];
const delta=(rows,t)=>rows.reduce((n,e)=>n+(score(e)?e.team===t?e.shot.scoreValue:-e.shot.scoreValue:0),0);
// Elapsed time describes a sequence; it does not establish or disprove a
// connection. All recorded additional time belongs to its actual period.
const timed=e=>e.scoreOrderKnown!==false&&Number.isFinite(e.periodTimeMs)&&e.periodTimeMs>=0;
const elapsed=(a,b)=>{
 if(!timed(a)||!timed(b))return null;
 const value=a.period===b.period?b.periodTimeMs-a.periodTimeMs:
  Number.isFinite(a.continuousTimeMs)&&Number.isFinite(b.continuousTimeMs)?b.continuousTimeMs-a.continuousTimeMs:null;
 return Number.isFinite(value)&&value>=0?value:null;
};
const samePeriodOrder=(a,b)=>a.period===b.period&&elapsed(a,b)!==null;
// Separate local episodes; never bridge an interval, unknown time, or a ledger
// correction which invalidates intervening evidence.
const barrier=(stream,a,b)=>stream.some(e=>
 (e.index>a.index&&e.index<b.index&&(!e.valid||!timed(e)||e.period!==a.period))||
 // Unknown timestamps cannot safely be sorted into the inferred sequence.
 (!timed(e)&&e.period===a.period&&e.recordingIndex>Math.min(a.recordingIndex,b.recordingIndex)&&e.recordingIndex<Math.max(a.recordingIndex,b.recordingIndex)));
function episodes(rows,stream){
 const groups=[];let group=[];
 for(const e of rows){
  if(!timed(e)){if(group.length)groups.push(group);group=[];continue;}
  if(group.length&&(!samePeriodOrder(group.at(-1),e)||barrier(stream,group.at(-1),e))){groups.push(group);group=[];}
  group.push(e);
 }if(group.length)groups.push(group);return groups;
}
// Unknown score ordering is a barrier, not an omitted opposing score. Broad
// score swings otherwise remain free to cross intervals and long quiet gaps.
function scoringSegments(stream){
 const groups=[];let group=[];
 for(const e of stream){
  if(e.scoreOrderKnown===false){if(group.length)groups.push(group);group=[];continue;}
  group.push(e);
 }if(group.length)groups.push(group);return groups;
}
const pointLabel=n=>`${n} ${n===1?'point':'points'}`;
export function possessionSource(e){
 if(!e.valid)return null;
 if(e.kickout?.winner)return {team:e.kickout.winner,type:'kickout',mark:e.kickout.mark===true,length:e.kickout.length,kickingTeam:e.team};
 if(e.turnover)return {team:e.turnover.winningTeam,type:'turnover',length:null};
 if(e.interception)return {team:e.team,type:'interception',length:null};
 if(e.event==='possession'&&['won','retained','lost'].includes(String(e.outcome).toLowerCase()))return {team:String(e.outcome).toLowerCase()==='lost'?other(e.team):e.team,type:'possession',length:null};
 if(['retained','lost'].includes(String(e.possessionResult).toLowerCase()))return {team:String(e.possessionResult).toLowerCase()==='lost'?other(e.team):e.team,type:'possession',length:null};
 return null;
}
export function reconstructPossessions(stream){
 const chains=[];let current=null;
 const finish=(reason,e=null)=>{if(!current)return;current.endReason=reason;current.endId=e?.id||current.eventIds.at(-1);chains.push(current);current=null;};
 for(const e of stream){
  if(!e.valid){finish('unknown');continue;}
  if(current&&e.period!==current.period)finish('period-end');
  if(current&&(!samePeriodOrder(stream.find(x=>x.id===current.sourceId),e)||barrier(stream,stream.find(x=>x.id===current.sourceId),e)))finish('timing-unknown');
  const source=possessionSource(e);
  if(source){finish('new-possession',e);if(!timed(e))continue;current={id:`possession:${e.id}`,sourceId:e.id,...source,period:e.period,eventIds:[e.id],notablePassIds:[],shotIds:[],scoreIds:[],confirmedShotIds:[],confirmedScoreIds:[],confidence:'CONFIRMED',endReason:null};continue;}
  if(e.kickout){finish(e.kickout.outcome==='out-of-play'?'dead-ball':'unknown',e);continue;}
  if(!current)continue;
  // A defensive block/save does not prove a change of possession.
  if(e.event==='defensive-block'){current.eventIds.push(e.id);continue;}
  if(e.pass){if(e.team!==current.team){finish('unknown',e);continue;}current.eventIds.push(e.id);current.notablePassIds.push(e.id);continue;}
  if(e.shot){
   if(e.team!==current.team){finish('opposition-attack',e);continue;}
   current.eventIds.push(e.id);current.shotIds.push(e.id);
   const evidence=stream.filter(x=>current.eventIds.includes(x.id));
   const linked=evidence.some(x=>x.directScoreLink===e.id||x.buildUpLink===e.id);
   if(linked)current.confirmedShotIds.push(e.id);else current.confidence='PROBABLE';
   if(score(e)){current.scoreIds.push(e.id);if(linked)current.confirmedScoreIds.push(e.id);finish('score',e);}
   else if(e.shot.missReason==='wide')finish('wide',e);
   // Saved/Blocked/Post/Short do not establish who collected the rebound.
   continue;
  }
  if(e.event==='possession')finish('unknown',e);
 }
 finish('unknown');return chains;
}
export function possessionOpportunities(chains){
 const result=[];
 for(const team of ['our','opposition'])for(const type of ['kickout','mark','turnover','interception','possession'])for(const length of type==='kickout'||type==='mark'?['long','short',null]:[null]){
  const group=chains.filter(c=>c.team===team&&(c.type===type||type==='mark'&&c.mark)&&c.length===length);
  if(group.length)result.push({team,type,length,subsetOf:type==='mark'?'kickout':null,marksWon:group.filter(c=>c.mark).length,possessionsWon:group.length,
   confirmedShots:group.filter(c=>c.confirmedShotIds.length).length,confirmedScores:group.filter(c=>c.confirmedScoreIds.length).length,
   recordedNextShots:group.filter(c=>c.shotIds.length).length,recordedNextScores:group.filter(c=>c.scoreIds.length).length,
   evidenceIds:group.map(c=>c.sourceId)});
 }return result;
}
function contextWeight(match,rows,team){
 const last=rows.at(-1),close=Math.abs(margin(last,team))<=3;
 const late=timed(last)&&(last.half>=3||last.half===2&&last.periodTimeMs>=match.setup.halfLength*60000*.8);
 return (close?2:0)+(late?3:0);
}
function makeCandidate(match,stream,{family,team,from,to,title,detail,metrics={},direct=false,strength=0,level='SUPPORTING',polarity=null}){
 const rows=stream.filter(e=>e.index>=from&&e.index<=to&&e.valid),first=rows[0],last=rows.at(-1);if(!first||!last)return null;
 const impact=Math.abs(delta(rows,team));
 // One fixed evidence allowance: incidental types/touches cannot boost ranking.
 const rank={matchImpact:impact*2,patternStrength:strength,supportingEvidence:1,directConsequence:direct?4:0,matchContext:contextWeight(match,rows,team)};
 return {id:`flow:${family}:${first.id}:${last.id}`,family,families:[family],team,title,detail,
  evidenceType:direct?'DIRECT_EVENT_CHAIN':'CORRELATED_WINDOW',confidence:direct?'CONFIRMED':'OBSERVED',level,
  polarity:polarity||(team==='our'?'positive':'problem'),from:first.index,to:last.index,
  window:{from:{id:first.id,period:first.period,timeMs:first.periodTimeMs,continuousTimeMs:first.continuousTimeMs},to:{id:last.id,period:last.period,timeMs:last.periodTimeMs,continuousTimeMs:last.continuousTimeMs}},
  evidenceIds:rows.map(e=>e.id),metrics,rank,significance:Object.values(rank).reduce((a,b)=>a+b,0),supporting:[]};
}
function scoringCandidates(match,stream){
 const scored=stream.filter(e=>e.valid&&score(e));
 const timeline=[{id:null,...(scored[0]?.scoreBefore||{our:0,opposition:0})},...scored.map(e=>({id:e.id,our:e.scoreAfter.our,opposition:e.scoreAfter.opposition}))];
 const runs=scoreTimelineWindows(timeline,{reversalPoints:1}).filter(w=>w.unanswered).map(w=>w.checkpoints.slice(1).map(p=>scored.find(e=>e.id===p.id)).filter(Boolean));
 const results=[];
 for(const run of runs){const points=run.reduce((n,e)=>n+e.shot.scoreValue,0);if(points<4||run.length<2)continue;
  const team=run[0].team,first=run[0],last=run.at(-1),before=margin(first,team,'scoreBefore'),after=margin(last,team),previous=scored.filter(e=>e.index<first.index).at(-1);
  const response=before<0,leadChange=before<=0&&after>0;
  const seconds=elapsed(first,last),duration=seconds===null?'':` in ${Math.floor(seconds/60000)}:${String(Math.floor(seconds/1000)%60).padStart(2,'0')}`;
  const detail=`${teamName(match,team)} recorded ${run.length} unanswered scoring attempts worth ${pointLabel(points)}${duration}. Recorded margin: ${before>0?'+':''}${before} → ${after>0?'+':''}${after}.`;
  results.push(makeCandidate(match,stream,{family:'scoring-run',team,from:previous?previous.index+1:first.index,to:last.index,
   title:`${teamName(match,team)}${response?' response':''} — ${pointLabel(points)} unanswered`,detail,
   metrics:{scoringAttempts:run.length,points,marginBefore:before,marginAfter:after,leadChange,durationMs:seconds},strength:points+(leadChange?3:0),level:points>=5?'PRIMARY':'SUPPORTING'}));
 }
 // A decisive late lead change can matter even without a multi-score run.
 for(const e of scored){const t=e.team;if(e.half<2||margin(e,t,'scoreBefore')>0||margin(e,t)<=0||contextWeight(match,[e],t)<5)continue;
  results.push(makeCandidate(match,stream,{family:'lead-change',team:t,from:e.index,to:e.index,title:`${teamName(match,t)} moved ahead late`,detail:`The recorded score changed the margin from ${margin(e,t,'scoreBefore')} to +${margin(e,t)}.`,metrics:{points:e.shot.scoreValue},strength:5}));
 }
 return results;
}
function restartCandidates(match,stream){
 const result=[];
 for(const kickingTeam of ['our','opposition']){
  const restarts=stream.filter(e=>e.valid&&e.kickout&&e.team===kickingTeam);let run=[];
  const emit=()=>{
   if(run.length<3)return;
   const first=run[0],last=run.at(-1),team=first.kickout.winner;
   const rows=stream.filter(e=>e.index>=first.index&&e.index<=last.index),swing=delta(rows,team),ctx=contextWeight(match,rows,team);
   // Repetition alone is context, never automatically a coaching card.
   if(Math.abs(swing)<3&&ctx<5)return;
   const sameLength=run.every(e=>e.kickout.length&&e.kickout.length===first.kickout.length)?first.kickout.length:null;
   result.push(makeCandidate(match,stream,{family:'restarts',team,from:first.index,to:last.index,
    title:`${teamName(match,team)} — repeated restart wins`,
    detail:`During this spell, ${teamName(match,team)} won ${run.length} consecutive recorded ${teamName(match,kickingTeam)}${sameLength?' '+sameLength.charAt(0).toUpperCase()+sameLength.slice(1):''} kickouts. The recorded scoring swing in the window was ${swing>0?'+':''}${swing} points for ${teamName(match,team)}.`,
    metrics:{consecutiveKickouts:run.length,length:sameLength,scoringSwing:swing},strength:run.length*2,level:Math.abs(swing)>=4?'PRIMARY':'CONTEXT'}));
  };
  for(const e of restarts){if(!e.kickout.winner||run.length&&(e.kickout.winner!==run[0].kickout.winner||!samePeriodOrder(run.at(-1),e)||barrier(stream,run.at(-1),e))){emit();run=[];}if(e.kickout.winner&&timed(e))run.push(e);}emit();
 }
 return result;
}
function sourceCandidates(match,stream,chains){
 const result=[];
 for(const t of ['our','opposition'])for(const kind of ['turnover','interception','kickout','mark']){
  const eligible=chains.filter(c=>c.team===t&&(c.type===kind||kind==='mark'&&c.mark));
  for(const episode of episodes(eligible.map(c=>stream.find(e=>e.id===c.sourceId)),stream)){
  const local=eligible.filter(c=>episode.some(e=>e.id===c.sourceId));
  const group=local.filter(c=>c.scoreIds.length);
  if(group.length<2){
   const shots=local.filter(c=>c.shotIds.length&&!c.scoreIds.length);
   if(shots.length>=3){const evidence=stream.filter(e=>shots.some(c=>c.eventIds.includes(e.id)));
    if(contextWeight(match,evidence,t)>=5)result.push(makeCandidate(match,stream,{family:'opportunities',team:t,from:evidence[0].index,to:evidence.at(-1).index,title:`${teamName(match,t)} — late possession wins and chances`,detail:`${shots.length} recorded ${kind} wins were followed by recorded same-team shots without a recorded score in those sequences. These are probable sequences, not proof of continuous possession.`,metrics:{source:kind,shotSequences:shots.length,scoreSequences:0},strength:shots.length*2}));}
   continue;
  }
  const rows=stream.filter(e=>group.some(c=>c.eventIds.includes(e.id))),first=rows[0],last=rows.at(-1);
  if(delta(stream.filter(e=>e.index>=first.index&&e.index<=last.index),t)<3)continue;
  const confirmed=group.filter(c=>c.confirmedScoreIds.length).length;
  result.push(makeCandidate(match,stream,{family:'opportunities',team:t,from:first.index,to:last.index,
   title:`${teamName(match,t)} — possession wins followed by scores`,
   detail:`${group.length} recorded ${kind} wins were followed in the recorded sequence by same-team scoring attacks (${confirmed} explicitly linked). Unlinked sequences are probable; continuous possession is not established.`,
   metrics:{source:kind,sequences:group.length,confirmed},strength:group.length*2}));
  }
 }
 return result;
}
function directCandidates(match,stream){
 const result=[],ball=stream.filter(e=>e.valid&&(e.shot||e.kickout||e.turnover||e.interception||e.pass||e.event==='possession'||e.event==='defensive-block'));
 for(let i=0;i<ball.length-2;i++){
  const a=ball[i],ko=ball[i+1];
  let j=i+2;while(j<ball.length&&ball[j].pass&&ball[j].team===a.team&&ball[j].period===a.period)j++;
  const b=ball[j];if(!b)continue;
  if(!score(a)||!ko.kickout||!score(b)||a.team!==b.team||ko.team===a.team||ko.kickout.winner!==a.team||a.period!==ko.period||ko.period!==b.period)continue;
  const duration=elapsed(a,b);
  if(!samePeriodOrder(a,ko)||!samePeriodOrder(ko,b)||barrier(stream,a,b))continue;
  result.push(makeCandidate(match,stream,{family:'direct-restart-score',team:a.team,from:a.index,to:b.index,direct:true,
   title:`${teamName(match,a.team)} — score, restart win, score`,
   detail:`Recorded sequence: ${a.eventLabel} → ${ko.kickout.length?ko.kickout.length+' ':''}${ko.kickout.mark?'Mark on the opposition kickout':'opposition kickout won'} → ${b.eventLabel}, ${Math.round(duration/1000)} seconds after the first score. This describes the recorded sequence, not continuous possession or tactical causation.`,
   metrics:{seconds:duration/1000,points:a.shot.scoreValue+b.shot.scoreValue},strength:5,level:'PRIMARY'}));
 }
 return result;
}
function numericalCandidates(match,stream){
 const result=[];let window=[];
 const emit=()=>{
  if(window.length<2)return;
  const counts=window[0].activeCounts,t=counts.our>=counts.opposition?'our':'opposition',swing=delta(window,t),shots=window.filter(e=>e.shot).length;
  if(Math.abs(swing)<3||shots<2)return;
  result.push(makeCandidate(match,stream,{family:'numerical',team:swing>=0?t:other(t),from:window[0].index,to:window.at(-1).index,
   title:`Recorded ${counts.our}v${counts.opposition} spell`,
   detail:`During the recorded ${counts.our}v${counts.opposition} spell (our team first), ${teamName(match,t)} had a ${swing>0?'+':''}${swing}-point scoring swing; ${shots} shots were recorded. This is a correlation, not a causal claim.`,metrics:{ourActive:counts.our,oppositionActive:counts.opposition,scoringSwing:swing,shots},strength:4}));
 };
 for(const e of stream){
  if(!e.valid||!timed(e)){emit();window=[];continue;}
  const c=e.activeCounts,known=c.our!==null&&c.opposition!==null,reduced=known&&(c.our<15||c.opposition<15);
  if(window.length&&(!reduced||e.period!==window[0].period||c.our!==window[0].activeCounts.our||c.opposition!==window[0].activeCounts.opposition)){emit();window=[];}
  if(!reduced)continue;
  // Only shots or an actual strength transition anchor this scoring spell.
  // Optional passes/notes cannot move its ending into late time or raise rank.
  const strengthChange=c.our!==e.beforeCounts.our||c.opposition!==e.beforeCounts.opposition;
  if(!e.shot&&!strengthChange)continue;
  if(window.length&&(!samePeriodOrder(window.at(-1),e)||barrier(stream,window.at(-1),e))){emit();window=[];}
  window.push(e);
 }emit();return result;
}
function personnelCandidates(match,stream){
 const result=[];
 for(const sub of stream.filter(e=>e.valid&&e.substitution&&timed(e))){
  const next=stream.filter(e=>e.index>sub.index),stop=next.find(e=>!e.valid||!samePeriodOrder(sub,e)||barrier(stream,sub,e)||e.substitution?.on?.team===sub.team);
  const rows=next.filter(e=>!stop||e.index<stop.index),scored=rows.filter(score);
  if(scored.length<3)continue;
  const span=stream.filter(e=>e.index>=sub.index&&e.index<=scored.at(-1).index),swing=delta(span,sub.team);
  if(swing<4)continue;
  result.push(makeCandidate(match,stream,{family:'personnel',team:sub.team,from:sub.index,to:scored.at(-1).index,
   title:`${teamName(match,sub.team)} — scoring spell after a change`,
   detail:`Following the substitution, ${teamName(match,sub.team)} recorded a +${swing}-point net scoring advantage across ${scored.length} recorded scores in ${sub.period}. The recorded sequence does not establish that the substitution caused the change.`,metrics:{scoringSwing:swing,scoringEvents:scored.length},strength:3}));
 }return result;
}
function shootingCandidates(match,stream){
 const result=[];
 for(const team of ['our','opposition']){
  const shots=stream.filter(e=>e.valid&&e.team===team&&e.shot);
  // A before/after comparison requires a reliable ordering of every attempt.
  if(shots.some(e=>!timed(e)))continue;
  // At least five observed attempts on each side of a sequence boundary.
  let best=null;
  for(let i=5;i<=shots.length-5;i++){
   const a=shots.slice(0,i),b=shots.slice(i),rate=x=>x.filter(score).length/x.length,gap=rate(b)-rate(a);
   if(Math.abs(gap)<.4)continue;
   const strength=Math.abs(gap)*Math.min(a.length,b.length);
   if(!best||strength>best.strength)best={a,b,gap,strength};
  }
  if(!best)continue;
  const {a,b,gap}=best,rows=stream.filter(e=>e.index>=a[0].index&&e.index<=b.at(-1).index);
  if(Math.abs(delta(rows,team))<4)continue;
  result.push(makeCandidate(match,stream,{family:'shooting-change',team,from:a[0].index,to:b.at(-1).index,
   title:`${teamName(match,team)} — recorded shooting ${gap>0?'recovery':'change'}`,
   detail:`Conversion changed from ${a.filter(score).length}/${a.length} recorded attempts to ${b.filter(score).length}/${b.length}. Both samples contain at least five attempts; unrecorded attempts are unknown.`,
   metrics:{beforeAttempts:a.length,afterAttempts:b.length,beforeScores:a.filter(score).length,afterScores:b.filter(score).length},strength:4,polarity:gap>0?(team==='our'?'positive':'problem'):(team==='our'?'problem':'positive')}));
 }return result;
}
export function mergeStories(candidates){
 const sorted=candidates.filter(Boolean).sort((a,b)=>b.significance-a.significance||a.from-b.from||a.id.localeCompare(b.id));
 const stories=[];
 for(const candidate of sorted){
  const existing=stories.find(s=>s.team===candidate.team&&s.from<=candidate.to&&candidate.from<=s.to&&
    // Merge supporting evidence, not independent opposite-team recovery stories.
    (Math.min(s.to,candidate.to)-Math.max(s.from,candidate.from)+1)/Math.min(s.to-s.from+1,candidate.to-candidate.from+1)>=.5);
  if(existing){existing.supporting.push({family:candidate.family,detail:candidate.detail,evidenceType:candidate.evidenceType,metrics:candidate.metrics,evidenceIds:candidate.evidenceIds});
   existing.families=[...new Set([...existing.families,candidate.family])];existing.evidenceIds=[...new Set([...existing.evidenceIds,...candidate.evidenceIds])];
   if(candidate.from<existing.from){existing.from=candidate.from;existing.window={...existing.window,from:candidate.window.from};}
   if(candidate.to>existing.to){existing.to=candidate.to;existing.window={...existing.window,to:candidate.window.to};}
  }else stories.push({...candidate,supporting:[]});
 }
 return stories;
}
export function matchFlow(match,{scope='FULL_MATCH'}={}){
 const complete=canonicalAnalysisStream(match),stream=scope==='FULL_MATCH'?complete:complete.filter(e=>e.period===scope),chains=reconstructPossessions(stream);
 const segments=scoringSegments(stream);
 const scoreWindows=segments.flatMap(rows=>scoreTimelineWindows(rows.filter(e=>e.valid&&score(e)).map(e=>({id:e.id,our:e.scoreAfter.our,opposition:e.scoreAfter.opposition,period:e.period,timeMs:e.periodTimeMs}))));
 const swingCandidates=scoreWindows.filter(w=>w.pointsAgainst>0&&w.marginSwing>=5).map(w=>{const a=stream.find(e=>e.id===w.from.id),b=stream.find(e=>e.id===w.to.id);return makeCandidate(match,stream,{family:'score-swing',team:w.team,from:a.index,to:b.index,title:`${teamName(match,w.team)} — ${w.marginSwing}-point margin swing`,detail:`The recorded margin moved by ${w.marginSwing} points towards ${teamName(match,w.team)} across this spell (${w.pointsFor} points scored, ${w.pointsAgainst} conceded).`,metrics:{marginSwing:w.marginSwing,pointsFor:w.pointsFor,pointsAgainst:w.pointsAgainst},strength:w.marginSwing,level:'PRIMARY'});});
 const candidates=[...swingCandidates,...segments.flatMap(rows=>scoringCandidates(match,rows)),...restartCandidates(match,stream),...sourceCandidates(match,stream,chains),...directCandidates(match,stream),...numericalCandidates(match,stream),...personnelCandidates(match,stream),...shootingCandidates(match,stream)];
 const stories=mergeStories(candidates),limit=scope==='FULL_MATCH'?5:3;
 return {scope,stream,chains,opportunities:possessionOpportunities(chains),candidates,observations:stories.filter(s=>s.level!=='CONTEXT'&&s.significance>=(scope==='FULL_MATCH'?13:15)).slice(0,limit),
  scoreWindows,end:analysisEnd(match),limitations:['Recorded events only; unrecorded play is unknown.','Passes are optional notable actions, not a complete passing dataset.','Probable sequences do not establish continuous possession.']};
}
