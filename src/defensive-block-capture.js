import { ourCreditRoster, playerCreditPicker, bindOtherCredit } from "./player-credit.js";
import { attackingDirection, transformLocation } from "./matchday.js";
import { normalizedLocation } from "./domain.js";
import { pitchMarkup } from "./pitch.js";
import { esc } from "./ui.js";

// The defensive event has already been persisted before this optional UI opens.
export function openDefensiveBlockDetails(
  dialog,
  event,
  match,
  onUpdate,
  onClose,
) {
  let draft = { ...event },
    finished = false;
  const direction = attackingDirection(match, "opposition", event.half);
  const opponent = match.setup.opposition || "Opposition";
  const options = {
    direction,
    teamName: opponent,
    interactiveLabel: "Defensive block location pitch",
  };
  const save = (patch) => {
    draft = { ...draft, ...patch };
    onUpdate(draft);
  };
  dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">DEFENSIVE BLOCK ALREADY RECORDED · ${esc(match.setup.ourTeam || "Our team")}</p><h2 id="event-dialog-title">Defensive Block</h2></div><button type="button" class="icon-button" data-defensive-close aria-label="Close defensive block">×</button></div><p class="capture-instruction">Who made the block? · optional</p><div data-defensive-player>${playerCreditPicker(ourCreditRoster(match), { groupLabel: "Our defensive blocker", attribute: "data-defensive-player", actionLabel: "Credit defensive block to", selected: String(draft.playerNumber || "") })}</div><p class="small-note">The block is saved. A player tap saves credit and returns to the match. No possession change is assumed.</p><details class="optional-defensive-location"><summary>Add location · optional</summary><p class="small-note">${esc(opponent)} attacks the ${direction.toUpperCase()} goal. Tap where our block happened; no shooting attempt is created.</p><div class="capture-pitch">${pitchMarkup(draft.shotX === null ? [] : [draft], true, options)}</div><button type="button" class="button subtle" data-clear-defensive-location>Clear location</button></details><button type="button" class="button subtle full-width" data-defensive-close>Skip / Close</button>`;
  dialog
    .querySelectorAll("[data-defensive-close]")
    .forEach((b) => (b.onclick = () => dialog.close()));
  dialog.querySelectorAll("[data-defensive-player][type=button]").forEach(
    (b) =>
      (b.onclick = () => {
        if (finished) return;
        finished = true;
        save({ playerNumber: b.dataset.defensivePlayer });
        dialog.close();
      }),
  );
  bindOtherCredit(dialog, (_, number) => { if (finished) return; finished = true; save({ playerNumber: number }); dialog.close(); });
  const pitch = dialog.querySelector(".gaelic-pitch");
  const paint = () => {
    pitch.innerHTML = pitchMarkup([draft], false, options).match(
      /<svg[^>]*>([\s\S]*)<\/svg>/,
    )[1];
  };
  const choose = (location) => {
    if (location) {
      save(transformLocation(location, direction));
      paint();
    }
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
  dialog.querySelector("[data-clear-defensive-location]").onclick = () => {
    save({ shotX: null, shotY: null });
    paint();
  };
  dialog.addEventListener("close", onClose, { once: true });
  dialog.showModal();
  dialog.querySelector("[data-defensive-close]").focus();
}
