import { validatePlayers } from "./squads.js";
import { createMatchPlayer } from "./identity.js";
import { esc } from "./ui.js";
export function applyMatchLineup(original, changes) {
  if (
    changes.length !== original.length ||
    new Set(changes.map((p) => p.id)).size !== original.length
  )
    throw Error("Roster changed. Reopen today’s lineup.");
  return validatePlayers(
    changes.map((c) => {
      const old = original.find((p) => p.id === c.id);
      if (!old) throw Error("Unknown match player");
      return { ...old, number: c.number, role: c.role };
    }),
  ).map(createMatchPlayer);
}
export function openMatchLineup(dialog, players, onSaved) {
  dialog.innerHTML = `<form><div class="dialog-heading"><div><p class="eyebrow">THIS MATCH ONLY</p><h2 id="event-dialog-title">Today’s team</h2></div><button type="button" class="icon-button" data-lineup-close aria-label="Close today's team">×</button></div><p class="small-note">Set today’s jerseys and starting lineup together. Swaps save in one step. Blank jerseys are allowed. During play, use Substitution for on/off changes; these roles are the starting lineup. Saved Squad identities are unchanged.</p><div class="table-scroll review-table"><table><thead><tr><th>Player</th><th>Today's jersey</th><th>Starting role</th></tr></thead><tbody>${players
    .map(
      (p, i) =>
        `<tr data-today-row data-player-id="${esc(p.id)}"><th>${esc(p.name)}</th><td><input name="number" aria-label="Today's jersey ${i + 1}" type="number" min="1" max="99" inputmode="numeric" value="${esc(p.number ?? "")}"></td><td><select name="role" aria-label="Today's role ${i + 1}">${[
          ["starter", "Starter"],
          ["substitute", "Substitute"],
          ["panel", "Panel · not selected"],
        ]
          .map(
            ([id, label]) =>
              `<option value="${id}" ${id === p.role ? "selected" : ""}>${label}</option>`,
          )
          .join("")}</select></td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div><p class="warning" data-lineup-error hidden></p><div class="dialog-actions"><button type="button" class="button subtle" data-lineup-close>Cancel</button><button class="button primary" type="submit">Save today's team</button></div></form>`;
  dialog
    .querySelectorAll("[data-lineup-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const changes = [...dialog.querySelectorAll("[data-today-row]")].map(
        (r) => ({
          id: r.dataset.playerId,
          number: r.querySelector("[name=number]").value,
          role: r.querySelector("[name=role]").value,
        }),
      );
      onSaved(applyMatchLineup(players, changes));
      dialog.close();
    } catch (error) {
      const n = dialog.querySelector("[data-lineup-error]");
      n.hidden = false;
      n.textContent = error.message;
    }
  };
  dialog.showModal();
  dialog.querySelector("[data-lineup-close]").focus();
}
