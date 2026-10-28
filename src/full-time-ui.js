import { analysisForScope, periodComparison } from "./half-time.js";
import { coachingDashboard } from "./coaching-dashboard.js";

export function fullTimeScreen(match) {
  return `<div class="full-time-view">${coachingDashboard({
    data: analysisForScope(match, "FULL_MATCH"),
    scope: "FULL_MATCH",
    comparison: periodComparison(match),
    ourTeam: match.setup.ourTeam || "Our team",
    oppositionTeam: match.setup.opposition || "Opposition",
    periodLabel: "FULL TIME",
    scopeLabel: "Whole match",
    title: "Full-Time Analysis",
    scoreLabel: "Full-time score",
    mapHeading: "FULL MATCH SHOT MAP",
    mapLabel: "Full-match shot map",
    contributorsHeading: "KEY CONTRIBUTORS — FULL MATCH",
    // All saved shots face their attacking goal at top, independent of half.
    direction: "top",
    actions: [
      { label: "Return to Match", view: "live" },
      { label: "Return to Timeline", view: "timeline" },
      {
        label: "VIEW DETAILED MATCH REPORT",
        action: "ft-detailed-report",
        primary: true,
      },
    ],
  })}</div>`;
}
