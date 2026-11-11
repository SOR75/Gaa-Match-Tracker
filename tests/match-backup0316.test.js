import test from 'node:test';
import assert from 'node:assert/strict';
import {blankMatch, createEvent} from '../src/domain.js';
import {createSquadPlayer, createMatchPlayer} from '../src/identity.js';
import {makeBackup, parseBackup, validateBackup, restorePlan, MAX_BACKUP_BYTES} from '../src/match-backup.js';
import {createHistoryRepository} from '../src/history-repository.js';
const date = '2026-11-11T12:00:00.000Z';
function fixture(id = 'synthetic-backup-match') {
  const m = blankMatch(); m.id = id;
  m.setup.ourTeam = 'Synthetic Rovers'; m.setup.opposition = 'Synthetic United';
  m.players = [createMatchPlayer({...createSquadPlayer({name: 'Áine Ní Bhraonáin', number: 8, role: 'starter'}), id: undefined})];
  m.events = [{...createEvent(m, 'point', 'our'), id: 'synthetic-score', playerNumber: '8', extraRecordedMetadata: {legacyUnknown: null, unicode: '✓ Éire'}}];
  return m;
}
const backup = (m = fixture()) => makeBackup([{id: m.id, match: m, archivedAt: date}], date);
test('backup JSON preserves original ledger, identities, Unicode, unknown metadata and clock without mutating source', () => {
  const m = fixture(), before = structuredClone(m);
  const out = parseBackup(JSON.stringify(backup(m)));
  assert.deepEqual(out.matches[0].match, m); assert.deepEqual(m, before);
  assert.equal(out.matches[0].match.players[0].playerId, m.players[0].playerId);
  out.matches[0].match.events[0].outcome = 'changed'; assert.deepEqual(m, before);
});
test('legacy schema one remains schema one in backup, without invented modern fields or identity', () => {
  const m = fixture(); m.schemaVersion = 1; delete m.oppositionPlayers;
  delete m.players[0].playerId;
  const out = parseBackup(JSON.stringify(backup(m)));
  assert.deepEqual(out.matches[0].match, m); assert.equal(out.matches[0].match.schemaVersion, 1);
});
for (const version of [0, 3, '1', null]) test(`unsupported backup version ${version} rejected`, () => {
  const b = backup(); b.version = version; assert.throws(() => validateBackup(b), /Unsupported/);
});
test('wrong format, malformed JSON, empty and excessive match collections are rejected', () => {
  assert.throws(() => parseBackup('{'), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify(fixture())), /Unsupported/);
  const b = backup(); b.matches = []; assert.throws(() => validateBackup(b), /count/);
  b.matches = Array(2001).fill(backup().matches[0]); assert.throws(() => validateBackup(b), /count/);
});
test('size limit checked before JSON parsing', () => assert.throws(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /25 MB/));
test('a single invalid match rejects the entire backup', () => {
  const b = backup(); const m = fixture('broken'); m.events[0].timeMs = -1;
  b.matches.push({id: m.id, match: m}); assert.throws(() => validateBackup(b), /invalid/);
});
test('future match schema, mismatched IDs and duplicate match IDs are rejected', () => {
  let b = backup(); b.matches[0].match.schemaVersion = 999; assert.throws(() => validateBackup(b), /invalid/);
  b = backup(); b.matches[0].id = 'other'; assert.throws(() => validateBackup(b), /invalid/);
  b = backup(); b.matches.push(structuredClone(b.matches[0])); assert.throws(() => validateBackup(b), /Duplicate match/);
});
test('empty and duplicate event IDs are rejected rather than repaired', () => {
  let b = backup(); b.matches[0].match.events[0].id = ''; assert.throws(() => validateBackup(b), /invalid/);
  b = backup(); b.matches[0].match.events.push(structuredClone(b.matches[0].match.events[0])); assert.throws(() => validateBackup(b), /invalid/);
});
test('invalid envelope or archive dates rejected, unknown historical dates may remain absent', () => {
  let b = backup(); b.exportedAt = 'unknown'; assert.throws(() => validateBackup(b), /Invalid/);
  b = backup(); b.matches[0].archivedAt = 'yesterday'; assert.throws(() => validateBackup(b), /invalid/);
  b = backup(); delete b.matches[0].archivedAt; assert.equal(validateBackup(b).matches[0].archivedAt, undefined);
});
test('restore plan protects active, duplicate and tombstoned IDs independently of names or jersey numbers', () => {
  const matches = ['active', 'existing', 'deleted', 'new'].map(id => ({id, match: fixture(id)}));
  const b = makeBackup(matches, date), before = structuredClone(b);
  const plan = restorePlan(b, {activeId: 'active', existingIds: new Set(['existing','deleted']), deletedIds: new Set(['deleted'])});
  assert.deepEqual(plan.map(p => !!p.reason), [true,true,true,false]); assert.deepEqual(b, before);
});
test('changing jersey numbers never changes permanent identity in backup', () => {
  const a = fixture('one'), b = structuredClone(a); b.id = 'two'; b.players[0].number = 11; b.players[0].jerseyNumber = 11;
  const out = parseBackup(JSON.stringify(makeBackup([a,b].map(m => ({id:m.id,match:m})),date)));
  assert.equal(out.matches[0].match.players[0].playerId, out.matches[1].match.players[0].playerId);
  assert.deepEqual(out.matches.map(r => r.match.players[0].number), [8,11]);
});
test('unavailable repository storage fails backup/preview/restore without changing local records', async () => {
  const values = new Map([['sideline.match.v1',JSON.stringify(fixture())],['sideline.squads.v2','preserve']]);
  const s = {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem(){throw Error('unexpected write');},removeItem(){throw Error('unexpected delete');}};
  const repo = createHistoryRepository({storage:s,indexedDB:undefined}), before = [...values];
  await assert.rejects(repo.exportBackup(fixture()),/IndexedDB/);
  await assert.rejects(repo.previewRestore(backup(),fixture()),/IndexedDB/);
  await assert.rejects(repo.restoreBackup(backup(),fixture()),/IndexedDB/);
  assert.deepEqual([...values],before);
});
