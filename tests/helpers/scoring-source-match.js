// Representative reporting data only; never an imported/reconstructed real match.
import { blankMatch, createEvent, saveEvent } from '../../src/domain.js';
import { snapshotSquad, loadSquadPlayers } from '../../src/squads.js';
export function sourceSquad() {
 return snapshotSquad('Reporting test squad',[
  {number:10,name:'Mixed Source Player',role:'starter'},
  {number:11,name:'Goal and Free Player',role:'starter'},
  {number:12,name:'Two Point Player',role:'starter'},
  {number:13,name:'Penalty Player',role:'starter'},
  {number:14,name:'45 Player',role:'starter'},
  {number:15,name:'Unknown Source Player',role:'starter'},
 ]);
}
export function sourceMatch(squad=sourceSquad(),number=10,date='2026-10-01') {
 const m=blankMatch();m.setup.ourTeam='Report Home';m.setup.opposition='Report Visitors';m.setup.date=date;
 m.players=loadSquadPlayers(squad);m.players[0].number=number;m.players[0].jerseyNumber=number;m.squadId=squad.id;
 return m;
}
export function sourceEvent(m,number,type,source){
 const e={...createEvent(m,type,'our'),playerNumber:String(number)};
 if(source===undefined){delete e.shotSource;delete e.scoreOrigin;}else e.shotSource=source;
 m.events=saveEvent(m.events,e,m);return m.events.at(-1);
}
export function scoringSourceExample(squad=sourceSquad()) {
 const m=sourceMatch(squad);
 for(let i=0;i<5;i++)sourceEvent(m,10,'point','open-play');
 for(let i=0;i<2;i++)sourceEvent(m,10,'point','free');
 for(let i=0;i<4;i++)sourceEvent(m,10,'miss','open-play');
 sourceEvent(m,11,'goal','open-play');sourceEvent(m,11,'point','free');
 sourceEvent(m,12,'two-point','open-play');sourceEvent(m,13,'goal','penalty');
 sourceEvent(m,14,'point','45');sourceEvent(m,15,'point');return m;
}
