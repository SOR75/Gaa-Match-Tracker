import test from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  undoEvent,
  validMatch,
  totals,
} from "../src/domain.js";
import {
  createMatchPlayer,
  createSquadPlayer,
  participantRef,
} from "../src/identity.js";
import { goalkeeperRef, goalkeeperStatistics } from "../src/goalkeepers.js";
import { summarize, playerStatistics } from "../src/analysis.js";
import { playerReviews } from "../src/player-insights.js";
import { kickoutChoices } from "../src/kickouts.js";
function fixture() {
  const m = blankMatch();
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  const p = (number, role = "starter") =>
    createMatchPlayer({
      ...createSquadPlayer({ name: `Player ${number}`, number, role }),
      id: undefined,
      matchPlayerId: undefined,
    });
  m.players = [p(1), p(16, "substitute"), p(8), p(10)];
  m.oppositionPlayers = [p(1), p(8), p(16, "substitute")];
  m.goalkeepers = {
    our: goalkeeperRef(m, "our", m.players[0].id),
    opposition: goalkeeperRef(m, "opposition", m.oppositionPlayers[0].id),
  };
  return m;
}
function add(m, type, team = "our", fields = {}) {
  const e = {
    ...createEvent(m, type, team),
    timeMs: m.events.length * 1000,
    ...fields,
  };
  m.events = saveEvent(m.events, e, m);
  return m.events.find((x) => x.id === e.id);
}
const keep = (m, number, team = "our") =>
  goalkeeperStatistics(m).find(
    (g) => g.team === team && g.jerseyNumber === number,
  );
test("kickout fifth choice is out of play, legacy unknown remains separate", () => {
  const m = fixture();
  assert.equal(
    kickoutChoices("our-kickout").at(-1).label,
    "Out of Play / Sideline",
  );
  add(m, "our-kickout", "our", {
    outcome: "out-of-play",
    mark: true,
    markPlayerNumber: "8",
  });
  assert.equal(m.events[0].mark, false);
  const k = summarize(m.events, "our").kickouts;
  assert.deepEqual(
    [k.total, k.won, k.lost, k.outOfPlay, k.unknown],
    [1, 0, 0, 1, 0],
  );
  assert.equal(k.retention, null);
  add(m, "our-kickout", "our", { outcome: "unknown" });
  assert.equal(summarize(m.events, "our").kickouts.unknown, 1);
  assert.equal(validMatch(JSON.parse(JSON.stringify(m))), true);
});
for (const team of ["our", "opposition"])
  for (const passType of ["hand", "kick"])
    test(`${team} ${passType} pass identities and retrospective association`, () => {
      const m = fixture(),
        shot = add(m, "point", team),
        p = add(m, "pass", team, {
          playerNumber: "1",
          receiverNumber: "8",
          passType,
          buildUpLink: shot.id,
          timeMs: 0,
        });
      assert.equal(
        participantRef(p).playerId,
        (team === "our" ? m.players : m.oppositionPlayers)[0].playerId,
      );
      assert.equal(participantRef(p, "receiver").jerseyNumber, 8);
      assert.equal(p.buildUpLink, shot.id);
      assert.equal(validMatch(JSON.parse(JSON.stringify(m))), true);
      assert.equal(totals(m.events, team).total, 1);
      m.events = saveEvent(
        m.events,
        { ...shot, event: "possession", outcome: "" },
        m,
      );
      assert.equal(m.events[1].buildUpLink, "");
      m.events = undoEvent(m.events);
      assert.equal(m.events.length, 1);
    });
test("undo removes dependent build-up link, links cannot cross teams", () => {
  const m = fixture();
  const pass = add(m, "pass"),
    shot = add(m, "miss");
  m.events = saveEvent(m.events, { ...pass, buildUpLink: shot.id }, m);
  m.events = undoEvent(m.events);
  assert.equal(m.events[0].buildUpLink, "");
  const away = add(m, "point", "opposition");
  m.events = saveEvent(m.events, { ...m.events[0], buildUpLink: away.id }, m);
  assert.equal(m.events[0].buildUpLink, "");
});
for (const fields of [
  { turnoverWinnerNumber: "8" },
  { turnoverLoserNumber: "8" },
  { turnoverWinnerNumber: "8", turnoverLoserNumber: "8" },
])
  test(`turnover roles ${JSON.stringify(fields)}`, () => {
    const m = fixture(),
      e = add(m, "turnover-won", "our", fields);
    assert.equal(m.events.length, 1);
    if (fields.turnoverWinnerNumber) {
      assert.equal(participantRef(e, "turnoverWinner").team, "our");
      assert.equal(
        playerStatistics(m, "our").find((p) => p.number === "8").turnoversWon,
        1,
      );
    }
    if (fields.turnoverLoserNumber) {
      assert.equal(participantRef(e, "turnoverLoser").team, "opposition");
      assert.equal(
        playerStatistics(m, "opposition").find((p) => p.number === "8")
          .turnoversLost,
        1,
      );
    }
  });
