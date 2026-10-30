import { uid } from "./ids.js";
import { kickoutDetails } from "./kickouts.js";
import { shotDetails } from "./shots.js";
export const validPlayerId = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
export const rowId = (p) => p?.matchPlayerId || p?.id || null;
export function createMatchPlayer(player) {
  const id = player.matchPlayerId || player.id || uid();
  return {
    ...player,
    id,
    matchPlayerId: id,
    playerId: validPlayerId(player.playerId) ? player.playerId : null,
    nameSnapshot: player.name,
    jerseyNumber: player.number,
    sourceSquadId: player.sourceSquadId || null,
  };
}
export function createSquadPlayer(player) {
  const playerId = validPlayerId(player.playerId) ? player.playerId : uid();
  return {
    id: playerId,
    playerId,
    name: player.name,
    number: player.number ?? null,
    position: player.position || "",
    role: player.role || "starter",
    notes: player.notes || "",
    secondaryPosition: player.secondaryPosition || "",
    status: player.status || "active",
  };
}
const roster = (match, team) =>
  (team === "our" ? match.players : match.oppositionPlayers) || [];
export function roleNumber(event, role) {
  if (role === "player") return String(event.playerNumber || "");
  if (role === "markWinner")
    return kickoutDetails(event)?.markPlayerNumber || "";
  if (role === "blocker")
    return event.event === "defensive-block"
      ? String(event.playerNumber || "")
      : event.team === "opposition"
        ? shotDetails(event)?.blockedByNumber || ""
        : "";
  if (role === "receiver")
    return event.event === "pass" ? String(event.receiverNumber || "") : "";
  if (["turnoverWinner", "turnoverLoser"].includes(role))
    return ["turnover-won", "turnover-lost"].includes(event.event)
      ? String(event[role + "Number"] || "")
      : "";
  return event.event === "substitution" ? String(event[role] || "") : "";
}
export const roleTeam = (event, role) => {
  if (["markWinner", "blocker"].includes(role)) return "our";
  if (role === "turnoverWinner")
    return event.event === "turnover-won"
      ? event.team
      : event.team === "our"
        ? "opposition"
        : "our";
  if (role === "turnoverLoser")
    return event.event === "turnover-lost"
      ? event.team
      : event.team === "our"
        ? "opposition"
        : "our";
  return event.team;
};
export const participantRoles = [
  "player",
  "markWinner",
  "blocker",
  "playerOn",
  "playerOff",
  "receiver",
  "turnoverWinner",
  "turnoverLoser",
];
const roles = participantRoles;
function validRef(ref, event, role) {
  return (
    ref &&
    ref.team === roleTeam(event, role) &&
    typeof ref.matchPlayerId === "string" &&
    ref.matchPlayerId.length > 0 &&
    (ref.playerId === null || validPlayerId(ref.playerId)) &&
    typeof ref.nameSnapshot === "string" &&
    Number.isInteger(ref.jerseyNumber) &&
    ref.jerseyNumber >= 1 &&
    ref.jerseyNumber <= 99 &&
    String(ref.jerseyNumber) === roleNumber(event, role)
  );
}
export function validEventIdentity(event) {
  if (event.identityVersion === undefined) return true;
  return (
    event.identityVersion === 1 &&
    event.participants &&
    roles.every(
      (role) =>
        event.participants[role] === null ||
        (["receiver", "turnoverWinner", "turnoverLoser"].includes(role) &&
          event.participants[role] === undefined) ||
        validRef(event.participants[role], event, role),
    )
  );
}
export function validMatchPlayerIdentity(player) {
  return (
    (player.playerId === undefined ||
      player.playerId === null ||
      validPlayerId(player.playerId)) &&
    (player.matchPlayerId === undefined ||
      (typeof player.matchPlayerId === "string" &&
        player.matchPlayerId.length > 0 &&
        player.matchPlayerId === player.id))
  );
}
export function participantRef(event, role = "player") {
  const ref = event.identityVersion === 1 ? event.participants?.[role] : null;
  return validRef(ref, event, role) ? ref : null;
}
function fromNumber(match, event, role) {
  const number = roleNumber(event, role),
    team = roleTeam(event, role);
  if (!number) return null;
  const matches = roster(match, team).filter(
    (p) => p.number !== null && String(p.number) === number,
  );
  if (matches.length !== 1 || !rowId(matches[0])) return null;
  const p = matches[0];
  if (roster(match, team).filter((v) => rowId(v) === rowId(p)).length !== 1)
    return null;
  return {
    team,
    matchPlayerId: rowId(p),
    playerId: validPlayerId(p.playerId) ? p.playerId : null,
    nameSnapshot: p.name,
    jerseyNumber: Number(number),
  };
}
export function bindEventParticipants(event, previous, match) {
  // Number-only legacy events never acquire a permanent link through a save,
  // roster load, note edit, or name/number resemblance.
  if (event.identityVersion !== 1 || !match) return event;
  const participants = {};
  for (const role of roles) {
    const number = roleNumber(event, role),
      same =
        previous &&
        roleNumber(previous, role) === number &&
        roleTeam(previous, role) === roleTeam(event, role);
    participants[role] = !number
      ? null
      : same
        ? participantRef(previous, role)
        : fromNumber(match, event, role);
  }
  return { ...event, participants };
}
export function resolveParticipant(match, event, role = "player") {
  const ref = participantRef(event, role);
  if (ref) {
    const p = roster(match, ref.team).find(
      (p) =>
        rowId(p) === ref.matchPlayerId &&
        (p.playerId || null) === (ref.playerId || null),
    );
    return p
      ? {
          ...p,
          matchPlayerId: ref.matchPlayerId,
          playerId: ref.playerId,
          found: true,
        }
      : {
          id: ref.matchPlayerId,
          matchPlayerId: ref.matchPlayerId,
          playerId: ref.playerId,
          name: ref.nameSnapshot,
          number: ref.jerseyNumber,
          found: false,
        };
  }
  const n = roleNumber(event, role),
    team = roleTeam(event, role);
  const p = roster(match, team).find(
    (p) => p.number !== null && String(p.number) === n,
  );
  return n
    ? {
        ...p,
        name: p?.name || "Unlisted player",
        number: Number(n),
        playerId: null,
        matchPlayerId: null,
        found: !!p,
      }
    : null;
}
export function participantKey(event, role = "player") {
  const ref = participantRef(event, role),
    n = roleNumber(event, role),
    team = roleTeam(event, role);
  return ref
    ? `id:${ref.team}:${ref.matchPlayerId}`
    : n
      ? `legacy:${team}:${n}`
      : null;
}
