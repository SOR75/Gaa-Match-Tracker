import { test } from "node:test";
import assert from "node:assert/strict";
import { blankMatch, createEvent, saveEvent } from "../src/domain.js";
import {
  snapshotSquad,
  persistSquads,
  loadSquads,
  loadSquadPlayers,
  deleteSavedSquad,
} from "../src/squads.js";
import {
  saveTeamSetup,
  loadTeamSetups,
  applyTeamSetup,
} from "../src/team-setups.js";
import { starterWarning, starterLineupKey } from "../src/starter-warning.js";
import { applyMatchLineup } from "../src/match-lineup.js";
import { playerReviews } from "../src/player-insights.js";
import { completeMatch } from "../src/history.js";
import { halfTimeAnalysis, analysisForScope } from "../src/half-time.js";
import {
  kickoutPlayerPatterns,
  KICKOUT_PLAYER_THRESHOLD,
} from "../src/kickout-patterns.js";
function storage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    map,
  };
}
function setup() {
  globalThis.localStorage = storage();
  const squad = snapshotSquad("County permanent Squad", [
    { name: "Isabel O'Regan", number: 9, role: "starter" },
    { name: "Zoe", number: 18, role: "substitute" },
  ]);
  persistSquads([squad]);
  const m = blankMatch();
  m.squadId = squad.id;
  m.players = loadSquadPlayers(squad);
  return { squad, m };
}
function record(m, type, fields = {}) {
  const e = { ...createEvent(m, type, fields.team || "our"), ...fields };
  m.events = saveEvent(m.events, e, m);
  return m.events.at(-1);
}
test("saved Team Setup restores numbers/roles with same permanent IDs and independent match IDs; new edits cannot rewrite source or historical matches", () => {
  const { squad, m } = setup(),
    before = JSON.stringify(m),
    library = JSON.stringify(loadSquads()),
    saved = saveTeamSetup("Starting team", squad.id, m.players);
  assert.deepEqual(Object.keys(saved.players[0]).sort(), [
    "number",
    "playerId",
    "role",
  ]);
  const loaded = applyTeamSetup(
    loadTeamSetups().setups[0],
    loadSquads().squads[0],
  );
  assert.deepEqual(
    loaded.map((p) => p.playerId),
    m.players.map((p) => p.playerId),
  );
  assert.deepEqual(
    loaded.map((p) => [p.number, p.role]),
    [
      [9, "starter"],
      [18, "substitute"],
    ],
  );
  assert.notEqual(loaded[0].matchPlayerId, m.players[0].matchPlayerId);
  loaded[0].number = 6;
  assert.equal(saved.players[0].number, 9);
  assert.equal(JSON.stringify(m), before);
  assert.equal(JSON.stringify(loadSquads()), library);
});
test("saving a duplicate setup name never overwrites existing saved defaults", () => {
  const { squad, m } = setup();
  saveTeamSetup("Team", squad.id, m.players);
  const raw = localStorage.getItem("sideline.team-setups.v1");
  assert.throws(
    () => saveTeamSetup(" team ", squad.id, m.players),
    /never overwritten/,
  );
  assert.equal(localStorage.getItem("sideline.team-setups.v1"), raw);
});
test("unlinked players cannot create permanent identities via Team Setup", () => {
  const { squad, m } = setup();
  m.players[0].playerId = null;
  assert.throws(
    () => saveTeamSetup("Unlinked", squad.id, m.players),
    /permanent Squad/,
  );
  assert.equal(loadTeamSetups().setups.length, 0);
});
test("missing original squad or removed member blocks setup use rather than inventing players; new members remain unassigned", () => {
  const { squad, m } = setup(),
    saved = saveTeamSetup("Team", squad.id, m.players);
  assert.throws(() => applyTeamSetup(saved, null), /original/);
  assert.throws(
    () => applyTeamSetup(saved, { ...squad, players: squad.players.slice(1) }),
    /no longer/,
  );
  const other = snapshotSquad("new", [{ name: "New member", number: null }])
      .players[0],
    players = applyTeamSetup(saved, {
      ...squad,
      players: [...squad.players, other],
    });
  assert.equal(players[2].role, "panel");
  assert.equal(players[2].number, null);
});
test("corrupt setup library is preserved and cannot be replaced by apparently empty data", () => {
  const { squad, m } = setup();
  localStorage.setItem("sideline.team-setups.v1", "corrupt");
  assert.match(loadTeamSetups().error, /preserved/);
  assert.throws(() => saveTeamSetup("No", squad.id, m.players), /preserved/);
  assert.equal(localStorage.getItem("sideline.team-setups.v1"), "corrupt");
});
for (const count of [11, 15, 16])
  test(`${count} starters: warning is advisory and never changes active roster; acknowledgement persists`, () => {
    const m = blankMatch();
    m.players = loadSquadPlayers(
      snapshotSquad(
        "Team",
        Array.from({ length: count }, (_, i) => ({
          name: `Member ${i + 1}`,
          number: i + 1,
          role: "starter",
        })),
      ),
    );
    const before = JSON.stringify(m.players);
    assert.equal(!!starterWarning(m), count !== 15);
    m.starterCountAcknowledgement = starterLineupKey(m);
    assert.equal(starterWarning(JSON.parse(JSON.stringify(m))), null);
    assert.equal(JSON.stringify(m.players), before);
    assert.equal(applyMatchLineup(m.players, m.players).length, count);
  });
