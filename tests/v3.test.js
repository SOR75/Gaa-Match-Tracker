import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretCommentary } from "../src/voice-parser.js";
import {
  createTapGuard,
  transformLocation,
  attackingDirection,
  onFieldNumbers,
} from "../src/matchday.js";
import {
  blankMatch,
  createEvent,
  saveEvent,
  undoEvent,
  totals,
} from "../src/domain.js";
import { startBlankMatch, loadMatch, persistMatch } from "../src/storage.js";

test("V3 deterministic commentary examples propose structured events without touching scores", () => {
  const cases = [
    [
      "Our kickout long won by number 8",
      {
        event: "our-kickout",
        team: "our",
        outcome: "won",
        playerNumber: "8",
        kickoutLength: "Long",
      },
    ],
    [
      "Number 8 runs through and scores a point",
      { event: "point", team: "our", playerNumber: "8" },
    ],
    [
      "Their kickout won by number 9",
      {
        event: "opposition-kickout",
        team: "opposition",
        outcome: "won",
        playerNumber: "9",
      },
    ],
    ["22 for 6", { event: "substitution", playerOn: "22", playerOff: "6" }],
    [
      "Number 15 wide",
      { event: "miss", playerNumber: "15", outcome: "missed" },
    ],
    ["Goal number 11", { event: "goal", playerNumber: "11" }],
    [
      "Two point score by number eight",
      { event: "two-point", playerNumber: "8" },
    ],
    [
      "twenty two for six",
      { event: "substitution", playerOn: "22", playerOff: "6" },
    ],
  ];
  for (const [text, expected] of cases) {
    const { candidate } = interpretCommentary(text);
    assert.ok(candidate, text);
    for (const [key, value] of Object.entries(expected))
      assert.equal(candidate[key], value, text);
  }
  assert.equal(
    interpretCommentary("goal number 11", "opposition").candidate.team,
    "opposition",
  );
  for (const text of [
    "maybe a point",
    "not a goal",
    "goal number 8 and point number 9",
    "our kickout won by number 8 then a goal",
    "number 8 passes to number 15 for a point",
    "22 for 22",
    "our and their kickout won",
    "kickout",
    "number zero wide",
  ])
    assert.equal(interpretCommentary(text).candidate, null, text);
});
test("normalized storage is unchanged by per-team and per-half display rotation", () => {
  const match = blankMatch(),
    location = { shotX: 0.2, shotY: 0.3 };
  for (const direction of ["top", "bottom"]) {
    const displayed = transformLocation(location, direction);
    const restored = transformLocation(displayed, direction);
    assert.ok(Math.abs(restored.shotX - location.shotX) < 1e-10);
    assert.ok(Math.abs(restored.shotY - location.shotY) < 1e-10);
  }
  assert.deepEqual(location, { shotX: 0.2, shotY: 0.3 });
  assert.equal(attackingDirection(match, "our", 1), "top");
  assert.equal(attackingDirection(match, "opposition", 1), "bottom");
  assert.equal(attackingDirection(match, "our", 2), "bottom");
  assert.equal(attackingDirection(match, "opposition", 2), "top");
  match.setup.ourFirstHalfAttacks = "bottom";
  assert.equal(attackingDirection(match, "our", 2), "top");
});
test("double tap guard rejects rapid same-action repeats but accepts other events and later taps", () => {
  const accept = createTapGuard();
  assert.equal(accept("point:our", 0), true);
  assert.equal(accept("point:our", 100), false);
  assert.equal(accept("point:our", 700), true);
  assert.equal(accept("goal:our", 710), true);
});
test("substitution persistence, edit and undo derive on-field players; scoring stays correct", () => {
  const match = blankMatch();
  match.players = [
    { id: "6", number: 6, name: "Starter", role: "starter" },
    { id: "22", number: 22, name: "Sub", role: "substitute" },
  ];
  const substitution = {
    ...createEvent(match, "substitution", "our"),
    playerOn: "22",
    playerOff: "6",
  };
  match.events = saveEvent(match.events, substitution);
  assert.deepEqual([...onFieldNumbers(match, "our")], ["22"]);
  assert.equal(match.players[0].role, "starter");
  match.events = saveEvent(match.events, { ...substitution, playerOn: "23" });
  assert.deepEqual([...onFieldNumbers(match, "our")], ["23"]);
  match.events = undoEvent(match.events);
  assert.deepEqual([...onFieldNumbers(match, "our")], ["6"]);
  assert.throws(() => saveEvent([], { ...substitution, playerOff: "22" }));
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
  match.events = [
    createEvent(match, "goal", "our"),
    createEvent(match, "two-point", "our"),
    substitution,
  ];
  persistMatch(match);
  assert.equal(loadMatch().match.events[2].playerOn, "22");
  assert.equal(totals(loadMatch().match.events, "our").total, 5);
  const next = startBlankMatch(match);
  assert.equal(next.error, "");
  assert.equal(next.match.setup.ourTeam, "");
  assert.deepEqual(next.match.players, []);
  assert.deepEqual(next.match.oppositionPlayers, []);
  assert.equal(
    JSON.parse(map.get(`sideline.match.archive.${match.id}`)).events.length,
    3,
  );
});
