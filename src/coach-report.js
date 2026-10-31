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
 const teams=['our','opposition'];const stats=Object.fromEntries(teams.map(t=>[t,summarize(match.events,t)]));
 const halves=Object.fromEntries(teams.map(t=>[t,[1,2].map(h=>summarize(match.events.filter(e=>e.half===h),t))]));
 const keepers=goalkeeperStatistics(match);
 const players=teams.flatMap(team=>reportPlayerStatistics(match,team).map(p=>{
   const g=keepers.find(k=>k.team===team && (p.matchPlayerId?k.matchPlayerId===p.matchPlayerId:String(k.jerseyNumber)===String(p.number)));
   return {...p,team,keeper:g||null};
 }).filter(p=>playerReportContributions(p).length>0));
 const sources=Object.fromEntries(teams.map(team=>[team,SHOT_SOURCES.map(([id,label])=>{
   const shots=match.events.filter(e=>e.team===team&&isShot(e)&&shotDetails(e).shotSource===id);const scores=shots.filter(e=>e.outcome==='scored').length;
   return {id,label,attempts:shots.length,scores,conversion:percentage(scores,shots.length)};
 })]));
 const location=Object.fromEntries(teams.map(t=>[t,shotLocationAnalysis(match.events,t)]));
 const model={setup:{...match.setup},names:Object.fromEntries(teams.map(t=>[t,reportTeamName(match,t)])),stats,halves,keepers,players,sources,location,observations:[],runs:recordedScoringRuns(match.events),shots:match.events.filter(e=>e.team==='our'&&isShot(e)),substitutions:match.events.filter(e=>e.event==='substitution').map(e=>({team:e.team,half:e.half,time:e.timeMs,on:e.playerOn,off:e.playerOff})),eventCount:match.events.length};
 return {...model,observations:coachReportObservations(model)};
}
export function coachReportObservations(data){
 const {stats,halves,players,names,location}=data;const observations=[];const [h1,h2]=halves.our,k=stats.our.kickouts,opp=stats.opposition.kickouts;
 if(h1.attempts>=5&&h2.attempts>=5)observations.push(`Shooting conversion ${h2.conversion>h1.conversion?'increased':h2.conversion<h1.conversion?'decreased':'was unchanged'} from ${h1.conversion}% in H1 to ${h2.conversion}% in H2 (${h1.successful}/${h1.attempts} and ${h2.successful}/${h2.attempts}).`);
 if(k.won+k.lost>=5)observations.push(`Our kickout retention was ${k.retention}% (${k.won}/${k.won+k.lost} known outcomes${k.outOfPlay?`; ${k.outOfPlay} Out of Play / Sideline included as losses`:''}).`);
 if(k.long.won+k.long.lost>=5)observations.push(`Long kickout retention was ${k.long.success}% (${k.long.won}/${k.long.won+k.long.lost} known outcomes).`);
 if(opp.won+opp.lost>=5)observations.push(`${names.opposition} retained ${opp.retention}% of their kickouts; we won ${opp.won}/${opp.won+opp.lost} known outcomes${opp.outOfPlay?` (includes ${opp.outOfPlay} Out of Play / Sideline, not player possession credits)`:''}.`);
 if(location.our?.zones.outside.attempts>=3){const z=location.our.zones.outside;observations.push(`Outside-40m conversion was ${z.conversion}% (${z.successful}/${z.attempts} classifiable attempts).`);}
 const leader=players.filter(p=>p.team==='our'&&p.successful>=3).sort((a,b)=>b.successful-a.successful)[0];
 if(leader&&leader.successful>=stats.our.successful/2)observations.push(`#${leader.number} ${leader.name} accounted for ${leader.successful} of ${stats.our.successful} recorded scores.`);
 return observations.slice(0,5);
}
