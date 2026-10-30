import { elapsedMs } from "./domain.js";
import { participantRef, rowId, validPlayerId } from "./identity.js";
import { kickoutDetails } from "./kickouts.js";
import { shotDetails } from "./shots.js";
const other = (team) => (team === "our" ? "opposition" : "our");
export const goalkeeperMetrics = [
  "goalkeeperAppearances",
  "gkKickouts",
  "gkRetained",
  "gkLost",
  "gkShort",
  "gkShortRetained",
  "gkLong",
  "gkLongRetained",
  "gkMarks",
  "gkOutOfPlay",
  "gkSaves",
  "gkGoalsConceded",
];
export const keeperPercent = (a, b) =>
  b ? Math.round((a / b) * 1000) / 10 : null;
export function goalkeeperRef(match, team, id) {
  const p = (team === "our" ? match.players : match.oppositionPlayers).find(
    (p) => rowId(p) === id,
  );
  return p && Number.isInteger(p.number)
    ? {
        team,
        matchPlayerId: rowId(p),
        playerId: validPlayerId(p.playerId) ? p.playerId : null,
        nameSnapshot: p.name,
        jerseyNumber: p.number,
      }
    : null;
}
// New matches opt into initial #1 inference. Never retroactively enable it on
// existing archives. A candidate's explicit keeper snapshots remain readable.
export function startingGoalkeepers(match) {
  if (match.goalkeepers) return { ...match.goalkeepers };
  if (match.goalkeeperTrackingVersion !== 1) return {};
  return Object.fromEntries(
    ["our", "opposition"].map((team) => {
      const roster = team === "our" ? match.players : match.oppositionPlayers;
      const candidates = roster.filter(
        (p) => p.number === 1 && p.role === "starter" && p.matchPlayerId,
      );
      return [
        team,
        candidates.length === 1
          ? goalkeeperRef(match, team, candidates[0].matchPlayerId)
          : null,
      ];
    }),
  );
}
export function goalkeeperStatistics(
  match,
  { half = null, now = Date.now() } = {},
) {
  const active = startingGoalkeepers(match),
    groups = new Map();
  const group = (ref) => {
    if (!ref?.matchPlayerId || !["our", "opposition"].includes(ref.team))
      return null;
    const key = `${ref.team}:${ref.matchPlayerId}`;
    if (!groups.has(key))
      groups.set(key, {
        ...ref,
        ...Object.fromEntries(goalkeeperMetrics.map((k) => [k, 0])),
      });
    return groups.get(key);
  };
  Object.values(active).forEach(group);
  const seen = new Set();
  for (const { e } of match.events
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) => a.e.half - b.e.half || a.e.timeMs - b.e.timeMs || a.i - b.i,
    )) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.event === "goalkeeper-change")
      active[e.team] = participantRef(e) || null;
    if (e.event === "substitution") {
      const off = participantRef(e, "playerOff"),
        on = participantRef(e, "playerOn");
      if (off && active[e.team]?.matchPlayerId === off.matchPlayerId)
        active[e.team] = on || null;
      // A legacy number-only substitution cannot establish a new keeper identity.
      else if (
        !off &&
        active[e.team] &&
        String(active[e.team].jerseyNumber) === String(e.playerOff)
      )
        active[e.team] = null;
    }
    if (half !== null && e.half !== half) continue;
    for (const ref of Object.values(active)) {
      const g = group(ref);
      if (g) g.goalkeeperAppearances = 1;
    }
    const ko = kickoutDetails(e);
    if (ko) {
      const g = group(active[e.team]);
      const retained = e.team === "our" ? "won" : "lost";
      const lost = e.team === "our" ? "lost" : "won";
      if (g) {
        g.gkKickouts++;
        if (ko.outcome === retained) g.gkRetained++;
        if (ko.outcome === lost) g.gkLost++;
        if (ko.outcome === "out-of-play") g.gkOutOfPlay++;
        if (ko.mark) g.gkMarks++;
        if (e.kickoutLength === "Short") {
          g.gkShort++;
          if (ko.outcome === retained) g.gkShortRetained++;
        }
        if (e.kickoutLength === "Long") {
          g.gkLong++;
          if (ko.outcome === retained) g.gkLongRetained++;
        }
      }
    }
    const shot = shotDetails(e);
    if (["goal", "point", "two-point", "miss"].includes(e.event)) {
      const g = group(active[other(e.team)]);
      if (g && e.event === "goal" && e.outcome === "scored")
        g.gkGoalsConceded++;
      if (g && e.event === "miss" && shot.missReason === "short") g.gkSaves++;
    }
  }
  const periods = goalkeeperPeriods(match, now, { half });
  return [...groups.values()].map((g) => {
    const ownPeriods = periods.filter(
      (p) => p.team === g.team && p.matchPlayerId === g.matchPlayerId,
    );
    const timeMs = ownPeriods.some((p) => p.durationMs === null)
      ? null
      : ownPeriods.reduce((n, p) => n + p.durationMs, 0);
    return {
      ...g,
      goalkeeperAppearances: g.goalkeeperAppearances || Number(timeMs > 0),
      gkTimeMs: timeMs,
      periods: ownPeriods,
      gkRetention: keeperPercent(g.gkRetained, g.gkKickouts),
      gkShortRetention: keeperPercent(g.gkShortRetained, g.gkShort),
      gkLongRetention: keeperPercent(g.gkLongRetained, g.gkLong),
    };
  });
}
export function activeGoalkeepers(match) {
  const active = startingGoalkeepers(match);
  for (const { e } of match.events
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) => a.e.half - b.e.half || a.e.timeMs - b.e.timeMs || a.i - b.i,
    )) {
    if (e.event === "goalkeeper-change") active[e.team] = participantRef(e);
    if (e.event === "substitution" && active[e.team]) {
      const off = participantRef(e, "playerOff");
      if (off?.matchPlayerId === active[e.team].matchPlayerId)
        active[e.team] = participantRef(e, "playerOn");
      else if (
        !off &&
        String(e.playerOff) === String(active[e.team].jerseyNumber)
      )
        active[e.team] = null;
    }
  }
  return active;
}

