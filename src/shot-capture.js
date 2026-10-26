import { eventType, normalizedLocation, playersFor } from "./domain.js";
import { SHOT_SOURCES, MISS_REASONS, shotDetails } from "./shots.js";
import {
  attackingDirection,
  transformLocation,
  onFieldNumbers,
} from "./matchday.js";
import { pitchMarkup } from "./pitch.js";
import { esc } from "./ui.js";

export function shotFieldsMarkup(event, match, { editing = false } = {}) {
  const shot = shotDetails(event);
  if (!shot) return "";
  const active = onFieldNumbers(match, "our");
  const defenders = match.players.filter(
    (p) => Number.isInteger(p.number) && active.has(String(p.number)),
  );
  const reasonOptions = MISS_REASONS.map(
    (id) =>
      `<option value="${id}" ${shot.missReason === id ? "selected" : ""}>${id[0].toUpperCase() + id.slice(1)}</option>`,
  ).join("");
  const canBlock =
    event.team === "opposition" &&
    shot.shotOutcome === "miss" &&
    shot.missReason === "blocked";
  // Existing historical credit stays visible in editing even after a substitution.
  const retained =
    editing &&
    shot.blockedByNumber &&
    !defenders.some((p) => String(p.number) === shot.blockedByNumber)
      ? `<option selected value="${esc(shot.blockedByNumber)}">#${esc(shot.blockedByNumber)} · recorded credit</option>`
      : "";
  return `<div class="shot-fields"><label class="field"><span>Shot source</span><select name="shotSource" aria-label="Shot source"><option value="" ${!shot.shotSource ? "selected" : ""}>Not recorded</option>${SHOT_SOURCES.map(([id, label]) => `<option value="${id}" ${shot.shotSource === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field" ${shot.shotOutcome !== "miss" ? "hidden" : ""}><span>Miss reason · optional</span><select name="missReason" aria-label="Miss reason"><option value="">Not recorded</option>${reasonOptions}</select></label><label class="field" ${!canBlock ? "hidden" : ""}><span>Block by · our on-field player · optional</span><select name="blockedByNumber" aria-label="Block by"><option value="">No credited player</option>${retained}${defenders.map((p) => `<option value="${p.number}" ${shot.blockedByNumber === String(p.number) ? "selected" : ""}>#${p.number} ${esc(p.name)}</option>`).join("")}</select></label></div>`;
}

// The event already exists in the log. Every optional detail updates that ID.
export function openShotDetails(dialog, event, match, onUpdate, onClose) {
  let draft = { ...event, ...shotDetails(event) };
  const direction = attackingDirection(match, event.team, event.half);
  const name =
    event.team === "our" ? match.setup.ourTeam : match.setup.opposition;
  const save = (patch) => {
    draft = { ...draft, ...patch };
    onUpdate(draft);
  };
  const repaintFields = () => {
    const fields = dialog.querySelector("[data-shot-fields]");
    fields.innerHTML = shotFieldsMarkup(draft, match);
  };
  const players = playersFor(match, event.team)
    .filter((p) => Number.isInteger(p.number) && p.role !== "panel")
    .sort((a, b) => a.number - b.number);
  dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">SHOT ALREADY RECORDED · ${esc(name)}</p><h2 id="event-dialog-title">${esc(eventType(event.event).label)} · optional details</h2></div><button type="button" class="icon-button" data-shot-close aria-label="Close shot details">×</button></div><p class="capture-instruction">${esc(name)} attacks the ${direction.toUpperCase()} goal this half. Tap the shot location or close immediately.</p><div data-shot-fields>${shotFieldsMarkup(draft, match)}</div><div class="shot-detail-layout"><div class="capture-pitch">${pitchMarkup(draft.shotX === null ? [] : [draft], true, { direction, teamName: name })}</div><div><p class="small-note">Player · optional</p><div class="quick-player-grid">${players.map((p) => `<button type="button" class="player-pick ${String(draft.playerNumber) === String(p.number) ? "chosen" : ""}" data-shot-player="${p.number}">${p.number}<span>${esc(p.name)}</span></button>`).join("")}</div><label class="field"><span>Other player number · optional</span><input name="playerNumber" type="number" min="1" max="99" step="1" inputmode="numeric" value="${esc(draft.playerNumber)}"></label><p class="small-note">The shot is saved. All details are optional and save as you change them.</p></div></div><div class="dialog-actions"><button type="button" class="button subtle" data-shot-close>Skip / Close</button><button type="button" class="button primary" data-shot-close>Done</button></div>`;
  dialog
    .querySelectorAll("[data-shot-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
  dialog.addEventListener("close", () => onClose(), { once: true });
  dialog.querySelector("[data-shot-fields]").onchange = (e) => {
    if (
      ["shotSource", "missReason", "blockedByNumber"].includes(e.target.name)
    ) {
      const patch = { [e.target.name]: e.target.value };
      if (e.target.name === "missReason" && e.target.value !== "blocked")
        patch.blockedByNumber = "";
      save(patch);
      repaintFields();
    }
  };
  const other = dialog.querySelector("[name=playerNumber]");
  other.oninput = () => {
    if (other.validity.valid) save({ playerNumber: other.value });
  };
  dialog.querySelectorAll("[data-shot-player]").forEach(
    (b) =>
      (b.onclick = () => {
        save({ playerNumber: b.dataset.shotPlayer });
        other.value = draft.playerNumber;
        dialog
          .querySelectorAll("[data-shot-player]")
          .forEach((p) => p.classList.toggle("chosen", p === b));
      }),
  );
  const pitch = dialog.querySelector(".gaelic-pitch");
  const choose = (location) => {
    if (!location) return;
    save(transformLocation(location, direction));
    pitch.innerHTML = pitchMarkup([draft], false, {
      direction,
      teamName: name,
    }).match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
  };
  pitch.onclick = (e) =>
    choose(
      normalizedLocation(e.clientX, e.clientY, pitch.getBoundingClientRect()),
    );
  let x = 0.5,
    y = 0.5;
  pitch.onkeydown = (e) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Enter",
        " ",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    if (e.key === "Enter" || e.key === " ") {
      choose({ shotX: x, shotY: y });
      return;
    }
    x = Math.max(
      0,
      Math.min(
        1,
        x + (e.key === "ArrowLeft" ? -0.05 : e.key === "ArrowRight" ? 0.05 : 0),
      ),
    );
    y = Math.max(
      0,
      Math.min(
        1,
        y + (e.key === "ArrowUp" ? -0.05 : e.key === "ArrowDown" ? 0.05 : 0),
      ),
    );
  };
  dialog.showModal();
  dialog.querySelector("[data-shot-close]").focus();
}
