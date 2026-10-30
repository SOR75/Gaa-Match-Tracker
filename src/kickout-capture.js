import {
  attributionRoster,
  bindOtherCredit,
  emptyCreditRosterMarkup,
  playerCreditPicker,
} from "./player-credit.js";
import { kickoutChoices, kickoutDetails } from "./kickouts.js";
import { eventType, formatTime } from "./domain.js";
import { esc } from "./ui.js";
import { noteMarkup, bindSpeech } from "./speech.js";
export function kickoutFieldsMarkup(event, match) {
  const data = kickoutDetails(event);
  if (!data) return "";
  const selected =
    kickoutChoices(event.event).find(
      (c) => c.outcome === data.outcome && c.mark === data.mark,
    )?.id || "unknown";
  const team = data.outcome === "won" ? "our" : "opposition";
  const ownMark = data.mark && team === "our";
  const number =
    data.kickoutWinnerNumber || (ownMark ? data.markPlayerNumber : "");
  const roster = attributionRoster(match, team, { includeInactive: true });
  const retained =
    number && !roster.players.some((p) => String(p.number) === number)
      ? `<option selected value="${esc(number)}">#${esc(number)} · recorded player</option>`
      : "";
  return `<div class="kickout-fields"><label class="field"><span>Kickout result · our perspective</span><select name="kickoutResult" aria-label="Kickout result">${data.outcome === "unknown" ? '<option value="unknown" selected>Unknown · legacy / unrecorded</option>' : ""}${kickoutChoices(
    event.event,
  )
    .map(
      (c) =>
        `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>${c.label}</option>`,
    )
    .join(
      "",
    )}</select></label>${["won", "lost"].includes(data.outcome) ? `<input type="hidden" name="kickoutWinnerTeam" value="${team}"><label class="field"><span>${ownMark ? "Mark catcher" : "Possession winner"} · ${team === "our" ? esc(match.setup.ourTeam || "Our team") : esc(match.setup.opposition || "Opposition")} · optional</span><select name="${ownMark ? "markPlayerNumber" : "kickoutWinnerNumber"}" aria-label="${ownMark ? "Mark catcher" : "Kickout winner"}"><option value="">No player selected</option>${retained}${roster.players.map((p) => `<option value="${p.number}" ${number === String(p.number) ? "selected" : ""}>#${p.number} ${esc(p.name)}</option>`).join("")}</select>${emptyCreditRosterMarkup(roster.guidance)}</label>` : ""}</div>`;
}
export function kickoutFormFields(data, event) {
  const choice = kickoutChoices(event.event).find(
    (c) => c.id === data.kickoutResult,
  );
  if (!choice) return {};
  const number =
    ["won", "lost"].includes(choice.outcome) &&
    (!data.kickoutWinnerTeam ||
      data.kickoutWinnerTeam ===
        (choice.outcome === "won" ? "our" : "opposition"))
      ? (choice.mark && choice.outcome === "won"
          ? (data.markPlayerNumber ?? data.kickoutWinnerNumber)
          : (data.kickoutWinnerNumber ?? data.markPlayerNumber)) || ""
      : "";
  return {
    outcome: choice.outcome,
    mark: choice.mark,
    kickoutPerspective: "our",
    kickoutWinnerNumber: number,
    markPlayerNumber: choice.mark && choice.outcome === "won" ? number : "",
  };
}
// Outcome saves once. All successful possession outcomes immediately open the
// proven one-tap grid, updating that same event ID. Close never deletes the event.
export function openKickoutCapture(dialog, event, match, onSave, onClose) {
  let draft = { ...event },
    recorded = false,
    finished = false;
  dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">KICKOUT · H${event.half} · ${formatTime(event.timeMs)}</p><h2 id="event-dialog-title">${esc(eventType(event.event).label)}</h2></div><button type="button" class="icon-button" data-kickout-close aria-label="Close kickout">×</button></div><p class="capture-instruction">Who secured possession?</p><p class="small-note">WON means our team secured possession. LOST means opposition secured possession.</p><div class="quick-length" role="group" aria-label="Optional kickout length"><span>Length · optional</span>${["Short", "Long"].map((l) => `<button type="button" class="button subtle" data-ko-length="${l}" aria-pressed="false">${l.toUpperCase()}</button>`).join("")}</div><div class="kickout-outcomes">${kickoutChoices(
    event.event,
  )
    .map(
      (c) =>
        `<button type="button" class="button ${c.outcome === "won" ? "primary" : "subtle"}" data-ko-result="${c.id}">${c.label}</button>`,
    )
    .join(
      "",
    )}</div><p data-ko-saved role="status" hidden></p><div data-ko-credit hidden></div><details class="optional-note"><summary>● Add typed / dictated note <span>Optional</span></summary>${noteMarkup(draft)}</details>`;
  const save = () => {
    for (const key of ["notes", "dictatedNote"])
      draft[key] = dialog.querySelector(`[name="${key}"]`)?.value || "";
    onSave({ ...draft });
  };
  dialog.querySelector("[data-kickout-close]").onclick = () => dialog.close();
  dialog.querySelectorAll("[data-ko-length]").forEach(
    (b) =>
      (b.onclick = () => {
        draft.kickoutLength =
          draft.kickoutLength === b.dataset.koLength ? "" : b.dataset.koLength;
        dialog
          .querySelectorAll("[data-ko-length]")
          .forEach((n) =>
            n.setAttribute(
              "aria-pressed",
              String(n.dataset.koLength === draft.kickoutLength),
            ),
          );
      }),
  );
  const credit = (number) => {
    if (finished || !recorded) return;
    finished = true;
    draft.kickoutWinnerNumber = number;
    draft.markPlayerNumber =
      draft.mark && draft.outcome === "won" ? number : "";
    save();
    dialog.close();
  };
  dialog.querySelectorAll("[data-ko-result]").forEach(
    (b) =>
      (b.onclick = () => {
        if (recorded || finished) return;
        const c = kickoutChoices(draft.event).find(
          (c) => c.id === b.dataset.koResult,
        );
        Object.assign(draft, {
          outcome: c.outcome,
          mark: c.mark,
          kickoutWinnerNumber: "",
          markPlayerNumber: "",
          kickoutPerspective: "our",
        });
        recorded = true;
        save();
        if (c.outcome === "out-of-play") {
          finished = true;
          dialog.close();
          return;
        }
        const team = c.outcome === "won" ? "our" : "opposition",
          ownMark = c.mark && team === "our";
        dialog
          .querySelectorAll("[data-ko-result],[data-ko-length]")
          .forEach((n) => (n.disabled = true));
        const status = dialog.querySelector("[data-ko-saved]");
        status.hidden = false;
        status.textContent = `${c.mark ? "Mark" : "Kickout"} recorded. Tap the player who won possession.`;
        const area = dialog.querySelector("[data-ko-credit]");
        area.hidden = false;
        area.innerHTML = `<p class="capture-instruction">${ownMark ? "Who caught our Mark?" : "Who won possession?"} · ${esc(team === "our" ? match.setup.ourTeam || "Our team" : match.setup.opposition || "Opposition")}</p>${playerCreditPicker(attributionRoster(match, team), { groupLabel: ownMark ? "Our Mark winner" : "Kickout possession winner", attribute: "data-ko-player", actionLabel: ownMark ? "Credit Mark to" : "Credit possession to" })}`;
        area.querySelectorAll("[data-ko-player]").forEach((n) => {
          if (ownMark) n.dataset.markPlayer = n.dataset.koPlayer;
          n.onclick = () => credit(n.dataset.koPlayer);
        });
        bindOtherCredit(area, (_, number) => credit(number));
        area.scrollIntoView({ block: "nearest" });
      }),
  );
  dialog.querySelectorAll('[name="notes"],[name="dictatedNote"]').forEach(
    (n) =>
      (n.oninput = () => {
        if (recorded) save();
      }),
  );
  const stop = bindSpeech(dialog, {
    onTranscript: (fields) => {
      Object.assign(draft, fields);
      if (recorded) onSave({ ...draft });
    },
  });
  dialog.addEventListener(
    "close",
    () => {
      stop();
      onClose();
    },
    { once: true },
  );
  dialog.showModal();
  dialog.querySelector("[data-kickout-close]").focus();
}
