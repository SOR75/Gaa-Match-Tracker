import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankMatch, createEvent, saveEvent, validMatch, migrateMatch, undoEvent } from '../src/domain.js';
import { createMatchPlayer, createSquadPlayer, participantRef } from '../src/identity.js';
import { pairedTurnoverFields } from '../src/turnovers.js';
import { summarize, playerStatistics } from '../src/analysis.js';
import { playerReviews } from '../src/player-insights.js';
import { fullMatchReportModel } from '../src/full-match-report-data.js';
import { playerReportContributions, reportPlayerStatistics } from '../src/report-player-data.js';
import { analysisForScope } from '../src/half-time.js';
import { historySnapshot, completeMatch } from '../src/history.js';
import { attributionRoster } from '../src/player-credit.js';
const make = () => {
 const m = blankMatch(); m.setup.ourTeam='Home'; m.setup.opposition='Away';
 const roster=()=>Array.from({length:18},(_,i)=>createMatchPlayer({...createSquadPlayer({name:`Player ${i+1}`,number:i+1,role:i<15?'starter':'substitute'}),id:undefined}));
 m.players=roster();m.oppositionPlayers=roster();return m;
};
const add=(m,type,fields={},team='our')=>{
 const e={...createEvent(m,type,team),...fields};m.events=saveEvent(m.events,e,m);return m.events.at(-1);
};
const paired=(m,type,ours,theirs='')=>{
 const fields={pairedTurnoverVersion:1,turnoverWinnerNumber:type==='turnover-won'?ours:theirs,turnoverLoserNumber:type==='turnover-won'?theirs:ours};
 return add(m,type,fields,'opposition');
};
for(const type of ['turnover-won','turnover-lost'])for(const opponent of ['12',''])test(`${type}, opposition ${opponent||'unknown'}: one event, both team totals, only selected player credits`,()=>{
 const m=make(),won=type==='turnover-won',ours=won?'8':'10';
 const e=paired(m,type,ours,opponent);
 assert.equal(m.events.length,1);assert.equal(e.team,'our');assert.equal(e.playerNumber,ours);
 assert.equal(e.winningTeam,won?'our':'opposition');assert.equal(e.losingTeam,won?'opposition':'our');
 const field=won?'turnoversWon':'turnoversLost',other=won?'turnoversLost':'turnoversWon';
 assert.equal(summarize(m.events,'our')[field],1);assert.equal(summarize(m.events,'opposition')[other],1);
 assert.equal(playerStatistics(m,'our').find(p=>p.number===ours)[field],1);
 assert.equal(playerStatistics(m,'opposition').reduce((n,p)=>n+p[other],0),opponent?1:0);
 assert.equal(participantRef(e,won?'turnoverWinner':'turnoverLoser').playerId,m.players[+ours-1].playerId);
 assert.equal(participantRef(e,won?'turnoverLoser':'turnoverWinner')?.playerId||null,opponent?m.oppositionPlayers[+opponent-1].playerId:null);
 assert.ok(validMatch(m));assert.deepEqual(migrateMatch(m),m);
});
test('required our player cannot be missing; optional away player is never guessed',()=>{
 const m=make();assert.throws(()=>paired(m,'turnover-won','','12'),/Choose our turnover player/);assert.equal(m.events.length,0);
 paired(m,'turnover-won','8');assert.equal(m.events[0].participants.turnoverLoser,null);
 for(const n of ['0','100','12.5','abc'])assert.throws(()=>paired(make(),'turnover-lost','10',n));
});
test('number-only fallback still derives both teams without creating squads or permanent identities',()=>{
 const m=blankMatch();paired(m,'turnover-lost','23','8');assert.deepEqual(m.players,[]);assert.deepEqual(m.oppositionPlayers,[]);
 assert.equal(playerStatistics(m,'our')[0].turnoversLost,1);assert.equal(playerStatistics(m,'opposition')[0].turnoversWon,1);
 assert.equal(playerStatistics(m,'our')[0].playerId,null);
});
test('historical independent 3/0 vs 2/1 remains exactly recorded, with no migration or inferred counterparts',()=>{
 const m=make();for(let i=0;i<3;i++)add(m,'turnover-won',{playerNumber:'8'});
 for(let i=0;i<2;i++)add(m,'turnover-won',{playerNumber:'8'},'opposition');add(m,'turnover-lost',{playerNumber:'12'},'opposition');
 const before=JSON.stringify(m);
 assert.deepEqual(['our','opposition'].map(t=>{const s=summarize(m.events,t);return [s.turnoversWon,s.turnoversLost];}),[[3,0],[2,1]]);
 assert.equal(JSON.stringify(migrateMatch(m)),before);assert.equal(JSON.stringify(m),before);
 assert.equal(playerStatistics(m,'our').find(p=>p.number==='8').turnoversWon,3);
});
test('mixed historical and paired events add only explicitly recorded/derived contributions; interception remains separate',()=>{
 const m=make();add(m,'turnover-won');paired(m,'turnover-lost','10','8');add(m,'interception',{playerNumber:'8'});
 assert.deepEqual(['our','opposition'].map(t=>{const s=summarize(m.events,t);return [s.turnoversWon,s.turnoversLost,s.interceptions];}),[[1,1,1],[1,0,0]]);
});
test('edit/clear optional counterpart, change required player and undo recalculate once using stable role references',()=>{
 const m=make();const e=paired(m,'turnover-won','8','12');
 m.events=saveEvent(m.events,{...e,turnoverWinnerNumber:'10',turnoverLoserNumber:''},m);
 assert.equal(playerStatistics(m,'our').find(p=>p.number==='8').turnoversWon,0);
 assert.equal(playerStatistics(m,'our').find(p=>p.number==='10').turnoversWon,1);
 assert.equal(playerStatistics(m,'opposition').reduce((n,p)=>n+p.turnoversLost,0),0);
 assert.equal(summarize(m.events,'opposition').turnoversLost,1);
 assert.equal(m.events[0].participants.turnoverWinner.playerId,m.players[9].playerId);
 assert.equal(m.events[0].participants.turnoverLoser,null);
 m.events=undoEvent(m.events);assert.equal(summarize(m.events,'opposition').turnoversLost,0);
});
test('both Active XV rosters independently track substitution and re-entry without changing participation calculations',()=>{
 const m=make();add(m,'substitution',{playerOn:'18',playerOff:'10'});add(m,'substitution',{playerOn:'16',playerOff:'12'},'opposition');
 assert.ok(attributionRoster(m,'our').players.some(p=>p.number===18));assert.ok(!attributionRoster(m,'our').players.some(p=>p.number===10));
 assert.ok(attributionRoster(m,'opposition').players.some(p=>p.number===16));assert.ok(!attributionRoster(m,'opposition').players.some(p=>p.number===12));
 add(m,'substitution',{playerOn:'10',playerOff:'18'});assert.ok(attributionRoster(m,'our').players.some(p=>p.number===10));
});
test('HT/FT, Coach Report and Full Match Data share paired totals and explicitly attributed contributions; history preserves event bytes',()=>{
 const m=make();paired(m,'turnover-won','8','12');m.clock.half=2;paired(m,'turnover-lost','10','8');
 const before=JSON.stringify(m);
 for(const scope of ['H1','FULL_MATCH']){const d=analysisForScope(m,scope);assert.equal(d.our.turnoversWon,1);assert.equal(d.opposition.turnoversLost,1);assert.equal(d.our.turnoversLost,scope==='H1'?0:1);}
 const d=fullMatchReportModel(m);assert.equal(d.eventCount,2);assert.equal(d.stats.our.turnoversWon,d.stats.opposition.turnoversLost);assert.equal(d.stats.our.turnoversLost,d.stats.opposition.turnoversWon);
 const row=reportPlayerStatistics(m,'opposition').find(p=>p.number==='12');assert.deepEqual(playerReportContributions(row),[{label:'TO lost',value:'1'}]);
 const archived=historySnapshot({match:completeMatch(m)});assert.deepEqual(archived.events,m.events);assert.equal(fullMatchReportModel(archived).stats.opposition.turnoversWon,1);assert.equal(JSON.stringify(m),before);
});
test('Player Review aggregates linked turnover roles across matches and jersey changes, never by jersey/name similarity',()=>{
 const a=make(),b=make();b.players[0]={...b.players[0],playerId:a.players[7].playerId,name:a.players[7].name,number:23};
 paired(a,'turnover-won','8');paired(b,'turnover-lost','23','8');
 const records=[a,b].map(m=>({id:m.id,match:completeMatch(m)}));
 const p=playerReviews(records).find(p=>p.playerId===a.players[7].playerId);
 assert.equal(p.turnoversWon,1);assert.equal(p.turnoversLost,1);assert.equal(p.matches.length,2);assert.deepEqual(p.matches.map(m=>m.jersey).sort((a,b)=>a-b),[8,23]);
});
test('unrecognised paired version or malformed marked rows cannot load as silently paired events',()=>{
 const m=make();paired(m,'turnover-won','8','12');
 for(const patch of [{pairedTurnoverVersion:2},{winningTeam:'opposition'},{losingTeam:'our'},{team:'opposition'},{turnoverWinnerNumber:''},{event:'interception'}]){
  const copy=structuredClone(m);Object.assign(copy.events[0],patch);assert.equal(validMatch(copy),false);
 }
});
test('same displayed name and number on opposing squads remain different permanent role identities',()=>{
 const m=make();paired(m,'turnover-won','8','8');const e=m.events[0];
 assert.notEqual(participantRef(e,'turnoverWinner').playerId,participantRef(e,'turnoverLoser').playerId);
 assert.equal(playerStatistics(m,'our').find(p=>p.playerId===m.players[7].playerId).turnoversWon,1);
 assert.equal(playerStatistics(m,'opposition').find(p=>p.playerId===m.oppositionPlayers[7].playerId).turnoversLost,1);
});
