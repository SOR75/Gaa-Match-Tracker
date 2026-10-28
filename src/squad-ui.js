import { showFormationReview } from "./formation-review.js";
import { esc } from "./ui.js";
import { playersFor } from "./domain.js";
import {
  loadSquads,
  persistSquads,
  snapshotSquad,
  loadSquadPlayers,
  validatePlayers,
} from "./squads.js";
import { extractCandidates, parseDelimited } from "./imports.js";
import {
  POSITIONS,
  parseTextPlayers,
  parseTablePlayers,
} from "./import-parser.js";

export function squadTools(match, team) {
  return `<section class="card squad-tools"><div class="team-toggle" role="group" aria-label="Squad team"><button data-squad-team="our" aria-pressed="${team === "our"}" class="${team === "our" ? "selected" : ""}">${esc(match.setup.ourTeam || "Our team")}</button><button data-squad-team="opposition" aria-pressed="${team === "opposition"}" class="${team === "opposition" ? "selected" : ""}">${esc(match.setup.opposition || "Opposition")}</button></div><div class="form-grid import-options"><label class="field"><span>Import layout</span><select id="import-layout"><option value="auto">Auto / programme list</option><option value="programme">Printed programme</option><option value="registered">Foireann / LGFA registered panel</option><option value="formation">Formation / pitch image</option></select></label><label class="field"><span>Formation goalkeeper end</span><select id="import-goal"><option value="top">Goalkeeper at top</option><option value="bottom">Goalkeeper at bottom</option></select></label></div><div class="squad-methods"><button class="button subtle" data-squad-library>Saved squads</button><button class="button subtle" data-save-squad>Save this squad</button><button class="button subtle" data-paste-squad>Paste team-sheet text</button><label class="button subtle file-button">Import team sheet<input type="file" id="team-sheet-file" accept=".csv,.tsv,.txt,.xlsx,.pdf,image/*"></label><label class="button subtle file-button">Scan / photo team sheet<input type="file" id="team-sheet-photo" accept="image/*" capture="environment"></label></div><p class="small-note">Manual entry below · imports are always reviewed before adding. JPEG/PNG and scanned PDF use bundled local OCR. PDFs use their text layer first. Handwriting / checkbox recognition is uncertain; always review. HEIC: export to JPEG/PNG first.</p></section>`;
}
const closeButton =
  '<button type="button" class="icon-button" data-close-squad aria-label="Close squad dialog">×</button>';
