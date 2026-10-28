import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  validMatch,
  migrateMatch,
  totals,
  uid,
} from "../src/domain.js";
import {
  createMatchPlayer,
  validPlayerId,
  resolveParticipant,
  participantRef,
} from "../src/identity.js";
import {
  validatePlayers,
  snapshotSquad,
  loadSquadPlayers,
  loadSquads,
  persistSquads,
} from "../src/squads.js";
import { playerStatistics, filterShots } from "../src/analysis.js";
import { completeMatch, historySnapshot } from "../src/history.js";
import { createHistoryRepository } from "../src/history-repository.js";
import { onFieldNumbers } from "../src/matchday.js";
function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    map,
  };
}
const squad = () =>
  snapshotSquad("Club panel", [
    {
      name: "Isabel",
      number: 6,
      role: "starter",
      position: "Centre Half Back",
    },
    { name: "Sarah", number: 22, role: "substitute" },
  ]);
function setup(s = squad()) {
  const m = blankMatch();
  m.players = loadSquadPlayers(s);
  m.squadId = s.id;
  return m;
}
function record(m, type = "point", fields = {}) {
  const e = { ...createEvent(m, type, fields.team || "our"), ...fields };
  m.events = saveEvent(m.events, e, m);
  return m.events.find((v) => v.id === e.id);
}

