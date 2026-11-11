import {parseBackup, MAX_BACKUP_BYTES, downloadMatchBackup} from './match-backup.js';
import {esc} from './ui.js';

export function createMatchBackupUI({repository, getActive, onChange, onRestored, canAct = () => true}) {
  let busy = false, preview = null, notice = '', error = '';
  function screen() {
    const disabled = busy || !canAct();
    const additions = preview && (preview.plan.some(p => !p.reason) || preview.libraries?.squads.some(p => !p.reason) || preview.libraries?.setups.some(p => !p.reason));
    const libraryRows = (rows, label) => rows.length ? `<h3>${label}</h3><ul>${rows.map(({record, reason, sameName}) => `<li><strong>${esc(record.name)}</strong> · ${esc(reason || 'Add with original ID')}${!reason && sameName ? ' · Separate record: this display name already exists' : ''}</li>`).join('')}</ul>` : '';
    return `<details class="card history-backup" data-match-backup${preview || notice || error ? ' open' : ''}>
      <summary>Backup &amp; restore</summary>
      <p>Download a JSON backup of the current match, Match History, Saved Squads and Saved Team Setups. Save it somewhere safe, such as Files, iCloud Drive or Google Drive.</p>
      <p class="small-note">Includes permanent player IDs and recorded match details. This file contains personal information and is not encrypted. This is a manual backup, not cloud sync.</p>
      <div class="history-management"><button class="button subtle" data-backup-action="download" ${disabled ? 'disabled' : ''}>Download Sideline backup</button>
      <label class="field"><span>Restore Sideline backup</span><input type="file" accept=".json,application/json" data-match-backup-file ${disabled ? 'disabled' : ''}></label></div>
      ${busy ? '<p role="status">Checking backup…</p>' : ''}
      ${error ? `<p class="warning" role="alert">${esc(error)}</p>` : ''}
      ${notice ? `<p role="status" data-backup-notice>${esc(notice)}</p>` : ''}
      ${preview ? `<section aria-labelledby="backup-review-title" data-backup-review><h2 id="backup-review-title">Review restore</h2>
      <p>${preview.plan.filter(p => !p.reason).length} new matches to restore; ${preview.plan.filter(p => p.reason).length} skipped. Backup saved ${esc(preview.backup.exportedAt)}.</p>
      ${preview.libraries ? `<p data-backup-library-counts>Saved Squads: ${preview.libraries.squads.filter(p => !p.reason).length} new, ${preview.libraries.squads.filter(p => p.reason).length} skipped. Saved Team Setups: ${preview.libraries.setups.filter(p => !p.reason).length} new, ${preview.libraries.setups.filter(p => p.reason).length} skipped.</p>` : '<p>Older match-only backup: no Saved Squads or Team Setups are included or changed.</p>'}
      <p>New matches are added to History only. The active match is unchanged. Existing records and deleted-match markers will not be overwritten. Names and jersey numbers are never used to merge identities.</p>
      <p class="small-note">Close other Sideline tabs before restoring. Keep this page open until it finishes. If interrupted, retry the same file; existing IDs will be skipped. A previously active match can be deliberately resumed from History where eligible; its restored clock is paused.</p>
      <ul>${preview.plan.map(({record, reason}) => `<li><strong>${esc(record.match.setup.ourTeam || 'Our team')} vs ${esc(record.match.setup.opposition || 'Opposition')}</strong> · ${esc(record.match.setup.date || 'Date unknown')} · ${record.match.events.length} events · ${esc(reason || 'Add to History')}</li>`).join('')}</ul>
      ${preview.libraries ? libraryRows(preview.libraries.squads, 'Saved Squads') + libraryRows(preview.libraries.setups, 'Saved Team Setups') : ''}
      <div class="history-management"><button class="button subtle" data-backup-action="cancel" ${disabled ? 'disabled' : ''}>Cancel restore</button>
      <button class="button primary" data-backup-action="confirm" ${disabled || !additions ? 'disabled' : ''}>Confirm restore</button></div></section>` : ''}
    </details>`;
  }
  async function click(button) {
    if (busy || !canAct()) return;
    const action = button.dataset.backupAction;
    if (action === 'cancel') { preview = null; error = ''; notice = 'Restore cancelled. No data was changed.'; onChange(); return; }
    if (!['download', 'confirm'].includes(action) || action === 'confirm' && !preview) return;
    busy = true; error = ''; notice = ''; onChange();
    try {
      if (action === 'download') {
        const backup = await repository.exportBackup(getActive());
        downloadMatchBackup(backup);
        notice = `Backup prepared: ${backup.matches.length} matches, ${backup.libraries.squads.squads.length} Saved Squads and ${backup.libraries.teamSetups.setups.length} Saved Team Setups. Save the downloaded JSON file outside this browser.`;
      } else {
        const result = await repository.restoreBackup(preview.backup, getActive());
        preview = null;
        notice = `${result.restored} ${result.restored === 1 ? 'match' : 'matches'} restored; ${result.skipped} skipped. Saved Squads: ${result.squadsRestored} restored, ${result.squadsSkipped} skipped. Saved Team Setups: ${result.setupsRestored} restored, ${result.setupsSkipped} skipped. Active match and existing records unchanged.`;
        try { await onRestored(); }
        catch { error = 'Data was restored, but the history view could not refresh. Refresh History to view it.'; }
      }
    } catch (e) { error = e.message || 'Match backup failed. Original records are unchanged.'; }
    busy = false; onChange();
  }
  async function change(target) {
    if (!target.hasAttribute('data-match-backup-file') || busy || !canAct()) return;
    const file = target.files?.[0]; if (!file) return;
    busy = true; preview = null; error = ''; notice = ''; onChange();
    try {
      if (file.size > MAX_BACKUP_BYTES) throw Error('Choose a match backup smaller than 25 MB.');
      const backup = parseBackup(await file.text());
      const plan = await repository.previewRestore(backup, getActive());
      preview = {backup, plan: plan.matches, libraries: plan.libraries};
    } catch (e) { error = e.message || 'This backup could not be opened. No matches were restored.'; }
    busy = false; onChange();
  }
  return {screen, click, change, isBusy: () => busy};
}
