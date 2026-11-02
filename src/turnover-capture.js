import { attributionRoster, playerCreditPicker } from './player-credit.js';
import { esc } from './ui.js';
import { pairedTurnoverFields } from './turnovers.js';

// Local, unsaved draft. One explicit completion saves one event with both roles.
export function openTurnoverCapture(dialog, event, match, onRecord) {
  const won = event.event === 'turnover-won';
  const draft = { ...event, pairedTurnoverVersion: 1, turnoverWinnerNumber: '', turnoverLoserNumber: '' };
  let recorded = false;
  const role = team => (team === 'our') === won ? 'turnoverWinnerNumber' : 'turnoverLoserNumber';
  const grid = team => {
    const name = team === 'our' ? match.setup.ourTeam || 'Our team' : match.setup.opposition || 'Opposition';
    const question = (team === 'our') === won ? 'Who won it?' : 'Who was turned over?';
    const label = `${name} — ${question}`;
    return `<section class="turnover-roster"><h3>${esc(label)}</h3><p class="small-note">${team === 'our' ? 'Choose our player' : 'Optional — leave unknown if not identified'}</p>${playerCreditPicker(attributionRoster(match, team), {groupLabel:label, attribute:`data-turnover-${team}`, actionLabel:label})}</section>`;
  };
  dialog.innerHTML = `<div data-turnover-form><div class="dialog-heading"><div><p class="eyebrow">OUR-TEAM PERSPECTIVE · ONE POSSESSION CHANGE</p><h2 id="event-dialog-title">Turnover ${won ? 'Won' : 'Lost'}</h2></div><button type="button" class="icon-button" data-turnover-close aria-label="Close turnover">×</button></div><div class="turnover-rosters">${grid('our')}${grid('opposition')}</div><div class="dialog-actions"><button type="button" class="button subtle" data-turnover-clear>Clear opposition player</button><button type="button" class="button primary" data-turnover-record disabled>Record turnover</button></div></div>`;
  const record = dialog.querySelector('[data-turnover-record]');
  const choose = (team, number, clearOther = true) => {
    draft[role(team)] = number;
    const attribute = `data-turnover-${team}`;
    dialog.querySelectorAll(`[${attribute}]`).forEach(button => {
      const selected = button.getAttribute(attribute) === number;
      button.classList.toggle('chosen', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (clearOther) {
      const input = dialog.querySelector(`[data-credit-other="${attribute}"]`);
      if (input) input.value = '';
    }
    record.disabled = !draft[role('our')];
  };
  for (const team of ['our', 'opposition']) {
    dialog.querySelectorAll(`[data-turnover-${team}]`).forEach(button => {
      button.onclick = () => choose(team, button.getAttribute(`data-turnover-${team}`));
    });
    const other = dialog.querySelector(`[data-credit-other="data-turnover-${team}"]`);
    if (other) other.oninput = () => choose(team, other.value && other.validity.valid ? String(+other.value) : '', false);
  }
  dialog.querySelector('[data-turnover-clear]').onclick = () => choose('opposition', '');
  dialog.querySelector('[data-turnover-close]').onclick = () => dialog.close();
  record.onclick = () => {
    if (recorded || !draft[role('our')]) return;
    if(onRecord({ ...draft, ...pairedTurnoverFields(draft) })===false)return;
    recorded = true;
    dialog.close();
  };
  dialog.showModal();
  dialog.querySelector('[data-turnover-close]').focus();
}
