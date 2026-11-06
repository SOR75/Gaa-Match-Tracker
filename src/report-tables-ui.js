import {summarize,scoringTimeline} from './analysis.js';
import {formatTime} from './domain.js';
import {periodId} from './periods.js';
import {esc} from './ui.js';
import {kickoutLengthEvidence} from './report-evidence.js';
const pct=n=>n===null?'—':n+'%';
const table=(head,rows)=>`<div class="table-scroll"><table class="${rows.length<=10?'report-table-short':''}"><thead><tr>${head.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<${i?'td':'th'} ${i?'':'scope="row"'}>${esc(String(v))}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
export function reportKickoutTables(match,stats){
 const teams=['our','opposition'],name=t=>(t==='our'?match.setup.ourTeam:match.setup.opposition)||(t==='our'?'Our team':'Opposition');
 if(!teams.some(t=>stats[t].kickouts.total))return '<p class="small-note">No kickouts recorded.</p>';
 return table(['Kicking team','Taken','Retained / known','Lost by kicking team','Unknown outcome','OOP / Sideline','Marks us / opp'],teams.map(t=>{const k=stats[t].kickouts;return [name(t),k.total,`${t==='our'?k.won:k.lost}/${k.won+k.lost} · ${pct(k.retention)}`,t==='our'?k.lost:k.won,k.unknown,k.outOfPlay,`${k.marksWon}/${k.marksLost}`];}))+
 '<h3>Kickout lengths · separate from outcomes</h3>'+table(['Kicking team','Recorded length','Taken','Retained / known','Retention','Unknown outcome'],teams.flatMap(t=>kickoutLengthEvidence(match.events,t).filter(g=>g.total>0).map(g=>[name(t),g.label,g.total,`${g.retained}/${g.known}`,pct(g.retention),g.unknownOutcome])));
}

// Same per-half calculations, pivoted to avoid repeating team labels and metrics.
export function reportHalfComparison(match){
 const teams=['our','opposition'],names=[match.setup.ourTeam||'Our team',match.setup.opposition||'Opposition'];
 const halves=teams.flatMap(t=>[1,2].map(h=>({team:t,s:summarize(match.events.filter(e=>e.half===h),t)})));
 const metrics=[['Total points','total'],['Attempts','attempts'],['Successful attempts','successful'],['Conversion','conversion'],['Kickouts','kickouts'],['Kickout retention','retention'],['Turnovers won','turnoversWon'],['Turnovers lost','turnoversLost'],['Interceptions','interceptions'],['Defensive blocks','defensiveBlocks'],['Possession events','possessions']];
 return table(['Recorded metric',...names.flatMap(n=>[n+' H1',n+' H2'])],metrics.map(([label,key])=>[label,...halves.map(({team,s})=>key==='conversion'?pct(s.conversion):key==='kickouts'?s.kickouts.total:key==='retention'?`${team==='our'?s.kickouts.won:s.kickouts.lost}/${s.kickouts.won+s.kickouts.lost} · ${pct(s.kickouts.retention)}`:s[key]) ]));
}
export function reportScoringTimeline(match){
 const scores=scoringTimeline(match.events);if(!scores.length)return '<p class="small-note">No scores recorded yet.</p>';
 const groups=new Map();for(const row of scores){const id=[1,2,3,4].includes(row.event.half)?periodId(row.event.half):'Period unknown';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
 return `<div class="report-pair">${[...groups].map(([period,rows])=>`<div><h3>${esc(period)}</h3>${table(['Time','Team','Score','Running score'],rows.map(({event,our,opposition})=>[Number.isFinite(event.timeMs)?formatTime(event.timeMs):'Unknown',event.team==='our'?match.setup.ourTeam||'Our team':match.setup.opposition||'Opposition',event.event==='two-point'?'2 Point':event.event,`${our} — ${opposition}`]))}</div>`).join('')}</div>`;
}
