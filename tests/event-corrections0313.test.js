import test from 'node:test';
import assert from 'node:assert/strict';
import {eventDeletion,editRosterOptions} from '../src/event-corrections.js';
import {attributionRoster} from '../src/player-credit.js';
import {linkedEventFields} from '../src/event-links.js';
import {kickoutFieldsMarkup} from '../src/kickout-capture.js';
import {shotFieldsMarkup} from '../src/shot-capture.js';
import {flowMatch,addFlow} from './helpers/match-flow-match.js';
import {summarize,playerStatistics} from '../src/analysis.js';
import {canonicalAnalysisStream,timelineCSV} from '../src/analysis-stream.js';
import {fullMatchReportModel} from '../src/full-match-report-data.js';
import {coachingInsights} from '../src/coaching-insights.js';
import {bindEventParticipants} from '../src/identity.js';
const stamp=m=>JSON.stringify(m);
function fixture(){const m=flowMatch({lineup:true});for(const t of ['our','opposition'])for(const p of m[t==='our'?'players':'oppositionPlayers'])p.name=`${t==='our'?'Home':'Away'} Person ${p.number}`;return m;}
for(const type of ['point','goal','two-point','our-kickout','opposition-kickout','defensive-block','turnover-won','turnover-lost','interception','pass'])test(`${type}: editor roster uses the event team and its historical field state`,()=>{
 const m=fixture(),team=type==='opposition-kickout'?'opposition':'our';
 addFlow(m,'substitution',team,100,1,{playerOn:'18',playerOff:'10'});
 const e=addFlow(m,type,team,50,1,{playerNumber:'10'}),before=stamp(m);
 const rows=attributionRoster(m,team,editRosterOptions(e)).players;
 assert.ok(rows.some(p=>p.number===10));assert.ok(!rows.some(p=>p.number===18));assert.ok(rows.every(p=>p.name.startsWith(team==='our'?'Home':'Away')));
 const later={...e,timeMs:150000};const after=attributionRoster(m,team,editRosterOptions(later)).players;
 assert.ok(after.some(p=>p.number===18));assert.ok(!after.some(p=>p.number===10));assert.equal(stamp(m),before);
});
test('role-specific editing keeps legitimate opposite-team credits separate',()=>{
 const m=fixture(),e=addFlow(m,'turnover-won','our',100,1,{pairedTurnoverVersion:1,winningTeam:'our',losingTeam:'opposition',playerNumber:'4',turnoverWinnerNumber:'4'});
 const fields=linkedEventFields(e,m,editRosterOptions(e));const [winner,loser]=fields.split('</select>');
 assert.match(winner,/Home Person/);assert.doesNotMatch(winner,/Away Person/);assert.match(loser,/Away Person/);assert.doesNotMatch(loser,/Home Person/);
 const ko={...e,event:'our-kickout',outcome:'lost',kickoutPerspective:'our'};
 assert.match(kickoutFieldsMarkup(ko,m,editRosterOptions(ko)),/Away Person/);
 const block={...e,event:'miss',outcome:'miss',team:'opposition',missReason:'blocked'};
 assert.match(shotFieldsMarkup(block,m,{editing:true,rosterOptions:editRosterOptions(block)}),/Home Person/);
});
for(const type of ['point','our-kickout','defensive-block','interception'])test(`delete ${type}: one event removed; original identities, other events and source match remain intact`,()=>{
 const m=fixture(),e=addFlow(m,type,'our',10,1,{playerNumber:'4',outcome:type==='our-kickout'?'won':type==='point'?'scored':'',kickoutPerspective:'our'});
 addFlow(m,'point','opposition',20,1,{playerNumber:'8'});const before=stamp(m),roster=stamp(m.players),next={...m,events:eventDeletion(m,e.id)};
 assert.equal(stamp(m),before);assert.equal(next.events.length,1);assert.equal(next.events[0],m.events[1]);assert.equal(stamp(next.players),roster);
 const stats=summarize(next.events,'our');assert.equal(stats.total,0);assert.equal(stats.kickouts.total,0);assert.equal(stats.defensiveBlocks,0);assert.equal(stats.interceptions,0);
 assert.equal(fullMatchReportModel(next).stats.our.total,0);assert.equal(canonicalAnalysisStream(next).length,1);assert.ok(!timelineCSV(next).includes(e.id));
 assert.equal(playerStatistics(next,'our').reduce((n,p)=>n+p.total,0),0);assert.ok(coachingInsights(next).observations.every(o=>!o.evidenceIds.includes(e.id)));
 assert.throws(()=>eventDeletion(next,e.id),/already been removed/);
});
test('explicit score, build-up and card references block deletion without rewriting another event',()=>{
 for(const field of ['directScoreLink','buildUpLink','cardId']){const m=fixture(),e=addFlow(m,'point','our',10);addFlow(m,'interception','our',20,1,{[field]:e.id});const before=stamp(m);assert.throws(()=>eventDeletion(m,e.id),/Resolve linked events/);assert.equal(stamp(m),before);}
});
test('dependent substitution must be resolved explicitly, not silently invalidated by deletion',()=>{
 const m=fixture(),first=addFlow(m,'substitution','our',10,1,{playerOn:'18',playerOff:'10'});addFlow(m,'substitution','our',20,1,{playerOn:'10',playerOff:'18'});
 assert.throws(()=>eventDeletion(m,first.id),/Resolve dependent/);assert.equal(m.events.length,2);
});
test('discipline return linked to a card prevents unsafe card deletion',()=>{
 const m=fixture(),card=addFlow(m,'booked','our',10,1,{playerNumber:'4',card:'yellow',matchCode:'LGFA',disciplineVersion:1,sinBinDurationMs:600000});Object.assign(card,bindEventParticipants(card,m));
 addFlow(m,'discipline-return','our',700,1,{cardId:card.id});assert.throws(()=>eventDeletion(m,card.id),/Resolve linked/);
});

