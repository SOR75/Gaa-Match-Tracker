import { attributionRoster, playerCreditPicker } from "./player-credit.js";
import { onFieldKeys, playerKey } from "./participation.js";
import { esc } from "./ui.js";
// Only live Pass applies the existing team-aware active calculation to both teams.
// No roster means retain the shared anonymous number-only fallback.
export function livePassRoster(match, team) {
  const roster = attributionRoster(match, team, { includeInactive: true });
  if (roster.fallback) return roster;
  const active = onFieldKeys(match, team);
  const players = roster.players.filter((p) => active.has(playerKey(p)));
  return { ...roster, players, guidance: players.length ? "" : roster.guidance || "No on-field players available — set today’s lineup in Squad" };
}
// A local draft only; the existing recording callback runs on a valid type tap.
export function openPassCapture(dialog, event, match, onRecord) {
  let recorded = false;
  const draft = { playerNumber: "", receiverNumber: "" };
  const roster = livePassRoster(match, event.team);
  const teamName = event.team === "our" ? match.setup.ourTeam : match.setup.opposition;
  const grid = (label, attribute) => `<section class="pass-roster"><h3>${label}</h3>${playerCreditPicker(roster, { groupLabel: label, attribute, actionLabel: label })}</section>`;
  dialog.innerHTML = `<div data-pass-form><div class="dialog-heading"><div><p class="eyebrow">PASS · ${esc(teamName)}</p><h2 id="event-dialog-title">Pass</h2></div><button type="button" class="icon-button" data-pass-close aria-label="Close Pass">×</button></div><p class="capture-instruction">Tap FROM, TO, then Hand Pass or Kick Pass.</p><div class="pass-rosters">${grid("FROM", "data-pass-from")}${grid("TO", "data-pass-to")}</div><h3 class="pass-type-heading">PASS TYPE</h3><div class="pass-type-options" role="group" aria-label="Pass type"><button type="button" class="button primary" data-pass-type="hand" disabled>Hand Pass</button><button type="button" class="button primary" data-pass-type="kick" disabled>Kick Pass</button></div></div>`;
  dialog.querySelector("[data-pass-close]").onclick = () => dialog.close();
  const choose = (attribute, number, clearOther = true) => {
    if (clearOther) {
      const other = dialog.querySelector(`[data-credit-other="${attribute}"]`);
      if (other) other.value = "";
    }
    draft[attribute === "data-pass-from" ? "playerNumber" : "receiverNumber"] = number;
    dialog.querySelectorAll(`[${attribute}]`).forEach((button) => {
      const selected = button.getAttribute(attribute) === number;
      button.classList.toggle("chosen", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    dialog.querySelectorAll("[data-pass-type]").forEach((button) => {
      button.disabled = !draft.playerNumber || !draft.receiverNumber;
    });
  };
  for (const attribute of ["data-pass-from", "data-pass-to"]) {
    dialog.querySelectorAll(`[${attribute}]`).forEach((button) => {
      button.onclick = () => choose(attribute, button.getAttribute(attribute));
    });
  }
  dialog.querySelectorAll("[data-credit-other]").forEach((input) => {
    input.oninput = () => choose(input.dataset.creditOther,
      input.value && input.validity.valid ? String(+input.value) : "", false);
  });
  dialog.querySelectorAll("[data-pass-type]").forEach((button) => {
    button.onclick = () => {
      if (recorded || !draft.playerNumber || !draft.receiverNumber) return;
      recorded = true;
      onRecord({ ...event, ...draft, passType: button.dataset.passType });
      dialog.close();
    };
  });
  dialog.showModal();
  dialog.querySelector("[data-pass-close]").focus();
}
