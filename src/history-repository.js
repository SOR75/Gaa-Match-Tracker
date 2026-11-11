import { withBlankMatchPlayers } from "./match-squad-enrichment.js";
import { blankMatch, migrateMatch } from "./domain.js";
import { persistMatch } from "./storage.js";
import {makeBackup, validateBackup, restorePlan} from './match-backup.js';
import {readBackupLibraries, libraryRestorePlan, writeLibraryAdditions} from './library-backup.js';
import {
  ARCHIVE_PREFIX,
  ACTIVE_KEY,
  HISTORY_DB,
  HISTORY_STORE,
  completed,
  historySnapshot,
  sortHistory,
} from "./history.js";
const message = (e) => e?.message || String(e);
export function createHistoryRepository({
  storage = globalThis.localStorage,
  indexedDB = globalThis.indexedDB,
  now = () => Date.now(),
} = {}) {
  let database;
  async function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        if (!indexedDB) return reject(new Error("IndexedDB is unavailable"));
        const r = indexedDB.open(HISTORY_DB, 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(HISTORY_STORE))
            r.result.createObjectStore(HISTORY_STORE, { keyPath: "id" });
        };
        r.onsuccess = () => {
          r.result.onversionchange = () => {
            r.result.close();
            database = null;
          };
          resolve(r.result);
        };
        r.onerror = () =>
          reject(r.error || new Error("History storage could not open"));
        r.onblocked = () =>
          reject(
            new Error(
              "Close other Sideline tabs before opening history storage",
            ),
          );
      }).catch((e) => {
        database = null;
        throw e;
      });
    return database;
  }
  async function transaction(mode, work) {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(HISTORY_STORE, mode),
        store = tx.objectStore(HISTORY_STORE);
      let result, failure;
      const fail = (error) => {
        failure = error;
        tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () =>
        reject(failure || tx.error || new Error("History transaction failed"));
      tx.onabort = () =>
        reject(failure || tx.error || new Error("History transaction aborted"));
      try {
        work(store, (value) => (result = value), fail);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
  }
  const get = (id) =>
    transaction("readonly", (s, done) => {
      const r = s.get(id);
      r.onsuccess = () => done(r.result);
    });
  const put = (record) => transaction("readwrite", (s) => s.put(record));
  function legacy() {
    const records = [],
      warnings = [],
      keys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(ARCHIVE_PREFIX)) keys.push(key);
    }
    for (const key of keys)
      try {
        const match = migrateMatch(JSON.parse(storage.getItem(key)));
        if (key !== ARCHIVE_PREFIX + match.id)
          throw Error("Archive key does not match its match ID");
        records.push({
          repositoryVersion: 1,
          id: match.id,
          match,
          origin: "legacy",
          legacyKey: key,
        });
      } catch (e) {
        warnings.push({ key, error: message(e) });
      }
    return { records, warnings };
  }
  function validate(record) {
    if (record.repositoryVersion !== 1 || record.id !== record.match?.id)
      throw Error("Unsupported history record");
    return { ...record, match: migrateMatch(record.match) };
  }
  async function list() {
    const old = legacy(),
      warnings = [...old.warnings],
      combined = new Map(),
      deleted = new Set();
    let writable = true;
    try {
      const stored = await transaction("readonly", (s, done) => {
        const r = s.getAll();
        r.onsuccess = () => done(r.result);
      });
      for (const r of stored) {
        if (r.deleted) {
          deleted.add(r.id);
          continue;
        }
        try {
          combined.set(r.id, validate(r));
        } catch (e) {
          warnings.push({ key: r.id, error: message(e) });
        }
      }
      for (const record of old.records) {
        if (deleted.has(record.id)) continue;
        const existing = combined.get(record.id);
        if (!existing || existing.origin === "legacy") {
          combined.set(record.id, record);
          // A single transaction prevents a discovery racing a deliberate deletion
          // from resurrecting a tombstoned match. Originals are never touched here.
          await transaction("readwrite", (s, _done, fail) => {
            const r = s.get(record.id);
            r.onsuccess = () => {
              try {
                if (
                  !r.result?.deleted &&
                  (!r.result ||
                    (r.result.repositoryVersion === 1 &&
                      r.result.origin === "legacy"))
                )
                  s.put(record);
              } catch (error) {
                fail(error);
              }
            };
          });
        }
      }
    } catch (e) {
      writable = false;
      warnings.push({ key: "History storage", error: message(e) });
      for (const r of old.records)
        if (!deleted.has(r.id) && !combined.has(r.id)) combined.set(r.id, r);
    }
    return { records: sortHistory([...combined.values()]), warnings, writable };
  }
  async function archive(current) {
    const date = new Date(now()).toISOString();
    const record = {
      repositoryVersion: 1,
      id: current.id,
      match: historySnapshot({ match: current, archivedAt: date }),
      archivedAt: date,
      origin: "native",
    };
    // Prefer scalable history storage. If it is unavailable, retain V0.3.7's
    // fail-safe local recovery snapshot contract instead of losing the match.
    try {
      const previous = await get(record.id);
      if (previous && previous.repositoryVersion !== 1)
        throw Error("Unsupported history record version");
      await put(record);
    } catch {
      storage.setItem(ARCHIVE_PREFIX + record.id, JSON.stringify(record.match));
    }
    return record;
  }
  async function replace(current, next) {
    const before = JSON.stringify(current),
      saved = storage.getItem(ACTIVE_KEY);
    await archive(current);
    if (
      before !== JSON.stringify(current) ||
      saved !== storage.getItem(ACTIVE_KEY)
    )
      throw Error(
        "The active match changed while archiving. Retry; no new match was started.",
      );
    const error = persistMatch(next, storage);
    if (error) throw Error(error);
    return next;
  }
  async function startNew(current) {
    const next = withBlankMatchPlayers(blankMatch());
    next.lifecycle = {
      status: "paused",
      createdAt: new Date(now()).toISOString(),
    };
    return await replace(current, next);
  }
  async function resume(id, current) {
    if (id === current.id) throw Error("This is already the active match");
    const { records } = await list(),
      record = records.find((r) => r.id === id);
    if (!record) throw Error("Archived match could not be opened");
    if (completed(record.match)) throw Error("Completed matches are read-only");
    const next = historySnapshot(record);
    next.lifecycle = {
      ...next.lifecycle,
      status: "paused",
      resumedAt: new Date(now()).toISOString(),
    };
    return await replace(current, next);
  }
  async function removeMany(ids, current) {
    const selected = [...new Set(ids)];
    if (!selected.length) throw Error("Select at least one archived match");
    const assertArchived = () => {
      const active = storage.getItem(ACTIVE_KEY);
      const activeId = active ? JSON.parse(active).id : current.id;
      if (selected.includes(current.id) || selected.includes(activeId))
        throw Error("The active match cannot be deleted from History");
    };
    assertArchived();
    const state = await list();
    if (!state.writable)
      throw Error("History storage is unavailable. No match was deleted.");
    const originals = new Map();
    try {
      await transaction("readwrite", (store, _done, fail) => {
        const found = new Map();
        for (const id of selected) {
          const request = store.get(id);
          request.onsuccess = () => {
            try {
              const record = request.result;
              if (!record || record.deleted) throw Error("Match no longer exists in History. No matches were deleted.");
              validate(record);
              found.set(id, record);
              if (found.size !== selected.length) return;
              // Re-check after asynchronous discovery and within the batch.
              assertArchived();
              // Durable originals already exist in this transaction. A source
              // cleanup or tombstone-write failure aborts ALL logical deletions.
              for (const key of selected) {
                const legacyKey = ARCHIVE_PREFIX + key;
                const raw = storage.getItem(legacyKey);
                if (raw !== null) {
                  originals.set(legacyKey, raw);
                  storage.removeItem(legacyKey);
                }
              }
              const deletedAt = new Date(now()).toISOString();
              for (const key of selected) store.put({ repositoryVersion: 1, id: key, deleted: true, deletedAt });
            } catch (error) { fail(error); }
          };
        }
      });
    } catch (error) {
      // localStorage and IndexedDB cannot share a transaction. Restore removed
      // legacy sources on abort; verified IndexedDB copies also remain intact.
      let recoveryFailed = false;
      for (const [key, raw] of originals) {
        try { if (storage.getItem(key) === null) storage.setItem(key, raw); }
        catch { recoveryFailed = true; }
      }
      throw Error(`${message(error)}${message(error).includes("No matches were deleted") ? "" : " No matches were deleted."}${recoveryFailed ? ' Legacy source restoration failed; original match copies remain in IndexedDB History.' : ''}`);
    }
    return selected;
  }
  const remove = (id, current) => removeMany([id], current);
  // Backup reads original records directly: no discovery migration or clock edits.
  const storedRecords = () => transaction('readonly', (s, done) => {
    const r = s.getAll(); r.onsuccess = () => done(r.result);
  });
  function localArchiveKeys() {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i); if (key?.startsWith(ARCHIVE_PREFIX)) keys.push(key);
    }
    return keys;
  }
  function backupState(stored, current) {
    const active = storage.getItem(ACTIVE_KEY);
    return {
      activeId: active ? JSON.parse(active).id : current.id,
      existingIds: new Set([...stored.map(r => r.id), ...localArchiveKeys().map(k => k.slice(ARCHIVE_PREFIX.length))]),
      deletedIds: new Set(stored.filter(r => r.deleted).map(r => r.id)),
    };
  }
  async function exportBackup(current) {
    const date = new Date(now()).toISOString(), active = structuredClone(current);
    const stored = await storedRecords(), records = new Map();
    const deleted = new Set(stored.filter(r => r.deleted).map(r => r.id));
    for (const record of stored) {
      if (record.deleted) continue;
      if (record.repositoryVersion !== 1 || record.id !== record.match?.id)
        throw Error('An unsupported History record prevents a complete backup. Original records are unchanged.');
      records.set(record.id, structuredClone(record));
    }
    for (const key of localArchiveKeys()) {
      const id = key.slice(ARCHIVE_PREFIX.length);
      if (deleted.has(id)) continue;
      const match = JSON.parse(storage.getItem(key));
      if (id !== match?.id) throw Error('An archive has an invalid match ID. Original records are unchanged.');
      const existing = records.get(id);
      if (!existing || existing.origin === 'legacy') records.set(id, {id, match});
    }
    records.set(active.id, {id: active.id, match: active, archivedAt: date});
    return makeBackup([...records.values()].map(r => ({id: r.id, match: r.match, ...(r.archivedAt ? {archivedAt: r.archivedAt} : {})})), date, readBackupLibraries(storage).libraries);
  }
  async function previewRestore(value, current) {
    const backup = validateBackup(value);
    return {
      matches: restorePlan(backup, backupState(await storedRecords(), current)),
      libraries: backup.libraries ? libraryRestorePlan(backup.libraries, readBackupLibraries(storage)) : null,
    };
  }
  async function restoreBackup(value, current) {
    const backup = validateBackup(value), date = new Date(now()).toISOString();
    // IDB keeps the match batch atomic and serializes restore operations. Library
    // additions use separate localStorage keys, with guarded rollback on abort.
    // Existing library entries are retained verbatim; no active match is written.
    let rollback = () => '';
    try { return await transaction('readwrite', (store, done, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const plan = restorePlan(backup, backupState(request.result, current));
          const libraries = backup.libraries ? libraryRestorePlan(backup.libraries, readBackupLibraries(storage)) : null;
          for (const {record, reason} of plan) if (!reason) store.add({
            repositoryVersion: 1, id: record.id, match: record.match, origin: 'restored',
            ...(record.archivedAt ? {archivedAt: record.archivedAt} : {}), restoredAt: date,
          });
          rollback = writeLibraryAdditions(libraries, storage);
          done({restored: plan.filter(p => !p.reason).length, skipped: plan.filter(p => p.reason).length,
            squadsRestored: libraries?.squads.filter(p => !p.reason).length || 0,
            squadsSkipped: libraries?.squads.filter(p => p.reason).length || 0,
            setupsRestored: libraries?.setups.filter(p => !p.reason).length || 0,
            setupsSkipped: libraries?.setups.filter(p => p.reason).length || 0,
          });
        } catch (error) { fail(error); }
      };
    }); } catch (e) { throw Error(`${message(e)} No matches were restored.${rollback()}`); }
  }
  return { list, startNew, resume, remove, removeMany, exportBackup, previewRestore, restoreBackup };
}
