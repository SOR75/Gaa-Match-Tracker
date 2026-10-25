// Speech capture is deliberately separate from any future commentary interpretation.
// Only transcription is stored. No event type, score or player is inferred from speech.
import { esc, micIcon } from "./ui.js";
export function noteMarkup(event = {}) {
  return `<div class="note-capture"><label class="field"><span>Typed notes</span><textarea name="notes" rows="2" maxlength="4000" placeholder="Type or use keyboard dictation">${esc(event.notes)}</textarea></label><label class="field"><span>Dictated note</span><textarea name="dictatedNote" rows="2" maxlength="8000" placeholder="Your transcription appears here; you can correct it">${esc(event.dictatedNote)}</textarea></label><button class="button microphone" type="button" data-microphone aria-label="Dictate note">${micIcon} Dictate note</button><p class="speech-status" role="status" data-speech-status></p><p class="small-note">Browser dictation may need internet and may use your device/browser provider’s speech service. No AI interpretation. Typed notes and keyboard dictation always remain available.</p></div>`;
}
export function bindSpeech(root) {
  const button = root.querySelector("[data-microphone]");
  if (!button) return () => {};
  const status = root.querySelector("[data-speech-status]");
  const textarea = root.querySelector('[name="dictatedNote"]');
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null,
    active = false,
    destroyed = false;
  const saveButtons = () =>
    root.querySelectorAll(
      '[type="submit"], [data-quick-player], [data-quick-save], [data-outcome]',
    );
  function setActive(value) {
    active = value;
    button.innerHTML = value ? "■ Stop dictation" : `${micIcon} Dictate note`;
    button.setAttribute(
      "aria-label",
      value ? "Stop dictation" : "Dictate note",
    );
    saveButtons().forEach((node) => (node.disabled = value));
  }
  if (!Recognition) {
    button.disabled = true;
    status.textContent =
      "Browser speech recognition is unavailable here. Type your note or use the keyboard microphone.";
  } else {
    button.addEventListener("click", () => {
      if (active) {
        recognition.stop();
        status.textContent = "Finishing transcription…";
        return;
      }
      recognition = new Recognition();
      recognition.lang = navigator.language || "en-IE";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onstart = () => {
        if (!destroyed) {
          setActive(true);
          status.textContent = "Listening… tap Stop when finished.";
        }
      };
      recognition.onresult = (event) => {
        if (destroyed) return;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal)
            textarea.value = [
              textarea.value.trim(),
              result[0].transcript.trim(),
            ]
              .filter(Boolean)
              .join(" ")
              .slice(0, 8000);
          else interim += result[0].transcript;
        }
        status.textContent =
          interim || "Transcription captured. Finish or continue speaking.";
      };
      recognition.onerror = (event) => {
        if (!destroyed) {
          setActive(false);
          status.textContent = `Dictation unavailable (${event.error}). Existing notes are kept; type or use keyboard dictation.`;
        }
      };
      recognition.onend = () => {
        if (!destroyed) {
          setActive(false);
          if (!status.textContent.startsWith("Dictation unavailable"))
            status.textContent =
              "Dictation stopped. Review the transcription before saving.";
        }
      };
      try {
        setActive(true);
        recognition.start();
      } catch {
        setActive(false);
        status.textContent =
          "Could not start dictation. Type or use keyboard dictation.";
      }
    });
  }
  return () => {
    destroyed = true;
    try {
      recognition?.abort();
    } catch {
      /* A stopped recognizer has no remaining session. */
    }
  };
}
