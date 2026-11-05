import {esc} from './ui.js';
// Reuse the existing evidence disclosure, with no new capture controls.
export function coachingEvidenceMarkup(observation,stream){
 return `<details><summary>Show evidence · ${observation.evidenceIds.length} events</summary><ol>${stream.filter(e=>observation.evidenceIds.includes(e.id)).map(e=>`<li data-insight-evidence="${esc(e.id)}"><strong>${esc(e.period)} ${esc(e.periodTime||'time unknown')}</strong> · ${esc(e.eventLabel)}<small>Event ${esc(e.id)}</small></li>`).join('')}</ol></details>`;
}
