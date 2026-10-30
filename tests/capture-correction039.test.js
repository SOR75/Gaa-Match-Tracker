import test from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  validMatch,
} from "../src/domain.js";
import { createMatchPlayer, createSquadPlayer } from "../src/identity.js";
import { goalkeeperStatistics } from "../src/goalkeepers.js";
import { summarize } from "../src/analysis.js";
function fixture() {
  const m = blankMatch();
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  m.players = Array.from({ length: 18 }, (_, i) =>
    createMatchPlayer({
      ...createSquadPlayer({
        number: i + 1,
        name: `Player ${i + 1}`,
        role: i < 15 ? "starter" : "substitute",
      }),
      id: undefined,
    }),
  );
  return m;
}
function add(m, type, team, fields) {
  const e = { ...createEvent(m, type, team), ...fields };
  m.events = saveEvent(m.events, e, m);
  return e;
}
test("physical goalkeeper scenario: 4 kickouts then 3, one conceded goal each; keeper and team totals reconcile", () => {
  const m = fixture();
  m.clock.elapsedMs = 30 * 60000;
  const ko = (timeMs, length, outcome, mark = false) =>
    add(m, "our-kickout", "our", {
      timeMs,
      kickoutLength: length,
      outcome,
      mark,
      kickoutWinnerNumber: outcome === "out-of-play" ? "" : "8",
    });
  ko(60000, "Short", "won");
  ko(120000, "Long", "lost");
  ko(180000, "Long", "won", true);
  ko(240000, "Long", "out-of-play");
  add(m, "goal", "opposition", { timeMs: 5 * 60000 });
  add(m, "substitution", "our", {
    timeMs: 10 * 60000,
    playerOn: "16",
    playerOff: "1",
  });
  ko(11 * 60000, "Short", "won");
  ko(12 * 60000, "Short", "lost");
  ko(13 * 60000, "Long", "won");
  add(m, "goal", "opposition", { timeMs: 14 * 60000 });
  const g = goalkeeperStatistics(m, { now: 0 }).filter((x) => x.team === "our");
  const a = g.find((x) => x.jerseyNumber === 1),
    b = g.find((x) => x.jerseyNumber === 16);
  assert.deepEqual(
    [
      a.gkTimeMs,
      a.gkKickouts,
      a.gkRetained,
      a.gkLost,
      a.gkMarks,
      a.gkOutOfPlay,
      a.gkGoalsConceded,
    ],
    [10 * 60000, 4, 2, 1, 1, 1, 1],
  );
  assert.deepEqual(
    [b.gkTimeMs, b.gkKickouts, b.gkRetained, b.gkLost, b.gkGoalsConceded],
    [20 * 60000, 3, 2, 1, 1],
  );
  const k = summarize(m.events, "our").kickouts;
  for (const [field, key] of [
    ["gkKickouts", "total"],
    ["gkRetained", "won"],
    ["gkLost", "lost"],
    ["gkOutOfPlay", "outOfPlay"],
    ["gkMarks", "marksWon"],
  ])
    assert.equal(
      g.reduce((n, p) => n + p[field], 0),
      k[key],
    );
  assert.equal(
    g.reduce((n, p) => n + p.gkGoalsConceded, 0),
    summarize(m.events, "opposition").goals,
  );
  assert.ok(validMatch(JSON.parse(JSON.stringify(m))));
});
test("historical Possession records remain valid and counted without migration or identity invention", () => {
  const m = fixture();
  const e = createEvent(m, "possession", "our");
  delete e.identityVersion;
  delete e.participants;
  m.events = [e];
  const raw = JSON.stringify(m);
  assert.ok(validMatch(m));
  assert.equal(summarize(m.events, "our").possessions, 1);
  assert.equal(JSON.stringify(m), raw);
  assert.equal(m.events[0].event, "possession");
});
