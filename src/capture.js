import { attackingDirection, transformLocation } from "./matchday.js";
import {
  eventType,
  isShot,
  isKickout,
  playersFor,
  normalizedLocation,
} from "./domain.js";
import { pitchMarkup } from "./pitch.js";
import { noteMarkup, bindSpeech } from "./speech.js";
import { esc } from "./ui.js";

// The draft is created by the original live tap. None of these steps retime it.
export function openQuickCapture(dialog, draft, match, onSaved, onNoteSaved) {
  const direction = attackingDirection(match, draft.team, draft.half);
  const name =
    draft.team === "our" ? match.setup.ourTeam : match.setup.opposition;
  let finished = false;
  let step = isShot(draft) ? "location" : "kickout";
  let stopSpeech = () => {};
  const getNotes = () => {
    for (const key of ["notes", "dictatedNote"]) {
      const node = dialog.querySelector(`[name="${key}"]`);
      if (node) draft[key] = node.value;
    }
  };
  const save = (number) => {
    if (finished) return;
    finished = true;
    getNotes();
    stopSpeech();
    draft.playerNumber = number;
    dialog.close();
    onSaved(draft);
  };
  function paint() {
    stopSpeech();
    const players = playersFor(match, draft.team).filter(
      (player) => Number.isInteger(player.number) && player.role !== "panel",
    );
    const header = `<div class="dialog-heading"><div><p class="eyebrow">QUICK CAPTURE · H${draft.half} · ${Math.floor(draft.timeMs / 60000)}:${String(Math.floor(draft.timeMs / 1000) % 60).padStart(2, "0")}</p><h2 id="event-dialog-title">${esc(eventType(draft.event).label)}</h2></div><button type="button" class="icon-button" data-cancel-capture aria-label="Cancel event">×</button></div>`;
    dialog.innerHTML =
      header +
      (step === "location"
        ? `<p class="capture-instruction">Tap where the shot was taken.</p><p class="small-note">${esc(name)} attacks the ${direction.toUpperCase()} goal this half. Stored coordinates stay attack-normalized.</p><div class="capture-pitch">${pitchMarkup([], true, { direction, teamName: name })}</div><p class="small-note">Keyboard: arrow keys position the shot; Enter selects.</p><button class="button subtle full-width" data-skip-location>Skip location → Choose player</button>`
        : step === "kickout"
          ? `<p class="capture-instruction">Did the kicking team retain the ball?</p><p class="small-note">${esc(draft.team === "our" ? match.setup.ourTeam : match.setup.opposition)} kickout · outcome is from their perspective.</p><div class="quick-length" role="group" aria-label="Optional kickout length"><span>Length · optional</span><button class="button subtle" data-length="Short" aria-pressed="false">SHORT</button><button class="button subtle" data-length="Long" aria-pressed="false">LONG</button></div><div class="quick-outcomes"><button class="button primary" data-outcome="won">WON</button><button class="button lost-button" data-outcome="lost">LOST</button></div>`
          : `<p class="capture-instruction">Who took the shot?</p><div class="quick-player-grid">${players
              .slice()
              .sort((a, b) => a.number - b.number)
              .map(
                (player) =>
                  `<button type="button" class="player-pick" data-quick-player="${player.number}">${player.number}<span>${esc(player.name)}</span></button>`,
              )
              .join(
                "",
              )}</div><form id="quick-number-form" class="quick-number"><label class="field"><span>Other player number · optional</span><input name="playerNumber" type="number" min="1" max="99" inputmode="numeric" placeholder="1–99"></label><button type="submit" class="button primary">Save player</button></form><button class="button subtle full-width" data-quick-save>Skip player & save event</button>`) +
      (step !== "location"
        ? `<details class="optional-note"><summary>● Add typed / dictated note <span>Optional</span></summary>${noteMarkup(draft)}</details>`
        : "");
    dialog.querySelector("[data-cancel-capture]").onclick = () =>
      dialog.close();
    if (step === "location") {
      const pitch = dialog.querySelector(".gaelic-pitch");
      const choose = (location) => {
        Object.assign(draft, transformLocation(location, direction));
        step = "player";
        paint();
      };
      pitch.onclick = (event) =>
        choose(
          normalizedLocation(
            event.clientX,
            event.clientY,
            pitch.getBoundingClientRect(),
          ),
        );
      let x = 0.5,
        y = 0.5;
      pitch.onkeydown = (event) => {
        if (
          ![
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Enter",
            " ",
          ].includes(event.key)
        )
          return;
        event.preventDefault();
        if (event.key === "Enter" || event.key === " ") {
          choose({ shotX: x, shotY: y });
          return;
        }
        x = Math.max(
          0,
          Math.min(
            1,
            x +
              (event.key === "ArrowLeft"
                ? -0.05
                : event.key === "ArrowRight"
                  ? 0.05
                  : 0),
          ),
        );
        y = Math.max(
          0,
          Math.min(
            1,
            y +
              (event.key === "ArrowUp"
                ? -0.05
                : event.key === "ArrowDown"
                  ? 0.05
                  : 0),
          ),
        );
        pitch.innerHTML = pitchMarkup(
          [
            {
              id: "cursor",
              event: draft.event,
              ...transformLocation({ shotX: x, shotY: y }, direction),
              half: draft.half,
            },
          ],
          false,
          { direction, teamName: name },
        ).match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
      };
      dialog.querySelector("[data-skip-location]").onclick = () => {
        step = "player";
        paint();
      };
    }
    dialog.querySelectorAll("[data-length]").forEach(
      (button) =>
        (button.onclick = () => {
          draft.kickoutLength =
            draft.kickoutLength === button.dataset.length
              ? ""
              : button.dataset.length;
          dialog
            .querySelectorAll("[data-length]")
            .forEach((node) =>
              node.setAttribute(
                "aria-pressed",
                String(node.dataset.length === draft.kickoutLength),
              ),
            );
        }),
    );
    dialog.querySelectorAll("[data-outcome]").forEach(
      (button) =>
        (button.onclick = () => {
          draft.outcome = button.dataset.outcome;
          save("");
        }),
    );
    dialog
      .querySelectorAll("[data-quick-player]")
      .forEach(
        (button) => (button.onclick = () => save(button.dataset.quickPlayer)),
      );
    dialog
      .querySelector("[data-quick-save]")
      ?.addEventListener("click", () => save(""));
    dialog
      .querySelector("#quick-number-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        save(new FormData(event.target).get("playerNumber"));
      });
    stopSpeech = bindSpeech(dialog, {
      onTranscript: (fields) => {
        Object.assign(draft, fields);
        onNoteSaved?.(draft);
      },
    });
  }
  paint();
  dialog.addEventListener("close", () => stopSpeech(), { once: true });
  dialog.showModal();
  dialog.querySelector("[data-cancel-capture]").focus();
}
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
