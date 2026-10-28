import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisForScope,
  halfTimeAnalysis,
  periodComparison,
} from "../src/half-time.js";
import { blankMatch, createEvent, saveEvent } from "../src/domain.js";
import { fullTimeScreen } from "../src/full-time-ui.js";
import { coachingMatch } from "./helpers/coaching-match.js";

test("H1, H2 and FULL_MATCH are explicit reusable scopes; unknown scopes fail safely", () => {
  const m = coachingMatch();
  assert.ok(analysisForScope(m, "H1").events.every((e) => e.half === 1));
  assert.ok(analysisForScope(m, "H2").events.every((e) => e.half === 2));
  assert.equal(
    analysisForScope(m, "FULL_MATCH").events.length,
    m.events.length,
  );
  assert.deepEqual(analysisForScope(m, "H1"), halfTimeAnalysis(m));
  assert.throws(() => analysisForScope(m, "typo"), /Unknown analysis scope/);
});
test("comparison scores reconcile H1 plus H2 for both teams including two-pointers", () => {
  const p = periodComparison(coachingMatch());
  assert.deepEqual(
    [p.H1.our.total, p.H2.our.total, p.FULL_MATCH.our.total],
    [6, 1, 7],
  );
  assert.deepEqual(
    [
      p.H1.opposition.total,
      p.H2.opposition.total,
      p.FULL_MATCH.opposition.total,
    ],
    [1, 5, 6],
  );
  assert.equal(p.FULL_MATCH.our.goals, 1);
  assert.equal(p.FULL_MATCH.our.twoPointers, 1);
  assert.equal(p.FULL_MATCH.opposition.twoPointers, 1);
});
test("shooting comparison uses each actual denominator rather than averaging half percentages", () => {
  const p = periodComparison(coachingMatch());
  assert.deepEqual(
    [p.H1.our.conversion, p.H2.our.conversion, p.FULL_MATCH.our.conversion],
    [75, 33.3, 57.1],
  );
  assert.equal(p.FULL_MATCH.our.attempts, 7);
  assert.equal(p.FULL_MATCH.our.successful, 4);
});
test("our kickout comparison preserves unknown outcomes and uses only known denominators", () => {
  const p = periodComparison(coachingMatch());
  assert.deepEqual(
    [
      p.H1.our.kickouts.retention,
      p.H2.our.kickouts.retention,
      p.FULL_MATCH.our.kickouts.retention,
    ],
    [66.7, 33.3, 50],
  );
  assert.equal(p.FULL_MATCH.our.kickouts.total, 7);
  assert.equal(p.FULL_MATCH.our.kickouts.unknown, 1);
});
test("opposition kickout comparison is our win rate, not their retention", () => {
  const p = periodComparison(coachingMatch());
  assert.deepEqual(
    [
      p.H1.opposition.kickouts.possessionWinRate,
      p.H2.opposition.kickouts.possessionWinRate,
      p.FULL_MATCH.opposition.kickouts.possessionWinRate,
    ],
    [25, 75, 50],
  );
  assert.equal(p.H1.opposition.kickouts.retention, 75);
});
test("turnover comparison is explicitly won minus lost, without inferred possession changes", () => {
  const p = periodComparison(coachingMatch());
  assert.deepEqual(
    [p.H1, p.H2, p.FULL_MATCH].map(
      (d) => d.our.turnoversWon - d.our.turnoversLost,
    ),
    [2, -2, 0],
  );
  assert.equal(p.FULL_MATCH.our.turnoversWon, 4);
  assert.equal(p.FULL_MATCH.our.turnoversLost, 4);
});
test("whole-match contributors include H2 scores, defensive blocks and marks without ratings", () => {
  const d = analysisForScope(coachingMatch(), "FULL_MATCH");
  assert.equal(d.contributors.find((p) => p.number === "6").total, 7);
  assert.equal(d.contributors.find((p) => p.number === "4").defensiveBlocks, 3);
  assert.equal(d.contributors.find((p) => p.number === "8").kickoutMarks, 2);
  assert.ok(d.contributors.every((p) => !("rating" in p)));
});
test("whole-match observations apply the same sample thresholds to the selected scope", () => {
  const m = blankMatch();
  for (let i = 0; i < 5; i++) {
    const half = i < 3 ? 1 : 2;
    m.events.push({
      ...createEvent(m, "our-kickout", "our"),
      half,
      outcome: "won",
    });
  }
  for (let i = 0; i < 6; i++)
    m.events.push({
      ...createEvent(m, i < 3 ? "point" : "miss", "our"),
      half: i % 2 ? 1 : 2,
      shotX: 0.5,
      shotY: i < 3 ? 0.2 : 0.6,
    });
  assert.equal(analysisForScope(m, "H1").observations.length, 0);
  assert.equal(analysisForScope(m, "H2").observations.length, 0);
  const kinds = analysisForScope(m, "FULL_MATCH").observations.map(
    (o) => o.kind,
  );
  assert.deepEqual(kinds, ["working", "opportunity"]);
});
test("full-time corrections recalculate scores, contributors and comparison without a cached snapshot", () => {
  const m = coachingMatch(),
    before = analysisForScope(m, "FULL_MATCH");
  const goal = m.events.find((e) => e.team === "our" && e.event === "goal");
  m.events = saveEvent(m.events, {
    ...goal,
    event: "point",
    outcome: "scored",
  });
  assert.equal(analysisForScope(m, "FULL_MATCH").our.total, 5);
  assert.equal(periodComparison(m).H1.our.total, 4);
  assert.equal(
    analysisForScope(m, "FULL_MATCH").contributors.find((p) => p.number === "6")
      .total,
    5,
  );
  assert.equal(before.our.total, 7);
  m.events = m.events.filter((e) => e.id !== goal.id);
  assert.equal(analysisForScope(m, "FULL_MATCH").our.total, 4);
});
test("zero/missing data gives em dashes, not misleading percentages, NaN or Infinity", () => {
  const m = blankMatch(),
    p = periodComparison(m);
  for (const d of Object.values(p)) {
    assert.equal(d.our.conversion, null);
    assert.equal(d.our.kickouts.retention, null);
    assert.deepEqual(d.observations, []);
  }
  const html = fullTimeScreen(m);
  assert.ok(html.includes("—"));
  assert.ok(!/NaN|Infinity/.test(html));
  assert.ok(!html.includes("0% (0/0)"));
  assert.ok(html.includes("won − lost"));
});
test("scope calculation/rendering adds no match fields, storage schema or invented events", () => {
  const m = coachingMatch(),
    before = JSON.stringify(m);
  for (const scope of ["H1", "H2", "FULL_MATCH"]) analysisForScope(m, scope);
  fullTimeScreen(m);
  assert.equal(JSON.stringify(m), before);
  assert.equal(m.schemaVersion, 2);
});
