import { isShot } from "./domain.js";
import { percentage } from "./analysis.js";
import { fortyMetreZone, invalidTwoPointLocation } from "./pitch-geometry.js";

// Storage is already team-relative attacking-top. H1, H2, both teams and legacy
// events use the same coordinates; never guess a physical/canonical distinction.
export function shotLocationAnalysis(events, team = "our") {
  const shots = events.filter(e => e.team === team && isShot(e));
  const zones = Object.fromEntries(["inside", "outside", "unknown"].map(zone => {
    const group = shots.filter(e => fortyMetreZone(e) === zone);
    const successful = group.filter(e => e.outcome === "scored").length;
    return [zone, { attempts: group.length, successful, conversion: percentage(successful, group.length) }];
  }));
  return { zones, invalidTwoPointers: shots.filter(invalidTwoPointLocation).length };
}
