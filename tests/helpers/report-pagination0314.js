// Synthetic print stress cases only. No original recorded match is reconstructed.
import {reportCases0312,heavyReport0312} from './reports0312.js';
import {flowMatch,addFlow} from './match-flow-match.js';
import {syncPeriod} from '../../src/periods.js';
import {completeMatch} from '../../src/history.js';
import {startingGoalkeepers,goalkeeperRef} from '../../src/goalkeepers.js';
export function paginationCases0314(){
 const cases=reportCases0312();delete cases.tt;
 const keepers=reportCases0312().normal;keepers.events=[];keepers.goalkeepers=null;keepers.setup.competition='Synthetic multiple goalkeeper print test';
 for(const team of ['our','opposition'])for(const p of team==='our'?keepers.players:keepers.oppositionPlayers)p.name=`Synthetic ${team} keeper ${p.number}`;
 keepers.goalkeepers=startingGoalkeepers(keepers);
 for(const team of ['our','opposition'])for(const [i,n]of [2,3,4].entries()){
  const ref=goalkeeperRef(keepers,team,(team==='our'?keepers.players:keepers.oppositionPlayers).find(p=>p.number===n).matchPlayerId);
  const change=addFlow(keepers,'goalkeeper-change',team,300+i*300,1,{playerNumber:String(n)});
  change.participants={...change.participants,player:ref};
  addFlow(keepers,team==='our'?'our-kickout':'opposition-kickout',team,310+i*300,1,{outcome:'won',kickoutPerspective:'our'});
 }
 const timeline=flowMatch({lineup:true});timeline.setup.competition='Synthetic long scoring timeline';
 for(const half of [1,2])for(let i=0;i<70;i++)addFlow(timeline,'point',i%2?'opposition':'our',20+i*20,half,{playerNumber:String(i%15+1)});
 const participation=heavyReport0312();participation.setup.competition='Synthetic long player and participation tables';
 for(const team of ['our','opposition'])for(const p of team==='our'?participation.players:participation.oppositionPlayers)p.name=`Synthetic ${team} player ${String(p.number).padStart(2,'0')} Long Name For Print Review`;
 const extraTime=reportCases0312().normal;extraTime.events=[];extraTime.setup.competition='Synthetic extra-time portrait report';
 extraTime.clock=syncPeriod({half:4,elapsedMs:600000,startedAt:null,completedHalves:{1:1800000,2:1800000,3:600000,4:600000}});
 for(const half of [1,2,3,4])for(const team of ['our','opposition']){
  addFlow(extraTime,'point',team,60,half,{playerNumber:'4'});
  addFlow(extraTime,'interception',team,90,half,{playerNumber:'4'});
 }
 const overviewOverflow=reportCases0312().short;
 overviewOverflow.setup.competition='Synthetic oversized metadata '+Array.from({length:500},(_,i)=>`context${i}`).join(' ');
 return {...cases,keepers,timeline,participation,extraTime:completeMatch(extraTime,0),overviewOverflow};
}
