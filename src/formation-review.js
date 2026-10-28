import { esc } from "./ui.js";
import { validatePlayers } from "./squads.js";
import {
  createFormationResolution,
  assignFormationPlayer,
  assignedElsewhere,
  correctRosterName,
  formationReady,
  confirmedFormationPlayers,
} from "./formation-resolution.js";
import "./formation-review.css";
export function showFormationReview(
  dialog,
  data,
  existing,
  onConfirmed,
  { filename = "", objectUrl = "" } = {},
) {
  let state = createFormationResolution(data),
    selected = null,
    editing = null,
    error = "";
  const player = (id) => state.roster.find((p) => p.id === id);
  const count = () => state.slots.filter((s) => s.playerId).length;
  const fail = (e) => {
    error = e.message;
    paint();
  };
  function paint() {
    const slot = state.slots.find((s) => s.number === selected);
    const header = `<div class="dialog-heading"><div><p class="eyebrow">ASSISTED FORMATION RESOLUTION · ${count()}/15 assigned</p><h2 id="event-dialog-title">${slot ? `Select player · #${slot.number} ${esc(slot.position)}` : "Formation Review"}</h2></div><button type="button" class="icon-button" data-formation-close aria-label="Cancel formation import">×</button></div>`;
    const pick = (p) => {
      const used = assignedElsewhere(state, p.id, selected);
      return `<div class="formation-player-choice"><button type="button" class="button subtle" data-formation-pick="${p.id}" ${used ? "disabled" : ""} aria-pressed="${slot?.playerId === p.id}"><strong>${esc(p.name)}</strong><small>${used ? `Assigned to #${used.number}` : p.uncertain ? "Review printed name · OCR uncertain" : slot?.playerId === p.id ? "Current selection" : "Printed roster"}</small></button>${!used ? `<button type="button" class="formation-edit-name" data-formation-edit="${p.id}">Edit printed name</button>` : ""}</div>`;
    };
    let body;
    if (slot) {
      const suggested = state.roster.filter((p) =>
        slot.alternatives.includes(p.id),
      );
      body = `<button type="button" class="button subtle" data-formation-back>← Back to formation</button><p class="small-note">Choose from this photograph's printed roster. Assigned players are disabled. Selecting a player saves the choice immediately.</p>${editing ? `<form data-formation-name-form><label class="field"><span>Correct printed full name</span><input name="printedName" aria-label="Correct printed full name" required maxlength="80" value="${esc(player(editing).name)}"></label><button class="button primary" type="submit">Save printed name</button></form>` : ""}${suggested.length ? `<h3>Suggested candidates · review</h3><div class="formation-picker">${suggested.map(pick).join("")}</div>` : ""}<h3>Complete extracted roster</h3><div class="formation-picker">${state.roster
        .filter((p) => !suggested.some((s) => s.id === p.id))
        .map(pick)
        .join(
          "",
        )}</div>${slot.playerId ? '<button type="button" class="button subtle" data-formation-clear>Clear assignment</button>' : ""}`;
    } else {
      body = `<p class="formation-instruction">Tap Select player or Review. Every starter must be assigned before confirming. Marked printed names remain editable.</p><div class="formation-slots">${state.slots
        .map((s) => {
          const p = player(s.playerId),
            ambiguous = s.alternatives.length > 1;
          return `<section class="formation-slot ${p ? "assigned" : "unresolved"}" data-formation-slot="${s.number}"><span class="formation-number">${s.number}</span><div class="formation-slot-main"><strong>${esc(s.position)}</strong>${s.clue ? `<small>OCR clue: ${esc(s.clue)}</small>` : ""}<button type="button" class="formation-assignment" data-formation-open="${s.number}">${p ? esc(p.name) : ambiguous ? "Review · choose player" : "Select player"}</button>${p ? `<small>${s.automatic ? "Automatic · editable" : "Selected by coach"}${p.uncertain ? " · Review printed name" : ""}</small>` : ""}${
            !p && ambiguous
              ? `<div class="formation-suggestions">${state.roster
                  .filter((p) => s.alternatives.includes(p.id))
                  .map(
                    (p) =>
                      `<button type="button" class="button subtle" data-formation-suggest="${p.id}" data-position="${s.number}" ${assignedElsewhere(state, p.id, s.number) ? "disabled" : ""}>${esc(p.name)}</button>`,
                  )
                  .join("")}</div>`
              : ""
          }${!s.anchorConfirmed ? `<label><input type="checkbox" data-formation-anchor="${s.number}"> I verified printed position #${s.number}</label>` : ""}</div></section>`;
        })
        .join(
          "",
        )}</div><details class="formation-substitutes"><summary>Unassigned roster · ${state.roster.filter((p) => !state.slots.some((s) => s.playerId === p.id)).length} available substitutes · jerseys unknown</summary><ul>${state.roster
        .filter((p) => !state.slots.some((s) => s.playerId === p.id))
        .map(
          (p) =>
            `<li>${esc(p.name)}${p.uncertain ? " · Review printed name" : ""}</li>`,
        )
        .join(
          "",
        )}</ul></details>${objectUrl ? `<details><summary>View source photograph · ${esc(filename)}</summary><img class="sheet-preview" src="${esc(objectUrl)}" alt="Original formation team sheet"></details>` : ""}`;
    }
    dialog.innerHTML = `<div class="formation-review">${header}<div class="formation-body">${body}</div><p class="warning" role="alert" ${error ? "" : "hidden"}>${esc(error)}</p>${!slot ? `<div class="formation-review-actions"><button type="button" class="button subtle" data-formation-close>Cancel import</button><span>${count()}/15 assigned · No squad changes until confirmation</span><button type="button" class="button primary" data-formation-confirm ${formationReady(state) ? "" : "disabled"}>CONFIRM TEAM</button></div>` : ""}</div>`;
    dialog
      .querySelectorAll("[data-formation-close]")
      .forEach((b) => (b.onclick = () => dialog.close()));
    dialog.querySelectorAll("[data-formation-open]").forEach(
      (b) =>
        (b.onclick = () => {
          selected = +b.dataset.formationOpen;
          error = "";
          paint();
        }),
    );
    dialog
      .querySelector("[data-formation-back]")
      ?.addEventListener("click", () => {
        selected = null;
        editing = null;
        error = "";
        paint();
      });
    dialog
      .querySelectorAll("[data-formation-pick]")
      .forEach(
        (b) => (b.onclick = () => choose(selected, b.dataset.formationPick)),
      );
    dialog
      .querySelectorAll("[data-formation-suggest]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            choose(+b.dataset.position, b.dataset.formationSuggest)),
      );
    dialog.querySelectorAll("[data-formation-edit]").forEach(
      (b) =>
        (b.onclick = () => {
          editing = b.dataset.formationEdit;
          paint();
          dialog.querySelector("[name=printedName]").focus();
        }),
    );
    dialog
      .querySelector("[data-formation-name-form]")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        try {
          state = correctRosterName(
            state,
            editing,
            new FormData(e.target).get("printedName"),
          );
          editing = null;
          error = "";
          paint();
        } catch (e) {
          fail(e);
        }
      });
    dialog
      .querySelector("[data-formation-clear]")
      ?.addEventListener("click", () => choose(selected, ""));
    dialog.querySelectorAll("[data-formation-anchor]").forEach(
      (b) =>
        (b.onchange = () => {
          state = {
            ...state,
            slots: state.slots.map((s) =>
              s.number === +b.dataset.formationAnchor
                ? { ...s, anchorConfirmed: b.checked }
                : s,
            ),
          };
          paint();
        }),
    );
    dialog
      .querySelector("[data-formation-confirm]")
      ?.addEventListener("click", () => {
        try {
          const players = validatePlayers(
            confirmedFormationPlayers(state),
            existing,
          );
          onConfirmed(players);
          dialog.close();
        } catch (e) {
          fail(e);
        }
      });
  }
  function choose(number, id) {
    try {
      state = assignFormationPlayer(state, number, id);
      selected = null;
      editing = null;
      error = "";
      paint();
    } catch (e) {
      fail(e);
    }
  }
  paint();
}
