import { playersFor } from "./domain.js";
import { validSubstitution } from "./matchday.js";
import { esc } from "./ui.js";
export function openSubstitution(dialog, draft, match, onSaved) {
  let saved = false;
  dialog.innerHTML = `<form id="substitution-form"><div class="dialog-heading"><div><p class="eyebrow">H${draft.half} · ${Math.floor(draft.timeMs / 60000)}:${String(Math.floor(draft.timeMs / 1000) % 60).padStart(2, "0")}</p><h2 id="event-dialog-title">Substitution</h2></div><button type="button" class="icon-button" data-sub-cancel aria-label="Cancel substitution">×</button></div><p class="small-note">${esc(draft.team === "our" ? match.setup.ourTeam : match.setup.opposition)} · choose player ON, then OFF. Jersey numbers can also be entered.</p><div class="sub-grid">${[
    "On",
    "Off",
  ]
    .map(
      (key) =>
        `<fieldset><legend>Player ${key.toUpperCase()}</legend><div class="sub-picks">${playersFor(
          match,
          draft.team,
        )
          .filter(
            (player) =>
              Number.isInteger(player.number) && player.role !== "panel",
          )
          .slice()
          .sort((a, b) => a.number - b.number)
          .map(
            (player) =>
              `<button type="button" class="player-pick" data-sub-${key.toLowerCase()}="${player.number}" aria-label="Player ${key.toLowerCase()} ${player.number}">${player.number}<span>${esc(player.name)}</span></button>`,
          )
          .join(
            "",
          )}</div><label class="field"><span>Player ${key.toLowerCase()}</span><input name="player${key}" type="number" min="1" max="99" required inputmode="numeric" value="${esc(draft["player" + key] || "")}" placeholder="Jersey"></label></fieldset>`,
    )
    .join(
      "",
    )}</div><p class="warning" data-sub-error hidden></p><div class="dialog-actions"><button class="button primary" type="submit">Record substitution</button></div></form>`;
  dialog.querySelector("[data-sub-cancel]").onclick = () => dialog.close();
  for (const key of ["on", "off"])
    dialog.querySelectorAll(`[data-sub-${key}]`).forEach(
      (button) =>
        (button.onclick = () => {
          dialog.querySelector(
            `[name="player${key === "on" ? "On" : "Off"}"]`,
          ).value = button.dataset[key === "on" ? "subOn" : "subOff"];
          dialog
            .querySelectorAll(`[data-sub-${key}]`)
            .forEach((node) =>
              node.classList.toggle("chosen", node === button),
            );
        }),
    );
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    if (saved) return;
    const data = Object.fromEntries(new FormData(event.target));
    if (!validSubstitution(data.playerOn, data.playerOff)) {
      const error = dialog.querySelector("[data-sub-error]");
      error.hidden = false;
      error.textContent = "Choose different on/off jersey numbers, 1–99.";
      return;
    }
    saved = true;
    dialog.close();
    onSaved({ ...draft, ...data });
  };
  dialog.showModal();
  dialog.querySelector("[data-sub-cancel]").focus();
}