test('unknown historical time offers only that team’s roster without inventing eligibility or time',()=>{
 const m=fixture(),event={event:'point',team:'opposition',half:1,timeMs:null};const before=stamp(m),options=editRosterOptions(event);
 assert.equal(options.beforeEvent,null);assert.equal(options.includeInactive,true);const rows=attributionRoster(m,event.team,options).players;assert.equal(rows.length,18);assert.ok(rows.every(p=>p.name.startsWith('Away')));assert.equal(stamp(m),before);
});

test('deleting a qualifying contribution refreshes HT and FT observations without dropping unrelated evidence',()=>{
 const m=fixture();for(let i=0;i<3;i++)addFlow(m,'interception','our',10+i,1,{playerNumber:'4'});
 const id=m.events[2].id;for(const scope of ['H1','FULL_MATCH'])assert.ok(coachingInsights(m,{scope}).observations.some(o=>o.playerKey));
 const next={...m,events:eventDeletion(m,id)};for(const scope of ['H1','FULL_MATCH'])assert.ok(!coachingInsights(next,{scope}).observations.some(o=>o.playerKey));
 assert.deepEqual(next.events,m.events.slice(0,2));assert.equal(summarize(next.events,'our').interceptions,2);
});

test('deleting an entry substitution cannot leave a later shooter newly off-field via legacy replay tolerance',()=>{
 const m=fixture(),sub=addFlow(m,'substitution','our',10,1,{playerOn:'18',playerOff:'10'});const shot=addFlow(m,'point','our',20,1,{playerNumber:'18'});const before=stamp(m);
 assert.throws(()=>eventDeletion(m,sub.id),/Resolve dependent/);assert.equal(stamp(m),before);const resolved={...m,events:eventDeletion(m,shot.id)};assert.deepEqual(eventDeletion(resolved,sub.id),[]);
});

test('conflicting legacy event IDs cannot make a single deletion remove multiple records',()=>{
 const m=fixture(),e=addFlow(m,'point','our',10,1,{playerNumber:'4'});m.events.push({...e,timeMs:20000,periodElapsedMs:20000});const before=stamp(m);assert.throws(()=>eventDeletion(m,e.id),/conflicting event ID/);assert.equal(stamp(m),before);
});
