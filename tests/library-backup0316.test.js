import test from 'node:test';
import assert from 'node:assert/strict';
import {history0313} from './helpers/history0313.js';
import {uid} from '../src/ids.js';
import {blankMatch} from '../src/domain.js';
import {makeBackup, parseBackup} from '../src/match-backup.js';
import {validateBackupLibraries, readBackupLibraries, libraryRestorePlan, writeLibraryAdditions} from '../src/library-backup.js';
const S='sideline.squads.v2',T='sideline.team-setups.v1';
function source() {const d=history0313();return {squads:{version:2,squads:[d.squad]},teamSetups:{version:1,setups:[d.setup]}};}
function store(entries={}) {
 const map=new Map(Object.entries(entries));return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
const empty=()=>readBackupLibraries(store());
test('full backup round trip retains squads, setups, metadata and original UUID references exactly',()=>{
 const lib=source();lib.squads.squads[0].clubId=uid();lib.squads.squads[0].seasonId=uid();lib.squads.squads[0].clubName='Éire Óg';lib.squads.squads[0].extraOriginalField={unknown:null};
 const before=structuredClone(lib),m=blankMatch(),b=makeBackup([{id:m.id,match:m}],undefined,lib),out=parseBackup(JSON.stringify(b));
 assert.equal(out.version,2);assert.deepEqual(out.libraries,lib);assert.deepEqual(lib,before);
 assert.equal(out.libraries.teamSetups.setups[0].players[0].playerId,lib.squads.squads[0].players[0].playerId);
});
test('match-only version one remains valid and has no library additions',()=>{
 const m=blankMatch(),b=makeBackup([{id:m.id,match:m}]);assert.equal(parseBackup(JSON.stringify(b)).version,1);assert.equal(libraryRestorePlan(undefined,empty()),null);
 b.libraries=source();assert.throws(()=>parseBackup(JSON.stringify(b)),/version 2/);
});
test('library reads do not migrate, rename, generate identity or write data',()=>{
 const lib=source(),s=store({[S]:JSON.stringify(lib.squads),[T]:JSON.stringify(lib.teamSetups),'sideline.match.v1':'untouched'}),before=[...s.map];
 assert.deepEqual(readBackupLibraries(s).libraries,lib);assert.deepEqual([...s.map],before);
});
test('legacy-only Saved Squad library requires explicit existing upgrade rather than generating IDs in backup',()=>{
 const s=store({'sideline.squads.v1':'{"version":1,"squads":[]}'}),before=[...s.map];assert.throws(()=>readBackupLibraries(s),/legacy/);assert.deepEqual([...s.map],before);
});
for(const invalid of ['bad-json','future-squads','future-setups','bad-player-id','duplicate-squad','duplicate-player','duplicate-setup','duplicate-jersey','bad-role'])test(`reject ${invalid} library without repair`,()=>{
 const lib=source();
 if(invalid==='bad-json'){const s=store({[S]:'{'});assert.throws(()=>readBackupLibraries(s),/invalid/);assert.equal(s.getItem(S),'{');return;}
 if(invalid==='future-squads')lib.squads.version=3;
 if(invalid==='future-setups')lib.teamSetups.version=2;
 if(invalid==='bad-player-id')lib.squads.squads[0].players[0].playerId='not-a-uuid';
 if(invalid==='duplicate-squad')lib.squads.squads.push(lib.squads.squads[0]);
 if(invalid==='duplicate-player')lib.squads.squads[0].players.push(lib.squads.squads[0].players[0]);
 if(invalid==='duplicate-setup')lib.teamSetups.setups.push(lib.teamSetups.setups[0]);
 if(invalid==='duplicate-jersey')lib.teamSetups.setups[0].players[1].number=lib.teamSetups.setups[0].players[0].number;
 if(invalid==='bad-role')lib.teamSetups.setups[0].players[0].role='invented';
 const before=JSON.stringify(lib);assert.throws(()=>validateBackupLibraries(lib));assert.equal(JSON.stringify(lib),before);
 const m=blankMatch();assert.throws(()=>makeBackup([{id:m.id,match:m}],undefined,lib),/invalid/);
});
test('existing IDs are skipped even when source names and player defaults differ',()=>{
 const lib=source(),s=store({[S]:JSON.stringify(lib.squads),[T]:JSON.stringify(lib.teamSetups)}),incoming=structuredClone(lib);incoming.squads.squads[0].name='different';incoming.squads.squads[0].players[0].number=99;incoming.teamSetups.setups[0].name='different setup';
 const p=libraryRestorePlan(incoming,readBackupLibraries(s));assert.ok(p.squads.every(r=>r.reason));assert.ok(p.setups.every(r=>r.reason));const before=[...s.map];writeLibraryAdditions(p,s);assert.deepEqual([...s.map],before);
});
test('same-name records with distinct UUIDs stay separate and are flagged for review',()=>{
 const lib=source(),incoming=structuredClone(lib);incoming.squads.squads[0].id=uid();incoming.teamSetups.setups[0].id=uid();incoming.teamSetups.setups[0].squadId=incoming.squads.squads[0].id;
 const s=store({[S]:JSON.stringify(lib.squads),[T]:JSON.stringify(lib.teamSetups)}),p=libraryRestorePlan(incoming,readBackupLibraries(s));
 assert.equal(p.squads[0].reason,'');assert.equal(p.squads[0].sameName,true);assert.equal(p.setups[0].sameName,true);writeLibraryAdditions(p,s);
 assert.equal(JSON.parse(s.getItem(S)).squads.length,2);assert.equal(JSON.parse(s.getItem(T)).setups.length,2);
});
test('orphaned setup is skipped, never attached to a similarly named or unrelated squad',()=>{
 const lib=source();lib.teamSetups.setups[0].squadId='missing-original-id';const p=libraryRestorePlan(lib,empty());assert.match(p.setups[0].reason,/Squad unavailable/);assert.equal(p.squads[0].reason,'');
});
test('setup cannot add missing players into an existing same-ID squad',()=>{
 const lib=source(),old=structuredClone(lib.squads);old.squads[0].players=[];const p=libraryRestorePlan(lib,readBackupLibraries(store({[S]:JSON.stringify(old)})));
 assert.match(p.setups[0].reason,/player IDs unavailable/);assert.ok(p.squads[0].reason);
});
test('successful library append keeps all original fields and returns exact rollback',()=>{
 const lib=source(),old={version:2,squads:[],extraRoot:'kept'},s=store({[S]:JSON.stringify(old),'sideline.match.v1':'current','sideline.squads.v1':'old recovery bytes'}),before=[...s.map];
 const undo=writeLibraryAdditions(libraryRestorePlan(lib,readBackupLibraries(s)),s);assert.equal(JSON.parse(s.getItem(S)).extraRoot,'kept');assert.deepEqual(JSON.parse(s.getItem(S)).squads,lib.squads.squads);assert.deepEqual(JSON.parse(s.getItem(T)).setups,lib.teamSetups.setups);assert.equal(undo(),'');assert.deepEqual([...s.map],before);
});
test('failure on second key rolls back first key without changing matches or existing libraries',()=>{
 const s=store({'sideline.match.v1':'current'}),before=[...s.map],set=s.setItem;s.setItem=(k,v)=>{if(k===T)throw Error('quota');return set(k,v);};
 assert.throws(()=>writeLibraryAdditions(libraryRestorePlan(source(),readBackupLibraries(s)),s),/quota/);assert.deepEqual([...s.map],before);
});
test('stale library write rejected if another tab changed the key',()=>{
 const s=store(),p=libraryRestorePlan(source(),readBackupLibraries(s));s.setItem(S,'new library from another tab');assert.throws(()=>writeLibraryAdditions(p,s),/changed during restore/);assert.equal(s.getItem(S),'new library from another tab');assert.equal(s.getItem(T),null);
});
test('rollback never overwrites a later external edit and reports incomplete recovery',()=>{
 const s=store(),undo=writeLibraryAdditions(libraryRestorePlan(source(),readBackupLibraries(s)),s);s.setItem(S,'later edit');assert.match(undo(),/Some added library records may remain/);assert.equal(s.getItem(S),'later edit');assert.equal(s.getItem(T),null);
});
test('rollback storage failure is reported rather than claiming all libraries were restored',()=>{
 const s=store(),undo=writeLibraryAdditions(libraryRestorePlan(source(),readBackupLibraries(s)),s);s.removeItem=()=>{throw Error('blocked');};assert.match(undo(),/rollback was blocked/);assert.ok(s.getItem(S));
});
