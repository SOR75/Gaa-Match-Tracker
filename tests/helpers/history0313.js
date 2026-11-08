// Deterministic fictional records for History safety; never a real match export.
import {blankMatch,createEvent,saveEvent,uid} from '../../src/domain.js';
import {snapshotSquad,loadSquadPlayers} from '../../src/squads.js';
import {completeMatch} from '../../src/history.js';
export function history0313(){
 const squad=snapshotSquad('History Review Squad',[{name:'County Player',number:6,role:'starter'},{name:'County Player',number:8,role:'starter'},{name:'Bench Player',number:20,role:'substitute'}]);
 const make=(id,date,jersey=6)=>{const m=blankMatch();m.id=id;m.setup={...m.setup,ourTeam:'History Home',opposition:id,date};m.players=loadSquadPlayers(squad);m.players[0].number=jersey;m.players[0].jerseyNumber=jersey;m.squadId=squad.id;return m;};
 const score=(m,type,n)=>{m.events=saveEvent(m.events,{...createEvent(m,type,'our'),playerNumber:String(n)},m);return completeMatch(m);};
 const a=score(make('Recorded A','2026-10-01'),'point',6),b=score(make('Recorded B','2026-10-08',11),'goal',11);
 const empty=completeMatch(make('Empty completed','2026-11-05'));empty.clock.elapsedMs=120000;
 const clock=make('Empty clock','2026-11-06');clock.clock.elapsedMs=180000;
 const active=make('Current match','2026-11-08');active.clock.elapsedMs=60000;
 const setup={id:uid(),name:'Saved team selection',squadId:squad.id,players:a.players.map(p=>({playerId:p.playerId,number:p.number,role:p.role}))};
 return {squad,a,b,empty,clock,active,setup};
}
