import { blankMatch, migrateMatch } from "./domain.js";
import { persistMatch } from "./storage.js";
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
    const next = blankMatch();
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
  async function remove(id, current) {
    if (id === current.id)
      throw Error("The active match cannot be deleted from History");
    const state = await list();
    if (!state.writable)
      throw Error("History storage is unavailable. No match was deleted.");
    const record = await get(id);
    if (!record || record.deleted)
      throw Error("Match no longer exists in History");
    // A verified durable copy exists before removing a legacy source. If the
    // subsequent transaction fails, that copy remains available for recovery.
    validate(record);
    storage.removeItem(ARCHIVE_PREFIX + id);
    await put({
      repositoryVersion: 1,
      id,
      deleted: true,
      deletedAt: new Date(now()).toISOString(),
    });
  }
  return { list, startNew, resume, remove };
}
