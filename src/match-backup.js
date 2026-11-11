import {validMatch} from './domain.js';
import {validateBackupLibraries} from './library-backup.js';

export const BACKUP_FORMAT = 'sideline.match-backup';
export const BACKUP_VERSION = 2;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
export const MAX_BACKUP_MATCHES = 2000;
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

// Validation never migrates a match, fills missing fields, or creates identities.
export function validateBackup(value) {
  if (value?.format !== BACKUP_FORMAT || ![1, BACKUP_VERSION].includes(value.version))
    throw Error('Unsupported backup format or version. No matches were restored.');
  if (!isoDate(value.exportedAt) || !Array.isArray(value.matches) || !value.matches.length || value.matches.length > MAX_BACKUP_MATCHES)
    throw Error('Invalid backup contents or match count. No matches were restored.');
  const ids = new Set();
  for (const record of value.matches) {
    try {
      if (!record || typeof record.id !== 'string' || !record.id.trim() || record.id !== record.match?.id || !validMatch(record.match)) throw Error();
      if (record.archivedAt !== undefined && !isoDate(record.archivedAt)) throw Error();
      const events = record.match.events;
      if (events.some(e => !e.id.trim()) || new Set(events.map(e => e.id)).size !== events.length) throw Error();
    } catch {
      throw Error('A match in this backup is invalid or unsupported. No matches were restored.');
    }
    if (ids.has(record.id)) throw Error('Duplicate match IDs in backup. No matches were restored.');
    ids.add(record.id);
  }
  if (value.version === 2) {
    try { validateBackupLibraries(value.libraries); }
    catch { throw Error('A Saved Squad or Team Setup in this backup is invalid or unsupported. No data was restored.'); }
  } else if (value.libraries !== undefined) throw Error('Library data requires backup version 2. No data was restored.');
  return structuredClone(value);
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw Error('Choose a match backup smaller than 25 MB.');
  let value;
  try { value = JSON.parse(text); }
  catch { throw Error('This file is not valid JSON. No matches were restored.'); }
  return validateBackup(value);
}
export function makeBackup(matches, exportedAt = new Date().toISOString(), libraries = undefined) {
  const backup = validateBackup({format: BACKUP_FORMAT, version: libraries ? BACKUP_VERSION : 1, exportedAt, matches, ...(libraries ? {libraries} : {})});
  if (new TextEncoder().encode(JSON.stringify(backup)).length > MAX_BACKUP_BYTES)
    throw Error('This backup exceeds the supported 25 MB size. No file was created.');
  return backup;
}
export function restorePlan(backup, {activeId, existingIds, deletedIds}) {
  return backup.matches.map(record => ({
    record,
    reason: record.id === activeId ? 'Active match — preserved' : deletedIds.has(record.id) ? 'Previously deleted — preserved' : existingIds.has(record.id) ? 'Already stored — preserved' : '',
  }));
}
export function downloadMatchBackup(backup) {
  // Use the same representation checked by makeBackup's size limit, so every
  // exported file can be read back within the supported import limit.
  const blob = new Blob([JSON.stringify(backup)], {type: 'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = `Sideline-${backup.version === 2 ? 'Backup' : 'Matches'}-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
