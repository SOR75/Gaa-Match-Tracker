import test from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  undoEvent,
  validMatch,
} from "../src/domain.js";
import {
  createMatchPlayer,
  createSquadPlayer,
  participantRef,
} from "../src/identity.js";
import {
  activeGoalkeepers,
  goalkeeperStatistics,
  goalkeeperPeriods,
} from "../src/goalkeepers.js";
import { onFieldPlayers, substitutionChoices } from "../src/participation.js";
import { playerStatistics, summarize } from "../src/analysis.js";
import { parseOfficialSquad } from "../src/squad-excel.js";
import readWorkbook from "read-excel-file/node";
export function recoveryMatch() {
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
function add(m, type, team = "our", fields = {}) {
  const e = {
    ...createEvent(m, type, team),
    timeMs: m.events.length * 1000,
    ...fields,
  };
  m.events = saveEvent(m.events, e, m);
  return m.events.at(-1);
}
test("new identified #1 goalkeeper automatically, reserve #16 is not initial; old matches remain unlinked", () => {
  const m = recoveryMatch();
  assert.equal(activeGoalkeepers(m).our.matchPlayerId, m.players[0].id);
  assert.equal(
    goalkeeperStatistics(m).find((g) => g.team === "our").jerseyNumber,
    1,
  );
  delete m.goalkeeperTrackingVersion;
  assert.equal(activeGoalkeepers(m).our, undefined);
  assert.equal(goalkeeperStatistics(m).length, 0);
});
test("proven Active XV after 18 on/10 off survives reload, edit and undo with shared substitution choices", () => {
  let m = recoveryMatch();
  const sub = add(m, "substitution", "our", {
    playerOn: "18",
    playerOff: "10",
  });
  const active = () => onFieldPlayers(m, "our").map((p) => p.number);
  assert.ok(active().includes(18));
  assert.ok(!active().includes(10));
  m = JSON.parse(JSON.stringify(m));
  assert.ok(validMatch(m));
  assert.ok(active().includes(18));
  assert.ok(
    substitutionChoices(m, createEvent(m, "substitution", "our")).on.some(
      (p) => p.number === 10,
    ),
  );
  m.events = saveEvent(m.events, { ...sub, playerOff: "11" }, m);
  assert.ok(active().includes(10));
  assert.ok(!active().includes(11));
  m.events = undoEvent(m.events);
  assert.ok(active().includes(11));
  assert.ok(!active().includes(18));
});
for (const incoming of [16, 4])
  test(`goalkeeper substitution to ${incoming} and re-entry credits goals to correct periods`, () => {
    const m = recoveryMatch();
    add(m, "goal", "opposition");
    if (incoming === 4)
      add(m, "substitution", "our", { playerOn: "18", playerOff: "4" });
    add(m, "substitution", "our", {
      playerOn: String(incoming),
      playerOff: "1",
    });
    add(m, "goal", "opposition");
    assert.equal(
      activeGoalkeepers(m).our.matchPlayerId,
      m.players[incoming - 1].id,
    );
    const stats = goalkeeperStatistics(m).filter((g) => g.team === "our");
    assert.equal(stats.find((g) => g.jerseyNumber === 1).gkGoalsConceded, 1);
    assert.equal(
      stats.find((g) => g.jerseyNumber === incoming).gkGoalsConceded,
      1,
    );
    add(m, "substitution", "our", {
      playerOn: "1",
      playerOff: String(incoming),
    });
    assert.equal(activeGoalkeepers(m).our.matchPlayerId, m.players[0].id);
    const periods = goalkeeperPeriods(m);
    assert.ok(periods.some((p) => p.jerseyNumber === incoming));
  });
for (const type of ["our-kickout", "opposition-kickout"])
  for (const outcome of ["won", "lost"])
    for (const mark of [false, true])
      test(`${type} ${outcome} mark=${mark}: exactly one attributed possession`, () => {
        const m = recoveryMatch();
        const e = add(m, type, type === "our-kickout" ? "our" : "opposition", {
          outcome,
          kickoutPerspective: "our",
          kickoutWinnerNumber: "8",
          mark,
          markPlayerNumber: mark && outcome === "won" ? "8" : "",
        });
        const team = outcome === "won" ? "our" : "opposition";
        assert.equal(participantRef(e, "kickoutWinner").team, team);
        const p = playerStatistics(m, team).find((p) => p.number === "8");
        assert.equal(p.kickoutPossessionsWon, 1);
        assert.equal(p.kickoutMarks, Number(mark));
        assert.equal(p.otherKickoutPossessionsWon, Number(!mark));
        assert.equal(m.events.length, 1);
        assert.equal(summarize(m.events, e.team).kickouts.total, 1);
      });
test("seven kickout possessions = four Marks and three other wins, edits clear/reassign without duplicates", () => {
  const m = recoveryMatch();
  for (let i = 0; i < 7; i++)
    add(m, "our-kickout", "our", {
      outcome: "won",
      mark: i < 4,
      kickoutWinnerNumber: "8",
      kickoutLength: "Long",
    });
  let p = playerStatistics(m, "our").find((p) => p.number === "8");
  assert.deepEqual(
    [p.kickoutPossessionsWon, p.kickoutMarks, p.otherKickoutPossessionsWon],
    [7, 4, 3],
  );
  m.events = saveEvent(m.events, { ...m.events[0], outcome: "out-of-play" }, m);
  p = playerStatistics(m, "our").find((p) => p.number === "8");
  assert.equal(p.kickoutPossessionsWon, 6);
  assert.equal(m.events[0].kickoutWinnerNumber, "");
  assert.equal(summarize(m.events, "our").kickouts.outOfPlay, 1);
});
test("official workbook ignores Setup/Instructions rows and preserves full names/duplicates, never invented jerseys", async () => {
  const d = parseOfficialSquad(
    await readWorkbook("tests/fixtures/squad-template/Official-routing.xlsx"),
  );
  assert.deepEqual(
    d.players.map((p) => p.name),
    ["Éabha Ní Bhriain", "Test Player Two", "Test Player Two"],
  );
  assert.ok(d.players.every((p) => p.number === ""));
});
test("period duration stays unknown across half boundary rather than fabricating first-half length", () => {
  const m = recoveryMatch();
  add(m, "substitution", "our", {
    playerOff: "1",
    playerOn: "16",
    half: 2,
    timeMs: 0,
  });
  const periods = goalkeeperPeriods(m);
  assert.equal(
    periods.find((p) => p.team === "our" && p.jerseyNumber === 1).durationMs,
    null,
  );
});
test("kickout edit rejects a winner submitted from the previous possession team", async () => {
  const { kickoutFormFields } = await import("../src/kickout-capture.js");
  const fields = kickoutFormFields(
    {
      kickoutResult: "lost",
      kickoutWinnerNumber: "8",
      kickoutWinnerTeam: "our",
    },
    { event: "our-kickout" },
  );
  assert.equal(fields.kickoutWinnerNumber, "");
});
test("correcting Mark to normal possession retains the same explicitly chosen winner", async () => {
  const { kickoutFormFields } = await import("../src/kickout-capture.js");
  const f = kickoutFormFields(
    { kickoutResult: "won", markPlayerNumber: "8", kickoutWinnerTeam: "our" },
    { event: "our-kickout" },
  );
  assert.equal(f.kickoutWinnerNumber, "8");
  assert.equal(f.mark, false);
  assert.equal(f.markPlayerNumber, "");
});
test("opposition wins on our kickouts never masquerade as their retained-kickout pattern", async () => {
  const { kickoutPlayerPatterns } = await import("../src/kickout-patterns.js");
  const m = recoveryMatch();
  for (let i = 0; i < 3; i++)
    add(m, "our-kickout", "our", { outcome: "lost", kickoutWinnerNumber: "8" });
  assert.equal(
    playerStatistics(m, "opposition").find((p) => p.number === "8")
      .kickoutPossessionsWon,
    3,
  );
  assert.deepEqual(kickoutPlayerPatterns(m), []);
});
