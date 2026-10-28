import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  migrateMatch,
} from "../src/domain.js";
import { halfTimeAnalysis } from "../src/half-time.js";
import {
  fortyMetreZone,
  fortyMetreArcPaths,
  PITCH_GEOMETRY,
} from "../src/pitch-geometry.js";
import { pitchMarkup } from "../src/pitch.js";
import { transformLocation } from "../src/matchday.js";
const e = (type, extra = {}) => ({
  ...createEvent(blankMatch(), type, extra.team || "our"),
  ...extra,
});
const match = (events = []) => ({ ...blankMatch(), events });
test("half-time scoring uses H1 goals, points and two-point values only", () => {
  const d = halfTimeAnalysis(
    match([
      e("goal"),
      e("point"),
      e("two-point"),
      e("miss"),
      e("goal", { team: "opposition" }),
      e("goal", { half: 2 }),
    ]),
  );
  assert.equal(d.our.total, 6);
  assert.equal(d.opposition.total, 3);
  assert.equal(d.our.attempts, 4);
  assert.equal(d.our.successful, 3);
  assert.equal(d.our.conversion, 75);
  assert.equal(d.our.misses, 1);
  assert.equal(d.events.length, 5);
  assert.equal(d.shots.length, 4);
});
test("kickout rates use our perspective and known outcomes, including legacy opposition records", () => {
  const d = halfTimeAnalysis(
    match([
      e("our-kickout", { outcome: "won", kickoutLength: "Short" }),
      e("our-kickout", { outcome: "lost" }),
      e("our-kickout", { outcome: "unknown" }),
      e("opposition-kickout", { outcome: "won" }),
      e("opposition-kickout", { outcome: "lost" }),
      e("opposition-kickout", { outcome: "lost" }),
      e("opposition-kickout", { outcome: "unknown" }),
      e("opposition-kickout", {
        outcome: "won",
        kickoutPerspective: undefined,
      }),
    ]),
  );
  assert.equal(d.our.kickouts.retention, 50);
  assert.equal(d.our.kickouts.total, 3);
  assert.equal(d.our.kickouts.unknown, 1);
  assert.equal(d.our.kickouts.short.won, 1);
  assert.equal(d.opposition.kickouts.possessionWinRate, 25);
  assert.equal(d.opposition.kickouts.retention, 75);
});
test("turnovers do not infer wins from interceptions, blocks or possession", () => {
  const d = halfTimeAnalysis(
    match([
      e("turnover-won"),
      e("turnover-lost"),
      e("interception"),
      e("defensive-block"),
      e("possession"),
      e("turnover-won", { team: "opposition" }),
      e("turnover-won", { half: 2 }),
    ]),
  );
  assert.equal(d.our.turnoversWon, 1);
  assert.equal(d.our.turnoversLost, 1);
});
test("contributors reuse recorded scores, marks and defensive credit, sorted by jersey without ratings", () => {
  const m = match([
    e("two-point", { playerNumber: "10" }),
    e("defensive-block", { playerNumber: "4" }),
    e("our-kickout", { outcome: "won", mark: true, markPlayerNumber: "4" }),
    e("goal", { playerNumber: "10", half: 2 }),
    e("point"),
  ]);
  m.players = [
    { number: 10, name: "Forward" },
    { number: 4, name: "Defender" },
    { number: 6, name: "No recorded contribution" },
  ];
  const c = halfTimeAnalysis(m).contributors;
  assert.deepEqual(
    c.map((p) => p.number),
    ["4", "10"],
  );
  assert.equal(c[0].defensiveBlocks, 1);
  assert.equal(c[0].kickoutMarks, 1);
  assert.equal(c[1].total, 2);
  assert.equal(c[1].goals, 0);
});
test("no data gives null conversion, no observations and no invented contributors", () => {
  const d = halfTimeAnalysis(match());
  assert.equal(d.our.total, 0);
  assert.equal(d.our.conversion, null);
  assert.equal(d.our.kickouts.retention, null);
  assert.deepEqual(d.observations, []);
  assert.deepEqual(d.contributors, []);
});
test("small samples suppress coaching observations", () => {
  const d = halfTimeAnalysis(
    match([
      e("goal"),
      e("our-kickout", { outcome: "won" }),
      e("opposition-kickout", { outcome: "lost" }),
    ]),
  );
  assert.deepEqual(d.observations, []);
});
test("observation rules are deterministic, evidence-bound and capped at three", () => {
  const events = [
    ...Array.from({ length: 5 }, () => e("our-kickout", { outcome: "won" })),
    ...Array.from({ length: 5 }, () =>
      e("opposition-kickout", { outcome: "lost" }),
    ),
    ...Array.from({ length: 3 }, () => e("point", { shotX: 0.5, shotY: 0.2 })),
    ...Array.from({ length: 3 }, () => e("miss", { shotX: 0.5, shotY: 0.6 })),
  ];
  const a = halfTimeAnalysis(match(events));
  assert.deepEqual(
    a.observations.map((o) => o.kind),
    ["working", "watch", "opportunity"],
  );
  assert.deepEqual(
    a.observations,
    halfTimeAnalysis(match(events)).observations,
  );
  assert.match(a.observations[2].detail, /3\/3.*0\/3/);
});
test("editing, deleting and undoing H1 events recomputes all results without mutating a snapshot", () => {
  const m = match([e("goal", { playerNumber: "8" })]);
  const saved = JSON.stringify(m);
  const before = halfTimeAnalysis(m);
  assert.equal(JSON.stringify(m), saved);
  m.events = saveEvent(m.events, {
    ...m.events[0],
    event: "miss",
    outcome: "missed",
    missReason: "blocked",
  });
  const after = halfTimeAnalysis(m);
  assert.equal(after.our.total, 0);
  assert.equal(after.our.blockedAttempts, 1);
  assert.equal(after.our.wides, 0);
  assert.equal(before.our.total, 3);
  m.events = [];
  assert.equal(halfTimeAnalysis(m).our.attempts, 0);
});
test("arc SVG paths are exactly the frozen V0.3.6 paths, using shared geometry", () => {
  assert.deepEqual(fortyMetreArcPaths(), [
    "M95.122 145A240 240 0 0 0 504.878 145",
    "M95.122 755A240 240 0 0 1 504.878 755",
  ]);
  for (const path of fortyMetreArcPaths())
    assert.ok(pitchMarkup().includes(`d="${path}"`));
});
test("40m inside/outside/boundary classification matches circular segment and its full-width joins", () => {
  assert.equal(fortyMetreZone({ shotX: 0.5, shotY: 260 / 900 }), "inside");
  assert.equal(fortyMetreZone({ shotX: 0.5, shotY: 260.01 / 900 }), "outside");
  assert.equal(fortyMetreZone({ shotX: 0.5, shotY: 259.99 / 900 }), "inside");
  const x = 400,
    y = 20 + Math.sqrt(PITCH_GEOMETRY.fortyRadius ** 2 - 100 ** 2);
  assert.equal(fortyMetreZone({ shotX: x / 600, shotY: y / 900 }), "inside");
  assert.equal(fortyMetreZone({ shotX: 25 / 600, shotY: 145 / 900 }), "inside");
  assert.equal(
    fortyMetreZone({ shotX: 25 / 600, shotY: 146 / 900 }),
    "outside",
  );
});
test("missing, invalid and out-of-field locations are excluded, never guessed", () => {
  for (const p of [
    {},
    { shotX: null, shotY: null },
    { shotX: NaN, shotY: 0.5 },
    { shotX: 0, shotY: 0 },
    { shotX: 2, shotY: 0.5 },
    { shotX: 0.5, shotY: 1 },
  ])
    assert.equal(fortyMetreZone(p), "unknown");
  const d = halfTimeAnalysis(
    match([e("point"), e("miss", { shotX: 0.5, shotY: 0.6 })]),
  );
  assert.equal(d.zones.unknown.attempts, 1);
  assert.equal(d.zones.outside.attempts, 1);
  assert.equal(d.zones.inside.attempts, 0);
});
test("classification remains canonical when setup/display attack direction changes", () => {
  const shot = e("point", { shotX: 0.5, shotY: 0.2 });
  const m = match([shot]);
  const before = JSON.stringify(shot);
  m.setup.ourFirstHalfAttacks = "bottom";
  const svg = pitchMarkup([shot], false, { direction: "bottom" });
  assert.match(svg, /cy="720"/);
  assert.equal(transformLocation(shot, "bottom").shotY, 0.8);
  assert.equal(halfTimeAnalysis(m).zones.inside.attempts, 1);
  assert.equal(JSON.stringify(shot), before);
});
test("V0.3.6 saved match needs no schema or event migration for half-time analysis", () => {
  const m = match([e("goal")]);
  const previous = JSON.stringify(m);
  const loaded = migrateMatch(JSON.parse(previous));
  halfTimeAnalysis(loaded);
  assert.equal(loaded.schemaVersion, 2);
  assert.equal(JSON.stringify(loaded.events), JSON.stringify(m.events));
});