// Objective keeper periods, derived from the existing match clock/substitutions.
// Cross-half duration stays unknown: the archive does not retain the exact H1
// end clock, so nominal half length must not manufacture minutes in goal.
export function goalkeeperPeriods(
  match,
  now = Date.now(),
  { half = null } = {},
) {
  const ordered = match.events
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) => a.e.half - b.e.half || a.e.timeMs - b.e.timeMs || a.i - b.i,
    );
  const current = startingGoalkeepers(match),
    starts = {
      our: { half: 1, timeMs: 0 },
      opposition: { half: 1, timeMs: 0 },
    },
    periods = [];
  const halfEnd = (h) => {
    const value = match.clock.completedHalves?.[h];
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const close = (team, to) => {
    const ref = current[team],
      from = starts[team];
    if (!ref) return;
    let start = { ...from },
      end = { ...to };
    if (half !== null) {
      if (start.half > half || end.half < half) return;
      if (start.half < half) start = { half, timeMs: 0 };
      if (end.half > half) end = { half, timeMs: halfEnd(half) };
    }
    let durationMs = null;
    if (end.timeMs !== null && start.half === end.half)
      durationMs = Math.max(0, end.timeMs - start.timeMs);
    else if (end.timeMs !== null && halfEnd(start.half) !== null)
      durationMs = Math.max(0, halfEnd(start.half) - start.timeMs) + end.timeMs;
    periods.push({ ...ref, from: start, to: end, durationMs });
  };
  const prefix = [];
  for (const { e } of ordered) {
    prefix.push(e);
    if (!["substitution", "goalkeeper-change"].includes(e.event)) continue;
    const next =
      activeGoalkeepers({ ...match, events: prefix })[e.team] || null;
    if (next?.matchPlayerId === current[e.team]?.matchPlayerId) continue;
    const boundary = { half: e.half, timeMs: e.timeMs };
    close(e.team, boundary);
    current[e.team] = next;
    starts[e.team] = boundary;
  }
  const latest = ordered.at(-1)?.e;
  const clock = {
    half: match.clock.half,
    timeMs:
      match.clock.elapsedMs +
      (match.clock.startedAt === null
        ? 0
        : Math.max(0, now - match.clock.startedAt)),
  };
  const end =
    latest &&
    (latest.half > clock.half ||
      (latest.half === clock.half && latest.timeMs > clock.timeMs))
      ? { half: latest.half, timeMs: latest.timeMs }
      : clock;
  for (const team of ["our", "opposition"]) close(team, end);
  return periods;
}

// Preserve the established reset/pause behaviour, retaining only the measured
// outgoing-half duration for derived periods. No nominal minutes are inferred.
export function advanceHalfClock(clock, half, now = Date.now()) {
  const completedHalves = { ...clock.completedHalves };
  if (half > clock.half) completedHalves[clock.half] = elapsedMs(clock, now);
  return { ...clock, half, elapsedMs: 0, startedAt: null, completedHalves };
}
