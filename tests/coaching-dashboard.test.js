import { test } from "node:test";
import assert from "node:assert/strict";
import { blankMatch, createEvent } from "../src/domain.js";
import { halfTimeAnalysis } from "../src/half-time.js";
import { coachingDashboard } from "../src/coaching-dashboard.js";

test("coaching presentation uses supplied scope/data without applying its own H1 filter or mutating it", () => {
  const match = blankMatch();
  match.events = [
    { ...createEvent(match, "goal", "our"), shotX: 0.5, shotY: 0.2 },
  ];
  const analysis = halfTimeAnalysis(match);
  // The same presentation must accept a caller's later-period shot selection.
  const data = {
    ...analysis,
    shots: analysis.shots.map((e) => ({ ...e, half: 2 })),
  };
  const previous = JSON.stringify(data);
  const html = coachingDashboard({
    data,
    ourTeam: "Harbour",
    oppositionTeam: "Mountain",
    periodLabel: "SELECTED PERIOD",
    scopeLabel: "Selected period",
    title: "Coaching review",
    scoreLabel: "Selected score",
    mapHeading: "SELECTED SHOTS",
    mapLabel: "Selected shot map",
    contributorsHeading: "CONTRIBUTORS",
    direction: "top",
    actions: [{ label: "Back", view: "live" }],
  });
  assert.ok(html.includes("SELECTED PERIOD"));
  assert.ok(html.includes("SELECTED SHOTS"));
  assert.ok(html.includes('data-ht-score="our">1-00 (3)'));
  assert.ok(html.includes("· H2</title>"));
  assert.ok(!html.includes("FIRST HALF"));
  assert.equal(JSON.stringify(data), previous);
});
