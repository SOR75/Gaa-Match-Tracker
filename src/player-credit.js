import { playersFor } from "./domain.js";
import { esc } from "./ui.js";

// Mark and defensive-block credit share the active our-team roster, not a copy
// or separate database. Numberless players are never assigned invented jerseys.
export function ourCreditRoster(match) {
  const roster = playersFor(match, "our");
  const players = roster
    .filter((p) => Number.isInteger(p.number))
    .sort((a, b) => a.number - b.number);
  const guidance = !roster.length
    ? "No players loaded"
    : !players.length
      ? "No numbered players available"
      : "";
  return { players, guidance };
}
export function emptyCreditRosterMarkup(guidance) {
  return guidance
    ? `<p class="small-note" role="status">${esc(guidance)}</p><p class="small-note">Load our players and add jersey numbers in Squad, or skip player credit.</p>`
    : "";
}
export function playerCreditPicker(
  roster,
  { groupLabel, attribute, actionLabel, selected = "" },
) {
  if (!roster.players.length) return emptyCreditRosterMarkup(roster.guidance);
  return `<div class="quick-player-grid" role="group" aria-label="${esc(groupLabel)}">${roster.players.map((p) => `<button type="button" class="player-pick ${String(p.number) === selected ? "chosen" : ""}" ${attribute}="${p.number}" aria-pressed="${String(p.number) === selected}" aria-label="${esc(actionLabel)} #${p.number} ${esc(p.name)}">${p.number}<span>${esc(p.name)}</span></button>`).join("")}</div>`;
}
