import {
  participantKey,
  participantRef,
  resolveParticipant,
  roleTeam,
  rowId,
  validPlayerId,
} from "./identity.js";
import { kickoutDetails } from "./kickouts.js";
import { isDefensiveBlock } from "./defensive-blocks.js";
export function identityPlayerStatistics(match, team, summarize) {
  const roster = team === "our" ? match.players : match.oppositionPlayers,
    groups = new Map();
  function group(event, role) {
    const key = participantKey(event, role);
    if (!key) return null;
    const p = resolveParticipant(match, event, role);
    if (!p) return null;
    if (!groups.has(key))
      groups.set(key, {
        key,
        number: p.number,
        name: p.name,
        playerId: p.playerId || null,
        matchPlayerId: p.matchPlayerId || null,
        main: [],
        blocks: [],
        marks: [],
        wins: [],
        losses: [],
        passesReceived: [],
        kickoutWins: [],
      });
    return groups.get(key);
  }
  for (const e of match.events) {
    const kickout = kickoutDetails(e);
    if (kickout?.kickoutWinnerNumber && roleTeam(e, "kickoutWinner") === team) {
      const g = group(e, "kickoutWinner");
      if (g) {
        g.kickoutWins.push(e);
        if (kickout.mark) g.marks.push(e);
      }
    }
    if (e.event === "pass" && e.team === team) {
      const g = group(e, "receiver");
      if (g) g.passesReceived.push(e);
    }
    if (["turnover-won", "turnover-lost"].includes(e.event)) {
      for (const [role, field] of [
        ["turnoverWinner", "wins"],
        ["turnoverLoser", "losses"],
      ]) {
        if (roleTeam(e, role) === team) {
          const has = e[role + "Number"];
          const fallback =
            !has &&
            e.team === team &&
            ((role === "turnoverWinner" && e.event === "turnover-won") ||
              (role === "turnoverLoser" && e.event === "turnover-lost"));
          const g = group(e, fallback ? "player" : role);
          if (g) g[field].push(e);
        }
      }
    }
    if (e.team === team) {
      const g = group(e, "player");
      if (g) g.main.push(e);
    }
    if (team === "our") {
      if (isDefensiveBlock(e)) {
        const g = group(e, "blocker");
        if (g) g.blocks.push(e);
      }
      if (
        kickoutDetails(e)?.markPlayerNumber &&
        !kickoutDetails(e)?.kickoutWinnerNumber
      ) {
        const g = group(e, "markWinner");
        if (g) {
          g.marks.push(e);
          g.kickoutWins.push(e);
        }
      }
    }
  }
  for (const p of roster.filter((p) => Number.isInteger(p.number))) {
    const key = `id:${team}:${rowId(p)}`,
      legacy = `legacy:${team}:${p.number}`;
    if (!groups.has(key) && !(!p.playerId && groups.has(legacy)))
      groups.set(key, {
        key,
        number: p.number,
        name: p.name,
        playerId: validPlayerId(p.playerId) ? p.playerId : null,
        matchPlayerId: rowId(p),
        main: [],
        blocks: [],
        marks: [],
        wins: [],
        losses: [],
        passesReceived: [],
        kickoutWins: [],
      });
  }
  return [...groups.values()]
    .sort((a, b) => a.number - b.number || a.key.localeCompare(b.key))
    .map((g) => ({
      number: String(g.number),
      name:
        g.name +
        (g.key.startsWith("legacy:") &&
        roster.some((p) => p.playerId && String(p.number) === String(g.number))
          ? " · legacy/unlinked"
          : ""),
      playerId: g.playerId,
      matchPlayerId: g.matchPlayerId,
      identityKey: g.key,
      filterKey: g.key,
      ...summarize(g.main, team),
      turnoversWon: g.wins.length,
      turnoversLost: g.losses.length,
      passes: g.main.filter((e) => e.event === "pass").length,
      passesReceived: g.passesReceived.length,
      defensiveBlocks: team === "our" ? g.blocks.length : 0,
      kickoutPossessionsWon: g.kickoutWins.length,
      otherKickoutPossessionsWon: g.kickoutWins.filter(
        (e) => !kickoutDetails(e).mark,
      ).length,
      kickoutMarks: g.marks.length,
      kickoutInvolvement: new Set(
        [
          ...g.main.filter((e) =>
            ["our-kickout", "opposition-kickout"].includes(e.event),
          ),
          ...g.kickoutWins,
        ].map((e) => e.id),
      ).size,
    }));
}
export function hasIdentityAttribution(match, team) {
  const roster = team === "our" ? match.players : match.oppositionPlayers;
  return (
    match.events.some(
      (e) =>
        kickoutDetails(e)?.kickoutWinnerNumber &&
        roleTeam(e, "kickoutWinner") === team,
    ) ||
    roster.some((p) => p.matchPlayerId) ||
    match.events.some((e) =>
      [
        "player",
        "blocker",
        "markWinner",
        "receiver",
        "kickoutWinner",
        "turnoverWinner",
        "turnoverLoser",
      ].some((role) => participantRef(e, role)?.team === team),
    )
  );
}
export function matchesPlayerFilter(event, filter) {
  if (filter.startsWith("id:"))
    return participantKey(event, "player") === filter;
  if (filter.startsWith("legacy:"))
    return (
      !participantRef(event, "player") &&
      participantKey(event, "player") === filter
    );
  return `${event.team}:${event.playerNumber}` === filter;
}
