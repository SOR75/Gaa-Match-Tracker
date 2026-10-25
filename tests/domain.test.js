import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  totals,
  saveEvent,
  undoEvent,
  toggleClock,
  elapsedMs,
  formatTime,
  validMatch,
} from "../src/domain.js";
import { loadMatch, persistMatch } from "../src/storage.js";

test("a new match starts without team or player names", () => {
  const match = blankMatch();
  assert.equal(match.setup.ourTeam, "");
  assert.equal(match.setup.opposition, "");
  assert.equal(match.setup.halfLength, 30);
  assert.deepEqual(match.players, []);
  assert.deepEqual(match.events, []);
  assert.equal(validMatch(match), true);
});

test("scoreboard derives Gaelic totals from scoring records for each team", () => {
  const match = blankMatch();
  const events = ["goal", "point", "two-point", "miss", "turnover-won"].map(
    (type) => createEvent(match, type, "our"),
  );
  events.push(createEvent(match, "two-point", "opposition"));
  assert.deepEqual(totals(events, "our"), {
    goals: 1,
    points: 1,
    twoPointers: 1,
    total: 6,
  });
  assert.deepEqual(totals(events, "opposition"), {
    goals: 0,
    points: 0,
    twoPointers: 1,
    total: 2,
  });
  assert.equal(totals([{ ...events[0], scoreValue: 500 }], "our").total, 3);
});

test("editing a score, team, or outcome recalculates totals; undo removes last recorded event", () => {
  const match = blankMatch();
  const goal = createEvent(match, "goal", "our");
  const point = createEvent(match, "point", "our");
  let events = saveEvent(saveEvent([], goal), point);
  events = saveEvent(events, {
    ...goal,
    event: "two-point",
    team: "opposition",
    timeMs: 90000,
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].scoreValue, 2);
  assert.equal(totals(events, "our").total, 1);
  assert.equal(totals(events, "opposition").total, 2);
  events = undoEvent(events);
  assert.equal(events[0].id, goal.id);
  assert.equal(totals(events, "our").total, 0);
  events = saveEvent(events, { ...events[0], outcome: "wide" });
  assert.equal(totals(events, "opposition").total, 0);
  assert.equal(events[0].scoreValue, 0);
});

test("clock persists a timestamp and resumes accurately after serialization", () => {
  let clock = { half: 1, elapsedMs: 0, startedAt: null };
  clock = toggleClock(clock, 1000);
  clock = JSON.parse(JSON.stringify(clock));
  assert.equal(elapsedMs(clock, 76000), 75000);
  clock = toggleClock(clock, 76000);
  assert.equal(elapsedMs(clock, 100000), 75000);
  clock = toggleClock(clock, 100000);
  assert.equal(elapsedMs(clock, 105000), 80000);
  assert.equal(formatTime(1870000), "31:10");
});

test("event records preserve timing and required data fields", () => {
  const match = blankMatch();
  match.clock = { half: 2, elapsedMs: 72500, startedAt: null };
  const event = createEvent(match, "opposition-kickout", "our", 100000);
  assert.equal(event.team, "opposition");
  assert.equal(event.half, 2);
  assert.equal(event.timeMs, 72000);
  for (const key of [
    "id",
    "playerNumber",
    "event",
    "outcome",
    "scoreValue",
    "zone",
    "side",
    "kickoutLength",
    "notes",
    "scoreOrigin",
    "possessionResult",
    "attackPattern",
    "coachObservation",
    "directScoreLink",
  ])
    assert.ok(Object.hasOwn(event, key), key);
});

test("malformed saved data is rejected rather than silently overwriting it", () => {
  assert.equal(Boolean(validMatch(null)), false);
  assert.equal(
    Boolean(validMatch({ ...blankMatch(), events: [{ id: "bad" }] })),
    false,
  );
  assert.equal(
    Boolean(
      validMatch({
        ...blankMatch(),
        clock: { half: 3, elapsedMs: 0, startedAt: null },
      }),
    ),
    false,
  );
});

test("score links cannot point at an undone or reclassified non-scoring event", () => {
  const match = blankMatch();
  const possession = createEvent(match, "possession", "our");
  const goal = createEvent(match, "goal", "our");
  const events = [{ ...possession, directScoreLink: goal.id }, goal];
  assert.equal(undoEvent(events)[0].directScoreLink, "");
  assert.equal(
    saveEvent(events, { ...goal, event: "miss", outcome: "wide" })[0]
      .directScoreLink,
    "",
  );
});

test("local storage round trips all match data and preserves corrupt originals", () => {
  let raw = null;
  globalThis.localStorage = {
    getItem: () => raw,
    setItem: (key, value) => {
      raw = value;
    },
  };
  const match = blankMatch();
  match.setup.ourTeam = "Test";
  match.events = [createEvent(match, "goal", "our")];
  assert.equal(persistMatch(match), "");
  assert.deepEqual(loadMatch().match, match);
  raw = "{ damaged";
  const recovered = loadMatch();
  assert.equal(recovered.match, null);
  assert.match(recovered.error, /preserved/);
  assert.equal(raw, "{ damaged");
});

test("blocked storage reports failure instead of claiming to save", () => {
  globalThis.localStorage = {
    setItem() {
      throw new Error("Quota exceeded");
    },
  };
  assert.match(persistMatch(blankMatch()), /Autosave failed/);
});
