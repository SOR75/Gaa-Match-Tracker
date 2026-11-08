import { attributionRoster, playerCreditPicker, bindOtherCredit } from './player-credit.js';
import { captureAttempt } from './capture-error.js';
import { esc } from './ui.js';

// The interception is already saved. Credit always targets that captured ID.
export function openInterceptionCredit(dialog, event, match, onUpdate, onClose) {
  let finished = false;
  const credit = number => {
    if (finished) return;
    if (!captureAttempt(dialog, () => onUpdate(event.id, number))) return;
    finished = true;
    dialog.close();
  };
  const team = event.team === 'our' ? match.setup.ourTeam : match.setup.opposition;
  dialog.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">INTERCEPTION RECORDED · ${esc(team || 'Team')}</p><h2 id="event-dialog-title">Who made the interception? · optional</h2></div><button type="button" class="icon-button" data-interception-close aria-label="Close interception">×</button></div>${playerCreditPicker(attributionRoster(match, event.team), {groupLabel:'On-field interception player',attribute:'data-interception-player',actionLabel:'Credit interception to',selected:event.playerNumber})}<p class="small-note">The interception is saved. Tap a player to credit it, or continue without player credit.</p><button type="button" class="button subtle full-width" data-interception-close>Skip / Close</button>`;
  dialog.querySelectorAll('[data-interception-player]').forEach(button => {
    button.onclick = () => credit(button.dataset.interceptionPlayer);
  });
  bindOtherCredit(dialog, (_, number) => credit(number));
  dialog.querySelectorAll('[data-interception-close]').forEach(button => {
    button.onclick = () => dialog.close();
  });
  dialog.addEventListener('close', onClose, {once:true});
  dialog.showModal();
  dialog.querySelector('[data-interception-close]').focus();
}
