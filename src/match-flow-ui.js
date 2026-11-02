import {matchFlow} from './match-flow.js';
import {formatTime} from './domain.js';
import {esc} from './ui.js';
const at=p=>`${p.period} ${formatTime(p.timeMs)}`;
export function matchFlowMarkup(match,scope='FULL_MATCH'){
 const flow=matchFlow(match,{scope});
 return `<section class="card match-flow" data-match-flow="${esc(scope)}" aria-label="Match Flow Analysis"><header><div><p class="eyebrow">RECORDED EVIDENCE</p><h2>MATCH FLOW</h2></div><button class="button subtle" data-timeline-csv>Download Timeline CSV</button></header>
 ${flow.observations.length?`<div class="flow-stories">${flow.observations.map(o=>`<article data-flow-story class="flow-story ${esc(o.polarity)}"><small>${esc(at(o.window.from))} → ${esc(at(o.window.to))} · ${o.evidenceType==='DIRECT_EVENT_CHAIN'?'RECORDED SEQUENCE':'OBSERVED SPELL'}</small><h3>${esc(o.title)}</h3><p>${esc(o.detail)}</p>${o.supporting.slice(0,2).map(s=>`<p class="flow-support">${esc(s.detail)}</p>`).join('')}<details><summary>Show evidence · ${o.evidenceIds.length} events</summary><ol>${flow.stream.filter(e=>o.evidenceIds.includes(e.id)).map(e=>`<li data-flow-evidence="${esc(e.id)}"><strong>${esc(e.period)} ${esc(e.periodTime)}</strong> · ${esc(e.team==='our'?match.setup.ourTeam||'Our team':match.setup.opposition||'Opposition')} · ${esc(e.eventLabel)}${e.kickout?.length?' · '+esc(e.kickout.length):''}${e.primaryPlayer?.jerseyNumber?' · #'+esc(e.primaryPlayer.jerseyNumber):''}<small>Event ${esc(e.id)}</small></li>`).join('')}</ol></details></article>`).join('')}</div>`:'<p class="small-note">No sufficiently strong Match Flow observation from the recorded evidence yet.</p>'}
 <p class="small-note flow-method">Recorded events only. Sequences do not establish unrecorded possession or tactical causation. Passes are optional notable actions.</p></section>`;
}
