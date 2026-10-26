import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  totals,
  undoEvent,
  migrateMatch,
} from "../src/domain.js";
import { shotDetails, gaelicScore } from "../src/shots.js";
import { summarize, playerStatistics } from "../src/analysis.js";
import { persistMatch, loadMatch } from "../src/storage.js";
const shot = (type, team = "our", extra = {}) => ({
  ...createEvent(blankMatch(), type, team),
  ...extra,
});
test("four quick outcomes are shots; Gaelic points include the value of two-pointers", () => {
  const events = ["goal", "point", "two-point", "miss"].reduce(
    (events, type) => saveEvent(events, shot(type)),
    [],
  );
  assert.deepEqual(
    events.map((e) => shotDetails(e).shotOutcome),
    ["goal", "point", "two-point", "miss"],
  );
  assert.equal(totals(events, "our").total, 6);
  assert.equal(gaelicScore(totals(events, "our")), "1-3");
  assert.equal(summarize(events, "our").attempts, 4);
  assert.equal(summarize(events, "our").conversion, 75);
  assert.equal(totals(undoEvent(events), "our").total, 6);
});
test("source categorizes scores independently of goal outcome and edit/undo recomputes team totals", () => {
  let events = [];
  for (const [type, source] of [
    ["goal", "penalty"],
    ["point", "free"],
    ["two-point", "open-play"],
    ["point", "45"],
    ["point", "mark"],
  ])
    events = saveEvent(events, shot(type, "our", { shotSource: source }));
  assert.deepEqual(summarize(events, "our").scoresBySource, {
    "open-play": 1,
    free: 1,
    penalty: 1,
    45: 1,
    mark: 1,
  });
  assert.equal(totals(events, "our").total, 8);
  events = saveEvent(events, { ...events[0], team: "opposition" });
  assert.equal(totals(events, "our").total, 5);
  assert.equal(totals(events, "opposition").total, 3);
  assert.equal(events[0].shotOutcome, "goal");
  assert.equal(events[0].scoreOrigin, "Penalty");
  events = undoEvent(events);
  assert.equal(totals(events, "our").total, 4);
});
test("a blocked opposition attempt credits our defender in the SAME shot and clears stale credit on edits", () => {
  const match = blankMatch();
  match.players = [
    { id: "defender", number: 3, name: "Defender", role: "starter" },
  ];
  match.events = saveEvent(
    [],
    shot("miss", "opposition", {
      playerNumber: "9",
      missReason: "blocked",
      blockedByNumber: "3",
    }),
  );
  assert.equal(match.events.length, 1);
  assert.equal(totals(match.events, "opposition").total, 0);
  assert.equal(summarize(match.events, "opposition").blockedAttempts, 1);
  assert.equal(playerStatistics(match, "our")[0].defensiveBlocks, 1);
  assert.equal(playerStatistics(match, "opposition")[0].blockedAttempts, 1);
  assert.equal(playerStatistics(match, "our")[0].attempts, 0);
  let changed = saveEvent(match.events, { ...match.events[0], team: "our" });
  assert.equal(changed[0].missReason, "blocked");
  assert.equal(changed[0].blockedByNumber, "");
  changed = saveEvent(match.events, { ...match.events[0], missReason: "wide" });
  assert.equal(changed[0].blockedByNumber, "");
  changed = saveEvent(match.events, {
    ...match.events[0],
    event: "goal",
    outcome: "scored",
  });
  assert.equal(changed[0].missReason, "");
  assert.equal(changed[0].blockedByNumber, "");
});
test("V0.3.4 records are read without mutation or invented source and new fields persist locally", () => {
  const match = blankMatch();
  const legacy = shot("miss", "opposition", {
    outcome: "blocked",
    scoreOrigin: "Free",
  });
  for (const key of [
    "shotOutcome",
    "shotSource",
    "missReason",
    "blockedByNumber",
  ])
    delete legacy[key];
  match.events = [legacy];
  const before = JSON.stringify(match);
  assert.deepEqual(migrateMatch(match), match);
  assert.equal(JSON.stringify(match), before);
  assert.equal(shotDetails(legacy).missReason, "blocked");
  assert.equal(shotDetails(legacy).shotSource, "free");
  assert.equal(shotDetails({ ...legacy, scoreOrigin: "" }).shotSource, "");
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  match.events = saveEvent(match.events, { ...legacy, blockedByNumber: "3" });
  match.recordingTeam = "opposition";
  assert.equal(persistMatch(match), "");
  assert.deepEqual(loadMatch().match, match);
  assert.equal(loadMatch().match.events[0].blockedByNumber, "3");
});
