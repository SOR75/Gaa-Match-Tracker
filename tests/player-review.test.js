import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  undoEvent,
} from "../src/domain.js";
import { snapshotSquad, loadSquadPlayers } from "../src/squads.js";
import { createMatchPlayer } from "../src/identity.js";
import {
  onFieldKeys,
  playerKey,
  participationFor,
  substitutionChoices,
} from "../src/participation.js";
import { onFieldNumbers } from "../src/matchday.js";
import { attributionRoster } from "../src/player-credit.js";
import { playerReviews } from "../src/player-insights.js";
import { applyMatchLineup } from "../src/match-lineup.js";
import { completeMatch, historySnapshot } from "../src/history.js";
const squad = () =>
  snapshotSquad("County", [
    { name: "Isabel O'Regan", number: 8, role: "starter" },
    { name: "Starter Defender", number: 3, role: "starter" },
    { name: "Unused Bench", number: 22, role: "substitute" },
  ]);
function make(s = squad()) {
  const m = blankMatch();
  m.players = loadSquadPlayers(s);
  m.squadId = s.id;
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  return m;
}
function record(m, type, fields = {}) {
  const e = { ...createEvent(m, type, "our"), ...fields };
  m.events = saveEvent(m.events, e, m);
  return m.events.find((v) => v.id === e.id);
}
const archive = (m) => ({
  id: m.id,
  match: historySnapshot({ match: completeMatch(m) }),
});
test("Isabel #8 and #6 are ONE permanent profile, with correct participation, combined stats and immutable historical jerseys", () => {
  const s = squad(),
    a = make(s),
    b = make(s);
  a.setup.date = "2026-10-01";
  b.setup.date = "2026-10-08";
  a.setup.opposition = "Match A";
  b.setup.opposition = "Match B";
  record(a, "point", { playerNumber: "8" });
  record(a, "miss", { playerNumber: "8", missReason: "blocked" });
  record(a, "defensive-block", { playerNumber: "8" });
  b.players[0] = createMatchPlayer({
    ...b.players[0],
    number: 6,
    role: "substitute",
  });
  record(b, "substitution", { playerOn: "6", playerOff: "3" });
  record(b, "two-point", { playerNumber: "6" });
  record(b, "interception", { playerNumber: "6" });
  record(b, "opposition-kickout", {
    outcome: "won",
    mark: true,
    markPlayerNumber: "6",
  });
  const records = [archive(a), archive(b)],
    before = JSON.stringify(records),
    reviews = playerReviews(records, [s]),
    p = reviews.find((p) => p.playerId === s.players[0].playerId),
    bench = reviews.find((p) => p.playerId === s.players[2].playerId);
  assert.equal(reviews.filter((p) => p.name === "Isabel O'Regan").length, 1);
  assert.equal(p.appearances, 2);
  assert.equal(p.starts, 1);
  assert.equal(p.substituteAppearances, 1);
  assert.equal(p.named, 2);
  assert.deepEqual(
    p.matches.map((m) => [m.opponent, m.jersey]),
    [
      ["Match B", 6],
      ["Match A", 8],
    ],
  );
  assert.equal(p.attempts, 3);
  assert.equal(p.successful, 2);
  assert.equal(p.total, 3);
  assert.equal(p.blockedAttempts, 1);
  assert.equal(p.defensiveBlocks, 1);
  assert.equal(p.interceptions, 1);
  assert.equal(p.kickoutMarks, 1);
  assert.equal(p.conversion, 66.7);
  assert.deepEqual(p.recent, { sample: 2, played: 2, started: 1 });
  assert.equal(bench.named, 2);
  assert.equal(bench.appearances, 0);
  assert.equal(bench.didNotPlay, 2);
  const future = make(s);
  future.players[0].number = 11;
  assert.equal(JSON.stringify(records), before);
});
test("duplicate names stay separate; legacy/unlinked same-name/jersey records never join a permanent profile", () => {
  const s = snapshotSquad("Duplicates", [
      { name: "Same Name", number: 6 },
      { name: "Same Name", number: 8 },
    ]),
    m = make(s);
  record(m, "goal", { playerNumber: "6" });
  record(m, "point", { playerNumber: "8" });
  const legacy = structuredClone(m);
  legacy.id = "legacy";
  legacy.players.forEach((p) => {
    delete p.playerId;
    delete p.matchPlayerId;
  });
  legacy.events.forEach((e) => {
    delete e.identityVersion;
    delete e.participants;
  });
  const p = playerReviews([archive(m), archive(legacy)], [s]);
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((v) => v.total).sort(), [1, 3]);
  assert.ok(p.every((v) => v.named === 1));
});
test("active current record replaces stale archived same ID instead of double-counting", () => {
  const s = squad(),
    m = make(s);
  record(m, "point", { playerNumber: "8" });
  const old = archive(m);
  record(m, "goal", { playerNumber: "8" });
  const p = playerReviews([old], [s], m)[0];
  assert.equal(p.matches.length, 1);
  assert.equal(p.attempts, 2);
});
test("recent sample uses at most six actual qualifying matches; blank setup alone proves no appearance", () => {
  const s = squad(),
    records = Array.from({ length: 8 }, (_, i) => {
      const m = make(s);
      m.setup.date = `2026-10-${String(i + 1).padStart(2, "0")}`;
      record(m, "point");
      return archive(m);
    });
  const blank = make(s);
  assert.equal(playerReviews([], [s], blank)[0].appearances, 0);
  const p = playerReviews(records, [s])[0];
  assert.deepEqual(p.recent, { sample: 6, played: 6, started: 6 });
});
test("stable referenced action proves an appearance, not a squad listing or legacy number-only event", () => {
  const s = squad(),
    m = make(s);
  m.players[0].role = "substitute";
  record(m, "interception", { playerNumber: "8" });
  assert.equal(participationFor(m, m.players[0]).appeared, true);
  delete m.events[0].identityVersion;
  delete m.events[0].participants;
  assert.equal(participationFor(m, m.players[0]).appeared, false);
});
test("substitutions reconstruct active XV, allow re-entry and distinguish ON bench from OFF active", () => {
  const m = make(),
    id = m.players[0].matchPlayerId;
  assert.equal(onFieldKeys(m, "our").has(`id:${id}`), true);
  const e = record(m, "substitution", { playerOn: "22", playerOff: "8" });
  assert.deepEqual([...onFieldNumbers(m, "our")].sort(), ["22", "3"]);
  assert.deepEqual(
    attributionRoster(m, "our").players.map((p) => p.number),
    [3, 22],
  );
  let choices = substitutionChoices(m, createEvent(m, "substitution", "our"));
  assert.deepEqual(
    choices.on.map((p) => p.number),
    [8],
  );
  assert.deepEqual(choices.off.map((p) => p.number).sort(), [22, 3]);
  record(m, "substitution", { playerOn: "8", playerOff: "22" });
  assert.equal(onFieldKeys(m, "our").has(`id:${id}`), true);
  m.events = undoEvent(m.events);
  assert.equal(onFieldKeys(m, "our").has(`id:${id}`), false);
  m.events = undoEvent(m.events);
  assert.equal(onFieldKeys(m, "our").has(`id:${id}`), true);
  m.events = saveEvent([], { ...e, playerOff: "3" }, m);
  assert.deepEqual([...onFieldNumbers(m, "our")].sort(), ["22", "8"]);
  const restored = historySnapshot({ match: JSON.parse(JSON.stringify(m)) });
  assert.deepEqual(
    [...onFieldNumbers(restored, "our")],
    [...onFieldNumbers(m, "our")],
  );
});
test("all ordinary OUR selectors filter bench/panel but history editing includes recorded off players", () => {
  const m = make();
  record(m, "substitution", { playerOn: "22", playerOff: "8" });
  assert.deepEqual(
    attributionRoster(m, "our").players.map((p) => p.number),
    [3, 22],
  );
  assert.equal(
    attributionRoster(m, "our", { includeInactive: true }).players.length,
    3,
  );
  m.oppositionPlayers = m.players;
  assert.equal(attributionRoster(m, "opposition").players.length, 3);
});
test("numberless starting players retain local active identity; match-day load ignores default collisions and starts unassigned", () => {
  const s = squad();
  s.players[1].number = 8;
  const m = blankMatch();
  m.players = loadSquadPlayers(s, [], { matchDay: true });
  assert.ok(m.players.every((p) => p.number === null && p.role === "panel"));
  assert.equal(new Set(m.players.map((p) => p.playerId)).size, 3);
  m.players[0].role = "starter";
  assert.equal(onFieldKeys(m, "our").has(playerKey(m.players[0])), true);
});
test("batch today-team edit swaps numbers atomically, preserves identities and does not mutate Saved Squad or old event attribution", () => {
  const s = squad(),
    m = make(s),
    old = JSON.stringify(s),
    e = record(m, "point", { playerNumber: "8" }),
    ids = m.players.map((p) => p.playerId);
  m.players = applyMatchLineup(
    m.players,
    m.players.map((p, i) => ({
      id: p.id,
      number: i === 0 ? 3 : i === 1 ? 8 : 22,
      role: p.role,
    })),
  );
  assert.deepEqual(
    m.players.map((p) => p.playerId),
    ids,
  );
  assert.equal(m.events[0].participants.player.playerId, ids[0]);
  assert.equal(m.events[0].playerNumber, "8");
  assert.equal(JSON.stringify(s), old);
  assert.throws(
    () =>
      applyMatchLineup(
        m.players,
        m.players.map((p) => ({ id: p.id, number: 6, role: p.role })),
      ),
    /Duplicate/,
  );
});
test("reloading Saved Squad in same match preserves today’s assigned jersey/role/local ID", () => {
  const s = squad(),
    m = make(s);
  const id = m.players[0].matchPlayerId;
  m.players[0].number = 11;
  m.players[0].role = "substitute";
  const loaded = loadSquadPlayers(s, m.players, { matchDay: true });
  assert.equal(loaded[0].number, 11);
  assert.equal(loaded[0].role, "substitute");
  assert.equal(loaded[0].matchPlayerId, id);
});

