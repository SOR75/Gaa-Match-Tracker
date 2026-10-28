import {
  ourCreditRoster,
  attributionRoster,
  bindOtherCredit,
  emptyCreditRosterMarkup,
  playerCreditPicker,
} from "./player-credit.js";
import { eventType, normalizedLocation } from "./domain.js";
import {
  SHOT_SOURCES,
  MISS_REASONS,
  shotDetails,
  isBlockedShot,
} from "./shots.js";
import { attackingDirection, transformLocation } from "./matchday.js";
import { pitchMarkup } from "./pitch.js";
import { esc } from "./ui.js";

export function shotFieldsMarkup(event, match, { editing = false } = {}) {
  const shot = shotDetails(event);
  if (!shot) return "";
  const roster = ourCreditRoster(match, { includeInactive: editing });
  const { players: defenders, guidance } = roster;
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
  const blockerField = editing
    ? `<label class="field" ${!canBlock ? "hidden" : ""}><span>Who made the block? · optional</span><select name="blockedByNumber" aria-label="Block by"><option value="">No credited player</option>${retained}${defenders.map((p) => `<option value="${p.number}" ${shot.blockedByNumber === String(p.number) ? "selected" : ""}>#${p.number} ${esc(p.name)}</option>`).join("")}</select>${emptyCreditRosterMarkup(guidance)}</label>`
    : "";
  const blockerPicker =
    canBlock && !editing
      ? `<section data-block-credit><p class="capture-instruction">Who made the block? · optional</p>${playerCreditPicker(roster, { groupLabel: "Our blocker", attribute: "data-block-player", actionLabel: "Credit block to", selected: shot.blockedByNumber })}${shot.blockedByNumber ? `<p class="small-note" role="status">Block credited to #${shot.blockedByNumber}</p><button type="button" class="button subtle" data-clear-block>Clear blocker credit</button>` : ""}</section>`
      : "";
  return `<div class="shot-fields"><label class="field"><span>Shot source</span><select name="shotSource" aria-label="Shot source"><option value="" ${!shot.shotSource ? "selected" : ""}>Not recorded</option>${SHOT_SOURCES.map(([id, label]) => `<option value="${id}" ${shot.shotSource === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field" ${shot.shotOutcome !== "miss" ? "hidden" : ""}><span>Miss reason · optional</span><select name="missReason" aria-label="Miss reason"><option value="">Not recorded</option>${reasonOptions}</select></label>${blockerField}</div>${blockerPicker}`;
}

// The event already exists in the log. Every optional detail updates that ID.
export function openShotDetails(dialog, event, match, onUpdate, onClose) {
  let draft = { ...event, ...shotDetails(event) };
  const direction = attackingDirection(match, event.team, event.half);
  const name =
    event.team === "our" ? match.setup.ourTeam : match.setup.opposition;
  const fieldNames = ["shotSource", "missReason", "blockedByNumber"];
  let controlValues = {};
  const rememberControls = () => {
    controlValues = Object.fromEntries(
      fieldNames.flatMap((name) => {
        const node = dialog.querySelector(
          `[data-shot-fields] [name="${name}"]`,
        );
        return node ? [[name, node.value]] : [];
      }),
    );
  };
  const save = (patch) => {
    // Native controls may expose a new selection before change/blur. Read any
    // pending values on EVERY action, including shooter and pitch taps. Compare
    // with the last observed controls to preserve unedited legacy source values.
    const pending = {};
    for (const name of fieldNames) {
      const node = dialog.querySelector(`[data-shot-fields] [name="${name}"]`);
      if (node && node.value !== controlValues[name])
        pending[name] = node.value;
    }
    const next = { ...draft, ...pending, ...patch };
    draft = { ...next, ...shotDetails(next) };
    rememberControls();
    onUpdate(draft);
    refreshView();
  };
  const repaintFields = () => {
    dialog.querySelector("[data-shot-fields]").innerHTML = shotFieldsMarkup(
      draft,
      match,
    );
    rememberControls();
    bindOtherCredit(dialog, (_, number) => {
      save({ blockedByNumber: number });
      repaintFields();
    });
  };
  function refreshView() {
    dialog.querySelector("#event-dialog-title").textContent =
      `${isBlockedShot(draft) ? "Shot · Blocked" : eventType(draft.event).label} · optional details`;
    refreshPitch();
  }
  const { players } = attributionRoster(match, event.team, {
    includePanel: false,
  });
  dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">SHOT ALREADY RECORDED · ${esc(name)}</p><h2 id="event-dialog-title">${esc(isBlockedShot(draft) ? "Shot · Blocked" : eventType(event.event).label)} · optional details</h2></div><button type="button" class="icon-button" data-shot-close aria-label="Close shot details">×</button></div><p class="capture-instruction">${esc(name)} attacks the ${direction.toUpperCase()} goal this half. Tap the shot location or close immediately.</p><div data-shot-fields>${shotFieldsMarkup(draft, match)}</div><div class="shot-detail-layout"><div class="capture-pitch">${pitchMarkup(draft.shotX === null ? [] : [draft], true, { direction, teamName: name })}</div><div><p class="small-note">Player · optional</p><div class="quick-player-grid">${players.map((p) => `<button type="button" class="player-pick ${String(draft.playerNumber) === String(p.number) ? "chosen" : ""}" data-shot-player="${p.number}">${p.number}<span>${esc(p.name)}</span></button>`).join("")}</div><label class="field"><span>Other player number · optional</span><input name="playerNumber" type="number" min="1" max="99" step="1" inputmode="numeric" value="${esc(draft.playerNumber)}"></label><p class="small-note">The shot is saved. All details are optional and save as you change them.</p></div></div><div class="dialog-actions"><button type="button" class="button subtle" data-shot-close>Skip / Close</button><button type="button" class="button primary" data-shot-close>Done</button></div>`;
  dialog
    .querySelectorAll("[data-shot-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
  dialog.addEventListener("close", () => onClose(), { once: true });
  rememberControls();
  bindOtherCredit(dialog, (_, number) => {
    save({ blockedByNumber: number });
    repaintFields();
  });
  const fields = dialog.querySelector("[data-shot-fields]");
  fields.oninput = (e) => {
    if (fieldNames.includes(e.target.name))
      save({ [e.target.name]: e.target.value });
  };
  fields.onchange = (e) => {
    if (!fieldNames.includes(e.target.name)) return;
    const name = e.target.name,
      value = e.target.value;
    save({ [name]: value });
    repaintFields();
    if (name === "missReason" && value === "blocked")
      dialog
        .querySelector("[data-block-credit]")
        ?.scrollIntoView({ block: "nearest" });
  };
  dialog.querySelector("[data-shot-fields]").onclick = (e) => {
    const player = e.target.closest("[data-block-player]");
    if (player) {
      save({ blockedByNumber: player.dataset.blockPlayer });
      repaintFields();
    }
    if (e.target.closest("[data-clear-block]")) {
      save({ blockedByNumber: "" });
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
  function refreshPitch() {
    pitch.innerHTML = pitchMarkup([draft], false, {
      direction,
      teamName: name,
    }).match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
  }
  const choose = (location) => {
    if (!location) return;
    save(transformLocation(location, direction));
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
