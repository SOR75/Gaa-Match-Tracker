import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  isShot,
  totals,
  migrateMatch,
  validMatch,
  undoEvent,
} from "../src/domain.js";
import { summarize, playerStatistics, filterShots } from "../src/analysis.js";
import { pitchMarkup } from "../src/pitch.js";
const p = (number) => ({
  id: `p${number}`,
  number,
  name: `Player ${number}`,
  role: "starter",
  position: "",
  notes: "",
});
const stat = (m, n) =>
  playerStatistics(m, "our").find((p) => p.number === String(n));

test("attacking Blocked is one shot attempt, not a wide or defensive/possession event", () => {
  const m = blankMatch();
  const e = saveEvent([], {
    ...createEvent(m, "miss", "our"),
    playerNumber: "10",
    missReason: "blocked",
    shotX: 0.4,
    shotY: 0.6,
  })[0];
  assert.equal(isShot(e), true);
  assert.equal(e.shotSource, "open-play");
  const s = summarize([e], "our");
  assert.equal(s.attempts, 1);
  assert.equal(s.blockedAttempts, 1);
  assert.equal(s.wides, 0);
  assert.equal(s.defensiveBlocks, 0);
  assert.equal(s.turnoversWon, 0);
  assert.equal(s.possessions, 0);
  assert.equal(s.total, 0);
});
test("blocked shot uses a labeled B square at its actual position rather than the Wide X", () => {
  const e = {
    ...createEvent(blankMatch(), "miss", "our"),
    playerNumber: "10",
    missReason: "blocked",
    shotX: 0.4,
    shotY: 0.6,
  };
  const before = JSON.stringify(e);
  const svg = pitchMarkup([e]);
  const marker = svg.match(
    /<g class="shot-marker blocked-shot-marker"[\s\S]*?<\/g>/,
  )[0];
  assert.match(marker, /Blocked shot/);
  assert.match(marker, /x="226" y="526"/);
  assert.match(marker, /<rect/);
  assert.doesNotMatch(marker, /<path|Wide|<title>miss/);
  const rotated = pitchMarkup([e], false, { direction: "bottom" });
  assert.match(rotated, /x="346" y="346"/);
  assert.equal(JSON.stringify(e), before);
});
test("six shooting attempts reconcile as two points, one wide, three blocked attempts", () => {
  const m = blankMatch();
  m.players = [p(10)];
  for (const [type, reason] of [
    ["point", ""],
    ["point", ""],
    ["miss", "wide"],
    ["miss", "blocked"],
    ["miss", "blocked"],
    ["miss", "blocked"],
  ])
    m.events = saveEvent(m.events, {
      ...createEvent(m, type, "our"),
      playerNumber: "10",
      missReason: reason,
    });
  const s = stat(m, 10);
  assert.equal(s.attempts, 6);
  assert.equal(s.points, 2);
  assert.equal(s.wides, 1);
  assert.equal(s.blockedAttempts, 3);
  assert.equal(s.defensiveBlocks, 0);
  assert.equal(m.events.length, 6);
});
test("standalone defensive block is our action and creates no shot, score, turnover, kickout or possession", () => {
  const e = saveEvent(
    [],
    createEvent(blankMatch(), "defensive-block", "opposition"),
  )[0];
  assert.equal(e.team, "our");
  assert.equal(e.outcome, "blocked");
  assert.equal(isShot(e), false);
  assert.equal(filterShots([e]).length, 0);
  const s = summarize([e], "our");
  assert.equal(s.defensiveBlocks, 1);
  for (const k of [
    "attempts",
    "wides",
    "blockedAttempts",
    "turnoversWon",
    "turnoversLost",
    "interceptions",
    "possessions",
    "total",
  ])
    assert.equal(s[k], 0, k);
  assert.equal(s.kickouts.total, 0);
  assert.equal(summarize([e], "opposition").attempts, 0);
});
test("multiple standalone defensive blocks credit our player without adding shooting attempts", () => {
  const m = blankMatch();
  m.players = [p(4)];
  for (let i = 0; i < 3; i++)
    m.events = saveEvent(m.events, {
      ...createEvent(m, "defensive-block", "opposition"),
      playerNumber: "4",
    });
  assert.equal(m.events.length, 3);
  assert.equal(stat(m, 4).defensiveBlocks, 3);
  assert.equal(stat(m, 4).attempts, 0);
  assert.equal(stat(m, 4).wides, 0);
  assert.equal(totals(m.events, "our").total, 0);
  assert.equal(validMatch(m), true);
});
test("defensive player/location edits and undo recalculate without changing IDs or event count", () => {
  const m = blankMatch();
  m.players = [p(4), p(9)];
  m.events = saveEvent([], {
    ...createEvent(m, "defensive-block", "our"),
    playerNumber: "4",
    shotX: 0.25,
    shotY: 0.7,
  });
  const id = m.events[0].id;
  m.events = saveEvent(m.events, { ...m.events[0], playerNumber: "9" });
  assert.equal(stat(m, 4).defensiveBlocks, 0);
  assert.equal(stat(m, 9).defensiveBlocks, 1);
  m.events = saveEvent(m.events, {
    ...m.events[0],
    playerNumber: "",
    shotX: null,
    shotY: null,
  });
  assert.equal(m.events.length, 1);
  assert.equal(m.events[0].id, id);
  assert.equal(stat(m, 9).defensiveBlocks, 0);
  assert.equal(summarize(m.events, "our").defensiveBlocks, 1);
  assert.equal(m.events[0].shotX, null);
  m.events = undoEvent(m.events);
  assert.equal(summarize(m.events, "our").defensiveBlocks, 0);
});
test("legacy opposition blocked-shot credit stays readable; no new defensive events are invented", () => {
  const m = blankMatch();
  m.players = [p(4)];
  const old = {
    ...createEvent(m, "miss", "opposition"),
    playerNumber: "15",
    outcome: "blocked",
    blockedByNumber: "4",
  };
  delete old.missReason;
  delete old.shotOutcome;
  delete old.shotSource;
  m.events = [old];
  const raw = JSON.stringify(m);
  assert.equal(migrateMatch(m).events.length, 1);
  assert.equal(JSON.stringify(m), raw);
  assert.equal(stat(m, 4).defensiveBlocks, 1);
  assert.equal(summarize(m.events, "opposition").attempts, 1);
  const unknown = { ...old, blockedByNumber: "" };
  assert.equal(summarize([unknown], "our").defensiveBlocks, 1);
  assert.equal(
    playerStatistics({ ...m, events: [unknown] }, "our")[0].defensiveBlocks,
    0,
  );
});
test("defensive block map is distinct; changing attacking reason restores Wide marker and classification", () => {
  const d = {
    ...createEvent(blankMatch(), "defensive-block", "our"),
    playerNumber: "4",
    shotX: 0.5,
    shotY: 0.5,
  };
  const svg = pitchMarkup([d]);
  assert.match(svg, /defensive-block-marker/);
  assert.match(svg, /<title>Defensive Block/);
  assert.doesNotMatch(svg, /class="shot-marker/);
  let e = saveEvent([], {
    ...createEvent(blankMatch(), "miss", "our"),
    missReason: "blocked",
    shotX: 0.5,
    shotY: 0.5,
  })[0];
  e = saveEvent([e], { ...e, missReason: "wide" })[0];
  assert.equal(summarize([e], "our").wides, 1);
  assert.equal(summarize([e], "our").blockedAttempts, 0);
  assert.match(pitchMarkup([e]), /data-marker-kind="miss"/);
  assert.doesNotMatch(pitchMarkup([e]), /blocked-shot-marker/);
  assert.equal(e.shotX, 0.5);
});

test("Wide, Short, Saved, Post and Other keep their existing non-blocked map treatment", () => {
  for (const missReason of ["wide", "short", "saved", "post", "other"]) {
    const event = {
      ...createEvent(blankMatch(), "miss", "our"),
      missReason,
      shotX: 0.3,
      shotY: 0.2,
    };
    const svg = pitchMarkup([event]);
    assert.match(svg, /data-marker-kind="miss"/);
    assert.doesNotMatch(svg, /blocked-shot-marker/);
    assert.match(svg, /l20 20m-20 0l20-20/);
    assert.equal(event.shotX, 0.3);
  }
});