test("old bulk-loaded roster with over fifteen default starters cannot manufacture appearances or DNP; explicit actions remain evidence", () => {
  const s = snapshotSquad(
      "Old roster",
      Array.from({ length: 29 }, (_, i) => ({
        name: `Member ${i + 1}`,
        number: i + 1,
        role: "starter",
      })),
    ),
    m = make(s);
  record(m, "point", { playerNumber: "8" });
  const profiles = playerReviews([archive(m)], [s]);
  assert.equal(profiles.filter((p) => p.appearances).length, 1);
  assert.equal(
    profiles.reduce((n, p) => n + p.starts, 0),
    0,
  );
  assert.equal(
    profiles.reduce((n, p) => n + p.didNotPlay, 0),
    0,
  );
  assert.match(profiles[0].matches[0].participationWarning, /15 starters/);
});

test("same-day recent match ordering uses completion evidence before arbitrary match IDs", () => {
  const s = squad(),
    a = make(s),
    b = make(s);
  a.id = "zzz";
  b.id = "aaa";
  a.setup.opposition = "Earlier";
  b.setup.opposition = "Later";
  a.setup.date = b.setup.date = "2026-10-28";
  record(a, "point");
  record(b, "point");
  const first = archive(a),
    second = archive(b);
  first.match.lifecycle.completedAt = "2026-10-28T12:00:00Z";
  second.match.lifecycle.completedAt = "2026-10-28T16:00:00Z";
  assert.deepEqual(
    playerReviews([first, second], [s])[0].matches.map((m) => m.opponent),
    ["Later", "Earlier"],
  );
});
test("substitution participation requires matching permanent identity as well as local matchPlayerId", () => {
  const s = squad(),
    m = make(s);
  m.players[0].role = "substitute";
  record(m, "substitution", { playerOn: "8", playerOff: "3" });
  const changed = { ...m.players[0], playerId: s.players[2].playerId };
  assert.equal(participationFor(m, changed).appeared, false);
});
