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
      });
    return groups.get(key);
  }
  for (const e of match.events) {
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
      if (kickoutDetails(e)?.markPlayerNumber) {
        const g = group(e, "markWinner");
        if (g) g.marks.push(e);
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
      kickoutMarks: team === "our" ? g.marks.length : 0,
      kickoutInvolvement: g.main.filter((e) =>
        ["our-kickout", "opposition-kickout"].includes(e.event),
      ).length,
    }));
}
export function hasIdentityAttribution(match, team) {
  const roster = team === "our" ? match.players : match.oppositionPlayers;
  return (
    roster.some((p) => p.matchPlayerId) ||
    match.events.some((e) =>
      [
        "player",
        "blocker",
        "markWinner",
        "receiver",
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
