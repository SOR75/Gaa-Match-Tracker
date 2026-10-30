import { participantSelect } from "./event-links.js";
import { esc } from "./ui.js";
// One entry point and one Record action. Opening/cancelling creates no event.
export function openPassCapture(dialog, event, match, onRecord) {
  let recorded = false;
  const teamName =
    event.team === "our" ? match.setup.ourTeam : match.setup.opposition;
  dialog.innerHTML = `<form data-pass-form><div class="dialog-heading"><div><p class="eyebrow">OPTIONAL PASS · ${esc(teamName)}</p><h2 id="event-dialog-title">Pass</h2></div><button type="button" class="icon-button" data-pass-close aria-label="Close Pass">×</button></div><div class="form-grid">${participantSelect(match, event.team, "playerNumber", "", "Passer", { includeInactive: false, required: true })}${participantSelect(match, event.team, "receiverNumber", "", "Receiver", { includeInactive: false, required: true })}<label class="field"><span>Pass type</span><select name="passType" aria-label="Pass type"><option value="kick">Kick Pass</option><option value="hand">Hand Pass</option></select></label></div><p class="small-note">Record only passes worth noting. Match time was captured when you tapped Pass.</p><div class="dialog-actions"><button type="submit" class="button primary">Record pass</button></div></form>`;
  dialog.querySelector("[data-pass-close]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    if (recorded) return;
    recorded = true;
    const data = Object.fromEntries(new FormData(e.target));
    onRecord({ ...event, ...data });
    dialog.close();
  };
  dialog.showModal();
  dialog.querySelector("[data-pass-close]").focus();
}
