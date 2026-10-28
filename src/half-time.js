import { summarize, playerStatistics, percentage } from "./analysis.js";
import { isShot } from "./domain.js";
import { fortyMetreZone } from "./pitch-geometry.js";

export const OBSERVATION_RULES = Object.freeze({
  minimumAttempts: 5,
  minimumKnownKickouts: 5,
  minimumZoneAttempts: 3,
  goodRetention: 75,
  goodConversion: 60,
  lowRetention: 50,
  lowOppositionWins: 35,
  lowConversion: 40,
  zoneGap: 20,
});
const known = (k) => k.won + k.lost;
export function halfTimeObservations(data) {
  const r = OBSERVATION_RULES,
    result = [];
  const k = data.our.kickouts,
    their = data.opposition.kickouts;
  if (known(k) >= r.minimumKnownKickouts && k.retention >= r.goodRetention)
    result.push({
      kind: "working",
      title: `Our kickout — ${k.retention}% retained`,
      detail: `We retained ${k.won} of ${known(k)} kickouts with a known outcome.`,
    });
  else if (
    data.our.attempts >= r.minimumAttempts &&
    data.our.conversion >= r.goodConversion
  )
    result.push({
      kind: "working",
      title: `Shooting — ${data.our.conversion}% converted`,
      detail: `${data.our.successful} scores from ${data.our.attempts} recorded attempts.`,
    });
  if (known(k) >= r.minimumKnownKickouts && k.retention < r.lowRetention)
    result.push({
      kind: "watch",
      title: "Our kickout retention",
      detail: `We retained ${k.won} of ${known(k)} kickouts with a known outcome (${k.retention}%).`,
    });
  else if (
    known(their) >= r.minimumKnownKickouts &&
    their.possessionWinRate <= r.lowOppositionWins
  )
    result.push({
      kind: "watch",
      title: "Opposition kickout",
      detail: `We won ${their.won} of ${known(their)} opposition restarts with a known outcome (${their.possessionWinRate}%).`,
    });
  else if (
    data.our.attempts >= r.minimumAttempts &&
    data.our.conversion < r.lowConversion
  )
    result.push({
      kind: "watch",
      title: "Shooting conversion",
      detail: `${data.our.successful} scores from ${data.our.attempts} recorded attempts (${data.our.conversion}%).`,
    });
  const { inside, outside } = data.zones;
  if (
    inside.attempts >= r.minimumZoneAttempts &&
    outside.attempts >= r.minimumZoneAttempts &&
    inside.conversion - outside.conversion >= r.zoneGap
  )
    result.push({
      kind: "opportunity",
      title: "Shot selection — inside 40m",
      detail: `${inside.successful}/${inside.attempts} converted inside (${inside.conversion}%) compared with ${outside.successful}/${outside.attempts} outside (${outside.conversion}%). Located attempts only.`,
    });
  return result;
}
export const ANALYSIS_SCOPES = ["H1", "H2", "FULL_MATCH"];
export function analysisForScope(match, scope = "H1") {
  if (!ANALYSIS_SCOPES.includes(scope))
    throw new Error("Unknown analysis scope");
  const events = match.events.filter(
    (event) =>
      scope === "FULL_MATCH" || event.half === (scope === "H1" ? 1 : 2),
  );
  const shots = events.filter((e) => e.team === "our" && isShot(e));
  const zones = Object.fromEntries(
    ["inside", "outside", "unknown"].map((zone) => {
      const group = shots.filter((e) => fortyMetreZone(e) === zone);
      const successful = group.filter((e) => e.outcome === "scored").length;
      return [
        zone,
        {
          attempts: group.length,
          successful,
          conversion: percentage(successful, group.length),
        },
      ];
    }),
  );
  const data = {
    events,
    shots,
    zones,
    our: summarize(events, "our"),
    opposition: summarize(events, "opposition"),
    contributors: playerStatistics({ ...match, events }, "our").filter(
      (p) =>
        p.successful ||
        p.defensiveBlocks ||
        p.kickoutMarks ||
        p.turnoversWon ||
        p.interceptions,
    ),
  };
  return { ...data, observations: halfTimeObservations(data) };
}

// Compatibility wrapper: existing H1 callers keep the same event-derived results.
export function halfTimeAnalysis(match) {
  return analysisForScope(match, "H1");
}
export function periodComparison(match) {
  return Object.fromEntries(
    ANALYSIS_SCOPES.map((scope) => [scope, analysisForScope(match, scope)]),
  );
}
