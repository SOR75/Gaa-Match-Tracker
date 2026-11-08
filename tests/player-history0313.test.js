import test from 'node:test';
import assert from 'node:assert/strict';
import {blankMatch,createEvent,saveEvent} from '../src/domain.js';
import {snapshotSquad,loadSquadPlayers} from '../src/squads.js';
import {playerReviews,hasPlayerReviewEvidence} from '../src/player-insights.js';
import {completeMatch} from '../src/history.js';
import {createHistoryRepository} from '../src/history-repository.js';
const squad=()=>snapshotSquad('Synthetic History Squad',[{name:'Same Display Name',number:6,role:'starter'},{name:'Same Display Name',number:8,role:'starter'},{name:'Bench Player',number:20,role:'substitute'}]);
function match(s,id,number=6){const m=blankMatch();m.id=id;m.setup.ourTeam='Test Home';m.setup.opposition=id;m.players=loadSquadPlayers(s);m.players[0].number=number;m.players[0].jerseyNumber=number;return m;}
function event(m,type,number='6'){m.events=saveEvent(m.events,{...createEvent(m,type,'our'),playerNumber:number},m);return m;}
const records=ms=>ms.map(m=>({id:m.id,match:m}));
for(const status of ['blank','paused-clock','running-clock','completed'])for(const current of [true,false])test(`${status} zero-event ${current?'current':'archived'} match contributes no player appearance, starts, totals or recent form`,()=>{
 const s=squad(),m=match(s,status);if(status==='paused-clock')m.clock.elapsedMs=120000;if(status==='running-clock')m.clock.startedAt=Date.now()-120000;if(status==='completed')Object.assign(m,completeMatch(m));
 const before=JSON.stringify(m);assert.equal(hasPlayerReviewEvidence(m),false);const profiles=playerReviews(current?[]:records([m]),[s],current?m:null);
 for(const p of profiles){assert.equal(p.appearances,0);assert.equal(p.starts,0);assert.equal(p.attempts,0);assert.equal(p.total,0);assert.equal(p.named,0);assert.equal(p.matches.length,0);assert.equal(p.recent.sample,0);}assert.equal(JSON.stringify(m),before);
});
test('empty newer records cannot displace genuine matches from the recent six; identities and changing jerseys survive',()=>{
 const s=squad(),real=Array.from({length:7},(_,i)=>{const m=match(s,'real-'+i,i+1);m.setup.date=`2026-10-${10+i}`;event(m,'point',String(i+1));return completeMatch(m);}),empty=Array.from({length:5},(_,i)=>{const m=match(s,'fictional-'+i);m.setup.date=`2026-11-${10+i}`;m.clock.elapsedMs=60000;return completeMatch(m);});
 const input=records([...real,...empty]),before=JSON.stringify(input),p=playerReviews(input,[s]).find(p=>p.playerId===s.players[0].playerId);
 assert.equal(p.appearances,7);assert.equal(p.starts,7);assert.equal(p.attempts,7);assert.equal(p.total,7);assert.deepEqual(p.recent,{sample:6,played:6,started:6});assert.ok(p.matches.every(m=>m.matchId.startsWith('real-')));assert.equal(new Set(p.matches.map(m=>m.jersey)).size,7);assert.equal(JSON.stringify(input),before);
});
for(const type of ['point','miss','our-kickout','interception','defensive-block','substitution','booked'])test(`one genuine ${type} preserves limited recorded activity without requiring a score`,()=>{
 const s=squad(),m=match(s,type);if(type==='substitution')m.events=saveEvent([],{...createEvent(m,type,'our'),playerOn:'20',playerOff:'6'},m);else event(m,type);
 assert.equal(hasPlayerReviewEvidence(m),true);const p=playerReviews(records([m]),[s]).find(p=>p.playerId===s.players[0].playerId);assert.equal(p.matches.length,1);assert.equal(p.appearances,1);assert.equal(p.starts,1);
});
test('roster-only unused bench is never an appearance in a genuine match',()=>{
 const s=squad(),m=completeMatch(event(match(s,'genuine'),'point')),p=playerReviews(records([m]),[s]).find(p=>p.playerId===s.players[2].playerId);assert.equal(p.appearances,0);assert.equal(p.starts,0);assert.equal(p.didNotPlay,1);
});
test('an invalid-only event ledger does not establish performance evidence',()=>{
 const s=squad(),m=match(s,'invalid');m.events=[{...createEvent(m,'substitution','our'),playerOn:'20',playerOff:'99'}];assert.equal(hasPlayerReviewEvidence(m),false);assert.ok(playerReviews(records([m]),[s]).every(p=>p.recent.sample===0));
});
test('empty current snapshot overrides a stale same-ID archive without reviving old statistics',()=>{
 const s=squad(),m=event(match(s,'same-id'),'point'),active={...m,events:[],clock:{...m.clock,elapsedMs:120000}};assert.ok(playerReviews(records([m]),[s],active).every(p=>p.matches.length===0));
});
test('removing one archived match recalculates totals without merging equal names or deleting identities',()=>{
 const s=squad(),a=event(match(s,'a'),'point'),b=event(match(s,'b',11),'goal','11');const profiles=playerReviews(records([a,b]),[s]),after=playerReviews(records([b]),[s]);assert.equal(profiles.length,3);assert.equal(profiles.filter(p=>p.name==='Same Display Name').length,2);const target=after.find(p=>p.playerId===s.players[0].playerId);assert.equal(target.appearances,1);assert.equal(target.total,3);assert.equal(target.matches[0].jersey,11);assert.equal(after.find(p=>p.playerId===s.players[1].playerId).total,0);assert.equal(s.players.length,3);
});
test('bulk deletion without durable History storage fails safely and preserves legacy bytes and squads',async()=>{
 const s=squad(),a=match(s,'a'),b=match(s,'b'),active=match(s,'active'),map=new Map([['sideline.match.archive.a',JSON.stringify(a)],['sideline.match.archive.b',JSON.stringify(b)],['sideline.match.v1',JSON.stringify(active)],['sideline.squads.v2','keep-squads'],['sideline.team-setups.v1','keep-setups']]),storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},repo=createHistoryRepository({storage,indexedDB:null}),before=[...map];
 await assert.rejects(repo.removeMany(['a','b'],active),/unavailable/);await assert.rejects(repo.removeMany(['a','active'],active),/active/);await assert.rejects(repo.removeMany([],active),/Select/);assert.deepEqual([...map],before);
});

test('an empty completed goalkeeper setup contributes no goalkeeper appearances or recent form',()=>{
 const s=snapshotSquad('Keeper Squad',[{name:'Goalkeeper',number:1,role:'starter'}]),m=match(s,'empty-keeper',1);m.clock.elapsedMs=1800000;const p=playerReviews(records([completeMatch(m)]),[s])[0];assert.equal(p.goalkeeperAppearances,0);assert.equal(p.appearances,0);assert.equal(p.starts,0);assert.equal(p.gkKickouts,0);assert.equal(p.recent.sample,0);
});
