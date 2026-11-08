// Synthetic print stress cases only. No original recorded match is reconstructed.
import {reportCases0312,heavyReport0312} from './reports0312.js';
import {flowMatch,addFlow} from './match-flow-match.js';
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
 return {...cases,keepers,timeline,participation};
}
