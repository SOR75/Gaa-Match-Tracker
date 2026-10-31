import { scoringSourceTotals, scoringSourceSummary } from './scoring-sources.js';
import {playerStatistics,summarize} from './analysis.js';
import {participantKey,resolveParticipant,roleTeam} from './identity.js';
// Match-report presentation only. Never change the underlying statistics,
// roster, identity, participation or event attribution to decide visibility.
export const isReportShooter = player => Number(player.attempts) >= 1;
export const REPORT_EVENT_METRICS = [
 ['TO won','turnoversWon'], ['TO lost','turnoversLost'], ['Interceptions','interceptions'],
 ['KO events','kickoutInvolvement'], ['KO wins','kickoutPossessionsWon'],
 ['KO other','otherKickoutPossessionsWon'], ['Marks','kickoutMarks'],
 ['Defensive blocks','defensiveBlocks'], ['Passes','passes'],
 ['Passes received','passesReceived'], ['Legacy possession','possessions'],
];
export const hasReportEventData = player => REPORT_EVENT_METRICS.some(([,key])=>Number(player[key])>0);
export function playerReportContributions(player) {
 const items=[];
 if(Number(player.successful)>0)items.push({label:'Score',value:`${player.goals}-${player.points+2*player.twoPointers} (${player.total})`});
 const sources=scoringSourceSummary(player.scoringSources);
 if(sources)items.push({label:'',value:sources});
 if(isReportShooter(player))items.push({label:'Shots',value:`${player.successful}/${player.attempts}`});
 for(const [label,key] of [
  ['KO wins','kickoutPossessionsWon'], ['Marks','kickoutMarks'],
  ['TO won','turnoversWon'], ['TO lost','turnoversLost'],
  ['Interceptions','interceptions'], ['Blocked attempts','blockedAttempts'],
  ['Defensive blocks','defensiveBlocks'], ['Passes','passes'],
  ['Passes received','passesReceived'], ['Legacy possession events','possessions'],
 ])if(Number(player[key])>0)items.push({label,value:String(player[key])});
 return items;
}

// Older number-only Pass records do not expose pass metrics in the shared
// legacy statistics API. Name these explicit roles for reports only; do not
// create squad members, link identities, or alter existing calculated fields.
export function reportPlayerStatistics(match,team) {
 const rows=playerStatistics(match,team).map(p=>({...p}));
 const counts=new Map();
 for(const e of match.events.filter(e=>e.event==='pass'&&e.team===team)) {
  for(const [role,field] of [['player','passes'],['receiver','passesReceived']]) {
   const key=participantKey(e,role),ref=resolveParticipant(match,e,role);
   if(!key||!ref||roleTeam(e,role)!==team)continue;
   let row=rows.find(p=>(p.filterKey||p.identityKey||(p.matchPlayerId?`id:${team}:${p.matchPlayerId}`:`legacy:${team}:${p.number}`))===key);
   if(!row){row={...summarize([],team),number:String(ref.number),name:ref.name,playerId:ref.playerId||null,matchPlayerId:ref.matchPlayerId||null,filterKey:key};rows.push(row);}
   if(!counts.has(row))counts.set(row,{passes:0,passesReceived:0});
   counts.get(row)[field]++;
  }
 }
 for(const [row,values] of counts)for(const field of ['passes','passesReceived'])if(row[field]===undefined)row[field]=values[field];
 for(const row of rows){
  const key=row.filterKey||row.identityKey||(row.matchPlayerId?`id:${team}:${row.matchPlayerId}`:`legacy:${team}:${row.number}`);
  row.scoringSources=scoringSourceTotals(match.events.filter(e=>e.team===team&&participantKey(e,'player')===key));
 }
 return rows;
}
