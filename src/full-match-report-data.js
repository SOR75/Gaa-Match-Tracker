// Factual read-only report projection. Coaching interpretation stays in Analysis.
import {validAnalysisEvents} from './analysis-evidence.js';
import {summarize,percentage} from './analysis.js';
import {isShot} from './domain.js';
import {SHOT_SOURCES,shotDetails} from './shots.js';
import {goalkeeperStatistics} from './goalkeepers.js';
import {shotLocationAnalysis} from './shot-location-analysis.js';
import {playerReportContributions,reportPlayerStatistics} from './report-player-data.js';
import {reportStatus,kickoutLengthEvidence} from './report-evidence.js';
import {participationFor,playerPlayingTime} from './participation.js';
export function fullMatchReportModel(match){
 const events=validAnalysisEvents(match),teams=['our','opposition'];
 const stats=Object.fromEntries(teams.map(t=>[t,summarize(events,t)]));
 const halves=Object.fromEntries(teams.map(t=>[t,[1,2].map(h=>summarize(events.filter(e=>e.half===h),t))]));
 const names={our:match.setup.ourTeam||'Our team',opposition:match.setup.opposition||'Opposition'};
 const players=teams.flatMap(team=>reportPlayerStatistics(match,team).filter(p=>playerReportContributions(p).length).map(p=>({...p,team})));
 const sources=Object.fromEntries(teams.map(team=>[team,SHOT_SOURCES.map(([id,label])=>{const shots=events.filter(e=>e.team===team&&isShot(e)&&shotDetails(e).shotSource===id),scores=shots.filter(e=>e.outcome==='scored').length;return {id,label,attempts:shots.length,scores,conversion:percentage(scores,shots.length)};})]));
 const minutes=teams.flatMap(team=>(team==='our'?match.players:match.oppositionPlayers||[]).flatMap(p=>{const participation=participationFor(match,p,team),timeMs=playerPlayingTime(match,p,team,0);return participation.appeared||Number.isFinite(timeMs)&&timeMs>0?[{team,number:p.number,name:p.name,matchPlayerId:p.matchPlayerId||p.id,participation,evidence:participation.appeared?participation.evidence:'Recorded field changes (legacy linkage)',timeMs}]:[];}));
 return {setup:{...match.setup},names,events,stats,halves,players,sources,minutes,status:reportStatus(match),keepers:goalkeeperStatistics(match),
  location:Object.fromEntries(teams.map(t=>[t,shotLocationAnalysis(events,t)])),lengths:Object.fromEntries(teams.map(t=>[t,kickoutLengthEvidence(events,t)])),
  periodScores:[1,2,...[3,4].filter(h=>events.some(e=>e.half===h))].map(half=>({half,our:summarize(events.filter(e=>e.half===half),'our'),opposition:summarize(events.filter(e=>e.half===half),'opposition')})),
  substitutions:events.filter(e=>e.event==='substitution'||e.event==='discipline-replacement').map(e=>({id:e.id,team:e.team,half:e.half,time:e.timeMs,on:e.playerOn||e.playerNumber,off:e.playerOff,event:e})),
  eventCount:match.events.length,excludedCount:match.events.length-events.length};
}
