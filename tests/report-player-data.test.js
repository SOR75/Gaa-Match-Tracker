import test from 'node:test';
import assert from 'node:assert/strict';
import {isReportShooter,hasReportEventData,playerReportContributions,reportPlayerStatistics} from '../src/report-player-data.js';
import {fullMatchReportModel} from '../src/full-match-report-data.js';
import {analysisScreen} from '../src/analysis-ui.js';
import {blankMatch,createEvent,saveEvent} from '../src/domain.js';
import {createMatchPlayer} from '../src/identity.js';
const row=patch=>({number:'9',name:'Recorded player',team:'our',goals:0,points:0,twoPointers:0,total:0,attempts:0,successful:0,...patch});
test('membership, jersey, role, appearances, time in goal and unspecified attribution do not create report statistics',()=>{
 for(const patch of [{role:'starter'},{role:'substitute'},{role:'panel'},{goalkeeperAppearances:1,gkTimeMs:3600000},{keeper:{goalkeeperAppearances:1}},{attributed:5}]){
  const p=row(patch);assert.equal(isReportShooter(p),false);assert.equal(hasReportEventData(p),false);assert.deepEqual(playerReportContributions(p),[]);
 }
});
test('miss-only shooting remains visible with its meaningful denominator and no zero score/category clutter',()=>{
 const p=row({attempts:3});assert.equal(isReportShooter(p),true);assert.deepEqual(playerReportContributions(p),[{label:'Shots',value:'0/3'}]);assert.equal(hasReportEventData(p),false);
});
test('kickout-only and multi-contribution rows contain only explicitly named positive contributions',()=>{
 assert.deepEqual(playerReportContributions(row({kickoutPossessionsWon:3})),[{label:'KO wins',value:'3'}]);
 assert.deepEqual(playerReportContributions(row({attempts:1,kickoutPossessionsWon:2,kickoutMarks:1,turnoversWon:1})),[{label:'Shots',value:'0/1'},{label:'KO wins',value:'2'},{label:'Marks',value:'1'},{label:'TO won',value:'1'}]);
});
for(const [key,label] of [['turnoversLost','TO lost'],['interceptions','Interceptions'],['defensiveBlocks','Defensive blocks'],['blockedAttempts','Blocked attempts'],['passes','Passes'],['passesReceived','Passes received'],['possessions','Legacy possession events']])test(`${label}: named recorded contribution qualifies without generic attribution or another statistic being invented`,()=>{
 const p=row({[key]:2});assert.deepEqual(playerReportContributions(p),[{label,value:'2'}]);assert.equal(p.turnoversWon,undefined);
});
test('both-team shooter/event report filters preserve raw rosters, identities, turnover results and events',()=>{
 const m=blankMatch();m.setup.ourTeam='Us';m.setup.opposition='Them';const roster=()=>[1,3,8,26].map(n=>createMatchPlayer({number:n,name:`Member ${n}`,role:n===26?'panel':'starter',position:'',notes:''}));m.players=roster();m.oppositionPlayers=roster();
 for(const team of ['our','opposition'])for(let i=0;i<3;i++)m.events=saveEvent(m.events,{...createEvent(m,'miss',team),playerNumber:'3',timeMs:1000+i*1000},m);
 m.events=saveEvent(m.events,{...createEvent(m,'our-kickout','our'),outcome:'won',kickoutPerspective:'our',kickoutWinnerNumber:'8'},m);
 const raw=JSON.stringify(m);const model=fullMatchReportModel(m);assert.ok(!model.players.some(p=>p.number==='1'||p.number==='26'));assert.equal(model.players.filter(p=>p.attempts===3&&p.successful===0).length,2);
 const full=analysisScreen(m,{},true);assert.ok(!full.includes('Member 26'));assert.match(full,/Player shooting analysis/);assert.match(full,/Player event data/);assert.equal(JSON.stringify(m),raw);
 m.events=saveEvent(m.events,{...createEvent(m,'miss','our'),playerNumber:'1'},m);assert.ok(fullMatchReportModel(m).players.some(p=>p.number==='1'&&p.attempts===1));
});

test('number-only Pass sender/receiver are named report contributions without creating a squad or permanent identity',()=>{
 const m=blankMatch();m.events=[{...createEvent(m,'pass','opposition'),playerNumber:'4',receiverNumber:'11',passType:'kick'}];const before=JSON.stringify(m),rows=reportPlayerStatistics(m,'opposition');
 assert.equal(rows.find(p=>p.number==='4').passes,1);assert.equal(rows.find(p=>p.number==='11').passesReceived,1);assert.ok(rows.every(p=>!p.playerId&&!p.matchPlayerId));assert.equal(m.players.length,0);assert.equal(m.oppositionPlayers.length,0);assert.equal(JSON.stringify(m),before);
});
