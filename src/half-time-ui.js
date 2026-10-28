import { halfTimeAnalysis } from "./half-time.js";
import { attackingDirection } from "./matchday.js";
import { coachingDashboard } from "./coaching-dashboard.js";

// Scope selection and match transitions stay outside the reusable dashboard.
export function halfTimeScreen(match) {
  return `<div class="half-time-view">${coachingDashboard({
    data: halfTimeAnalysis(match),
    scope: "H1",
    ourTeam: match.setup.ourTeam || "Our team",
    oppositionTeam: match.setup.opposition || "Opposition",
    periodLabel: "HALF TIME",
    scopeLabel: "First half",
    title: "Half-Time Analysis",
    scoreLabel: "Half-time score",
    mapHeading: "FIRST HALF SHOT MAP",
    mapLabel: "First-half shot map",
    contributorsHeading: "KEY CONTRIBUTORS — FIRST HALF",
    direction: attackingDirection(match, "our", 1),
    actions: [
      { label: "View Full Stats", action: "ht-full-stats" },
      { label: "Return to Live Match", view: "live" },
      match.clock.half === 1
        ? {
            label: "START SECOND HALF →",
            action: "ht-second-half",
            primary: true,
          }
        : {
            label: "Second half started → Live Match",
            view: "live",
            primary: true,
          },
    ],
  })}</div>`;
}
