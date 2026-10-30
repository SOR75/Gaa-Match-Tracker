import { attributionRoster } from "./player-credit.js";
import { roleTeam } from "./identity.js";
import { esc } from "./ui.js";
export function participantSelect(
  match,
  team,
  field,
  value,
  label,
  options = { includeInactive: true },
) {
  const { players } = attributionRoster(match, team, options);
  const found = players.some((p) => String(p.number) === String(value));
  return `<label class="field"><span>${esc(label)} · ${esc(team === "our" ? match.setup.ourTeam || "Our team" : match.setup.opposition || "Opposition")} · optional</span><select name="${field}" aria-label="${esc(label)}"><option value="">Not known</option>${value && !found ? `<option selected value="${esc(value)}">#${esc(value)} · recorded</option>` : ""}${players
    .filter((p) => Number.isInteger(p.number))
    .map(
      (p) =>
        `<option value="${p.number}" ${String(value) === String(p.number) ? "selected" : ""}>#${p.number} ${esc(p.name)}</option>`,
    )
    .join("")}</select></label>`;
}
export function linkedEventFields(
  event,
  match,
  options = { includeInactive: true },
) {
  if (event.event === "pass")
    return `<div class="form-grid">${participantSelect(match, event.team, "playerNumber", event.playerNumber, "Passer", options)}${participantSelect(match, event.team, "receiverNumber", event.receiverNumber, "Receiver", options)}<label class="field"><span>Pass type</span><select name="passType" aria-label="Pass type"><option value="kick" ${event.passType !== "hand" ? "selected" : ""}>Kick Pass</option><option value="hand" ${event.passType === "hand" ? "selected" : ""}>Hand Pass</option></select></label></div><label class="field"><span>Build-up to shot · optional</span><select name="buildUpLink" aria-label="Build-up to shot"><option value="">Standalone pass</option>${match.events
      .filter(
        (e) =>
          ["goal", "point", "two-point", "miss"].includes(e.event) &&
          e.team === event.team,
      )
      .map(
        (e) =>
          `<option value="${e.id}" ${event.buildUpLink === e.id ? "selected" : ""}>H${e.half} ${Math.floor(e.timeMs / 60000)}:${String(Math.floor(e.timeMs / 1000) % 60).padStart(2, "0")} · ${esc(e.event)}</option>`,
      )
      .join(
        "",
      )}</select></label><p class="small-note">Retrospective build-up: adjust the event half/time below if known. The shot remains saved independently.</p>`;
  if (["turnover-won", "turnover-lost"].includes(event.event))
    return `<div class="form-grid">${participantSelect(match, roleTeam(event, "turnoverWinner"), "turnoverWinnerNumber", event.turnoverWinnerNumber || (event.event === "turnover-won" ? event.playerNumber : ""), "Player who won possession", options)}${participantSelect(match, roleTeam(event, "turnoverLoser"), "turnoverLoserNumber", event.turnoverLoserNumber || (event.event === "turnover-lost" ? event.playerNumber : ""), "Player who lost possession", options)}</div>`;
  return "";
}