test("validation is pure and never creates or regenerates a player identity", () => {
  const p = { id: "local", playerId: uid(), name: "Isabel", number: 6 };
  assert.equal(validatePlayers([p])[0].playerId, p.playerId);
  assert.equal(validatePlayers([p])[0].id, "local");
  assert.equal(
    validatePlayers([{ name: "Ad hoc", number: 2 }])[0].id,
    undefined,
  );
  assert.equal(createMatchPlayer({ name: "Ad hoc", number: 2 }).playerId, null);
});
test("permanent UUID survives save, reload, load, saved name/jersey/position edit and second reload", () => {
  globalThis.localStorage = storage();
  const s = squad(),
    id = s.players[0].playerId;
  assert.ok(validPlayerId(id));
  assert.equal(s.players[0].id, id);
  persistSquads([s]);
  const first = loadSquadPlayers(loadSquads().squads[0]);
  const saved = loadSquads().squads[0];
  saved.players[0] = {
    ...saved.players[0],
    name: "Isabel Updated",
    number: 8,
    position: "Midfield",
  };
  const edited = snapshotSquad(saved.name, saved.players, saved.id, saved);
  persistSquads([edited]);
  const second = loadSquadPlayers(loadSquads().squads[0]);
  assert.equal(second[0].playerId, id);
  assert.equal(first[0].playerId, id);
  assert.notEqual(second[0].matchPlayerId, first[0].matchPlayerId);
  assert.equal(second[0].sourceSquadId, s.id);
  assert.equal(second[0].nameSnapshot, "Isabel Updated");
  assert.equal(second[0].jerseyNumber, 8);
  assert.equal(first[0].name, "Isabel");
  assert.equal(first[0].number, 6);
  assert.equal(
    loadSquadPlayers(edited, second)[0].matchPlayerId,
    second[0].matchPlayerId,
  );
});
test("Isabel #6 → #8 → #11 retains one permanent identity across three independent historical matches", () => {
  const s = squad(),
    id = s.players[0].playerId;
  const matches = [6, 8, 11].map((number) => {
    const m = setup(s);
    m.players[0] = createMatchPlayer({ ...m.players[0], number });
    record(m, "point", {
      playerNumber: String(number),
      shotX: 0.23,
      shotY: 0.71,
    });
    return historySnapshot({
      match: JSON.parse(JSON.stringify(completeMatch(m))),
    });
  });
  assert.equal(new Set(matches.map((m) => m.players[0].matchPlayerId)).size, 3);
  assert.deepEqual(
    matches.map((m) => m.players[0].number),
    [6, 8, 11],
  );
  for (const [i, m] of matches.entries()) {
    assert.ok(validMatch(m));
    assert.equal(m.players[0].playerId, id);
    assert.equal(m.events[0].participants.player.playerId, id);
    assert.equal(m.events[0].participants.player.jerseyNumber, [6, 8, 11][i]);
    const stats = playerStatistics(m, "our").find((p) => p.playerId === id);
    assert.equal(stats.attempts, 1);
    assert.equal(stats.total, 1);
    assert.equal(m.events[0].shotX, 0.23);
    assert.equal(m.events[0].shotY, 0.71);
  }
  assert.equal(
    matches
      .flatMap((m) => playerStatistics(m, "our"))
      .filter((p) => p.playerId === id)
      .reduce((n, p) => n + p.attempts, 0),
    3,
  );
});
test("duplicate names remain separate permanent players and analysis groups", () => {
  const s = snapshotSquad("Names", [
      { name: "Alex Kelly", number: 4 },
      { name: "Alex Kelly", number: 8 },
    ]),
    m = setup(s);
  assert.notEqual(s.players[0].playerId, s.players[1].playerId);
  record(m, "goal", { playerNumber: "4" });
  record(m, "point", { playerNumber: "8" });
  const stats = playerStatistics(m, "our");
  assert.equal(stats.length, 2);
  assert.deepEqual(
    stats.map((p) => p.total),
    [3, 1],
  );
  assert.equal(new Set(stats.map((p) => p.playerId)).size, 2);
});
test("new shooter attribution survives jersey edits, notes edits and replacement roster without number reassignment", () => {
  const m = setup(),
    e = record(m, "goal", { playerNumber: "6" }),
    id = m.players[0].playerId;
  m.players[0] = createMatchPlayer({
    ...m.players[0],
    number: 8,
    name: "Isabel Corrected",
  });
  m.events = saveEvent(m.events, { ...e, notes: "kept" }, m);
  assert.equal(m.events[0].participants.player.playerId, id);
  assert.equal(m.events[0].playerNumber, "6");
  assert.equal(resolveParticipant(m, m.events[0]).name, "Isabel Corrected");
  assert.equal(
    playerStatistics(m, "our").find((p) => p.playerId === id).total,
    3,
  );
  assert.equal(
    filterShots(m.events, { player: `id:our:${m.players[0].matchPlayerId}` })
      .length,
    1,
  );
  m.players = loadSquadPlayers(
    snapshotSquad("Other", [{ name: "Different #6", number: 6 }]),
  );
  assert.equal(resolveParticipant(m, m.events[0]).name, "Isabel");
  assert.equal(
    playerStatistics(m, "our").find((p) => p.playerId === id).total,
    3,
  );
});
test("shot player edits change/clear stable refs without changing score", () => {
  const m = setup();
  let e = record(m, "point", { playerNumber: "6" });
  e = { ...e, playerNumber: "22" };
  m.events = saveEvent(m.events, e, m);
  assert.equal(m.events[0].participants.player.playerId, m.players[1].playerId);
  assert.equal(
    playerStatistics(m, "our").find((p) => p.playerId === m.players[1].playerId)
      .attempts,
    1,
  );
  m.events = saveEvent(m.events, { ...m.events[0], playerNumber: "" }, m);
  assert.equal(m.events[0].participants.player, null);
  assert.equal(totals(m.events, "our").total, 1);
});
for (const type of ["our-kickout", "opposition-kickout"])
  test(`${type}: our Mark winner is identified independently of kicking team`, () => {
    const m = setup();
    const e = record(m, type, {
      outcome: "won",
      mark: true,
      markPlayerNumber: "6",
    });
    assert.equal(e.participants.markWinner.playerId, m.players[0].playerId);
    assert.equal(e.participants.markWinner.team, "our");
    assert.equal(m.events.length, 1);
    assert.equal(
      playerStatistics(m, "our").find(
        (p) => p.playerId === m.players[0].playerId,
      ).kickoutMarks,
      1,
    );
    m.events = saveEvent(m.events, { ...e, outcome: "lost" }, m);
    assert.equal(m.events[0].participants.markWinner, null);
    assert.equal(
      playerStatistics(m, "our").find(
        (p) => p.playerId === m.players[0].playerId,
      ).kickoutMarks,
      0,
    );
  });
