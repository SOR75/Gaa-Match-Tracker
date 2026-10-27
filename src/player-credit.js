import { playersFor } from "./domain.js";
import { esc } from "./ui.js";

// Mark and defensive-block credit share the active our-team roster, not a copy
// or separate database. Numberless players are never assigned invented jerseys.
export function attributionRoster(match, team, { includePanel = true } = {}) {
  const roster = playersFor(match, team);
  const players = roster
    .filter((p) => Number.isInteger(p.number) && (includePanel || p.role !== "panel"))
    .sort((a, b) => a.number - b.number);
  const guidance = !roster.length
    ? "No players loaded"
    : !players.length
      ? "No numbered players available"
      : "";
  return { players: roster.length ? players : Array.from({ length: 15 }, (_, i) => ({ number: i + 1, name: "" })), guidance, fallback: !roster.length };
}
export const ourCreditRoster = (match) => attributionRoster(match, "our");
export function emptyCreditRosterMarkup(guidance) {
  return guidance
    ? `<p class="small-note" role="status">${esc(guidance)}</p><p class="small-note">${guidance === "No players loaded" ? "Choose a number without a squad, or skip player credit." : "Load our players and add jersey numbers in Squad, or skip player credit."}</p>`
    : "";
}
export function playerCreditPicker(
  roster,
  { groupLabel, attribute, actionLabel, selected = "" },
) {
  if (!roster.players.length) return emptyCreditRosterMarkup(roster.guidance);
  return `${emptyCreditRosterMarkup(roster.guidance)}<div class="quick-player-grid" role="group" aria-label="${esc(groupLabel)}">${roster.players.map((p) => `<button type="button" class="player-pick ${String(p.number) === selected ? "chosen" : ""}" ${attribute}="${p.number}" aria-pressed="${String(p.number) === selected}" aria-label="${esc(actionLabel)} #${p.number} ${esc(p.name)}">${roster.fallback ? "No. " : ""}${p.number}<span>${esc(p.name)}</span></button>`).join("")}</div>${roster.fallback ? `<label class="field"><span>Other number · optional</span><input type="number" min="1" max="99" step="1" inputmode="numeric" data-credit-other="${attribute}" aria-label="Other number"></label>` : ""}`;
}

// A numeric input is explicit; no keyboard opens until the operator chooses it.
export function bindOtherCredit(root, onChoose) {
  root.querySelectorAll('[data-credit-other]').forEach(input => {
    input.onchange = () => {
      if (input.value && input.validity.valid) onChoose(input.dataset.creditOther, String(+input.value));
    };
  });
}
