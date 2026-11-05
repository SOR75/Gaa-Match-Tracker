import {coachingInsights} from './coaching-insights.js';
import {validAnalysisEvents} from './analysis-evidence.js';
import { summarize,playerStatistics,scoringTimeline,percentage } from './analysis.js';
import { isShot,formatTime } from './domain.js';
import { SHOT_SOURCES,shotDetails,gaelicScore } from './shots.js';
import { goalkeeperStatistics } from './goalkeepers.js';
import { shotLocationAnalysis } from './shot-location-analysis.js';
import { playerReportContributions, reportPlayerStatistics } from './report-player-data.js';

export const reportTeamName=(match,team)=>team==='our'?(match.setup.ourTeam||'Our team'):(match.setup.opposition||'Opposition');
export function recordedScoringRuns(events) {
 const scores=scoringTimeline(events).map(x=>x.event),runs=[];let run=[];
 const flush=()=>{if(run.length>=3 && run.every(e=>Number.isFinite(e.timeMs)) && run.at(-1).timeMs>run[0].timeMs){const s=summarize(run,run[0].team);if(s.total>=4)runs.push({team:run[0].team,half:run[0].half,start:run[0].timeMs,end:run.at(-1).timeMs,score:gaelicScore(s),points:s.total,count:run.length});}};
 for(const e of scores){if(run.length&&(e.team!==run[0].team||e.half!==run[0].half)){flush();run=[];}run.push(e);}flush();
 return ['our','opposition'].flatMap(team=>runs.filter(r=>r.team===team).sort((a,b)=>b.points-a.points||a.half-b.half||a.start-b.start).slice(0,1));
}
export function coachReportModel(match) {
 const events=validAnalysisEvents(match);
 const teams=['our','opposition'];const stats=Object.fromEntries(teams.map(t=>[t,summarize(events,t)]));
 const halves=Object.fromEntries(teams.map(t=>[t,[1,2].map(h=>summarize(events.filter(e=>e.half===h),t))]));
 const keepers=goalkeeperStatistics(match);
 const players=teams.flatMap(team=>reportPlayerStatistics(match,team).map(p=>{
   const g=keepers.find(k=>k.team===team && (p.matchPlayerId?k.matchPlayerId===p.matchPlayerId:String(k.jerseyNumber)===String(p.number)));
   return {...p,team,keeper:g||null};
 }).filter(p=>playerReportContributions(p).length>0));
 const sources=Object.fromEntries(teams.map(team=>[team,SHOT_SOURCES.map(([id,label])=>{
   const shots=events.filter(e=>e.team===team&&isShot(e)&&shotDetails(e).shotSource===id);const scores=shots.filter(e=>e.outcome==='scored').length;
   return {id,label,attempts:shots.length,scores,conversion:percentage(scores,shots.length)};
 })]));
 const location=Object.fromEntries(teams.map(t=>[t,shotLocationAnalysis(events,t)]));
 const model={setup:{...match.setup},names:Object.fromEntries(teams.map(t=>[t,reportTeamName(match,t)])),stats,halves,keepers,players,sources,location,observations:[],runs:recordedScoringRuns(events),shots:events.filter(e=>e.team==='our'&&isShot(e)),substitutions:events.filter(e=>e.event==='substitution').map(e=>({team:e.team,half:e.half,time:e.timeMs,on:e.playerOn,off:e.playerOff})),eventCount:match.events.length};
 const insights=coachingInsights(match);
 return {...model,coachingInsights:insights,observations:coachReportObservations({...model,coachingInsights:insights})};
}
export function coachReportObservations(data){
 // A source-PDF snapshot is printed evidence, not an event ledger. Preserve its
 // explicit observations rather than manufacture event-level interpretation.
 return data.coachingInsights?data.coachingInsights.observations.map(o=>o.reportText||`${o.title}: ${o.detail}`):[...(data.observations||[])];
}