test("standalone defensive block carries stable blocker and main player without creating a shot", () => {
  const m = setup(),
    e = record(m, "defensive-block", { playerNumber: "6" });
  assert.equal(e.participants.blocker.playerId, m.players[0].playerId);
  const p = playerStatistics(m, "our").find(
    (p) => p.playerId === m.players[0].playerId,
  );
  assert.equal(p.defensiveBlocks, 1);
  assert.equal(p.attempts, 0);
  assert.equal(m.events.length, 1);
});
test("opposition blocked shot keeps distinct shooter and our blocker references; edit clears blocker", () => {
  const m = setup();
  m.oppositionPlayers = loadSquadPlayers(
    snapshotSquad("Visitors", [{ name: "Other shooter", number: 10 }]),
  );
  const e = record(m, "miss", {
    team: "opposition",
    playerNumber: "10",
    missReason: "blocked",
    blockedByNumber: "6",
  });
  assert.equal(e.participants.player.playerId, m.oppositionPlayers[0].playerId);
  assert.equal(e.participants.blocker.playerId, m.players[0].playerId);
  assert.equal(playerStatistics(m, "our")[0].defensiveBlocks, 1);
  m.events = saveEvent(m.events, { ...e, missReason: "wide" }, m);
  assert.equal(m.events[0].participants.blocker, null);
  assert.equal(playerStatistics(m, "our")[0].defensiveBlocks, 0);
});
test("substitution on/off store separate identity references and on-field tracking follows local identity", () => {
  const m = setup(),
    e = record(m, "substitution", { playerOn: "22", playerOff: "6" });
  assert.equal(e.participants.playerOn.playerId, m.players[1].playerId);
  assert.equal(e.participants.playerOff.playerId, m.players[0].playerId);
  assert.deepEqual([...onFieldNumbers(m, "our")], ["22"]);
  m.players[1] = createMatchPlayer({ ...m.players[1], number: 23 });
  assert.deepEqual([...onFieldNumbers(m, "our")], ["23"]);
});
test("number-only legacy events remain unlinked through edits and linked-squad loading", () => {
  const m = setup(),
    e = { ...createEvent(m, "point", "our"), playerNumber: "6" };
  delete e.identityVersion;
  delete e.participants;
  m.events = saveEvent([], e, m);
  m.events = saveEvent(m.events, { ...e, notes: "legacy" }, m);
  assert.equal(m.events[0].identityVersion, undefined);
  assert.equal(resolveParticipant(m, e).playerId, null);
  const p = playerStatistics(m, "our").find((p) => p.attempts === 1);
  assert.equal(p.playerId, null);
  assert.match(p.name, /legacy\/unlinked/);
  assert.equal(
    playerStatistics(m, "our").find((p) => p.playerId === m.players[0].playerId)
      .attempts,
    0,
  );
  assert.ok(validMatch(migrateMatch(JSON.parse(JSON.stringify(m)))));
});
test("new fallback-number event is not retroactively linked when a squad is later added", () => {
  const m = blankMatch(),
    e = record(m, "point", { playerNumber: "6" }),
    raw = JSON.stringify(e);
  m.players = loadSquadPlayers(squad());
  m.events = saveEvent(m.events, { ...e, notes: "later" }, m);
  assert.equal(m.events[0].participants.player, null);
  assert.equal(resolveParticipant(m, e).playerId, null);
  assert.equal(resolveParticipant(m, e).name, "Isabel");
  assert.equal(JSON.stringify(e), raw);
});
test("ad hoc/imported match players have stable local identity but no fabricated permanent linkage", () => {
  const m = blankMatch();
  m.players = [
    createMatchPlayer({
      ...validatePlayers([{ name: "Imported", number: 4 }])[0],
      id: "source-row",
    }),
  ];
  const e = record(m, "point", { playerNumber: "4" });
  assert.equal(e.participants.player.matchPlayerId, "source-row");
  assert.equal(e.participants.player.playerId, null);
  assert.equal(playerStatistics(m, "our")[0].playerId, null);
  assert.ok(validMatch(m));
});
test("legacy squad migration is durable, preserves v1 bytes and never merges repeated names or old duplicate IDs", () => {
  const old = {
    version: 1,
    squads: [
      {
        id: "s1",
        name: "Old",
        players: [
          { id: "old-id", name: "Same", number: 4, role: "starter" },
          { id: "old-id", name: "Same", number: 6, role: "starter" },
        ],
      },
    ],
  };
  const raw = JSON.stringify(old);
  globalThis.localStorage = storage({ "sideline.squads.v1": raw });
  const first = loadSquads();
  assert.equal(first.error, "");
  assert.notEqual(
    first.squads[0].players[0].playerId,
    first.squads[0].players[1].playerId,
  );
  assert.deepEqual(loadSquads(), first);
  assert.equal(localStorage.getItem("sideline.squads.v1"), raw);
});
test("failed identity migration never exposes ephemeral UUIDs or overwrites the legacy library", () => {
  const s = squad(),
    raw = JSON.stringify({ version: 1, squads: [s] });
  globalThis.localStorage = storage({ "sideline.squads.v1": raw });
  localStorage.setItem = () => {
    throw Error("Quota");
  };
  const result = loadSquads();
  assert.equal(result.squads.length, 0);
  assert.match(result.error, /preserved/);
  assert.equal(localStorage.getItem("sideline.squads.v1"), raw);
});
test("same permanent player may belong to multiple squads without using names as membership keys", () => {
  globalThis.localStorage = storage();
  const a = squad(),
    b = snapshotSquad("Other squad", [a.players[0]]);
  persistSquads([a, b]);
  assert.equal(
    loadSquads().squads[1].players[0].playerId,
    a.players[0].playerId,
  );
});
test("whole-payload History archive and Resume preserve identity, coordinates, score and read-only snapshots", async () => {
  const s = squad(),
    m = setup(s),
    st = storage(),
    repo = createHistoryRepository({ storage: st, indexedDB: null });
  record(m, "two-point", { playerNumber: "6", shotX: 0.31, shotY: 0.65 });
  await repo.startNew(m);
  const result = await repo.list();
  const entry = result.records.find((r) => r.id === m.id);
  const viewed = historySnapshot(entry);
  assert.deepEqual(viewed.players, m.players);
  assert.deepEqual(viewed.events, m.events);
  assert.deepEqual(playerStatistics(viewed, "our"), playerStatistics(m, "our"));
  assert.equal(totals(viewed.events, "our").total, 2);
  const resumed = await repo.resume(m.id, blankMatch());
  assert.deepEqual(resumed.players, m.players);
  assert.deepEqual(resumed.events, m.events);
  assert.equal(resumed.squadId, s.id);
});
test("invalid new identity fields are rejected without making legacy match data invalid", () => {
  const m = setup(),
    e = record(m, "point", { playerNumber: "6" });
  assert.ok(validMatch(m));
  m.events[0] = {
    ...e,
    participants: {
      ...e.participants,
      player: { ...e.participants.player, playerId: "not-a-uuid" },
    },
  };
  assert.equal(validMatch(m), false);
  assert.equal(participantRef(m.events[0]), null);
  m.events = [];
  m.players[0].playerId = "invalid";
  assert.equal(validMatch(m), false);
});

