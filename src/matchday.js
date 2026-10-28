import { onFieldKeys, playerKey } from "./participation.js";
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
  const keys = onFieldKeys(match, team),
    active = new Set();
  for (const p of playersFor(match, team))
    if (keys.has(playerKey(p)) && Number.isInteger(p.number))
      active.add(String(p.number));
  for (const key of keys)
    if (key.startsWith("number:")) active.add(key.slice(7));
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
