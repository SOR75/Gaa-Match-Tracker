// Read-only projections. No capture defaults, permanent links or storage writes.
import {knownEventTime} from './analysis-evidence.js';
import {eventType, formatTime} from './domain.js';
import {orderedFacts, fieldState} from './field-state.js';
import {continuousPlayingMs, periodId, playingEnd} from './periods.js';
import {participantRef, roleNumber, roleTeam, participantRoles, resolveParticipant} from './identity.js';
import {kickoutDetails} from './kickouts.js';
import {shotDetails} from './shots.js';
import {activeGoalkeepers} from './goalkeepers.js';
import {isPairedTurnover, turnoverTeams} from './turnovers.js';
const other = team => team === 'our' ? 'opposition' : 'our';
const player = (match,event,role) => {
  const ref=participantRef(event,role), number=roleNumber(event,role);
  if(!ref&&!number)return null;
  return {team:roleTeam(event,role), playerId:ref?.playerId??null,
    matchPlayerId:ref?.matchPlayerId??null, jerseyNumber:ref?.jerseyNumber??(number?Number(number):null),
    name:ref?.nameSnapshot||(resolveParticipant(match,event,role)?.found?resolveParticipant(match,event,role)?.name:null)||null,
    identity:ref?'recorded':'legacy-unlinked'};
};
function counts(match,state){
  return Object.fromEntries(['our','opposition'].map(team=>{
    const roster=(team==='our'?match.players:match.oppositionPlayers)||[];
    // Empty/scouting or ambiguous historical lineups are not evidence of 15v15.
    const known=roster.some(p=>p.role==='starter')&&!roster.some(p=>p.numberPlaceholder)&&!state.ambiguousTeams.has(team);
    return [team,known?state.activeKeys(team).size:null];
  }));
}
export function canonicalAnalysisStream(match){
  const ordered=orderedFacts(match), stream=[], scores={our:0,opposition:0};
  let state=fieldState({...match,events:[]},{now:0});
  const final=fieldState(match,{now:0});
  // Missing score timing makes in-period score order unknowable, not the total.
  const uncertainScorePeriods=new Set(match.events.filter(e=>!final.invalidEvents.has(e.id)&&(eventType(e.event)?.value||0)>0&&e.outcome==='scored'&&!knownEventTime(e)).map(e=>[1,2,3,4].includes(e.half)?e.half:null));
  for(let index=0;index<ordered.length;index++){
    const {event:e,index:recordingIndex}=ordered[index], beforeCounts=counts(match,state), scoreBefore={...scores};
    state=fieldState({...match,events:ordered.slice(0,index+1).map(x=>x.event)},{now:0});
    const activeCounts=counts(match,state), shot=shotDetails(e), ko=kickoutDetails(e), value=eventType(e.event)?.value||0;
    const valid=!final.invalidEvents.has(e.id), timed=knownEventTime(e);
    const points=valid&&value>0&&e.outcome==='scored'?value:0;
    if(points)scores[e.team]+=points;
    const keeperTeam=ko?e.team:shot?other(e.team):e.team;
    const keeper=(ko||shot||e.event==='goalkeeper-change')?activeGoalkeepers({...match,events:ordered.slice(0,index+(e.event==='goalkeeper-change'?1:0)).map(x=>x.event)})[keeperTeam]||null:null;
    const participants=Object.fromEntries(participantRoles.map(role=>[role,player(match,e,role)]));
    const winner=ko&&['won','lost'].includes(ko.outcome)?(ko.outcome==='won'?'our':'opposition'):null;
    const turnover=isPairedTurnover(e)?turnoverTeams(e):['turnover-won','turnover-lost'].includes(e.event)?{
      winningTeam:e.event==='turnover-won'?e.team:other(e.team),losingTeam:e.event==='turnover-lost'?e.team:other(e.team)}:null;
    stream.push({id:e.id,index,recordingIndex,period:periodId(e.half),half:e.half,
      periodTimeMs:timed?e.timeMs:null,periodTime:timed?formatTime(e.timeMs):'',continuousTimeMs:timed?continuousPlayingMs(match,e,0):null,
      team:e.team,event:e.event,eventLabel:eventType(e.event)?.label||e.event,outcome:e.outcome||null,
      primaryPlayer:participants.player,secondaryPlayer:participants.receiver||participants.playerOff||participants.turnoverLoser,
      participants,valid,scoreOrderKnown:!uncertainScorePeriods.has(null)&&!uncertainScorePeriods.has(e.half),reviewReason:final.invalidEvents.get(e.id)||null,
      kickout:ko?{team:e.team,length:['long','short','medium'].includes(String(e.kickoutLength).toLowerCase())?String(e.kickoutLength).toLowerCase():null,
        outcome:ko.outcome,winner,mark:e.mark===undefined?null:ko.mark,markWinner:participants.markWinner,winnerPlayer:participants.kickoutWinner}:null,
      shot:shot?{type:e.event,outcome:shot.shotOutcome,source:shot.shotSource||null,missReason:shot.missReason||null,
        x:Number.isFinite(e.shotX)?e.shotX:null,y:Number.isFinite(e.shotY)?e.shotY:null,scoreValue:points}:null,
      pass:e.event==='pass'?{from:participants.player,to:participants.receiver,type:['hand','kick'].includes(e.passType)?e.passType:null,notableOnly:true}:null,
      turnover,interception:e.event==='interception',block:e.event==='defensive-block'||shot?.missReason==='blocked',
      goalkeeper:keeper?{...keeper,name:keeper.nameSnapshot||null}:null,
      substitution:(e.event==='substitution'||final.substitutions.some(s=>s.event.id===e.id))?{
        on:participants.playerOn||participants.player,off:participants.playerOff,
        reason:final.substitutions.find(s=>s.event.id===e.id)?.reason||'invalid-or-legacy'}:null,
      discipline:e.event==='booked'?{card:e.card||null,code:e.matchCode||null,durationMs:e.sinBinDurationMs??null}:null,
      activeCounts,beforeCounts,activePlayers:activeCounts[e.team],opponentActivePlayers:activeCounts[other(e.team)],
      scoreBefore,scoreAfter:{...scores},scoreFor:scores[e.team],scoreAgainst:scores[other(e.team)],scoreDifferential:scores[e.team]-scores[other(e.team)],
      matchState:scores[e.team]===scores[other(e.team)]?'level':scores[e.team]>scores[other(e.team)]?'leading':'trailing',
      directScoreLink:e.directScoreLink||null,buildUpLink:e.buildUpLink||null,
      possessionResult:e.possessionResult||null,notes:e.notes||null,
      details:{zone:e.zone||null,side:e.side||null,dictatedNote:e.dictatedNote||null,coachObservation:e.coachObservation||null,attackPattern:e.attackPattern||null,cardId:e.cardId||null},
    });
  }
  return stream;
}
const label=p=>p?[p.jerseyNumber!==null?`#${p.jerseyNumber}`:'',p.name].filter(Boolean).join(' '):'';
export const TIMELINE_CSV_COLUMNS=[
 ['Event ID',e=>e.id],['Period',e=>e.period],['Period Time',e=>e.periodTime],
 ['Continuous Playing Time',e=>e.continuousTimeMs===null?'':formatTime(e.continuousTimeMs)],
 ['Period Time ms',e=>e.periodTimeMs],['Continuous Playing Time ms',e=>e.continuousTimeMs],['Recording Order',e=>e.recordingIndex],
 ['Team',e=>e.teamName],['Event',e=>e.eventLabel],['Outcome',e=>e.outcome],
 ['Player',e=>label(e.primaryPlayer)],['Player ID',e=>e.primaryPlayer?.playerId],
 ['Jersey Snapshot',e=>e.primaryPlayer?.jerseyNumber],['Secondary Player',e=>label(e.secondaryPlayer)],
 ['Kickout Length',e=>e.kickout?.length],['Kickout Winner',e=>e.kickout?.winner],['Mark',e=>e.kickout?.mark],
 ['Mark Winner',e=>label(e.kickout?.markWinner)],['Kickout Winner Player',e=>label(e.kickout?.winnerPlayer)],
 ['Shot Source',e=>e.shot?.source],['Shot Outcome',e=>e.shot?.outcome],['Miss Reason',e=>e.shot?.missReason],
 ['X',e=>e.shot?.x],['Y',e=>e.shot?.y],['Pass From',e=>label(e.pass?.from)],['Pass To',e=>label(e.pass?.to)],['Pass Type',e=>e.pass?.type],
 ['Turnover Winner',e=>e.turnover?.winningTeam],['Turnover Winner Player',e=>label(e.participants.turnoverWinner)],
 ['Turnover Loser Player',e=>label(e.participants.turnoverLoser)],['Blocker',e=>label(e.participants.blocker)],
 ['Goalkeeper',e=>label(e.goalkeeper)],['Player On',e=>label(e.substitution?.on)],['Player Off',e=>label(e.substitution?.off)],
 ['Card',e=>e.discipline?.card],['Sin Bin Duration ms',e=>e.discipline?.durationMs],
 ['Active Players',e=>e.activePlayers],['Opponent Active Players',e=>e.opponentActivePlayers],
 ['Score For',e=>e.scoreFor],['Score Against',e=>e.scoreAgainst],['Score Differential',e=>e.scoreDifferential],
 ['Score Value',e=>e.shot?.scoreValue],['Match State',e=>e.matchState],['Valid Derived Fact',e=>e.valid],['Review Reason',e=>e.reviewReason],
 ['Direct Score Link',e=>e.directScoreLink],['Build-up Link',e=>e.buildUpLink],['Notes',e=>e.notes],['Dictated Note',e=>e.details.dictatedNote],['Coach Observation',e=>e.details.coachObservation],['Zone',e=>e.details.zone],['Side',e=>e.details.side],['Attack Pattern',e=>e.details.attackPattern],['Linked Card ID',e=>e.details.cardId],['Possession Result',e=>e.possessionResult],
 ['Original Event JSON',e=>e.originalEventJSON],
];
// Quote all fields; neutralise spreadsheet formulas in user-supplied text.
export const csvCell=value=>'"'+(typeof value==='string'?value.replace(/^[\s]*[=+@-]/,s=>"'"+s):String(value??'')).replaceAll('"','""')+'"';
export function timelineCSV(match){
 const rows=canonicalAnalysisStream(match).map(e=>({...e,teamName:(e.team==='our'?match.setup.ourTeam:match.setup.opposition)||e.team,originalEventJSON:JSON.stringify(match.events[e.recordingIndex])}));
 return '\uFEFF'+[TIMELINE_CSV_COLUMNS.map(([name])=>csvCell(name)).join(','),...rows.map(row=>TIMELINE_CSV_COLUMNS.map(([,get])=>csvCell(get(row))).join(','))].join('\r\n')+'\r\n';
}
export function downloadTimelineCSV(match){
 const url=URL.createObjectURL(new Blob([timelineCSV(match)],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`Sideline-Timeline-${match.setup.date||'match'}-${match.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function analysisEnd(match){const end=playingEnd(match,0);return {...end,continuousTimeMs:continuousPlayingMs(match,end,0)};}
