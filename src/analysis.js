import {
  identityPlayerStatistics,
  hasIdentityAttribution,
  matchesPlayerFilter,
} from "./identity-analysis.js";
import { isDefensiveBlock, defensiveBlockPlayer } from "./defensive-blocks.js";
import { kickoutDetails } from "./kickouts.js";
import { shotDetails, SHOT_SOURCES } from "./shots.js";
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
      (player === "all" || matchesPlayerFilter(event, player)) &&
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
  const won = kickouts.filter(
    (event) => kickoutDetails(event).outcome === "won",
  ).length;
  const lost = kickouts.filter(
    (event) => kickoutDetails(event).outcome === "lost",
  ).length;
  const lengths = {};
  for (const length of ["Short", "Long"]) {
    const group = kickouts.filter(
      (event) => event.kickoutLength?.toLowerCase() === length.toLowerCase(),
    );
    const wins = group.filter(
      (event) => kickoutDetails(event).outcome === "won",
    ).length;
    const losses = group.filter(
      (event) => kickoutDetails(event).outcome === "lost",
    ).length;
    lengths[length.toLowerCase()] = {
      total: group.length,
      won: wins,
      lost: losses,
      unknown: group.length - wins - losses,
      success: percentage(team === "our" ? wins : losses, wins + losses),
    };
  }
  return {
    ...totals(events, team),
    attempts: shots.length,
    successful,
    misses: shots.length - successful,
    wides: shots.filter(
      (e) =>
        shotDetails(e).shotOutcome === "miss" &&
        shotDetails(e).missReason === "wide",
    ).length,
    conversion: percentage(successful, shots.length),
    scoresBySource: Object.fromEntries(
      SHOT_SOURCES.map(([source]) => [
        source,
        shots.filter(
          (e) => e.outcome === "scored" && shotDetails(e).shotSource === source,
        ).length,
      ]),
    ),
    blockedAttempts: shots.filter(
      (e) => shotDetails(e).missReason === "blocked",
    ).length,
    defensiveBlocks:
      team === "our" ? events.filter(isDefensiveBlock).length : 0,
    kickouts: {
      total: kickouts.length,
      won,
      lost,
      unknown: kickouts.length - won - lost,
      retention: percentage(team === "our" ? won : lost, won + lost),
      possessionWinRate: percentage(won, won + lost),
      marksWon: kickouts.filter(
        (e) => kickoutDetails(e).mark && kickoutDetails(e).outcome === "won",
      ).length,
      marksLost: kickouts.filter(
        (e) => kickoutDetails(e).mark && kickoutDetails(e).outcome === "lost",
      ).length,
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
  if (hasIdentityAttribution(match, team))
    return identityPlayerStatistics(match, team, summarize);
  const squad = team === "our" ? match.players : match.oppositionPlayers;
  const numbers = new Set([
    ...squad
      .filter((player) => Number.isInteger(player.number))
      .map((player) => String(player.number)),
    ...(team === "our"
      ? match.events.map(defensiveBlockPlayer).filter(Boolean)
      : []),
    ...(team === "our"
      ? match.events
          .map((e) => kickoutDetails(e)?.markPlayerNumber)
          .filter(Boolean)
      : []),
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
        defensiveBlocks:
          team === "our"
            ? match.events.filter((e) => defensiveBlockPlayer(e) === number)
                .length
            : 0,
        kickoutInvolvement: events.filter(isKickout).length,
        kickoutMarks:
          team === "our"
            ? match.events.filter(
                (e) => kickoutDetails(e)?.markPlayerNumber === number,
              ).length
            : 0,
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
