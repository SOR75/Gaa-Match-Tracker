import { interpretCommentary } from "./voice-parser.js";
import { createEvent, eventType, EVENT_TYPES } from "./domain.js";
import { validSubstitution } from "./matchday.js";
import { esc, micIcon } from "./ui.js";

export function createVoiceMatch({ getMatch, getTeam, onSave }) {
  let captureSnapshot = null;
  let pending = null,
    transcript = "",
    message = "",
    recognition = null,
    active = false,
    root = null,
    session = 0;
  function stop() {
    session++;
    active = false;
    try {
      recognition?.abort();
    } catch {}
    recognition = null;
  }
  function paint() {
    if (!root?.isConnected) return;
    const supported = Boolean(
      window.SpeechRecognition || window.webkitSpeechRecognition,
    );
    root.innerHTML = `<div class="voice-heading"><div><h2>Voice Match Mode</h2><p>One phrase → review → confirm. Tap Mode stays available.</p></div><button class="button microphone" data-vm-listen ${supported ? "" : "disabled"}>${micIcon}${active ? "Stop listening" : "Start voice capture"}</button></div><p class="small-note" role="status">${esc(message || (!supported ? "Speech recognition unavailable. Use Tap Mode, or type commentary below." : "Selected team is the default when you do not name one. Browser speech may need internet."))}</p><details ${pending || transcript ? "open" : ""}><summary>${pending ? "Review interpreted event" : "Type / review commentary"}</summary><form data-vm-form><label class="field"><span>Commentary</span><textarea name="commentary" aria-label="Commentary" rows="2" maxlength="2000">${esc(transcript)}</textarea></label><button type="button" class="button subtle" data-vm-interpret>Interpret text</button>${pending ? `<div class="voice-preview" role="status"><strong>${esc(eventType(pending.event).label)} · ${esc(pending.team === "our" ? getMatch().setup.ourTeam : getMatch().setup.opposition)}</strong><span>${pending.event === "substitution" ? `ON #${esc(pending.playerOn)} / OFF #${esc(pending.playerOff)}` : pending.playerNumber ? `Player #${esc(pending.playerNumber)}` : "Player not recorded"} · ${esc(pending.outcome)} ${esc(pending.kickoutLength || "")}</span><span>H${pending.half} · ${Math.floor(pending.timeMs / 60000)}:${String(Math.floor(pending.timeMs / 1000) % 60).padStart(2, "0")} · score unchanged until confirmed</span></div><div class="form-grid"><label class="field"><span>Voice event</span><select name="event" aria-label="Voice event">${EVENT_TYPES.map((type) => `<option value="${type.id}" ${type.id === pending.event ? "selected" : ""}>${esc(type.label)}</option>`).join("")}</select></label><label class="field"><span>Voice team</span><select name="team" aria-label="Voice team"><option value="our" ${pending.team === "our" ? "selected" : ""}>${esc(getMatch().setup.ourTeam)}</option><option value="opposition" ${pending.team === "opposition" ? "selected" : ""}>${esc(getMatch().setup.opposition)}</option></select></label><label class="field"><span>Voice player</span><input name="playerNumber" type="number" min="1" max="99" inputmode="numeric" value="${esc(pending.playerNumber)}"></label><label class="field"><span>Voice outcome</span><select name="outcome" aria-label="Voice outcome" ${eventType(pending.event).outcome ? "disabled" : ""}>${["scored", "missed", "won", "lost", "completed", ""].map((outcome) => `<option value="${outcome}" ${outcome === pending.outcome ? "selected" : ""}>${outcome || "Not recorded"}</option>`).join("")}</select></label><label class="field"><span>Voice player on</span><input name="playerOn" type="number" min="1" max="99" inputmode="numeric" value="${esc(pending.playerOn || "")}"></label><label class="field"><span>Voice player off</span><input name="playerOff" type="number" min="1" max="99" inputmode="numeric" value="${esc(pending.playerOff || "")}"></label></div><button type="submit" class="button primary" data-vm-confirm>Confirm & record event</button>` : ""}<button type="button" class="button subtle" data-vm-discard>Discard voice proposal</button></form></details>`;
    root.querySelector("[data-vm-listen]").onclick = () => {
      if (active) {
        stop();
        message = "Listening stopped. Review any recognised phrase below.";
        paint();
        return;
      }
      if (
        !getMatch().setup.ourTeam.trim() ||
        !getMatch().setup.opposition.trim()
      ) {
        message = "Enter both team names first. Tap Mode remains available.";
        paint();
        return;
      }
      stop();
      pending = null;
      transcript = "";
      const token = session;
      const match = getMatch(),
        team = getTeam();
      const snapshot = { match: structuredClone(match), team, now: Date.now() };
      captureSnapshot = snapshot;
      let used = false;
      const Recognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new Recognition();
      recognition.lang = "en-IE";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        if (token !== session || used) return;
        let final = "",
          interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal)
            final += event.results[i][0].transcript + " ";
          else interim += event.results[i][0].transcript;
        }
        if (final.trim()) {
          used = true;
          transcript = final.trim();
          interpret(snapshot);
          const confidence = event.results[event.resultIndex]?.[0]?.confidence;
          if (
            Number.isFinite(confidence) &&
            confidence > 0 &&
            confidence < 0.6
          ) {
            pending = null;
            message =
              "Low recognition confidence. Review/correct the transcript and Interpret text, or use Tap Mode.";
          }
          stop();
          paint();
        } else {
          message = `Listening: ${interim}`;
          const status = root?.querySelector('[role="status"]');
          if (status) status.textContent = message;
        }
      };
      recognition.onerror = (event) => {
        if (token !== session) return;
        message = `Voice capture failed (${event.error}). Tap Mode is unaffected.`;
        stop();
        paint();
      };
      recognition.onend = () => {
        if (token !== session) return;
        active = false;
        if (!used)
          message = "Listening ended. Tap to start again, or use Tap Mode.";
        paint();
      };
      try {
        active = true;
        message = "Listening for one event…";
        recognition.start();
        paint();
      } catch {
        stop();
        message = "Voice could not start. Use Tap Mode.";
        paint();
      }
    };
    root.querySelector("[data-vm-interpret]").onclick = () => {
      stop();
      transcript = root.querySelector('[name="commentary"]').value;
      captureSnapshot ||= {
        match: structuredClone(getMatch()),
        team: getTeam(),
        now: Date.now(),
      };
      interpret(captureSnapshot);
      paint();
    };
    root.querySelector("[data-vm-discard]").onclick = () => {
      stop();
      pending = null;
      captureSnapshot = null;
      transcript = "";
      message = "Voice proposal discarded. No event saved.";
      paint();
    };
    const eventSelect = root.querySelector('[name="event"]'),
      teamSelect = root.querySelector('[name="team"]');
    if (eventSelect)
      eventSelect.onchange = () => {
        const type = eventType(eventSelect.value);
        if (type.team) teamSelect.value = type.team;
        const outcome = root.querySelector('[name="outcome"]');
        outcome.disabled = Boolean(type.outcome);
        if (type.outcome) outcome.value = type.outcome;
      };
    if (teamSelect)
      teamSelect.onchange = () => {
        if (eventSelect.value.includes("kickout"))
          eventSelect.value =
            teamSelect.value === "our" ? "our-kickout" : "opposition-kickout";
      };
    root.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      if (!pending) return;
      const data = Object.fromEntries(new FormData(event.target));
      const type = eventType(data.event);
      if (
        data.event === "substitution" &&
        !validSubstitution(data.playerOn, data.playerOff)
      ) {
        message = "Choose different substitution numbers, 1–99.";
        paint();
        return;
      }
      const proposed = {
        ...pending,
        ...data,
        dictatedNote: transcript,
        team: type.team || data.team,
        outcome: type.outcome || data.outcome,
      };
      delete proposed.commentary;
      if (
        type.id.includes("kickout") &&
        !["won", "lost"].includes(proposed.outcome)
      ) {
        message = "Choose won or lost for the kicking team.";
        paint();
        return;
      }
      pending = null;
      captureSnapshot = null;
      transcript = "";
      stop();
      message = "Voice event confirmed.";
      onSave(proposed);
    };
  }
  function interpret({ match, team, now }) {
    if (!match.setup.ourTeam.trim() || !match.setup.opposition.trim()) {
      pending = null;
      message = "Enter both team names first.";
      return;
    }
    const result = interpretCommentary(transcript, team);
    message = result.reason;
    pending = result.candidate
      ? {
          ...createEvent(
            match,
            result.candidate.event,
            result.candidate.team,
            now,
          ),
          ...result.candidate,
          dictatedNote: transcript,
        }
      : null;
  }
  return {
    mount(node) {
      root = node;
      paint();
    },
    dispose() {
      stop();
      root = null;
    },
    reset() {
      stop();
      pending = null;
      captureSnapshot = null;
      transcript = "";
      message = "";
    },
  };
}
