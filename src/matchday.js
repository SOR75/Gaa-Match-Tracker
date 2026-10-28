import { participantRef, resolveParticipant } from "./identity.js";
const playersFor = (match, team) =>
  team === "our" ? match.players : match.oppositionPlayers;
export function createTapGuard(delay = 650) {
  let lastKey = "",
    lastAt = -Infinity;
  return (key, now = performance.now()) => {
    if (key === lastKey && now - lastAt < delay) return false;
    lastKey = key;
    lastAt = now;
    return true;
  };
}
export function attackingDirection(match, team, half) {
  const first = match.setup.ourFirstHalfAttacks || "top";
  const reverse = (team === "opposition") !== (half === 2);
  return reverse ? (first === "top" ? "bottom" : "top") : first;
}
// Canonical storage always faces the attacking goal at top (as in V2).
// A 180-degree display rotation is its own inverse; never rewrite event data.
export function transformLocation(location, direction = "top") {
  if (direction === "top") return { ...location };
  return { shotX: 1 - location.shotX, shotY: 1 - location.shotY };
}
export function onFieldNumbers(match, team) {
  const active = new Set(
    playersFor(match, team)
      .filter(
        (player) =>
          player.role === "starter" && Number.isInteger(player.number),
      )
      .map((player) => String(player.number)),
  );
  match.events
    .filter((event) => event.team === team && event.event === "substitution")
    .slice()
    .sort((a, b) => a.half - b.half || a.timeMs - b.timeMs)
    .forEach((event) => {
      for (const role of ["playerOff", "playerOn"]) {
        const ref = participantRef(event, role),
          player = ref ? resolveParticipant(match, event, role) : null;
        if (ref && !player?.found) continue;
        const number = ref ? player.number : event[role];
        if (number !== null && number !== "")
          active[role === "playerOff" ? "delete" : "add"](
            String(Number(number)),
          );
      }
    });
  return active;
}
export function validSubstitution(playerOn, playerOff) {
  const valid = (value) =>
    /^\d{1,2}$/.test(String(value)) &&
    Number(value) >= 1 &&
    Number(value) <= 99;
  return (
    valid(playerOn) &&
    valid(playerOff) &&
    Number(playerOn) !== Number(playerOff)
  );
}