test("legacy turnover attribution still readable without permanent linking", () => {
  const m = fixture();
  const e = add(m, "turnover-lost", "our", { playerNumber: "8" });
  delete e.identityVersion;
  delete e.participants;
  m.events = [e];
  assert.equal(validMatch(m), true);
  assert.equal(
    playerStatistics(m, "our").find((p) => p.identityKey === "legacy:our:8")
      .turnoversLost,
    1,
  );
});
test("goalkeeper not assumed from jersey 1 in legacy matches", () => {
  const m = fixture();
  delete m.goalkeepers;
  add(m, "goal", "opposition");
  add(m, "miss", "opposition", { missReason: "short" });
  add(m, "our-kickout", "our", { outcome: "won" });
  assert.equal(goalkeeperStatistics(m).length, 0);
});
test("goalkeeper kickout totals lengths Marks and out of play derived once", () => {
  const m = fixture();
  for (const f of [
    { outcome: "won", kickoutLength: "Short" },
    { outcome: "won", kickoutLength: "Long", mark: true },
    { outcome: "lost", kickoutLength: "Long" },
    { outcome: "out-of-play", kickoutLength: "Long" },
  ])
    add(m, "our-kickout", "our", f);
  const g = keep(m, 1);
  assert.deepEqual(
    [
      g.gkKickouts,
      g.gkRetained,
      g.gkLost,
      g.gkShort,
      g.gkShortRetained,
      g.gkLong,
      g.gkLongRetained,
      g.gkMarks,
      g.gkOutOfPlay,
      g.gkRetention,
    ],
    [4, 2, 1, 1, 1, 3, 1, 1, 1, 50],
  );
  assert.equal(m.events.length, 4);
});
for (const reason of ["short", "wide", "post", "blocked", "saved", "other"])
  test(`only Short derives save: ${reason}`, () => {
    const m = fixture();
    add(m, "miss", "opposition", { missReason: reason });
    add(m, "miss", "our", { missReason: reason });
    assert.equal(keep(m, 1).gkSaves, Number(reason === "short"));
    assert.equal(keep(m, 1, "opposition").gkSaves, Number(reason === "short"));
    assert.equal(m.events.length, 2);
  });
