import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankMatch,createEvent,saveEvent,validMatch,migrateMatch,totals} from '../src/domain.js';
import {withBlankMatchPlayers,acceptedEnrichment} from '../src/match-squad-enrichment.js';
import {participantRef,resolveParticipant} from '../src/identity.js';
import {attributionRoster} from '../src/player-credit.js';
import {onFieldPlayers} from '../src/participation.js';
import {summarize,playerStatistics} from '../src/analysis.js';
import {goalkeeperStatistics} from '../src/goalkeepers.js';
import {persistMatch,loadMatch} from '../src/storage.js';
const make=()=>withBlankMatchPlayers(blankMatch());
for(const code of ['GAA','LGFA'])test(`${code} match code and factual booking retain their stable participant through persistence`,()=>{
 const m=make();m.setup.matchCode=code;
 m.events=saveEvent(m.events,{...createEvent(m,'booked','opposition'),playerNumber:'8'},m);
 assert.equal(m.events[0].matchCode,code);assert.equal(participantRef(m.events[0]).matchPlayerId,m.oppositionPlayers[7].id);
 const previous=globalThis.localStorage,store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 try{assert.equal(persistMatch(m),'');assert.deepEqual(loadMatch().match,m);}finally{globalThis.localStorage=previous;}
});
test('legacy missing code remains absent, with no inferred code or migration',()=>{
 const m=blankMatch();delete m.setup.matchCode;const before=JSON.stringify(m);
 assert.ok(validMatch(m));assert.equal(JSON.stringify(migrateMatch(m)),before);
 assert.equal(createEvent(m,'booked','our').matchCode,null);
});
test('booking a blank numbered player enriches the original ID without rewriting the event',()=>{
 const m=make();m.events=saveEvent([],{...createEvent(m,'booked','our'),playerNumber:'8'},m);const before=JSON.stringify(m.events),id=m.players[7].id;
 m.players=acceptedEnrichment(m.players,[{number:8,name:'Named Eight',role:'starter'}],{live:true});
 assert.equal(JSON.stringify(m.events),before);assert.equal(participantRef(m.events[0]).matchPlayerId,id);assert.equal(resolveParticipant(m,m.events[0]).name,'Named Eight');
});
test('booking does not affect scores, shot/possession/turnover/kickout statistics, goalkeeper statistics or Active XV',()=>{
 const m=make();m.events=saveEvent([],{...createEvent(m,'point','our'),playerNumber:'6'},m);
 const score=totals(m.events,'our'),summary=summarize(m.events,'our'),players=playerStatistics(m,'our'),keepers=goalkeeperStatistics(m),active=onFieldPlayers(m,'our');
 m.events=saveEvent(m.events,{...createEvent(m,'booked','our'),playerNumber:'8'},m);
 assert.deepEqual(totals(m.events,'our'),score);assert.deepEqual(summarize(m.events,'our'),summary);assert.deepEqual(playerStatistics(m,'our'),players);assert.deepEqual(goalkeeperStatistics(m),keepers);assert.deepEqual(onFieldPlayers(m,'our'),active);
});
test('bookings require a player and preserve match code at recording even if setup later changes',()=>{
 const m=make();m.setup.matchCode='GAA';assert.throws(()=>saveEvent([],createEvent(m,'booked','our'),m),/Choose the player/);
 m.events=saveEvent([],{...createEvent(m,'booked','our'),playerNumber:'8'},m);m.setup.matchCode='LGFA';assert.equal(m.events[0].matchCode,'GAA');
});
test('shared Active XV for each selected team excludes off players and includes substituted bench identities',()=>{
 const m=make();m.events=saveEvent([],{...createEvent(m,'substitution','opposition'),playerOn:'18',playerOff:'8'},m);
 assert.equal(attributionRoster(m,'opposition').players.some(p=>p.number===8),false);assert.equal(attributionRoster(m,'opposition').players.some(p=>p.number===18),true);assert.equal(attributionRoster(m,'our').players.some(p=>p.number===8),true);
});