test("starter acknowledgement is scoped to the lineup and not shown repeatedly once match tracking has begun", () => {
  const { m } = setup();
  m.starterCountAcknowledgement = starterLineupKey(m);
  m.players[1].role = "starter";
  assert.ok(starterWarning(m));
  record(m, "point");
  assert.equal(starterWarning(m), null);
  assert.equal(starterWarning(blankMatch()), null);
});
test("Delete Saved Squad changes library only: active/archive bytes, stored team setups and identity-based historical statistics survive", () => {
  const { squad, m } = setup();
  record(m, "point", { playerNumber: "9" });
  const ended = completeMatch(m),
    records = [{ id: m.id, match: ended }],
    before = playerReviews(records, [squad]);
  saveTeamSetup("Team", squad.id, m.players);
  localStorage.setItem("sideline.match.v1", JSON.stringify(m));
  localStorage.setItem("sideline.match.archive." + m.id, JSON.stringify(ended));
  const active = localStorage.getItem("sideline.match.v1"),
    archived = localStorage.getItem("sideline.match.archive." + m.id),
    saved = localStorage.getItem("sideline.team-setups.v1");
  deleteSavedSquad(squad.id);
  assert.equal(loadSquads().squads.length, 0);
  assert.equal(localStorage.getItem("sideline.match.v1"), active);
  assert.equal(
    localStorage.getItem("sideline.match.archive." + m.id),
    archived,
  );
  assert.equal(localStorage.getItem("sideline.team-setups.v1"), saved);
  const after = playerReviews(records, []);
  assert.equal(after[0].playerId, before[0].playerId);
  assert.equal(after[0].total, 1);
  assert.equal(after[0].matches[0].jersey, 9);
});
test("Dublin retained 6/6 with #8 credited on 5 enhances existing opposition WATCH with factual player concentration", () => {
  const m = blankMatch();
  m.setup.opposition = "Dublin";
  for (let i = 0; i < 6; i++)
    record(m, "opposition-kickout", {
      outcome: "lost",
      playerNumber: i < 5 ? "8" : "",
    });
  const d = halfTimeAnalysis(m),
    watch = d.observations.filter(
      (o) => o.kind === "watch" && o.title.startsWith("Opposition kickout"),
    );
  assert.equal(watch.length, 1);
  assert.match(watch[0].title, /#8/);
  assert.match(watch[0].detail, /We won 0 of 6/);
  assert.match(watch[0].detail, /Dublin retained 6 of 6/);
  assert.match(watch[0].detail, /#8 was credited on 5/);
  assert.doesNotMatch(
    watch[0].detail,
    /must|always|dominating|matchup|target area/i,
  );
});
test("our four credited kickout Marks produce WORKING player evidence without counting an additional kickout", () => {
  const { m } = setup();
  m.players[0].number = 7;
  for (let i = 0; i < 4; i++)
    record(m, "our-kickout", {
      outcome: "won",
      mark: true,
      markPlayerNumber: "7",
      playerNumber: "7",
    });
  const pattern = kickoutPlayerPatterns(m)[0];
  assert.equal(pattern.count, 4);
  assert.equal(pattern.marks, 4);
  assert.equal(m.events.length, 4);
  const d = halfTimeAnalysis(m);
  assert.equal(d.our.kickouts.total, 4);
  assert.ok(
    d.observations.some(
      (o) =>
        o.kind === "working" &&
        o.title.includes("#7 Isabel O'Regan") &&
        o.detail.includes("4 kickout Marks"),
    ),
  );
});
for (const count of [1, 2, 3])
  test(`player-pattern threshold: ${count} credited successful kickouts`, () => {
    const m = blankMatch();
    for (let i = 0; i < count; i++)
      record(m, "opposition-kickout", { outcome: "lost", playerNumber: "8" });
    assert.equal(
      kickoutPlayerPatterns(m).length,
      count >= KICKOUT_PLAYER_THRESHOLD ? 1 : 0,
    );
  });
test("losses, unknown outcomes and missing attribution do not create a player-success pattern", () => {
  const m = blankMatch();
  for (let i = 0; i < 5; i++) {
    record(m, "opposition-kickout", { outcome: "won", playerNumber: "8" });
    record(m, "our-kickout", { outcome: "lost", playerNumber: "9" });
    record(m, "our-kickout", { outcome: "unknown", playerNumber: "9" });
    record(m, "our-kickout", { outcome: "won" });
  }
  assert.deepEqual(kickoutPlayerPatterns(m), []);
});
test("Mark winner is credited on opposition kickouts independently of the opposition main-player field", () => {
  const { m } = setup();
  for (let i = 0; i < 4; i++)
    record(m, "opposition-kickout", {
      outcome: "won",
      mark: true,
      markPlayerNumber: "9",
      playerNumber: "8",
    });
  const p = kickoutPlayerPatterns(m);
  assert.equal(p.length, 1);
  assert.equal(p[0].team, "our");
  assert.equal(p[0].count, 4);
  assert.equal(p[0].marks, 4);
});
test("scoped observations update after edits/undo and same-name players are never merged", () => {
  const { m } = setup();
  m.players[1].name = m.players[0].name;
  for (let i = 0; i < 2; i++) {
    record(m, "our-kickout", { outcome: "won", playerNumber: "9" });
    record(m, "our-kickout", { outcome: "won", playerNumber: "18" });
  }
  assert.deepEqual(kickoutPlayerPatterns(m), []);
  record(m, "our-kickout", { outcome: "won", playerNumber: "9", half: 2 });
  assert.equal(
    analysisForScope(m, "FULL_MATCH").observations.some((o) =>
      o.title.includes("#9"),
    ),
    true,
  );
  assert.equal(
    analysisForScope(m, "H1").observations.some((o) => o.title.includes("#9")),
    false,
  );
  m.events = saveEvent(m.events, { ...m.events.at(-1), outcome: "lost" }, m);
  assert.deepEqual(kickoutPlayerPatterns(m), []);
});

test("legacy opposition kicking-team outcomes translate before individual patterns, and duplicate references never inflate event count", () => {
  const m = blankMatch();
  for (let i = 0; i < 3; i++) {
    const event = record(m, "opposition-kickout", {
      outcome: "won",
      playerNumber: "8",
    });
    delete event.kickoutPerspective;
  }
  const p = kickoutPlayerPatterns(m);
  assert.equal(p[0].team, "opposition");
  assert.equal(p[0].count, 3);
  m.events = [m.events[0], m.events[0], m.events[0]];
  assert.deepEqual(kickoutPlayerPatterns(m), []);
});
