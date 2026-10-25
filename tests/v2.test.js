import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  migrateMatch,
  totals,
  validMatch,
  normalizedLocation,
  saveEvent,
  undoEvent,
} from "../src/domain.js";
import { loadMatch, persistMatch } from "../src/storage.js";
import {
  summarize,
  playerStatistics,
  filterShots,
  scoringTimeline,
} from "../src/analysis.js";
import {
  snapshotSquad,
  loadSquadPlayers,
  validatePlayers,
  persistSquads,
  loadSquads,
} from "../src/squads.js";
import {
  parseDelimited,
  candidatesFromRows,
  candidatesFromText,
} from "../src/imports.js";
function store() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return values;
}
function legacy() {
  const match = blankMatch();
  match.schemaVersion = 1;
  delete match.oppositionPlayers;
  match.players = [
    {
      id: "old-player",
      number: 7,
      name: "Historical Player",
      role: "starter",
      position: "",
      notes: "",
    },
  ];
  match.events = Array.from({ length: 85 }, (_, index) => {
    const event = createEvent(
      match,
      index % 3 === 0 ? "goal" : index % 3 === 1 ? "point" : "our-kickout",
      "our",
      index * 1000,
    );
    delete event.shotX;
    delete event.shotY;
    delete event.dictatedNote;
    return event;
  });
  return match;
}
test("85-event legacy migration preserves IDs, timing, outcomes, scores and original backup", () => {
  const values = store(),
    old = legacy(),
    raw = JSON.stringify(old);
  values.set("sideline.match.v1", raw);
  const match = loadMatch().match;
  assert.equal(match.schemaVersion, 2);
  assert.equal(match.events.length, 85);
  assert.equal(validMatch(match), true);
  assert.deepEqual(totals(old.events, "our"), totals(match.events, "our"));
  for (let i = 0; i < 85; i++) {
    assert.deepEqual(
      {
        ...match.events[i],
        shotX: undefined,
        shotY: undefined,
        dictatedNote: undefined,
      },
      {
        ...old.events[i],
        shotX: undefined,
        shotY: undefined,
        dictatedNote: undefined,
      },
    );
  }
  assert.equal(values.get("sideline.match.v1"), raw);
  assert.equal(persistMatch(match), "");
  assert.equal(values.get("sideline.match.v1.backup"), raw);
  assert.equal(persistMatch(match), "");
  assert.equal(values.get("sideline.match.v1.backup"), raw);
  assert.equal(migrateMatch(old).events[0].shotX, null);
  assert.equal(old.events[0].shotX, undefined);
});
test("obvious outcomes are inferred at capture without asking; kickouts remain unset until quick choice", () => {
  const match = blankMatch();
  for (const [type, outcome] of Object.entries({
    goal: "scored",
    point: "scored",
    "two-point": "scored",
    miss: "missed",
    interception: "won",
    "turnover-won": "won",
    "turnover-lost": "lost",
  }))
    assert.equal(createEvent(match, type, "our").outcome, outcome);
  assert.equal(createEvent(match, "our-kickout", "our").outcome, "");
});
test("coordinates normalize independently of viewport size and survive edit, scoring and undo", () => {
  const a = normalizedLocation(60, 120, {
    left: 10,
    top: 20,
    width: 100,
    height: 200,
  });
  const b = normalizedLocation(220, 440, {
    left: 20,
    top: 40,
    width: 400,
    height: 800,
  });
  assert.deepEqual(a, b);
  assert.deepEqual(a, { shotX: 0.5, shotY: 0.5 });
  assert.deepEqual(
    normalizedLocation(-1, 500, { left: 0, top: 0, width: 100, height: 200 }),
    { shotX: 0, shotY: 1 },
  );
  const event = {
    ...createEvent(blankMatch(), "two-point", "our"),
    ...a,
    dictatedNote: "A note",
  };
  let events = saveEvent([], event);
  assert.equal(totals(events, "our").total, 2);
  events = saveEvent(events, { ...event, team: "opposition", shotX: 0.2 });
  assert.equal(events[0].shotY, 0.5);
  assert.equal(totals(events, "opposition").total, 2);
  assert.deepEqual(undoEvent(events), []);
  assert.throws(() => saveEvent([], { ...event, shotX: 2 }));
});
test("analysis uses only recorded data, known kickout outcomes and correct team/half/player filters", () => {
  const match = blankMatch();
  const make = (type, team = "our", extra = {}) => ({
    ...createEvent(match, type, team),
    ...extra,
  });
  match.events = [
    make("goal", "our", { playerNumber: "7", shotX: 0.2, shotY: 0.3 }),
    make("two-point", "our", { playerNumber: "7", half: 2 }),
    make("miss", "our", { playerNumber: "7" }),
    make("point", "opposition"),
    make("our-kickout", "our", {
      outcome: "won",
      kickoutLength: "Short",
      playerNumber: "8",
    }),
    make("our-kickout", "our", { outcome: "lost", kickoutLength: "Long" }),
    make("our-kickout"),
    make("turnover-won", "our", { playerNumber: "7" }),
    make("interception", "opposition", { playerNumber: "4" }),
    make("possession"),
  ];
  const our = summarize(match.events, "our");
  assert.equal(our.total, 5);
  assert.equal(our.attempts, 3);
  assert.equal(our.misses, 1);
  assert.equal(our.conversion, 66.7);
  assert.equal(our.kickouts.total, 3);
  assert.equal(our.kickouts.unknown, 1);
  assert.equal(our.kickouts.retention, 50);
  assert.equal(our.kickouts.short.success, 100);
  assert.equal(our.kickouts.long.success, 0);
  assert.equal(our.turnoversWon, 1);
  assert.equal(our.possessions, 1);
  assert.equal(summarize([], "our").conversion, null);
  assert.equal(summarize([], "our").kickouts.retention, null);
  assert.equal(
    filterShots(match.events, {
      team: "our",
      half: "2",
      player: "our:7",
      result: "score",
    }).length,
    1,
  );
  assert.equal(filterShots(match.events, { result: "miss" }).length, 1);
  assert.equal(
    playerStatistics(match, "our").find((player) => player.number === "7")
      .total,
    5,
  );
  assert.equal(
    playerStatistics(match, "our").find((player) => player.number === "8")
      .kickoutInvolvement,
    1,
  );
  const timeline = scoringTimeline(match.events);
  assert.equal(timeline.at(-1).our, 5);
  assert.equal(timeline.at(-1).opposition, 1);
  const edited = saveEvent(match.events, {
    ...match.events[0],
    event: "miss",
    outcome: "missed",
  });
  assert.equal(summarize(edited, "our").total, 2);
  assert.equal(summarize(edited, "our").successful, 1);
});
test("saved squad edits and loads are detached copies; jerseys validated per team", () => {
  store();
  const players = [
    {
      id: "p",
      number: 7,
      name: "Original",
      role: "starter",
      position: "Wing",
      notes: "Note",
    },
  ];
  const squad = snapshotSquad("Offaly U15", players);
  persistSquads([squad]);
  const copy = loadSquadPlayers(loadSquads().squads[0]);
  copy[0].name = "Changed";
  assert.equal(players[0].name, "Original");
  assert.equal(loadSquads().squads[0].players[0].name, "Original");
  const edited = snapshotSquad(
    "Offaly U15",
    [{ ...squad.players[0], name: "Library edit" }],
    squad.id,
  );
  persistSquads([edited]);
  assert.equal(players[0].name, "Original");
  assert.equal(loadSquadPlayers(edited)[0].position, "Wing");
  assert.throws(
    () => validatePlayers([{ number: 7, name: "Duplicate" }], players),
    /Duplicate/,
  );
  assert.throws(() => validatePlayers([{ number: 0, name: "Invalid" }]));
  assert.equal(validatePlayers([{ number: 7, name: "Opposition" }]).length, 1);
});
test("corrupt squad libraries are never overwritten", () => {
  const values = store();
  values.set("sideline.squads.v1", "bad");
  assert.ok(loadSquads().error);
  assert.throws(() => persistSquads([]));
  assert.equal(values.get("sideline.squads.v1"), "bad");
});
test("CSV, worksheet and document adapters preserve names and return candidates for review", () => {
  const rows = parseDelimited(
    'Jersey Number,Player Name,Role\r\n7,"O’Neill, Jamie",starter\r\n8,"A ""B"" C",substitute',
  );
  const candidates = candidatesFromRows(rows);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].name, "O’Neill, Jamie");
  assert.equal(candidates[1].role, "substitute");
  assert.match(candidates[0].confidence, /Review/);
  assert.equal(candidatesFromRows([[1, "Test Player"]])[0].number, "1");
  assert.deepEqual(
    candidatesFromText("TEAM SHEET\n7 Test Player\nNo recognized number").map(
      (player) => player.name,
    ),
    ["Test Player"],
  );
  assert.throws(() => parseDelimited('1,"unclosed'));
});