test("goals are conceded not saves, goalkeeper substitution follows chronological half/time", () => {
  const m = fixture();
  add(m, "goal", "opposition");
  add(m, "substitution", "our", {
    playerOn: "16",
    playerOff: "1",
    half: 2,
    timeMs: 0,
  });
  add(m, "goal", "opposition", { half: 2, timeMs: 1000 });
  add(m, "goal", "opposition", { half: 2, timeMs: 2000 });
  add(m, "miss", "opposition", { half: 2, timeMs: 3000, missReason: "short" });
  add(m, "our-kickout", "our", { half: 2, timeMs: 4000, outcome: "won" });
  assert.equal(keep(m, 1).gkGoalsConceded, 1);
  assert.equal(keep(m, 16).gkGoalsConceded, 2);
  assert.equal(keep(m, 16).gkSaves, 1);
  assert.equal(keep(m, 16).gkKickouts, 1);
  assert.equal(keep(m, 1).gkSaves, 0);
  assert.equal(goalkeeperStatistics(m, { half: 1 }).length, 2);
});
test("explicit keeper change and clearing, edit undo recalculates", () => {
  const m = fixture();
  const change = add(m, "goalkeeper-change", "our", { playerNumber: "16" });
  const shot = add(m, "miss", "opposition", { missReason: "short" });
  assert.equal(keep(m, 16).gkSaves, 1);
  m.events = saveEvent(m.events, { ...change, playerNumber: "1" }, m);
  assert.equal(keep(m, 1).gkSaves, 1);
  m.events = saveEvent(m.events, { ...shot, missReason: "wide" }, m);
  assert.equal(keep(m, 1).gkSaves, 0);
  m.events = saveEvent(
    m.events,
    { ...shot, event: "goal", outcome: "scored" },
    m,
  );
  assert.equal(keep(m, 1).gkGoalsConceded, 1);
  m.events = undoEvent(m.events);
  assert.equal(keep(m, 1).gkGoalsConceded, 0);
  add(m, "goalkeeper-change", "our", { playerNumber: "" });
  add(m, "goal", "opposition");
  assert.equal(keep(m, 1).gkGoalsConceded, 0);
});
test("substitution same timestamp respects recording order and reentry", () => {
  const m = fixture();
  add(m, "goal", "opposition", { timeMs: 0 });
  add(m, "substitution", "our", { playerOff: "1", playerOn: "16", timeMs: 0 });
  add(m, "goal", "opposition", { timeMs: 0 });
  add(m, "substitution", "our", { playerOff: "16", playerOn: "1", timeMs: 0 });
  add(m, "goal", "opposition", { timeMs: 0 });
  assert.equal(keep(m, 1).gkGoalsConceded, 2);
  assert.equal(keep(m, 16).gkGoalsConceded, 1);
});
test("Player Review aggregates GK by permanent ID across jerseys, never same name/legacy", () => {
  const m = fixture();
  add(m, "our-kickout", "our", { outcome: "won" });
  add(m, "miss", "opposition", { missReason: "short" });
  const n = structuredClone(m);
  n.id = "second";
  n.players[0].number = 11;
  n.players[0].jerseyNumber = 11;
  n.goalkeepers.our.jerseyNumber = 11;
  const old = structuredClone(m);
  old.id = "legacy";
  delete old.goalkeepers;
  old.players[0].playerId = null;
  const q = playerReviews([{ match: m }, { match: n }, { match: old }]).find(
    (q) => q.playerId === m.players[0].playerId,
  );
  assert.equal(q.gkKickouts, 2);
  assert.equal(q.gkSaves, 2);
  assert.equal(q.goalkeeperAppearances, 2);
  assert.equal(q.gkRetention, 100);
});
test("turnover counterparty totals are derived from one incident, legacy totals unchanged", () => {
  const m = fixture();
  add(m, "turnover-won", "our", {
    turnoverWinnerNumber: "8",
    turnoverLoserNumber: "8",
  });
  assert.equal(summarize(m.events, "our").turnoversWon, 1);
  assert.equal(summarize(m.events, "opposition").turnoversLost, 1);
  assert.equal(m.events.length, 1);
});
test("pass receiver references clear on reclassification and changing team rebinds deliberately", () => {
  const m = fixture();
  const e = add(m, "pass", "our", { playerNumber: "1", receiverNumber: "8" });
  m.events = saveEvent(m.events, { ...e, team: "opposition" }, m);
  assert.equal(
    participantRef(m.events[0], "receiver").playerId,
    m.oppositionPlayers[1].playerId,
  );
  m.events = saveEvent(
    m.events,
    { ...m.events[0], event: "point", outcome: "scored" },
    m,
  );
  assert.equal(participantRef(m.events[0], "receiver"), null);
});
test("editing kickout outcome, length and keeper change recalculates without duplicate events", () => {
  const m = fixture();
  const ko = add(m, "our-kickout", "our", {
    outcome: "out-of-play",
    kickoutLength: "Short",
  });
  m.events = saveEvent(
    m.events,
    { ...ko, outcome: "won", mark: true, kickoutLength: "Long" },
    m,
  );
  assert.equal(keep(m, 1).gkOutOfPlay, 0);
  assert.equal(keep(m, 1).gkLongRetained, 1);
  assert.equal(keep(m, 1).gkMarks, 1);
  assert.equal(m.events.length, 1);
  m.events = undoEvent(m.events);
  assert.equal(goalkeeperStatistics(m).length, 0);
});
test("legacy Unknown edit never changes to won without an explicit choice", async () => {
  const { kickoutFieldsMarkup, kickoutFormFields } = await import(
    "../src/kickout-capture.js"
  );
  const m = fixture();
  const e = add(m, "our-kickout", "our", { outcome: "unknown" });
  assert.match(kickoutFieldsMarkup(e, m), /option value="unknown" selected/);
  assert.deepEqual(kickoutFormFields({ kickoutResult: "unknown" }, e), {});
});
test("new counterparty attribution works when an old match roster has only local row IDs", () => {
  const m = fixture();
  for (const p of [...m.players, ...m.oppositionPlayers]) {
    delete p.matchPlayerId;
    delete p.playerId;
  }
  const e = add(m, "turnover-won", "our", { turnoverLoserNumber: "8" });
  assert.equal(participantRef(e, "turnoverLoser").playerId, null);
  assert.equal(
    playerStatistics(m, "opposition").find((p) => p.number === "8")
      .turnoversLost,
    1,
  );
});
test("goalkeeper season and career totals use stored season IDs, not jersey/name/date guesses", () => {
  const a = fixture();
  a.seasonId = "season-A";
  add(a, "our-kickout", "our", { outcome: "won" });
  const b = structuredClone(a);
  b.id = "match-B";
  b.seasonId = "season-B";
  b.players[0].number = 11;
  b.goalkeepers.our.jerseyNumber = 11;
  const c = structuredClone(a);
  c.id = "match-C";
  delete c.seasonId;
  const p = playerReviews([{ match: a }, { match: b }, { match: c }]).find(
    (p) => p.playerId === a.players[0].playerId,
  );
  assert.equal(p.gkKickouts, 3);
  assert.equal(p.goalkeeperSeasons.length, 3);
  assert.equal(
    p.goalkeeperSeasons.find((s) => s.seasonId === "season-A").gkKickouts,
    1,
  );
  assert.equal(
    p.goalkeeperSeasons.find((s) => s.seasonId === null).label,
    "Season not recorded",
  );
});
