import {blankMatch,createEvent,saveEvent} from '../../src/domain.js';
import {withBlankMatchPlayers} from '../../src/match-squad-enrichment.js';
import {advancePeriod,shootoutClock} from '../../src/periods.js';
import {sinBinDuration} from '../../src/discipline.js';
import {disciplineRef} from '../../src/discipline-ui.js';
import {initialShootout,selectFirstTeam,startShootout} from '../../src/shootout.js';
import {totals} from '../../src/domain.js';
import {activeGoalkeepers} from '../../src/goalkeepers.js';
export function match03108(code='LGFA'){
 const m=withBlankMatchPlayers(blankMatch());m.setup={...m.setup,ourTeam:'Home',opposition:'Away',matchCode:code};
 for(const team of ['our','opposition'])for(const p of team==='our'?m.players:m.oppositionPlayers)p.name=`${team==='our'?'Home':'Away'} ${p.number}`;
 return m;
}
export function at03108(m,half,ms){if(m.clock.half!==half)m.clock=advancePeriod(m.clock,half,0);m.clock.elapsedMs=ms;m.clock.startedAt=null;}
export function put03108(m,e){m.events=saveEvent(m.events,e,m);return m.events.find(x=>x.id===e.id);}
export function ref03108(m,n,team='our'){const p=(team==='our'?m.players:m.oppositionPlayers).find(p=>p.number===n);return disciplineRef(m,team,p.id);}
export function card03108(m,n=8,card='yellow',team='our'){
 const e=createEvent(m,'booked',team,0),ref=ref03108(m,n,team);
 return put03108(m,{...e,disciplineVersion:1,matchCode:m.setup.matchCode,card,sinBinDurationMs:sinBinDuration(m),playerNumber:String(n),participants:{...e.participants,player:ref}});
}
export function return03108(m,card){const e=createEvent(m,'discipline-return',card.team,0),r=ref03108(m,+card.playerNumber,card.team);return put03108(m,{...e,disciplineVersion:1,cardId:card.id,playerNumber:card.playerNumber,participants:{...e.participants,player:r}});}
export function replace03108(m,card,n=18){const e=createEvent(m,'discipline-replacement',card.team,0),r=ref03108(m,n,card.team);return put03108(m,{...e,disciplineVersion:1,cardId:card.id,playerNumber:String(n),playerOn:String(n),playerOff:card.playerNumber,countsAsSubstitution:true,participants:{...e.participants,player:r,playerOn:r,playerOff:card.participants.player}});}
export function twoYellowET03108(){const m=match03108();at03108(m,1,1000);const first=card03108(m);at03108(m,1,601000);return03108(m,first);at03108(m,1,1800000);at03108(m,2,1000);const second=card03108(m);at03108(m,2,1800000);at03108(m,3,0);replace03108(m,second);return m;}
export function finishET03108(m){if(m.clock.half===1){at03108(m,1,1800000);at03108(m,2,1800000);}if(m.clock.half===2)at03108(m,3,0);if(m.clock.half===3){at03108(m,3,600000);at03108(m,4,0);}at03108(m,4,600000);return m;}
export function shootout03108(m){finishET03108(m);m.clock=shootoutClock(m.clock,0);m.shootout=startShootout(selectFirstTeam(initialShootout({our:totals(m.events,'our'),opposition:totals(m.events,'opposition')},activeGoalkeepers(m)),'our'));return m;}
export function normal03108(){const m=match03108();at03108(m,1,1000);put03108(m,createEvent(m,'point','our',0));at03108(m,1,2000);put03108(m,createEvent(m,'point','opposition',0));at03108(m,1,1800000);at03108(m,2,0);for(const team of ['our','opposition'])for(let i=0;i<4;i++){m.clock.elapsedMs+=1000;put03108(m,createEvent(m,'point',team,0));}m.clock.elapsedMs=1800000;return m;}
