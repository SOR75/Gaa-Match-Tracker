import { eventType } from "./domain.js";
import { noteMarkup, bindSpeech } from "./speech.js";
import { esc } from "./ui.js";

export function openNoteCapture(dialog, event, onSaved, onNoteSaved) {
  dialog.innerHTML = `<form id="live-note-form"><div class="dialog-heading"><h2 id="event-dialog-title">Note · ${esc(eventType(event.event).label)}</h2><button type="button" class="icon-button" data-cancel-note aria-label="Cancel note">×</button></div>${noteMarkup(event)}<div class="dialog-actions"><button type="submit" class="button primary">Save note</button></div></form>`;
  const stop = bindSpeech(dialog, {
    onTranscript: (fields) => onNoteSaved?.({ ...event, ...fields }),
  });
  dialog.querySelector("[data-cancel-note]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (submit) => {
    submit.preventDefault();
    const data = Object.fromEntries(new FormData(submit.target));
    stop();
    dialog.close();
    onSaved({ ...event, ...data });
  };
  dialog.addEventListener("close", stop, { once: true });
  dialog.showModal();
}
