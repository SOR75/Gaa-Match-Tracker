import test from "node:test";
import assert from "node:assert/strict";
import { blankMatch, createEvent, saveEvent, undoEvent } from "../src/domain.js";
import { summarize } from "../src/analysis.js";
import { analysisForScope } from "../src/half-time.js";
import { kickoutDetails, kickoutAnalysisOutcome } from "../src/kickouts.js";
import { goalkeeperStatistics } from "../src/goalkeepers.js";
import { createMatchPlayer, createSquadPlayer } from "../src/identity.js";
function add(m,type,team,fields={}) {
 const e={...createEvent(m,type,team),...fields};m.events=saveEvent(m.events,e,m);return m.events.find(x=>x.id===e.id);
}
for(const team of ["our","opposition"])test(`${team}: three retained plus one OOP is 75%, one kicking-team loss, one OOP, unchanged event records`,()=>{
 const m=blankMatch(),type=team==="our"?"our-kickout":"opposition-kickout",retained=team==="our"?"won":"lost";
 for(let i=0;i<3;i++)add(m,type,team,{outcome:retained,kickoutLength:"Long",half:1,mark:i===0});
 const oop=add(m,type,team,{outcome:"out-of-play",kickoutLength:"Long",half:1});
 const raw=JSON.stringify(m),k=summarize(m.events,team).kickouts;
 assert.equal(k.total,4);assert.equal(k.retention,75);assert.equal(k.outOfPlay,1);assert.equal(k.unknown,0);
 assert.equal(team==="our"?k.lost:k.won,1);
 assert.equal(k.long.total,4);assert.equal(k.long.success,75);assert.equal(k.long.unknown,0);
 assert.equal(kickoutDetails(oop).outcome,"out-of-play");assert.equal(oop.kickoutWinnerNumber,"");
 for(const scope of ["H1","FULL_MATCH"])assert.equal(analysisForScope(m,scope)[team].kickouts.retention,75);
 assert.equal(analysisForScope(m,"H2")[team].kickouts.total,0);
 add(m,type,team,{outcome:"unknown",half:2});
 assert.equal(summarize(m.events,team).kickouts.retention,75);assert.equal(summarize(m.events,team).kickouts.unknown,1);
 assert.equal(JSON.stringify({...m,events:m.events.slice(0,4)}),raw);
});
for(const team of ["our","opposition"])test(`${team} replacement goalkeeper #16: one retained plus one OOP is 50%, one lost, one OOP`,()=>{
 const m=blankMatch();
 const p=n=>createMatchPlayer({...createSquadPlayer({number:n,name:`Player ${n}`,role:n===1?"starter":"substitute"}),id:undefined});
 m.players=[p(1),p(16)];m.oppositionPlayers=[p(1),p(16)];
 add(m,"substitution",team,{timeMs:1000,playerOn:"16",playerOff:"1"});
 const type=team==="our"?"our-kickout":"opposition-kickout";
 add(m,type,team,{timeMs:2000,outcome:team==="our"?"won":"lost",kickoutLength:"Short"});
 add(m,type,team,{timeMs:3000,outcome:"out-of-play",kickoutLength:"Short"});
 const raw=JSON.stringify(m),g=goalkeeperStatistics(m).find(g=>g.team===team&&g.jerseyNumber===16);
 assert.deepEqual([g.gkKickouts,g.gkRetained,g.gkLost,g.gkOutOfPlay,g.gkRetention,g.gkShortRetention],[2,1,1,1,50,50]);
 assert.equal(m.events.length,3);assert.equal(JSON.stringify(m),raw);
});
test("OOP edits and undo recalculate without changing event identity or inventing kickouts",()=>{
 const m=blankMatch();add(m,"our-kickout","our",{outcome:"won"});const e=add(m,"our-kickout","our",{outcome:"out-of-play"});
 assert.equal(summarize(m.events,"our").kickouts.retention,50);
 m.events=saveEvent(m.events,{...e,outcome:"won"},m);
 assert.equal(m.events.length,2);assert.equal(m.events[1].id,e.id);assert.equal(summarize(m.events,"our").kickouts.retention,100);assert.equal(summarize(m.events,"our").kickouts.lost,0);
 m.events=saveEvent(m.events,e,m);assert.equal(summarize(m.events,"our").kickouts.outOfPlay,1);
 m.events=undoEvent(m.events);assert.equal(summarize(m.events,"our").kickouts.retention,100);
});
test("opposition observation denominator includes OOP but assigns no player-success credit to it",()=>{
 const m=blankMatch();m.setup.opposition="Away";
 for(let i=0;i<3;i++)add(m,"opposition-kickout","opposition",{outcome:"lost",playerNumber:"8"});
 add(m,"opposition-kickout","opposition",{outcome:"out-of-play"});
 const d=analysisForScope(m,"FULL_MATCH");
 assert.equal(d.opposition.kickouts.retention,75);
 assert.ok(d.observations.some(o=>o.detail.includes('retained 3 of 4')&&o.detail.includes('credited on 3')));
 assert.equal(m.events[3].kickoutWinnerNumber,"");
});
test("legacy opposition results and OOP analytical losses preserve recorded perspective and Mark handling",()=>{
 const m=blankMatch();const e=add(m,"opposition-kickout","opposition",{outcome:"won",mark:true});delete e.kickoutPerspective;
 assert.equal(kickoutAnalysisOutcome(e),"lost");assert.equal(kickoutDetails(e).mark,true);
 const oop=add(m,"opposition-kickout","opposition",{outcome:"out-of-play"});delete oop.kickoutPerspective;
 assert.equal(kickoutAnalysisOutcome(oop),"won");assert.equal(oop.outcome,"out-of-play");assert.equal(kickoutDetails(oop).mark,false);
 const k=summarize(m.events,"opposition").kickouts;assert.equal(k.retention,50);assert.equal(k.marksLost,1);assert.equal(k.total,2);
});
test("Interception is separate from Turnover Won in summaries and every analysis scope",()=>{
 const m=blankMatch();add(m,"interception","our");
 for(const scope of ["H1","FULL_MATCH"]){const s=analysisForScope(m,scope).our;assert.equal(s.interceptions,1);assert.equal(s.turnoversWon,0);}
 add(m,"turnover-won","our");const s=summarize(m.events,"our");assert.equal(s.interceptions,1);assert.equal(s.turnoversWon,1);
});
