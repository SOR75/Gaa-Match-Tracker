import { shotDetails } from "./shots.js";
export const isDefensiveBlockEvent = (event) =>
  event.event === "defensive-block";
// Retain saved opposition-shot credit from earlier V0.3.5 captures. Each event
// contributes at most one defensive block; no additional event is generated.
export const isDefensiveBlock = (event) =>
  isDefensiveBlockEvent(event) ||
  (event.team === "opposition" && shotDetails(event)?.missReason === "blocked");
export function defensiveBlockPlayer(event) {
  if (isDefensiveBlockEvent(event))
    return /^[1-9]\d?$/.test(String(event.playerNumber || ""))
      ? String(event.playerNumber)
      : "";
  return event.team === "opposition"
    ? shotDetails(event)?.blockedByNumber || ""
    : "";
}
