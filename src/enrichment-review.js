import { planSquadEnrichment, importStarterWarning } from './match-squad-enrichment.js';
import { hasMatchEvidence } from './participation.js';
import { playersFor } from './domain.js';
import { validatePlayers } from './squads.js';
import { assertMatchDayCapacity } from './programme-integrity.js';
import { esc } from './ui.js';
const fingerprint = p => JSON.stringify([p.number,p.name,p.id||'']);
export function bindEnrichmentReview(dialog,read,existing,context={}) {
  const form=dialog.querySelector('form'),choices=new Map();
  form.querySelector('[data-squad-error]').insertAdjacentHTML('beforebegin','<aside class="warning" data-import-starters role="status"></aside><aside class="small-note identity-review" data-identity-review></aside>');
  const remember=event=>{
    const select=event.target.closest('[data-import-resolution]');
    if(select)choices.set(select.dataset.fingerprint,select.value);
  };
  form.addEventListener('input',remember,true);form.addEventListener('change',remember,true);
  const roster=()=>context.match?playersFor(context.match,context.team):existing;
  const options=rows=>({live:context.match?hasMatchEvidence(context.match):false,
    decisions:Object.fromEntries(rows.map((p,i)=>[i,choices.get(fingerprint(p))||'']))});
  function refresh(){
    const rows=read(),warning=importStarterWarning(rows),node=form.querySelector('[data-import-starters]');
    node.hidden=!warning;node.textContent=warning?`⚠ ${warning.message} Confirming below deliberately accepts this designation; it does not fabricate a missing starter.`:'';
    const review=form.querySelector('[data-identity-review]');
    if(!context.match){review.hidden=true;return;}
    const plan=planSquadEnrichment(roster(),rows,options(rows));
    const attention=plan.rows.filter(r=>r.action==='review'||choices.has(fingerprint(rows[r.index])));
    review.innerHTML=`<strong>${context.match && hasMatchEvidence(context.match)?'Mid-match enrichment — current Active XV and all event references are preserved.':'Match identities — enrich existing numbered slots rather than adding duplicates.'}</strong><p>${plan.rows.filter(r=>r.action==='enrich').length} existing identities updated · ${plan.rows.filter(r=>r.action==='add').length} new players · ${plan.conflicts.length} identity conflicts requiring review.</p>${plan.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}${attention.map(r=>{
      const row=rows[r.index],value=choices.get(fingerprint(row))||'';
      return `<label class="field"><span>Row ${r.index+1}: ${esc(r.reason)}</span><select data-import-resolution data-fingerprint="${esc(fingerprint(row))}" aria-label="Identity resolution row ${r.index+1}"><option value="">Review required — correct row or choose</option><option value="skip" ${value==='skip'?'selected':''}>Keep existing roster; skip this imported row</option>${r.targetId?`<option value="same" ${value==='same'?'selected':''}>I confirm a name correction for the SAME player</option>`:`<option value="new" ${value==='new'?'selected':''}>I confirm this is a different person</option>`}</select></label>`;
    }).join('')}`;
  }
  function accept(){
    const raw=read(), rows=validatePlayers(raw);
    if(!context.match){assertMatchDayCapacity(rows,existing);return validatePlayers(rows,existing);}
    const plan=planSquadEnrichment(roster(),rows,options(raw));
    if(plan.conflicts.length)throw Error(`Review identity: ${plan.conflicts.map(r=>`row ${r.index+1}: ${r.reason}`).join(' ')}`);
    assertMatchDayCapacity(plan.players);
    return plan.players;
  }
  return {refresh,accept};
}
