import {
  loadTeamSetups,
  saveTeamSetup,
  applyTeamSetup,
} from "./team-setups.js";
import { loadSquads } from "./squads.js";
import { esc } from "./ui.js";
const close =
  '<button type="button" class="icon-button" data-setup-close aria-label="Close team setups">×</button>';
export function openSaveTeamSetup(dialog, match, team, onSaved) {
  const players = team === "our" ? match.players : match.oppositionPlayers,
    squadId = team === "our" ? match.squadId : match.oppositionSquadId;
  dialog.innerHTML = `<form><div class="dialog-heading"><h2 id="event-dialog-title">Save team setup</h2>${close}</div><p class="small-note">Save today’s jersey numbers and starting roles as reusable defaults. Permanent players, Saved Squad membership and existing matches are unchanged. Use a new name for each setup; nothing is overwritten.</p><label class="field"><span>Team setup name</span><input name="setupName" required maxlength="80" placeholder="e.g. Championship starting team"></label><p class="warning" data-setup-error hidden></p><div class="dialog-actions"><button class="button primary" type="submit">Save setup</button></div></form>`;
  dialog.querySelector("[data-setup-close]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    try {
      saveTeamSetup(new FormData(e.target).get("setupName"), squadId, players);
      dialog.close();
      onSaved();
    } catch (error) {
      const n = dialog.querySelector("[data-setup-error]");
      n.hidden = false;
      n.textContent = error.message;
    }
  };
  dialog.showModal();
}
export function openUseTeamSetup(dialog, match, team, onLoaded) {
  const completedMatch = match.lifecycle?.status === "completed";
  const saved = loadTeamSetups(),
    library = loadSquads();
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="event-dialog-title">Use saved team setup</h2>${close}</div><p class="small-note">${completedMatch ? "Start a new match before applying a team setup. This completed match will not be changed." : "Use a separate match snapshot of saved jersey/starting-role defaults. Change today’s team afterwards without changing the setup or history."}</p>${saved.error || library.error ? `<p class="warning" role="alert">${esc(saved.error || library.error)}</p>` : ""}<div class="library-list">${
    saved.setups
      .map((s) => {
        const squad = library.squads.find((q) => q.id === s.squadId);
        return `<div class="library-row"><div><strong>${esc(s.name)}</strong><p>${esc(squad?.name || "Source Saved Squad unavailable")} · ${s.players.filter((p) => p.role === "starter").length} starters · ${s.players.filter((p) => p.role === "substitute").length} substitutes</p></div><button class="button primary" data-use-team-setup="${s.id}" ${!squad || library.error || completedMatch ? "disabled" : ""}>Use setup</button></div>`;
      })
      .join("") ||
    "<p>No saved team setups yet. Load a Saved Squad, set today’s jerseys/roles, then Save team setup.</p>"
  }</div><p class="warning" data-setup-error hidden></p>`;
  dialog.querySelector("[data-setup-close]").onclick = () => dialog.close();
  dialog.querySelectorAll("[data-use-team-setup]").forEach(
    (b) =>
      (b.onclick = () => {
        try {
          if (completedMatch)
            throw Error("Start a new match before using a team setup.");
          const setup = saved.setups.find(
              (s) => s.id === b.dataset.useTeamSetup,
            ),
            squad = library.squads.find((s) => s.id === setup.squadId),
            existing = team === "our" ? match.players : match.oppositionPlayers;
          if (
            existing.length &&
            !confirm(
              `Use “${setup.name}” for this match? Today’s selected team jerseys/roles will be replaced. Recorded events, Saved Squad and historical matches are kept.`,
            )
          )
            return;
          const players = applyTeamSetup(setup, squad, existing);
          dialog.close();
          onLoaded(players, squad);
        } catch (error) {
          const n = dialog.querySelector("[data-setup-error]");
          n.hidden = false;
          n.textContent = error.message;
        }
      }),
  );
  dialog.showModal();
}