function rowMarkup(player, index) {
  return `<tr data-review-row data-original-index="${index}" data-source-id="${esc(player.id || "")}"><td><input aria-label="Jersey number row ${index + 1}" name="number" type="number" min="1" max="99" inputmode="numeric" value="${esc(player.number)}" placeholder="Blank allowed"></td><td><input aria-label="Player name row ${index + 1}" name="name" value="${esc(player.name)}" required maxlength="80"></td><td><input aria-label="Position row ${index + 1}" name="position" value="${esc(player.position || "")}" list="import-positions" placeholder="Review position"></td><td><select aria-label="Role row ${index + 1}" name="role"><option value="starter" ${player.role === "starter" ? "selected" : ""}>Starter</option><option value="substitute" ${player.role === "substitute" ? "selected" : ""}>Substitute</option><option value="panel" ${player.role === "panel" ? "selected" : ""}>Panel · not selected</option></select></td><td class="uncertain">${esc(player.confidence || "Saved player — editable")}</td><td><button type="button" class="icon-button" data-remove-review aria-label="Remove row ${index + 1}">×</button></td></tr>`;
}
function reviewTable(players) {
  return `<div class="table-scroll review-table"><table><thead><tr><th>Jersey</th><th>Player</th><th>Position</th><th>Starter/Sub</th><th>Confidence</th><th></th></tr></thead><tbody>${players.map(rowMarkup).join("")}</tbody></table></div><datalist id="import-positions">${[...new Set(POSITIONS)].map((position) => `<option value="${position}"></option>`).join("")}</datalist><button class="button subtle" type="button" data-add-review>+ Add row</button>`;
}
const rowBindings = new WeakMap();
function bindRows(dialog, original = []) {
  rowBindings.get(dialog)?.();
  const handleRows = (event) => {
    if (event.target.closest("[data-remove-review]"))
      event.target.closest("tr").remove();
    if (event.target.closest("[data-add-review]"))
      dialog.querySelector("tbody").insertAdjacentHTML(
        "beforeend",
        rowMarkup(
          {
            number: "",
            name: "",
            role: "starter",
            confidence: "Manual entry — verify",
          },
          dialog.querySelectorAll("tbody tr").length,
        ),
      );
    if (event.target.closest("[data-add-review]"))
      dialog.querySelector("tbody tr:last-child").dataset.originalIndex = "-1";
  };
  dialog.addEventListener("click", handleRows);
  rowBindings.set(dialog, () =>
    dialog.removeEventListener("click", handleRows),
  );
  return () =>
    [...dialog.querySelectorAll("[data-review-row]")].map((row) => {
      const data = Object.fromEntries(
        [...row.querySelectorAll("input,select")].map((input) => [
          input.name,
          input.value,
        ]),
      );
      // Retain notes/positions from saved squads when only reviewing number/name/role.
      return {
        ...(row.dataset.sourceId
          ? original.find((player) => player.id === row.dataset.sourceId)
          : original[+row.dataset.originalIndex] || {}),
        ...data,
      };
    });
}
function showError(dialog, error) {
  const node = dialog.querySelector("[data-squad-error]");
  node.textContent = error.message || String(error);
  node.hidden = false;
}
export function openSaveSquad(dialog, match, team, onSaved) {
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="event-dialog-title">Save reusable squad</h2>${closeButton}</div><p class="small-note">A separate copy is saved on this device. Editing it later will not change this match.</p><label class="field"><span>Squad name</span><input name="squadName" required maxlength="80" placeholder="e.g. Offaly U15"></label><p class="warning" data-squad-error hidden></p><div class="dialog-actions"><button type="submit" class="button primary">Save squad</button></div></form>`;
  dialog.querySelector("[data-close-squad]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    try {
      const loaded = loadSquads();
      if (loaded.error) throw new Error(loaded.error);
      const name = new FormData(event.target).get("squadName");
      if (
        loaded.squads.some(
          (squad) => squad.name.toLowerCase() === name.trim().toLowerCase(),
        )
      )
        throw new Error(
          "That name exists. Edit the saved squad in the library or choose another name.",
        );
      persistSquads([
        ...loaded.squads,
        snapshotSquad(name, playersFor(match, team)),
      ]);
      dialog.close();
      onSaved();
    } catch (error) {
      showError(dialog, error);
    }
  };
  dialog.showModal();
}
export function openSquadLibrary(dialog, match, team, onLoaded) {
  function listing() {
    const loaded = loadSquads();
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="event-dialog-title">Saved squads</h2>${closeButton}</div><p class="small-note">Library edits leave every match snapshot unchanged. Loading replaces only the selected team's current squad, after confirmation.</p><p class="warning" data-squad-error ${loaded.error ? "" : "hidden"}>${esc(loaded.error)}</p><div class="library-list">${loaded.squads.length ? loaded.squads.map((squad) => `<div class="library-row"><div><strong>${esc(squad.name)}</strong><p>${squad.players.length} players</p></div><button class="button primary" data-load-squad="${esc(squad.id)}">Load</button><button class="button subtle" data-edit-squad="${esc(squad.id)}">Edit</button></div>`).join("") : "<p>No saved squads yet. Save the players you enter on the Squad screen.</p>"}</div>`;
    dialog.querySelector("[data-close-squad]").onclick = () => dialog.close();
    dialog.querySelectorAll("[data-load-squad]").forEach(
      (button) =>
        (button.onclick = () => {
          const squad = loaded.squads.find(
            (item) => item.id === button.dataset.loadSquad,
          );
          if (
            playersFor(match, team).length &&
            !confirm(
              `Replace the selected team's current squad with ${squad.name}? Event records are kept. Historical number/name labels in this active match will use the loaded squad.`,
            )
          )
            return;
          onLoaded(loadSquadPlayers(squad));
          dialog.close();
        }),
    );
    dialog.querySelectorAll("[data-edit-squad]").forEach(
      (button) =>
        (button.onclick = () => {
          const squad = loaded.squads.find(
            (item) => item.id === button.dataset.editSquad,
          );
          dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="event-dialog-title">Edit saved squad</h2>${closeButton}</div><label class="field"><span>Squad name</span><input name="squadName" value="${esc(squad.name)}" required maxlength="80"></label>${reviewTable(squad.players)}<p class="warning" data-squad-error hidden></p><div class="dialog-actions"><button type="button" class="button subtle" data-back-library>Back</button><button type="submit" class="button primary">Save library changes</button></div></form>`;
          const read = bindRows(dialog, squad.players);
          dialog.querySelector("[data-close-squad]").onclick = () =>
            dialog.close();
          dialog.querySelector("[data-back-library]").onclick = listing;
          dialog.querySelector("form").onsubmit = (event) => {
            event.preventDefault();
            try {
              const next = snapshotSquad(
                new FormData(event.target).get("squadName"),
                read(),
                squad.id,
              );
              const current = loadSquads();
              if (current.error) throw new Error(current.error);
              if (
                current.squads.some(
                  (item) =>
                    item.id !== next.id &&
                    item.name.toLowerCase() === next.name.toLowerCase(),
                )
              )
                throw new Error("Another saved squad already uses that name.");
              persistSquads(
                current.squads.map((item) =>
                  item.id === next.id ? next : item,
                ),
              );
              listing();
            } catch (error) {
              showError(dialog, error);
            }
          };
        }),
    );
  }
  listing();
  dialog.showModal();
}

export const importOptions = () => ({
  layout: document.querySelector("#import-layout")?.value || "auto",
  goal: document.querySelector("#import-goal")?.value || "top",
});
const importSessions = new WeakMap();
export async function openImportReview(dialog, file, existing, onConfirmed) {
  importSessions.get(dialog)?.();
  const options = importOptions();
  let canceled = false,
    objectUrl = "";
  const controller = new AbortController();
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="event-dialog-title">Read team sheet</h2>${closeButton}</div><p role="status" data-import-progress>Extracting locally… no players have been added.</p><p class="small-note">OCR may take a minute on iPad. Keep this tab foreground. Cancel stops processing.</p>`;
  const cancel = () => {
    canceled = true;
    controller.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    dialog.removeEventListener("close", onClose);
    if (importSessions.get(dialog) === cancel) importSessions.delete(dialog);
  };
  // A queued close from the previous import must not cancel a newly opened one.
  const onClose = () => {
    if (!dialog.open) cancel();
  };
  importSessions.set(dialog, cancel);
  dialog.querySelector("[data-close-squad]").onclick = () => {
    cancel();
    dialog.close();
  };
  dialog.addEventListener("close", onClose);
  dialog.showModal();
  let result;
  try {
    result = await extractCandidates(file, {
      ...options,
      signal: controller.signal,
      onProgress: (message) => {
        const status = dialog.querySelector("[data-import-progress]");
        if (status) status.textContent = message;
      },
    });
  } catch (error) {
    result = {
      players: [],
      message: `Extraction unavailable: ${error.message}. Manual review is a fallback; no automatic extraction is claimed for this file.`,
    };
  }
  if (canceled) return;
  if (/image\/(jpeg|png|webp)/.test(file.type) && file.size <= 15 * 1024 * 1024)
    objectUrl = URL.createObjectURL(file);
  showReview(dialog, result, existing, onConfirmed, {
    filename: file.name,
    objectUrl,
  });
}
function showReview(
  dialog,
  result,
  existing,
  onConfirmed,
  { filename = "", objectUrl = "" } = {},
) {
  if (result.formationReview) {
    rowBindings.get(dialog)?.();
    rowBindings.delete(dialog);
    return showFormationReview(
      dialog,
      result.formationReview,
      existing,
      onConfirmed,
      { filename, objectUrl },
    );
  }
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="event-dialog-title">Review & confirm</h2>${closeButton}</div><p class="small-note">${esc(filename)}</p><p class="inline-notice">${esc(result.message)}${!result.players.length ? " No usable player rows extracted. Try a clearer/cropped image or paste text; manual entry below is a fallback." : ""}</p>${objectUrl ? `<img class="sheet-preview" src="${objectUrl}" alt="Source team sheet for verification">` : ""}${reviewTable(result.players.length ? result.players : [{ number: "", name: "", position: "", role: "starter", confidence: "Manual fallback — nothing extracted" }])}<p class="warning" data-squad-error hidden></p><div class="dialog-actions"><button type="button" class="button subtle" data-close-squad>Cancel import</button><button type="submit" class="button primary">Confirm & add to squad</button></div><p class="small-note">Verify every row. Blank jerseys are preserved, never generated. Panel = registered, not selected. Duplicate numbered jerseys must be corrected or removed.</p></form>`;
  const read = bindRows(dialog, result.players);
  dialog
    .querySelectorAll("[data-close-squad]")
    .forEach((button) => (button.onclick = () => dialog.close()));
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    try {
      const players = validatePlayers(read(), existing);
      onConfirmed(players);
      dialog.close();
    } catch (error) {
      showError(dialog, error);
    }
  };
}
export function openPasteImport(dialog, existing, onConfirmed) {
  importSessions.get(dialog)?.();
  const options = importOptions();
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="event-dialog-title">Paste team-sheet text</h2>${closeButton}</div><label class="field"><span>Team-sheet text</span><textarea name="sheetText" rows="10" required placeholder="Paste numbered names, copied PDF text, or tab/comma-separated columns. Include Name, Jersey, Position, Starting headers when available."></textarea></label><p class="small-note">Selected layout: ${esc(options.layout)}. Plain registered-panel names keep blank jerseys; only explicit Starting marks can identify starters.</p><p class="warning" data-squad-error hidden></p><div class="dialog-actions"><button class="button primary" type="submit">Extract & review text</button></div></form>`;
  dialog.querySelector("[data-close-squad]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    try {
      const text = new FormData(event.target).get("sheetText");
      const tabular = /[,\t]/.test(text.split(/\r?\n/)[0]);
      const players = tabular
        ? parseTablePlayers(parseDelimited(text), options)
        : parseTextPlayers(text, options);
      showReview(
        dialog,
        {
          players,
          message:
            "Pasted text extracted locally. Review all fields before confirming.",
        },
        existing,
        onConfirmed,
      );
    } catch (error) {
      showError(dialog, error);
    }
  };
  dialog.showModal();
}