test("identity-aware and legacy per-player statistics retain exactly the same sporting calculations", () => {
  const linked = setup();
  for (const [type, fields] of [
    ["goal", {}],
    ["point", {}],
    ["two-point", {}],
    ["miss", { missReason: "blocked" }],
    ["miss", { missReason: "wide" }],
    ["turnover-won", {}],
    ["turnover-lost", {}],
    ["interception", {}],
    ["possession", {}],
    [
      "our-kickout",
      {
        outcome: "won",
        mark: true,
        markPlayerNumber: "6",
        kickoutLength: "Long",
      },
    ],
    ["defensive-block", {}],
  ])
    record(linked, type, { playerNumber: "6", ...fields });
  const legacy = structuredClone(linked);
  for (const p of legacy.players) {
    delete p.matchPlayerId;
    delete p.playerId;
  }
  for (const e of legacy.events) {
    delete e.identityVersion;
    delete e.participants;
  }
  const a = playerStatistics(linked, "our").find((p) => p.number === "6"),
    b = playerStatistics(legacy, "our").find((p) => p.number === "6");
  for (const [key, value] of Object.entries(b))
    assert.deepEqual(a[key], value, key);
  assert.deepEqual(totals(linked.events, "our"), totals(legacy.events, "our"));
});
test("uniquely saved legacy UUID is retained but historical same-name/same-number match stays unlinked", () => {
  const id = uid(),
    old = {
      version: 1,
      squads: [
        {
          id: uid(),
          name: "Existing",
          players: [{ id, name: "Isabel", number: 6, role: "starter" }],
        },
      ],
    };
  globalThis.localStorage = storage({
    "sideline.squads.v1": JSON.stringify(old),
  });
  assert.equal(loadSquads().squads[0].players[0].playerId, id);
  const m = blankMatch();
  m.players = old.squads[0].players;
  const e = { ...createEvent(m, "point", "our"), playerNumber: "6" };
  delete e.identityVersion;
  delete e.participants;
  m.events = [e];
  assert.equal(playerStatistics(m, "our")[0].playerId, undefined);
  assert.equal(resolveParticipant(m, e).playerId, null);
});
