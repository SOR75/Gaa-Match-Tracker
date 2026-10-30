import test from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  undoEvent,
  validMatch,
} from "../src/domain.js";
import { createMatchPlayer, createSquadPlayer } from "../src/identity.js";
import {
  goalkeeperStatistics,
  goalkeeperPeriods,
  advanceHalfClock,
} from "../src/goalkeepers.js";
import { goalkeeperCards } from "../src/goalkeeper-ui.js";
function fixture() {
  const m = blankMatch();
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  const p = (n) =>
    createMatchPlayer({
      ...createSquadPlayer({
        number: n,
        name: `Player ${n}`,
        role: n <= 15 ? "starter" : "substitute",
      }),
      id: undefined,
    });
  m.players = Array.from({ length: 18 }, (_, i) => p(i + 1));
  m.oppositionPlayers = Array.from({ length: 18 }, (_, i) => p(i + 1));
  return m;
}
function add(m, event, team = "our", fields = {}) {
  const e = { ...createEvent(m, event, team), ...fields };
  m.events = saveEvent(m.events, e, m);
  return m.events.find((x) => x.id === e.id);
}
const keeper = (m, n, team = "our") =>
  goalkeeperStatistics(m, { now: 0 }).find(
    (g) => g.team === team && g.jerseyNumber === n,
  );
test("8 kickouts 6 retained, short 3/3 long 3/5 Marks 2: 32 and 28 actual recorded goalkeeper minutes", () => {
  const m = fixture();
  m.clock = {
    half: 2,
    elapsedMs: 30 * 60000,
    startedAt: null,
    completedHalves: { 1: 30 * 60000 },
  };
  for (let i = 0; i < 8; i++)
    add(m, "our-kickout", "our", {
      half: 1,
      timeMs: i * 60000,
      outcome: i < 6 ? "won" : "lost",
      kickoutLength: i < 3 ? "Short" : "Long",
      mark: i < 2,
    });
  add(m, "goal", "opposition", { half: 1, timeMs: 10 * 60000 });
  add(m, "substitution", "our", {
    half: 2,
    timeMs: 2 * 60000,
    playerOn: "16",
    playerOff: "1",
  });
  for (let i = 0; i < 4; i++)
    add(m, "our-kickout", "our", {
      half: 2,
      timeMs: (i + 3) * 60000,
      outcome: i < 3 ? "won" : "out-of-play",
      kickoutLength: "Long",
    });
  add(m, "goal", "opposition", { half: 2, timeMs: 8 * 60000 });
  add(m, "goal", "opposition", { half: 2, timeMs: 9 * 60000 });
  add(m, "point", "opposition", { half: 2, timeMs: 10 * 60000 });
  const a = keeper(m, 1),
    b = keeper(m, 16);
  assert.deepEqual(
    [
      a.gkTimeMs,
      a.gkKickouts,
      a.gkRetained,
      a.gkRetention,
      a.gkShortRetained,
      a.gkShort,
      a.gkLongRetained,
      a.gkLong,
      a.gkMarks,
      a.gkGoalsConceded,
    ],
    [32 * 60000, 8, 6, 75, 3, 3, 3, 5, 2, 1],
  );
  assert.deepEqual(
    [b.gkTimeMs, b.gkKickouts, b.gkRetained, b.gkOutOfPlay, b.gkGoalsConceded],
    [28 * 60000, 4, 3, 1, 2],
  );
  assert.match(goalkeeperCards(m), /32:00 recorded/);
  assert.match(goalkeeperCards(m), /28:00 recorded/);
  assert.doesNotMatch(goalkeeperCards(m), /<table/);
  assert.ok(validMatch(JSON.parse(JSON.stringify(m))));
});
for (const team of ["our", "opposition"])
  test(`${team} kickouts: all outcomes from kicking goalkeeper perspective, no Mark duplication`, () => {
    const m = fixture();
    m.clock.elapsedMs = 10 * 60000;
    const type = team === "our" ? "our-kickout" : "opposition-kickout";
    const win = team === "our" ? "won" : "lost",
      lost = win === "won" ? "lost" : "won";
    for (const [length, outcome, mark] of [
      ["Short", win, false],
      ["Short", lost, false],
      ["Long", win, true],
      ["Long", lost, false],
      ["Long", "out-of-play", false],
    ])
      add(m, type, team, {
        kickoutLength: length,
        outcome,
        mark,
        kickoutPerspective: "our",
      });
    const g = keeper(m, 1, team);
    assert.deepEqual(
      [
        g.gkKickouts,
        g.gkRetained,
        g.gkLost,
        g.gkRetention,
        g.gkShort,
        g.gkShortRetained,
        g.gkLong,
        g.gkLongRetained,
        g.gkMarks,
        g.gkOutOfPlay,
      ],
      [5, 2, 2, 40, 2, 1, 3, 1, 1, 1],
    );
    assert.equal(m.events.length, 5);
  });
