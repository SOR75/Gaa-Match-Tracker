import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankMatch,createEvent,saveEvent,validMatch,migrateMatch} from '../src/domain.js';
import {withBlankMatchPlayers,withNumberedEventPlayers,acceptedEnrichment,planSquadEnrichment,compatibleNameExtension,importStarterWarning,retainLiveRoster} from '../src/match-squad-enrichment.js';
import {participantRef,resolveParticipant,createMatchPlayer,createSquadPlayer} from '../src/identity.js';
import {onFieldPlayers} from '../src/participation.js';
import {playerStatistics} from '../src/analysis.js';
import {playerReviews} from '../src/player-insights.js';
import {parseTablePlayers,parseTextPlayers} from '../src/import-parser.js';
import {validatePlayers,snapshotSquad} from '../src/squads.js';
import {loadMatch} from '../src/storage.js';
import {applyMatchLineup} from '../src/match-lineup.js';
const make=()=>withBlankMatchPlayers(blankMatch());
function add(m,type,fields={},team='our'){
 const e={...createEvent(m,type,team),...fields},prepared=withNumberedEventPlayers(m,e);
 const saved=saveEvent(m.events,e,prepared);m.players=prepared.players;m.oppositionPlayers=prepared.oppositionPlayers;m.events=saved;return m.events.at(-1);
}
const candidates=(count=29)=>Array.from({length:count},(_,i)=>({number:i+1,name:`Player Name ${i+1}`,role:i<15?'starter':'substitute',position:''}));
const apply=(m,rows,team='our',options={})=>m[team==='our'?'players':'oppositionPlayers']=acceptedEnrichment(m[team==='our'?'players':'oppositionPlayers'],validatePlayers(rows),{live:Boolean(m.events.length||m.clock.elapsedMs||m.clock.startedAt!==null),...options});
test('new user match gets two independent sets of 23 stable match IDs, not permanent squad IDs',()=>{
 const m=make();for(const team of ['our','opposition']){
  const roster=team==='our'?m.players:m.oppositionPlayers;assert.equal(roster.length,23);assert.deepEqual(roster.map(p=>p.number),Array.from({length:23},(_,i)=>i+1));assert.equal(roster.filter(p=>p.role==='starter').length,15);assert.equal(roster.filter(p=>p.role==='substitute').length,8);assert.ok(roster.every(p=>p.matchPlayerId===p.id&&!p.playerId&&!p.name));assert.equal(onFieldPlayers(m,team).length,15);
 }assert.equal(new Set([...m.players,...m.oppositionPlayers].map(p=>p.id)).size,46);assert.ok(validMatch(m));assert.deepEqual(migrateMatch(m),m);
});
test('initialization refuses to replace a nonempty roster or running match',()=>{
 assert.throws(()=>withBlankMatchPlayers(make()),/new empty match/);const m=blankMatch();m.clock.startedAt=1;assert.throws(()=>withBlankMatchPlayers(m));
});
test('old stored matches load unchanged without placeholder migration, identity repair or archive edits',()=>{
 const old=blankMatch();old.setup.ourTeam='Legacy';const raw=JSON.stringify(old);const storage=new Map([['sideline.match.v1',raw],['sideline.match.archive.keep','preserved']]);
 const previous=globalThis.localStorage;globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 try{assert.deepEqual(loadMatch().match,old);assert.equal(storage.get('sideline.match.v1'),raw);assert.equal(storage.get('sideline.match.archive.keep'),'preserved');assert.equal(loadMatch().match.players.length,0);}finally{globalThis.localStorage=previous;}
});
test('every player role recorded before names binds to the real numbered match identity',()=>{
 const m=make(),six=m.players[5].id,eight=m.players[7].id;
 const turnover=add(m,'turnover-won',{pairedTurnoverVersion:1,turnoverWinnerNumber:'6',turnoverLoserNumber:''});
 const block=add(m,'defensive-block',{playerNumber:'6'}),pass=add(m,'pass',{playerNumber:'6',receiverNumber:'8',passType:'kick'}),ko=add(m,'our-kickout',{outcome:'won',kickoutWinnerNumber:'8'}),shot=add(m,'point',{playerNumber:'11'});
 assert.equal(participantRef(turnover,'turnoverWinner').matchPlayerId,six);assert.equal(participantRef(block).matchPlayerId,six);assert.equal(participantRef(pass).matchPlayerId,six);assert.equal(participantRef(pass,'receiver').matchPlayerId,eight);assert.equal(participantRef(ko,'kickoutWinner').matchPlayerId,eight);assert.equal(participantRef(shot).matchPlayerId,m.players[10].id);
});
for(const team of ['our','opposition'])test(`${team}: substitution before 29-player import stays authoritative, with no event or identity rewriting`,()=>{
 const m=make(),field=team==='our'?'players':'oppositionPlayers',ids=m[field].map(p=>p.id);add(m,'point',{playerNumber:'6'},team);add(m,'substitution',{playerOn:'18',playerOff:'6'},team);const raw=JSON.stringify(m.events);
 apply(m,candidates(),team);assert.equal(m[field].length,29);assert.deepEqual(m[field].slice(0,23).map(p=>p.id),ids);assert.equal(new Set(m[field].map(p=>p.id)).size,29);assert.equal(m[field].filter(p=>p.role==='starter').length,15);assert.ok(onFieldPlayers(m,team).some(p=>p.number===18));assert.ok(!onFieldPlayers(m,team).some(p=>p.number===6));assert.equal(JSON.stringify(m.events),raw);assert.equal(resolveParticipant(m,m.events[0]).name,'Player Name 6');
});
test('three pre-name actions plus two later actions stay on one stats row and one match-local Player Review entry',()=>{
 const m=make();m.setup.ourTeam='Home';m.setup.opposition='Away';const id=m.players[5].id;
 add(m,'turnover-won',{pairedTurnoverVersion:1,turnoverWinnerNumber:'6',turnoverLoserNumber:''});add(m,'defensive-block',{playerNumber:'6'});add(m,'pass',{playerNumber:'6',receiverNumber:'8',passType:'hand'});
 const before=JSON.stringify(m.events);apply(m,[{number:6,name:'Cathal Murphy',role:'starter'}]);assert.equal(JSON.stringify(m.events),before);
 add(m,'point',{playerNumber:'6'});add(m,'pass',{playerNumber:'6',receiverNumber:'8',passType:'kick'});
 const rows=playerStatistics(m,'our').filter(p=>p.matchPlayerId===id);assert.equal(rows.length,1);assert.equal(rows[0].name,'Cathal Murphy');assert.equal(rows[0].turnoversWon,1);assert.equal(rows[0].defensiveBlocks,1);assert.equal(rows[0].passes,2);assert.equal(rows[0].total,1);
 const profiles=playerReviews([],[],m).filter(p=>p.profileKey===`match:${m.id}:${id}`);assert.equal(profiles.length,1);assert.equal(profiles[0].name,'Cathal Murphy');assert.equal(profiles[0].recordedEvents,5);assert.equal(profiles[0].playerId,null);assert.equal(profiles[0].unlinked,true);
});
for(const [partial,full,n] of [['Oran','Oran Murphy',20],['Sean M','Sean McCarthy',25]])test(`${partial} safely extends to ${full} without splitting the existing match identity`,()=>{
 const m=make();if(n===25)add(m,'pass',{playerNumber:'25',receiverNumber:'8',passType:'kick'});
 apply(m,[{number:n,name:partial,role:'substitute'}],'our',{mode:'manual'});const old=m.players.find(p=>p.number===n),id=old.id;
 add(m,'pass',{playerNumber:String(n),receiverNumber:'8',passType:'kick'});const before=JSON.stringify(m.events);
 apply(m,[{number:n,name:full,role:'starter'}]);const now=m.players.filter(p=>p.number===n);assert.equal(now.length,1);assert.equal(now[0].id,id);assert.equal(now[0].name,full);assert.equal(now[0].role,'substitute');assert.equal(JSON.stringify(m.events),before);
});
test('full-name conflicts require explicit review, and skipping preserves every existing byte',()=>{
 const m=make();apply(m,[{number:6,name:'John Ryan',role:'starter'}],'our',{mode:'manual'});const before=JSON.stringify(m.players),incoming=[{number:6,name:'Cathal Murphy',role:'starter'}];
 const plan=planSquadEnrichment(m.players,incoming,{live:true});assert.equal(plan.conflicts.length,1);assert.throws(()=>acceptedEnrichment(m.players,incoming,{live:true}),/Review identity/);assert.equal(JSON.stringify(m.players),before);
 assert.equal(JSON.stringify(acceptedEnrichment(m.players,incoming,{live:true,decisions:{0:'skip'}})),before);
 const corrected=acceptedEnrichment(m.players,incoming,{live:true,decisions:{0:'same'}});assert.equal(corrected[5].id,m.players[5].id);assert.equal(corrected[5].name,'Cathal Murphy');
});
test('permanent IDs are retained, and a different permanent ID cannot be adopted because a jersey matches',()=>{
 const m=make(),person=createSquadPlayer({name:'Oran',number:6,role:'starter'});m.players[5]={...m.players[5],playerId:person.playerId,name:'Oran'};
 apply(m,[{number:6,name:'Oran Murphy',role:'starter'}]);assert.equal(m.players[5].playerId,person.playerId);
 assert.throws(()=>acceptedEnrichment(m.players,[{number:6,name:'Oran Murphy',playerId:createSquadPlayer({name:'Other'}).playerId}],{decisions:{0:'same'}}),/Permanent player IDs conflict/);
});
test('repeat import is identity-idempotent and capacity is checked on merged players, not old plus imported duplicates',()=>{
 const m=make();apply(m,candidates());const ids=m.players.map(p=>p.id);apply(m,candidates());assert.equal(m.players.length,29);assert.deepEqual(m.players.map(p=>p.id),ids);assert.equal(new Set(m.players.map(p=>p.number)).size,29);
});
test('duplicate jerseys/IDs and existing conflicting identities are detected rather than repaired silently',()=>{
 const m=make();assert.throws(()=>acceptedEnrichment(m.players,[{number:6,name:'A Person'},{number:6,name:'B Person'}]),/Duplicate imported jersey/);
 const old=[...m.players,{...m.players[5]}];const before=JSON.stringify(old);const plan=planSquadEnrichment(old,[{number:6,name:'A Person'}]);assert.ok(plan.warnings.some(w=>w.includes('duplicate match-player')));assert.equal(plan.conflicts.length,1);assert.equal(JSON.stringify(old),before);
});
test('same name at another jersey is a review case, never an automatic cross-player link',()=>{
 const m=make();apply(m,[{number:8,name:'Cathal Murphy',role:'starter'}],'our',{mode:'manual'});
 assert.throws(()=>acceptedEnrichment(m.players,[{number:6,name:'Cathal Murphy'}]),/another match identity/);
});
test('conservative name matching accepts initials but rejects different surnames and speculative prefix matches',()=>{
 assert.equal(compatibleNameExtension('Sean M','Sean McCarthy'),true);assert.equal(compatibleNameExtension('Sean Mc','Sean McCarthy'),false);assert.equal(compatibleNameExtension('John Ryan','John Ryder'),false);assert.equal(compatibleNameExtension('Maire','Máire Ryan'),false);
});
test('a 29-row conventional table yields fifteen starters and fourteen subs; explicit nonstandard starters remain possible',()=>{
 const rows=[['Jersey','Player Name'],...candidates().map(p=>[p.number,p.name])],parsed=parseTablePlayers(rows);assert.equal(parsed.length,29);assert.equal(parsed.filter(p=>p.role==='starter').length,15);assert.equal(parsed.filter(p=>p.role==='substitute').length,14);
 const order=[1,2,3,4,5,22,7,8,9,10,11,12,13,14,15,6,16,17,18,19,20,21,23];const custom=parseTablePlayers([['Jersey','Player Name'],...order.map(n=>[n,`Player Name ${n}`])]);assert.equal(custom.find(p=>+p.number===22).role,'starter');assert.equal(custom.find(p=>+p.number===6).role,'substitute');
});
test('Starting XV heading does not mark subsequent numbered list entries as 29 starters',()=>{
 const p=parseTextPlayers('Starting XV\n'+candidates().map((p,i)=>`${p.number} Áine ${String.fromCharCode(65+i%26)}son`).join('\n'));assert.equal(p.filter(p=>p.role==='starter').length,15);assert.equal(p.filter(p=>p.role==='substitute').length,14);
});
test('explicit malformed 29 starters are warned, not silently reclassified or hard-blocked; 14 remains 14',()=>{
 const bad=parseTablePlayers([['Jersey','Player Name','Role'],...candidates().map(p=>[p.number,p.name,'starter'])]);assert.equal(bad.filter(p=>p.role==='starter').length,29);assert.equal(importStarterWarning(bad).count,29);assert.equal(importStarterWarning(candidates(14)).count,14);assert.equal(importStarterWarning(candidates()),null);
});
test('missing starter import never invents a name; the original blank slot is bench pending coach review',()=>{
 const m=make(),rows=candidates(15).filter(p=>p.number!==1);assert.equal(rows.length,14);apply(m,rows);assert.equal(m.players.filter(p=>p.name).length,14);assert.equal(m.players.find(p=>p.number===1).name,'');assert.equal(m.players.filter(p=>p.role==='starter').length,14);
});
test('Other number creates a real match ID for new-match references only; existing legacy records are not rebound',()=>{
 const m=make();const first=add(m,'substitution',{playerOn:'25',playerOff:'6'});const id=participantRef(first,'playerOn').matchPlayerId;
 add(m,'pass',{playerNumber:'25',receiverNumber:'8',passType:'kick'});assert.equal(m.players.find(p=>p.number===25).id,id);assert.equal(participantRef(m.events[1]).matchPlayerId,id);assert.ok(onFieldPlayers(m,'our').some(p=>p.number===25));
 const old=blankMatch(),e={...createEvent(old,'pass','our'),playerNumber:'25',receiverNumber:'6',passType:'kick'};assert.equal(withNumberedEventPlayers(old,e),old);assert.equal(old.players.length,0);
});
test('blank slots can be adjusted in Today’s Team but cannot accidentally become permanent unnamed squad members',()=>{
 const m=make();const changed=applyMatchLineup(m.players,m.players.map(p=>({id:p.id,number:p.number,role:p.number===22?'starter':p.number===6?'substitute':p.role})));assert.equal(changed[21].id,m.players[21].id);assert.equal(changed[21].role,'starter');assert.throws(()=>snapshotSquad('Unnamed',m.players),/enter a name/);
});
test('live Saved Squad/Team Setup loading uses explicit IDs, preserves live roles/jerseys and never matches by number/name',()=>{
 const m=make();const same=m.players.map(p=>({...p,role:'substitute',number:null}));const held=retainLiveRoster(m.players,same,true);assert.deepEqual(held.map(p=>[p.id,p.number,p.role]),m.players.map(p=>[p.id,p.number,p.role]));const next=createMatchPlayer({...createSquadPlayer({name:'Saved Person',number:6}),id:undefined});const loaded=retainLiveRoster(m.players,[next],true);assert.equal(loaded.length,24);assert.equal(loaded.at(-1).number,null);assert.equal(loaded.at(-1).role,'panel');assert.equal(loaded[5].playerId,null);
});
test('same jersey and name in separate new matches never become a permanent or cross-match profile',()=>{
 const first=make(),second=make();
 for(const m of [first,second]){add(m,'defensive-block',{playerNumber:'6'});apply(m,[{number:6,name:'Cathal Murphy',role:'starter'}]);}
 const reviews=playerReviews([{match:first},{match:second}]);
 const profiles=reviews.filter(p=>p.name==='Cathal Murphy');
 assert.equal(profiles.length,2);assert.equal(new Set(profiles.map(p=>p.profileKey)).size,2);
 assert.ok(profiles.every(p=>p.playerId===null&&p.unlinked&&p.recordedEvents===1&&p.matches.length===1));
});
test('live enrichment may fill an empty source position but never replaces an existing match position or role',()=>{
 const m=make();add(m,'defensive-block',{playerNumber:'6'});m.players[6].position='Coach assigned';
 apply(m,[{number:6,name:'Cathal Murphy',role:'substitute',position:'Centre Half Back'},{number:7,name:'Holly Quinn',role:'substitute',position:'Left Half Back'}]);
 assert.equal(m.players[5].position,'Centre Half Back');assert.equal(m.players[6].position,'Coach assigned');assert.equal(m.players[5].role,'starter');assert.equal(m.players[6].role,'starter');
});
test('explicit manual new-player role is respected, while imported new players cannot silently enter a live XV',()=>{
 const m=make();add(m,'point',{playerNumber:'11'});
 const incoming=[{number:25,name:'Oran Murphy',role:'starter'}];
 assert.equal(acceptedEnrichment(m.players,incoming,{live:true,mode:'manual'}).at(-1).role,'starter');
 assert.equal(acceptedEnrichment(m.players,incoming,{live:true}).at(-1).role,'substitute');
});
