import { esc } from "./ui.js";
import {
  readOfficialSquad,
  validateSquadDraft,
  createImportedSquad,
  importedSquadName,
} from "./squad-excel.js";
import { loadSquads, persistSquads } from "./squads.js";
const fields = [
  ["clubName", "Club Name"],
  ["squadName", "Squad Name"],
  ["seasonLabel", "Season"],
  ["code", "Code"],
  ["coach", "Coach / Manager"],
];
const sessions = new WeakMap();
const close =
  '<button type="button" class="icon-button" data-excel-close aria-label="Close Squad Import">×</button>';
function row(p, index) {
  return `<tr data-excel-row><td><input name="name" aria-label="Imported player ${index + 1} name" maxlength="80" value="${esc(p.name)}"></td><td><input name="number" aria-label="Imported player ${index + 1} default number" inputmode="numeric" value="${esc(p.number ?? "")}"></td><td class="uncertain" data-excel-issues></td><td><button type="button" class="icon-button" data-excel-remove aria-label="Remove imported player ${index + 1}">×</button></td></tr>`;
}
export async function openOfficialSquadImport(dialog, file, onSaved) {
  const token = {};
  sessions.set(dialog, token);
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="event-dialog-title">Read Sideline Squad</h2>${close}</div><p role="status">Reading locally… Nothing has been saved.</p>`;
  const cancel = () => {
    if (sessions.get(dialog) === token) sessions.delete(dialog);
    dialog.oninput = null;
    dialog.close();
  };
  dialog.querySelector("[data-excel-close]").onclick = cancel;
  dialog.addEventListener(
    "close",
    () => {
      if (!dialog.open && sessions.get(dialog) === token) {
        sessions.delete(dialog);
        dialog.oninput = null;
      }
    },
    { once: true },
  );
  dialog.showModal();
  let draft;
  try {
    draft = await readOfficialSquad(file);
  } catch (e) {
    if (sessions.get(dialog) !== token || !dialog.open) return;
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="event-dialog-title">Squad import unavailable</h2>${close}</div><p role="alert">${esc(e.message)}</p>`;
    dialog.querySelector("[data-excel-close]").onclick = cancel;
    return;
  }
  if (sessions.get(dialog) !== token || !dialog.open) return;
  dialog.innerHTML = `<form><div class="dialog-heading"><div><p class="eyebrow">OFFICIAL SIDELINE TEMPLATE · LOCAL IMPORT</p><h2 id="event-dialog-title">SQUAD IMPORT REVIEW</h2></div>${close}</div><p data-excel-title></p><p role="status" data-excel-summary></p><p class="small-note">Nothing is saved until CREATE SQUAD. Duplicate names may be separate people; review them. Default numbers are optional and never identify a player. Older template position/status columns are ignored; positions are set for each match.</p><div class="form-grid">${fields.map(([key, label]) => `<label class="field"><span>${label}</span><input data-excel-meta="${key}" value="${esc(draft.metadata[key] || "")}" maxlength="80"></label>`).join("")}</div><div class="table-scroll review-table"><table><thead><tr><th>Player Name *</th><th>Default No.</th><th>Review</th><th></th></tr></thead><tbody>${draft.players.map(row).join("")}</tbody></table></div><button type="button" class="button subtle" data-excel-add>Add player row</button><p class="warning" data-excel-error hidden></p><div class="dialog-actions"><button type="button" class="button subtle" data-excel-close>Cancel import</button><button type="submit" class="button primary">CREATE SQUAD</button></div></form>`;
  let nextRow = draft.players.length;
  const read = () => ({
    metadata: Object.fromEntries(
      [...dialog.querySelectorAll("[data-excel-meta]")].map((n) => [
        n.dataset.excelMeta,
        n.value,
      ]),
    ),
    players: [...dialog.querySelectorAll("[data-excel-row]")].map((r) =>
      Object.fromEntries(
        [...r.querySelectorAll("input")].map((n) => [n.name, n.value]),
      ),
    ),
  });
  function update() {
    const d = read(),
      v = validateSquadDraft(d);
    dialog.querySelector("[data-excel-title]").textContent = importedSquadName(
      d.metadata,
    );
    dialog.querySelector("[data-excel-summary]").textContent =
      `${d.players.length} players found · ${v.ready} ready · ${d.players.length - v.ready} need review${v.rows.length ? "" : " — add at least one player"}${v.metadataErrors.length ? ` — ${v.metadataErrors.join(" ")}` : ""}`;
    dialog.querySelectorAll("[data-excel-issues]").forEach((n, i) => {
      n.textContent =
        [...v.rows[i].errors, ...v.rows[i].warnings].join(" ") || "Ready";
    });
    dialog.querySelector("[type=submit]").disabled = !v.valid;
  }
  dialog
    .querySelectorAll("[data-excel-close]")
    .forEach((b) => (b.onclick = cancel));
  dialog.oninput = update;
  dialog.querySelector("form").onclick = (e) => {
    if (e.target.closest("[data-excel-remove]")) {
      e.target.closest("tr").remove();
      update();
    }
    if (e.target.closest("[data-excel-add]")) {
      dialog
        .querySelector("tbody")
        .insertAdjacentHTML("beforeend", row({ name: "" }, nextRow++));
      update();
    }
  };
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const loaded = loadSquads();
      if (loaded.error) throw Error(loaded.error);
      const d = read(),
        name = importedSquadName(d.metadata);
      if (
        loaded.squads.some((s) => s.name.toLowerCase() === name.toLowerCase())
      )
        throw Error(
          "A saved squad has this name. Change the squad name before creating another.",
        );
      const squad = createImportedSquad(d);
      persistSquads([...loaded.squads, squad]);
      dialog.oninput = null;
      cancel();
      onSaved(squad);
    } catch (error) {
      const n = dialog.querySelector("[data-excel-error]");
      n.textContent = error.message;
      n.hidden = false;
    }
  };
  update();
}
