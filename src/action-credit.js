import { attributionRoster, playerCreditPicker } from "./player-credit.js";
import { eventType } from "./domain.js";
import { esc } from "./ui.js";
export const actionCreditEvent = (e) =>
  e &&
  ["interception", "turnover-won", "turnover-lost", "possession"].includes(
    e.event,
  );
export function actionCreditMarkup(match) {
  const e = match.events.at(-1);
  if (!actionCreditEvent(e)) return "";
  const picker = playerCreditPicker(attributionRoster(match, e.team), {
    groupLabel: "On-field event player",
    attribute: "data-action-player",
    actionLabel: "Credit event to",
    selected: e.playerNumber,
  })
    .replaceAll(
      "Other number · optional",
      "Other event player number · optional",
    )
    .replaceAll(
      'aria-label="Other number"',
      'aria-label="Other event player number"',
    );
  return `<details class="card optional-note" data-action-credit><summary>Credit player · optional · ${esc(eventType(e.event).label)}</summary><p class="small-note">Event already saved. Pick an on-field player or keep watching; the next event replaces this optional panel.</p>${picker}</details>`;
}
