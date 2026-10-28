import { rowId, participantRef } from "./identity.js";
const rosterFor = (match, team) =>
  (team === "our" ? match.players : match.oppositionPlayers) || [];
export const playerKey = (player) => `id:${rowId(player)}`;
export function substitutionKey(match, event, role) {
  const team = event.team,
    roster = rosterFor(match, team),
    ref = participantRef(event, role);
  if (ref) return `id:${ref.matchPlayerId}`;
  const number = String(event[role] || "");
  if (!number) return null;
  const found = roster.filter(
    (p) => p.number !== null && String(p.number) === number,
  );
  return found.length === 1 ? playerKey(found[0]) : `number:${number}`;
}
export function onFieldKeys(match, team, { beforeEvent = null } = {}) {
  const active = new Set(
    rosterFor(match, team)
      .filter((p) => p.role === "starter")
      .map(playerKey),
  );
  const ordered = match.events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) => event.team === team && event.event === "substitution",
    )
    .sort(
      (a, b) =>
        a.event.half - b.event.half ||
        a.event.timeMs - b.event.timeMs ||
        a.index - b.index,
    );
  const boundary = beforeEvent
    ? match.events.findIndex((e) => e.id === beforeEvent.id)
    : -1;
  for (const { event, index } of ordered) {
    if (
      beforeEvent &&
      (event.half > beforeEvent.half ||
        (event.half === beforeEvent.half &&
          (event.timeMs > beforeEvent.timeMs ||
            (event.timeMs === beforeEvent.timeMs &&
              boundary >= 0 &&
              index >= boundary))))
    )
      continue;
    const off = substitutionKey(match, event, "playerOff"),
      on = substitutionKey(match, event, "playerOn");
    if (off) active.delete(off);
    if (on) active.add(on);
  }
  return active;
}
export function onFieldPlayers(match, team, options) {
  const active = onFieldKeys(match, team, options);
  return rosterFor(match, team).filter((p) => active.has(playerKey(p)));
}
export function substitutionChoices(match, event) {
  const active = onFieldKeys(match, event.team, { beforeEvent: event }),
    roster = rosterFor(match, event.team).filter((p) =>
      Number.isInteger(p.number),
    );
  return {
    on: roster.filter((p) => !active.has(playerKey(p))),
    off: roster.filter((p) => active.has(playerKey(p))),
  };
}
export function hasMatchEvidence(match) {
  return !!(
    match.events.length ||
    match.clock.startedAt !== null ||
    match.clock.elapsedMs > 0 ||
    match.lifecycle?.status === "completed"
  );
}
export function participationFor(match, player, team = "our") {
  const ambiguousLineup =
    rosterFor(match, team).filter((p) => p.role === "starter").length > 15;
  const started =
    player.role === "starter" && !ambiguousLineup && hasMatchEvidence(match);
  const entered = match.events.some(
    (e) =>
      e.team === team &&
      e.event === "substitution" &&
      participantRef(e, "playerOn")?.matchPlayerId === rowId(player) &&
      participantRef(e, "playerOn")?.playerId === player.playerId,
  );
  const action = match.events.some((e) =>
    ["player", "markWinner", "blocker"].some((role) => {
      const ref = participantRef(e, role);
      return (
        ref?.team === team &&
        ref.matchPlayerId === rowId(player) &&
        ref.playerId === player.playerId
      );
    }),
  );
  const appeared = started || entered || action;
  const substituteAppearance =
    appeared &&
    !started &&
    (entered || ["substitute", "panel"].includes(player.role));
  return {
    named: true,
    started,
    entered,
    appeared,
    substituteAppearance,
    appearanceRoleUnknown: appeared && !started && !substituteAppearance,
    didNotPlay:
      !appeared && !ambiguousLineup && match.lifecycle?.status === "completed",
    participationWarning: ambiguousLineup
      ? "Review starting lineup: more than 15 starters recorded"
      : "",
    evidence: started
      ? "Starting lineup"
      : entered
        ? "Recorded substitution"
        : action
          ? "Attributed event"
          : ambiguousLineup
            ? "Review starting lineup: more than 15 starters recorded"
            : "No appearance recorded",
  };
}
