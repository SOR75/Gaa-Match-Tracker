import { totals, isShot, isKickout } from "./domain.js";
export const percentage = (part, whole) =>
  whole ? Math.round((part / whole) * 1000) / 10 : null;
export function filterShots(
  events,
  { team = "all", half = "all", player = "all", result = "all" } = {},
) {
  return events.filter(
    (event) =>
      isShot(event) &&
      (team === "all" || event.team === team) &&
      (half === "all" || event.half === Number(half)) &&
      (player === "all" || `${event.team}:${event.playerNumber}` === player) &&
      (result === "all" ||
        (result === "score"
          ? event.outcome === "scored"
          : event.outcome !== "scored")),
  );
}
export function summarize(events, team) {
  const selected = events.filter((event) => event.team === team);
  const shots = selected.filter(isShot);
  const successful = shots.filter((event) => event.outcome === "scored").length;
  const kickouts = selected.filter(isKickout);
  const won = kickouts.filter((event) => event.outcome === "won").length;
  const lost = kickouts.filter((event) => event.outcome === "lost").length;
  const lengths = {};
  for (const length of ["Short", "Long"]) {
    const group = kickouts.filter(
      (event) => event.kickoutLength?.toLowerCase() === length.toLowerCase(),
    );
    const wins = group.filter((event) => event.outcome === "won").length;
    const losses = group.filter((event) => event.outcome === "lost").length;
    lengths[length.toLowerCase()] = {
      total: group.length,
      won: wins,
      lost: losses,
      unknown: group.length - wins - losses,
      success: percentage(wins, wins + losses),
    };
  }
  return {
    ...totals(events, team),
    attempts: shots.length,
    successful,
    misses: shots.length - successful,
    conversion: percentage(successful, shots.length),
    kickouts: {
      total: kickouts.length,
      won,
      lost,
      unknown: kickouts.length - won - lost,
      retention: percentage(won, won + lost),
      ...lengths,
    },
    turnoversWon: selected.filter((event) => event.event === "turnover-won")
      .length,
    turnoversLost: selected.filter((event) => event.event === "turnover-lost")
      .length,
    interceptions: selected.filter((event) => event.event === "interception")
      .length,
    possessions: selected.filter((event) => event.event === "possession")
      .length,
  };
}
export function playerStatistics(match, team) {
  const squad = team === "our" ? match.players : match.oppositionPlayers;
  const numbers = new Set([
    ...squad.map((player) => String(player.number)),
    ...match.events
      .filter((event) => event.team === team && event.playerNumber !== "")
      .map((event) => String(event.playerNumber)),
  ]);
  return [...numbers]
    .sort((a, b) => Number(a) - Number(b))
    .map((number) => {
      const events = match.events.filter(
        (event) => event.team === team && String(event.playerNumber) === number,
      );
      const summary = summarize(events, team);
      return {
        number,
        name:
          squad.find((player) => String(player.number) === number)?.name ||
          "Unlisted player",
        ...summary,
        kickoutInvolvement: events.filter(isKickout).length,
      };
    });
}
export function scoringTimeline(events) {
  const sorted = events
    .filter((event) => isShot(event) && event.outcome === "scored")
    .slice()
    .sort((a, b) => a.half - b.half || a.timeMs - b.timeMs);
  return sorted.map((event, index) => ({
    event,
    our: totals(sorted.slice(0, index + 1), "our").total,
    opposition: totals(sorted.slice(0, index + 1), "opposition").total,
  }));
}
