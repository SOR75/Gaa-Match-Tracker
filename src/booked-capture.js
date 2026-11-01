import { attributionRoster, playerCreditPicker } from './player-credit.js';
import { esc } from './ui.js';

// A booking is recorded only after an active player is deliberately selected.
// The match ruleset is snapshotted by createEvent; no card outcome is inferred.
export function openBookedCapture(dialog, event, match, onRecord) {
  const roster = { ...attributionRoster(match, event.team), allowOther: false, fallback: false };
  const team = event.team === 'our' ? match.setup.ourTeam : match.setup.opposition;
  let recorded = false;
  dialog.innerHTML = `<div data-booked-form><div class="dialog-heading"><div><p class="eyebrow">BOOKED · ${esc(team)}${event.matchCode ? ` · ${esc(event.matchCode)}` : ''}</p><h2 id="event-dialog-title">Who was booked?</h2></div><button type="button" class="icon-button" data-booked-close aria-label="Cancel Booked">×</button></div>${playerCreditPicker(roster, {groupLabel:'Booked player · Active XV',attribute:'data-booked-player',actionLabel:'Book'})}</div>`;
  dialog.querySelector('[data-booked-close]').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-booked-player]').forEach(button => {
    button.onclick = () => {
      if (recorded) return;
      recorded = true;
      onRecord({...event, playerNumber:button.dataset.bookedPlayer});
      dialog.close();
    };
  });
  dialog.showModal();
  dialog.querySelector('[data-booked-close]').focus();
}
