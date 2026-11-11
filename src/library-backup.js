import {validateSavedSquadLibrary} from './squads.js';
import {validateSavedTeamSetupLibrary} from './team-setups.js';

const SQUADS = 'sideline.squads.v2', SETUPS = 'sideline.team-setups.v1';
const emptySquads = () => ({version: 2, squads: []});
const emptySetups = () => ({version: 1, setups: []});
export function validateBackupLibraries(libraries) {
  validateSavedSquadLibrary(libraries?.squads);
  validateSavedTeamSetupLibrary(libraries?.teamSetups);
  for (const s of libraries.squads.squads) {
    if (!s.id.trim() || !s.name.trim()) throw Error('Saved Squad identity or name needs review.');
  }
  return libraries;
}
export function readBackupLibraries(storage) {
  const squadRaw = storage.getItem(SQUADS), setupRaw = storage.getItem(SETUPS);
  if (squadRaw === null && storage.getItem('sideline.squads.v1') !== null)
    throw Error('This device has a legacy Saved Squad library. Open Saved Squads to complete the existing identity upgrade before making or restoring a full backup. Original data is unchanged.');
  try {
    const libraries = validateBackupLibraries({
      squads: squadRaw === null ? emptySquads() : JSON.parse(squadRaw),
      teamSetups: setupRaw === null ? emptySetups() : JSON.parse(setupRaw),
    });
    return {libraries, raw: {[SQUADS]: squadRaw, [SETUPS]: setupRaw}};
  } catch {
    throw Error('Saved Squad or Team Setup storage is invalid or unsupported. Original library data is unchanged; recover it before restoring a full backup.');
  }
}
export function libraryRestorePlan(incoming, destination) {
  if (!incoming) return null; // Old match-only backups remain usable independently.
  validateBackupLibraries(incoming);
  const existing = destination.libraries;
  const squads = incoming.squads.squads.map(record => ({record,
    reason: existing.squads.squads.some(s => s.id === record.id) ? 'Already stored — preserved' : '',
    sameName: existing.squads.squads.some(s => s.id !== record.id && s.name === record.name),
  }));
  const available = new Map(existing.squads.squads.map(s => [s.id, s]));
  for (const {record, reason} of squads) if (!reason) available.set(record.id, record);
  const setups = incoming.teamSetups.setups.map(record => {
    const squad = available.get(record.squadId);
    return {record,
      reason: existing.teamSetups.setups.some(s => s.id === record.id) ? 'Already stored — preserved'
        : !squad ? 'Original Saved Squad unavailable — skipped'
        : record.players.some(p => !squad.players.some(q => q.playerId === p.playerId)) ? 'Original player IDs unavailable in Saved Squad — skipped' : '',
      sameName: existing.teamSetups.setups.some(s => s.id !== record.id && s.name === record.name),
    };
  });
  return {squads, setups, destination};
}
// Each localStorage write is atomic, but it cannot share an IDB transaction.
// Rollback only our own appended library payload; never overwrite another edit.
export function writeLibraryAdditions(plan, storage) {
  if (!plan) return () => '';
  const writes = [], state = plan.destination;
  const additions = [[SQUADS, 'squads', plan.squads], [SETUPS, 'setups', plan.setups]];
  for (const [key, field, rows] of additions) {
    const extra = rows.filter(p => !p.reason).map(p => p.record);
    if (!extra.length) continue;
    const base = key === SQUADS ? state.libraries.squads : state.libraries.teamSetups;
    writes.push({key, before: state.raw[key], after: JSON.stringify({...base, [field]: [...base[field], ...extra]})});
  }
  const applied = [];
  const rollback = () => {
    let incomplete = false;
    for (const write of [...applied].reverse()) {
      try {
        const current = storage.getItem(write.key);
        if (current === write.before) continue;
        if (current !== write.after) { incomplete = true; continue; }
        if (write.before === null) storage.removeItem(write.key);
        else storage.setItem(write.key, write.before);
      } catch { incomplete = true; }
    }
    return incomplete ? ' Some added library records may remain because rollback was blocked or another tab changed the library. Do not clear data; check the libraries and retry the backup.' : '';
  };
  try {
    for (const write of writes) {
      if (storage.getItem(write.key) !== write.before) throw Error('A Saved Squad or Team Setup changed during restore. Retry after closing other Sideline tabs.');
      storage.setItem(write.key, write.after);
      applied.push(write);
    }
  } catch (e) { throw Error(`${e.message}${rollback()}`); }
  return rollback;
}