test("re-entry aggregates two periods for same participant and leaves one replacement period", () => {
  const m = fixture();
  m.clock.elapsedMs = 30 * 60000;
  add(m, "substitution", "our", {
    timeMs: 10 * 60000,
    playerOn: "16",
    playerOff: "1",
  });
  add(m, "substitution", "our", {
    timeMs: 20 * 60000,
    playerOn: "1",
    playerOff: "16",
  });
  assert.equal(keeper(m, 1).gkTimeMs, 20 * 60000);
  assert.equal(keeper(m, 1).periods.length, 2);
  assert.equal(keeper(m, 16).gkTimeMs, 10 * 60000);
});
test("outfield #4 becomes goalkeeper only when replacing #1, with exact period boundary", () => {
  const m = fixture();
  m.clock.elapsedMs = 30 * 60000;
  add(m, "substitution", "our", {
    timeMs: 5 * 60000,
    playerOn: "18",
    playerOff: "4",
  });
  assert.equal(keeper(m, 1).gkTimeMs, 30 * 60000);
  add(m, "substitution", "our", {
    timeMs: 6 * 60000,
    playerOn: "4",
    playerOff: "1",
  });
  assert.equal(keeper(m, 1).gkTimeMs, 6 * 60000);
  assert.equal(keeper(m, 4).gkTimeMs, 24 * 60000);
});
test("half transition preserves measured added time, resets/pauses exactly as before and leaves source clock unchanged", () => {
  const clock = { half: 1, elapsedMs: 32 * 60000, startedAt: 5000 };
  const original = structuredClone(clock);
  const next = advanceHalfClock(clock, 2, 65000);
  assert.deepEqual(clock, original);
  assert.deepEqual(next, {
    half: 2,
    elapsedMs: 0,
    startedAt: null,
    completedHalves: { 1: 33 * 60000 },
  });
  const m = fixture();
  m.clock = { ...next, elapsedMs: 31 * 60000 };
  assert.equal(keeper(m, 1).gkTimeMs, 64 * 60000);
});
test("legacy missing half-end duration remains unknown, but event metrics still calculate correctly", () => {
  const m = fixture();
  m.clock = { half: 2, elapsedMs: 30 * 60000, startedAt: null };
  add(m, "our-kickout", "our", { outcome: "won", half: 1 });
  assert.equal(keeper(m, 1).gkTimeMs, null);
  assert.equal(keeper(m, 1).gkKickouts, 1);
  assert.match(goalkeeperCards(m), /half-end clock not recorded/);
  delete m.goalkeeperTrackingVersion;
  assert.equal(goalkeeperStatistics(m).length, 0);
});
test("half-specific keeper time clips measured periods rather than leaking the other half", () => {
  const m = fixture();
  m.clock = {
    half: 2,
    elapsedMs: 30 * 60000,
    startedAt: null,
    completedHalves: { 1: 32 * 60000 },
  };
  const h1 = goalkeeperStatistics(m, { half: 1, now: 0 }).find(
    (g) => g.team === "our",
  );
  assert.equal(h1.gkTimeMs, 32 * 60000);
  const h2 = goalkeeperStatistics(m, { half: 2, now: 0 }).find(
    (g) => g.team === "our",
  );
  assert.equal(h2.gkTimeMs, 30 * 60000);
});
test("goals and kickouts recalculate after goalkeeper substitution edit and undo", () => {
  const m = fixture();
  m.clock.elapsedMs = 30 * 60000;
  const sub = add(m, "substitution", "our", {
    timeMs: 10 * 60000,
    playerOn: "16",
    playerOff: "1",
  });
  add(m, "goal", "opposition", { timeMs: 15 * 60000 });
  add(m, "our-kickout", "our", { timeMs: 16 * 60000, outcome: "won" });
  assert.equal(keeper(m, 16).gkGoalsConceded, 1);
  m.events = saveEvent(m.events, { ...sub, timeMs: 20 * 60000 }, m);
  assert.equal(keeper(m, 1).gkGoalsConceded, 1);
  assert.equal(keeper(m, 1).gkKickouts, 1);
  assert.equal(keeper(m, 16).gkTimeMs, 10 * 60000);
  m.events = undoEvent(m.events);
  assert.equal(keeper(m, 1).gkKickouts, 0);
});
test("unlinked legacy substitution cannot create a replacement keeper; periods and counters agree", () => {
  const m = fixture();
  m.goalkeepers = {
    our: {
      team: "our",
      matchPlayerId: m.players[0].id,
      playerId: m.players[0].playerId,
      nameSnapshot: m.players[0].name,
      jerseyNumber: 1,
    },
  };
  m.players = m.players.filter((p) => p.number !== 1);
  const e = add(m, "substitution", "our", {
    timeMs: 60000,
    playerOn: "16",
    playerOff: "1",
  });
  assert.equal(e.participants.playerOff, null);
  m.clock.elapsedMs = 120000;
  add(m, "our-kickout", "our", { timeMs: 90000, outcome: "won" });
  assert.equal(
    goalkeeperStatistics(m).find((g) => g.team === "our").gkKickouts,
    0,
  );
  assert.ok(!goalkeeperPeriods(m).some((p) => p.jerseyNumber === 16));
});
