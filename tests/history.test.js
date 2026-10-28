import { test } from "node:test";
import assert from "node:assert/strict";
import { blankMatch, createEvent, totals } from "../src/domain.js";
import {
  completeMatch,
  historySnapshot,
  historySummary,
  sortHistory,
} from "../src/history.js";
import { createHistoryRepository } from "../src/history-repository.js";
function match(id = "old") {
  const m = blankMatch();
  m.id = id;
  m.setup.ourTeam = "Harbour";
  m.setup.opposition = "Valley";
  m.events = [
    createEvent(m, "goal", "our"),
    createEvent(m, "two-point", "our"),
    createEvent(m, "point", "opposition"),
  ];
  return m;
}
function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    map,
  };
}
test("history score is derived from events, including two-pointers; legacy status/result are neutral", () => {
  const m = match(),
    s = historySummary({ match: m });
  assert.equal(s.our.total, 5);
  assert.equal(s.opposition.total, 1);
  assert.equal(s.status, "Archived");
  assert.equal(s.result, "Result not final");
});
test("completion metadata pauses clock and leaves the event log intact", () => {
  const m = match();
  m.clock = { half: 2, elapsedMs: 1000, startedAt: 10000 };
  const before = JSON.stringify(m),
    done = completeMatch(m, 15000);
  assert.equal(done.clock.elapsedMs, 6000);
  assert.equal(done.clock.startedAt, null);
  assert.equal(done.lifecycle.status, "completed");
  assert.deepEqual(done.events, m.events);
  assert.equal(JSON.stringify(m), before);
  assert.equal(historySummary({ match: done }).result, "WIN +4");
});
test("losses/draws are only final when explicit reliable completion metadata exists", () => {
  const m = match();
  m.events = [createEvent(m, "point", "opposition")];
  assert.equal(historySummary({ match: completeMatch(m) }).result, "LOSS -1");
  m.events = [];
  assert.equal(historySummary({ match: completeMatch(m) }).result, "DRAW");
});
test("active paused/live states do not manufacture a completed archive", () => {
  const m = match();
  assert.equal(historySummary({ match: m }, false).status, "Paused");
  m.clock.startedAt = 1;
  assert.equal(historySummary({ match: m }, false).status, "Live");
  assert.equal(historySummary({ match: m }).status, "Archived");
});
test("legacy running historical clocks freeze at last recorded same-half time, never wall-clock now", () => {
  const m = match();
  m.clock = { half: 1, elapsedMs: 1000, startedAt: 1 };
  m.events[0].timeMs = 123000;
  const raw = JSON.stringify(m);
  const frozen = historySnapshot({ match: m });
  assert.equal(frozen.clock.elapsedMs, 123000);
  assert.equal(frozen.clock.startedAt, null);
  assert.equal(JSON.stringify(m), raw);
});
test("known archive timestamp gives a deterministic frozen clock", () => {
  const m = match();
  m.clock = { half: 2, elapsedMs: 1000, startedAt: 10000 };
  assert.equal(
    historySnapshot({ match: m, archivedAt: new Date(15000).toISOString() })
      .clock.elapsedMs,
    6000,
  );
});
test("newest-first sorting retains undated legacy matches and does not use import time", () => {
  const a = match("a"),
    b = match("b"),
    c = match("c");
  a.setup.date = "2026-10-02";
  b.setup.date = "2026-10-01";
  c.setup.date = "";
  c.events = [];
  assert.deepEqual(
    sortHistory([
      { id: "c", match: c },
      { id: "b", match: b },
      { id: "a", match: a },
    ]).map((r) => r.id),
    ["a", "b", "c"],
  );
});
test("legacy discovery without IndexedDB is read-only and preserves raw V0.3.7 records", async () => {
  const m = match(),
    raw = JSON.stringify(m),
    s = storage({
      "sideline.match.archive.old": raw,
      "sideline.match.v1.backup": "untouched",
      "sideline.squads.v1": "untouched",
    }),
    before = [...s.map];
  const result = await createHistoryRepository({
    storage: s,
    indexedDB: null,
  }).list();
  assert.equal(result.records.length, 1);
  assert.equal(result.writable, false);
  assert.equal(totals(result.records[0].match.events, "our").total, 5);
  assert.deepEqual([...s.map], before);
});
test("corrupt archives remain intact and do not prevent other archives being discovered", async () => {
  const s = storage({
    "sideline.match.archive.old": JSON.stringify(match()),
    "sideline.match.archive.bad": "broken",
  });
  const r = await createHistoryRepository({
    storage: s,
    indexedDB: null,
  }).list();
  assert.equal(r.records.length, 1);
  assert.ok(r.warnings.some((w) => w.key.endsWith(".bad")));
  assert.equal(s.getItem("sideline.match.archive.bad"), "broken");
});
test("New Match falls back safely to a local snapshot if IndexedDB is unavailable", async () => {
  const m = match(),
    s = storage({ "sideline.match.v1": JSON.stringify(m) }),
    repo = createHistoryRepository({ storage: s, indexedDB: null });
  const next = await repo.startNew(m);
  assert.notEqual(next.id, m.id);
  assert.deepEqual(next.events, []);
  assert.equal(
    JSON.parse(s.getItem("sideline.match.archive.old")).events.length,
    3,
  );
  assert.equal(JSON.parse(s.getItem("sideline.match.v1")).id, next.id);
});
test("failure of both archive stores prevents any destructive New Match", async () => {
  const m = match(),
    raw = JSON.stringify(m),
    s = storage({ "sideline.match.v1": raw });
  s.setItem = () => {
    throw Error("Quota exceeded");
  };
  await assert.rejects(
    createHistoryRepository({ storage: s, indexedDB: null }).startNew(m),
    /Quota/,
  );
  assert.equal(s.getItem("sideline.match.v1"), raw);
  assert.equal(JSON.stringify(m), raw);
});
test("active-save failure leaves the old current match plus recoverable snapshot intact", async () => {
  const m = match(),
    raw = JSON.stringify(m),
    s = storage({ "sideline.match.v1": raw }),
    set = s.setItem;
  s.setItem = (k, v) => {
    if (k === "sideline.match.v1") throw Error("Full");
    return set(k, v);
  };
  await assert.rejects(
    createHistoryRepository({ storage: s, indexedDB: null }).startNew(m),
    /Autosave failed/,
  );
  assert.equal(s.getItem("sideline.match.v1"), raw);
  assert.equal(JSON.parse(s.getItem("sideline.match.archive.old")).id, "old");
});
test("completed archives cannot be resumed", async () => {
  const old = completeMatch(match()),
    active = match("active"),
    s = storage({
      "sideline.match.archive.old": JSON.stringify(old),
      "sideline.match.v1": JSON.stringify(active),
    });
  await assert.rejects(
    createHistoryRepository({ storage: s, indexedDB: null }).resume(
      "old",
      active,
    ),
    /Completed/,
  );
  assert.equal(JSON.parse(s.getItem("sideline.match.v1")).id, "active");
});
test("resuming a legacy archive saves the current match first and restores a paused independent payload", async () => {
  const old = match(),
    active = match("active");
  old.clock.startedAt = 1;
  old.events[0].timeMs = 90000;
  const raw = JSON.stringify(old),
    s = storage({
      "sideline.match.archive.old": raw,
      "sideline.match.v1": JSON.stringify(active),
    });
  const next = await createHistoryRepository({
    storage: s,
    indexedDB: null,
  }).resume("old", active);
  assert.equal(next.id, "old");
  assert.equal(next.clock.startedAt, null);
  assert.equal(next.clock.elapsedMs, 90000);
  assert.equal(s.getItem("sideline.match.archive.old"), raw);
  assert.equal(
    JSON.parse(s.getItem("sideline.match.archive.active")).id,
    "active",
  );
});
test("history deletion refuses the active ID and refuses incomplete storage access", async () => {
  const m = match(),
    s = storage({ "sideline.match.archive.old": JSON.stringify(m) }),
    repo = createHistoryRepository({ storage: s, indexedDB: null });
  await assert.rejects(repo.remove("old", m), /active/);
  await assert.rejects(repo.remove("old", match("active")), /unavailable/);
  assert.ok(s.getItem("sideline.match.archive.old"));
});
test("reopening Full-Time Analysis does not rewrite an existing completion timestamp", () => {
  const done = completeMatch(match(), 10000),
    again = completeMatch(done, 20000);
  assert.deepEqual(again, done);
  assert.equal(again.lifecycle.completedAt, new Date(10000).toISOString());
});
