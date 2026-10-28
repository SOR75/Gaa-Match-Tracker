import {
  ourCreditRoster,
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
  const roster = ourCreditRoster(match, { includeInactive: true });
  const { players, guidance } = roster;
  const retained =
    data.markPlayerNumber &&
    !players.some((p) => String(p.number) === data.markPlayerNumber)
      ? `<option value="${data.markPlayerNumber}" selected>#${data.markPlayerNumber} · recorded player</option>`
      : "";
  return `<div class="kickout-fields"><label class="field"><span>Kickout result · our perspective</span><select name="kickoutResult" aria-label="Kickout result">${kickoutChoices(
    event.event,
  )
    .map(
      (c) =>
        `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>${c.label}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="field" ${!data.mark || data.outcome !== "won" ? "hidden" : ""}><span>Mark catcher · our player · optional</span><select name="markPlayerNumber" aria-label="Mark catcher"><option value="">No player selected</option>${retained}${players.map((p) => `<option value="${p.number}" ${data.markPlayerNumber === String(p.number) ? "selected" : ""}>#${p.number} ${esc(p.name)}</option>`).join("")}</select>${emptyCreditRosterMarkup(guidance)}</label></div>`;
}
export function kickoutFormFields(data, event) {
  const choice = kickoutChoices(event.event).find(
    (c) => c.id === data.kickoutResult,
  );
  return choice
    ? {
        outcome: choice.outcome,
        mark: choice.mark,
        kickoutPerspective: "our",
        markPlayerNumber:
          choice.mark && choice.outcome === "won"
            ? data.markPlayerNumber || ""
            : "",
      }
    : {};
}
// One result tap records the kickout. An own-team Mark exposes optional credit
// inline on the same dialog; dismissing it never removes the recorded event.
export function openKickoutCapture(dialog, event, match, onSave, onClose) {
  let draft = { ...event },
    recorded = false,
    finished = false;
  const roster = ourCreditRoster(match);
  const { players, guidance } = roster;
  dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">KICKOUT · H${event.half} · ${formatTime(event.timeMs)}</p><h2 id="event-dialog-title">${esc(eventType(event.event).label)}</h2></div><button type="button" class="icon-button" data-kickout-close aria-label="Close kickout">×</button></div><p class="capture-instruction">Who secured possession?</p><p class="small-note">WON means our team secured possession. LOST means opposition secured possession.</p><div class="quick-length" role="group" aria-label="Optional kickout length"><span>Length · optional</span><button type="button" class="button subtle" data-ko-length="Short" aria-pressed="false">SHORT</button><button type="button" class="button subtle" data-ko-length="Long" aria-pressed="false">LONG</button></div><div class="kickout-outcomes">${kickoutChoices(
    event.event,
  )
    .map(
      (c) =>
        `<button type="button" class="button ${c.outcome === "won" ? "primary" : "subtle"}" data-ko-result="${c.id}">${c.label}</button>`,
    )
    .join(
      "",
    )}</div><p data-ko-saved role="status" hidden>Mark recorded. Player credit is optional; close to continue.</p><div data-ko-credit hidden><p class="small-note">Who caught our Mark? · optional</p>${playerCreditPicker(roster, { groupLabel: "Our Mark winner", attribute: "data-mark-player", actionLabel: "Credit Mark to" })}<button type="button" class="button subtle full-width" data-kickout-close>Skip player / Close</button></div><details class="optional-note"><summary>● Add typed / dictated note <span>Optional</span></summary>${noteMarkup(draft)}</details>`;
  const collectNotes = () => {
    for (const key of ["notes", "dictatedNote"])
      draft[key] = dialog.querySelector(`[name="${key}"]`)?.value || "";
  };
  const save = () => {
    collectNotes();
    onSave({ ...draft });
  };
  dialog
    .querySelectorAll("[data-kickout-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
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
          markPlayerNumber: "",
          kickoutPerspective: "our",
        });
        recorded = true;
        save();
        if (c.mark && c.outcome === "won") {
          dialog
            .querySelectorAll("[data-ko-result],[data-ko-length]")
            .forEach((n) => (n.disabled = true));
          dialog.querySelector("[data-ko-saved]").hidden = false;
          const credit = dialog.querySelector("[data-ko-credit]");
          credit.hidden = false;
          credit.scrollIntoView({ block: "nearest" });
        } else dialog.close();
      }),
  );
  bindOtherCredit(dialog, (_, number) => {
    if (finished || !recorded) return;
    finished = true;
    draft.markPlayerNumber = number;
    save();
    dialog.close();
  });
  dialog.querySelectorAll("[data-mark-player]").forEach(
    (b) =>
      (b.onclick = () => {
        if (finished || !recorded) return;
        finished = true;
        draft.markPlayerNumber = b.dataset.markPlayer;
        save();
        dialog.close();
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
