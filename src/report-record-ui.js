import {esc} from './ui.js';
import {formatTime} from './domain.js';
import {resolveParticipant} from './identity.js';
import {shootoutStatus,shootoutPlayerStatistics} from './shootout.js';
import {penaltyPerson} from './shootout-ui.js';
const section=(heading,body,attr='')=>`<section class="card analysis-section" ${attr}><h2>${heading}</h2>${body}</section>`;
const table=(headers,rows)=>`<div class="table-scroll"><table class="${rows.length<=8?'report-table-short':''}"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<${i?'td':'th'}${i?'':' scope="row"'}>${esc(String(v??'—'))}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const time=e=>Number.isFinite(e.timeMs)&&e.timeMs>=0?formatTime(e.timeMs):'Time unknown';
const period=e=>[1,2,3,4].includes(e.half)?['H1','H2','ET1','ET2'][e.half-1]:'Period unknown';
const person=(m,e,role)=>{const p=resolveParticipant(m,e,role);return p?[p.number!==null&&p.number!==''?'#'+p.number:'',p.name].filter(Boolean).join(' '):'Not recorded';};
export function reportRecordsMarkup(match,data){
 const name=t=>data.names[t]||'Team unknown';
 const subs=data.substitutions.map(s=>[`${period(s.event)} ${time(s.event)}`,name(s.team),person(match,s.event,'playerOn'),person(match,s.event,'playerOff'),s.event.event==='discipline-replacement'?'Recorded discipline replacement':'Substitution']);
 const substitutions=subs.length?section('Substitutions',table(['Period / time','Team','On','Off','Recorded action'],subs),'data-report-substitutions'):'<p class="small-note" data-report-substitutions><b>Substitutions</b> · No substitutions recorded.</p>';
 const minuteGroups=['our','opposition'].map(team=>{
  const rows=data.minutes.filter(p=>p.team===team);if(!rows.length)return '';
  const evidence=[...new Set(rows.map(p=>p.evidence))],common=evidence.length===1;
  return `<div class="report-participation-team"><h3>${esc(name(team))}</h3>${common?`<p class="small-note">Recorded evidence for all listed players: ${esc(evidence[0])}.</p>`:''}${table(common?['Player','Playing time']:['Player','Playing time','Recorded evidence'],rows.map(p=>[`${p.number!==null?'#'+p.number+' ':''}${p.name}`,p.timeMs===null?'Unknown':formatTime(p.timeMs),...(common?[]:[p.evidence==='Recorded field changes (legacy linkage)'?'Legacy field changes':p.evidence])]))}</div>`;
 }).join('');
 const minutes=section('Recorded participation & playing time',data.minutes.length?`<div class="report-pair">${minuteGroups}</div><p class="small-note">Times use recorded clock and field changes; missing boundaries remain unknown. Legacy linkage creates no new player identities.</p>`:'<p class="small-note">No player participation can be established from the recorded lineup/events.</p>','data-report-minutes');
 const s=match.shootout;if(!s)return substitutions+minutes;
 const status=shootoutStatus(s),shootout=section('Penalty shootout — separate from football',`<p>${esc(name('our'))}: ${status.score.our} · ${esc(name('opposition'))}: ${status.score.opposition}. ${status.winner?esc(name(status.winner))+' won on penalties.':'No shootout winner recorded.'}</p><p class="small-note">Untimed; original attempt order. Penalties do not change the football score, shot totals or playing time.</p>${table(['Order','Team','Kicker','Outcome','Defending goalkeeper'],s.attempts.map(a=>[a.order,name(a.team),penaltyPerson(match,a.kicker),a.outcome,penaltyPerson(match,a.goalkeeper)]))}${table(['Player','Shootout attempts / scored','GK faced / saved / conceded'],shootoutPlayerStatistics(match).map(p=>[`${name(p.team)} · ${penaltyPerson(match,p)}`,`${p.attempts}/${p.scored}`,`${p.gkFaced}/${p.gkSaved}/${p.gkConceded}`]))}`,'data-report-shootout');
 return substitutions+minutes+shootout;
}
