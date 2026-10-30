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
// Replay the same chronological substitution log as Active XV. Never infer a
// legacy goalkeeper from jersey/name/roster order. Explicit match selection only.
export function goalkeeperStatistics(match, { half = null } = {}) {
  const active = {
      our: match.goalkeepers?.our || null,
      opposition: match.goalkeepers?.opposition || null,
    },
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
    if (ko && e.team === "our") {
      const g = group(active.our);
      if (g) {
        g.gkKickouts++;
        if (ko.outcome === "won") g.gkRetained++;
        if (ko.outcome === "lost") g.gkLost++;
        if (ko.outcome === "out-of-play") g.gkOutOfPlay++;
        if (ko.mark) g.gkMarks++;
        if (e.kickoutLength === "Short") {
          g.gkShort++;
          if (ko.outcome === "won") g.gkShortRetained++;
        }
        if (e.kickoutLength === "Long") {
          g.gkLong++;
          if (ko.outcome === "won") g.gkLongRetained++;
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
  return [...groups.values()].map((g) => ({
    ...g,
    gkRetention: keeperPercent(g.gkRetained, g.gkKickouts),
    gkShortRetention: keeperPercent(g.gkShortRetained, g.gkShort),
    gkLongRetention: keeperPercent(g.gkLongRetained, g.gkLong),
  }));
}
export function activeGoalkeepers(match) {
  const active = { ...match.goalkeepers };
  for (const { e } of match.events
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) => a.e.half - b.e.half || a.e.timeMs - b.e.timeMs || a.i - b.i,
    )) {
    if (e.event === "goalkeeper-change") active[e.team] = participantRef(e);
    if (e.event === "substitution" && active[e.team]) {
      const off = participantRef(e, "playerOff");
      if (
        off?.matchPlayerId === active[e.team].matchPlayerId ||
        (!off && String(e.playerOff) === String(active[e.team].jerseyNumber))
      )
        active[e.team] = participantRef(e, "playerOn");
    }
  }
  return active;
}
