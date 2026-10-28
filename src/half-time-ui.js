import { halfTimeAnalysis } from "./half-time.js";
import { pitchMarkup, hasLocation } from "./pitch.js";
import { attackingDirection } from "./matchday.js";
import { esc } from "./ui.js";
const pct = (n) => (n === null ? "—" : `${n}%`);
const score = (s) =>
  `${s.goals}-${String(s.points + 2 * s.twoPointers).padStart(2, "0")} (${s.total})`;
const card = (id, title, value, rate, details) =>
  `<section class="ht-kpi" data-ht-kpi="${id}"><h2>${title}</h2><strong>${value}</strong><b>${rate}</b><p>${details}</p></section>`;
function kickoutText(k) {
  return `${k.total} total · ${k.won} won by us · ${k.lost} won by opposition · ${k.unknown} unknown`;
}
function lengths(k) {
  return ["short", "long"]
    .filter((l) => k[l].total)
    .map(
      (l) =>
        `${l === "short" ? "Short" : "Long"}: ${k[l].won}/${k[l].total} won by us${k[l].unknown ? ` (${k[l].unknown} unknown)` : ""}`,
    )
    .join(" · ");
}
export function halfTimeScreen(match) {
  const d = halfTimeAnalysis(match),
    k = d.our.kickouts,
    t = d.opposition.kickouts;
  const our = match.setup.ourTeam || "Our team",
    opposition = match.setup.opposition || "Opposition";
  const margin = d.our.total - d.opposition.total;
  return `<div class="half-time-view"><header class="ht-heading"><div><p class="eyebrow">HALF TIME · FIRST HALF ONLY</p><h1>Half-Time Analysis</h1></div><div class="ht-actions"><button class="button subtle" data-action="ht-full-stats">VIEW FULL STATS · FIRST HALF</button><button class="button subtle" data-view="live">Return to Live Match</button>${match.clock.half === 1 ? '<button class="button primary" data-action="ht-second-half">START SECOND HALF →</button>' : '<button class="button primary" data-view="live">Second half started → Live Match</button>'}</div></header>
  <section class="ht-score" aria-label="Half-time score"><div><span>${esc(our)}</span><strong data-ht-score="our">${score(d.our)}</strong></div><div class="ht-margin"><small>MARGIN</small><strong>${margin > 0 ? "+" : ""}${margin}</strong></div><div><span>${esc(opposition)}</span><strong data-ht-score="opposition">${score(d.opposition)}</strong></div></section>
  <div class="ht-kpis">${card("shooting", "SHOOTING", `${d.our.successful} / ${d.our.attempts}`, `${pct(d.our.conversion)} conversion`, `${d.our.goals} goals · ${d.our.points} points · ${d.our.twoPointers} 2-pointers<br>${d.our.misses} misses (all unsuccessful attempts)`)}${card("our-kickouts", "OUR KICKOUTS", `${k.won} / ${k.total}`, `${pct(k.retention)} retained`, `${kickoutText(k)}${lengths(k) ? `<br>${lengths(k)}` : ""}`)}${card("their-kickouts", "OPPOSITION KICKOUTS", `Won ${t.won} / ${t.total}`, `${pct(t.possessionWinRate)} won by us`, `${kickoutText(t)}${lengths(t) ? `<br>${lengths(t)}` : ""}`)}${card("turnovers", "TURNOVERS", `Won ${d.our.turnoversWon}`, `Lost ${d.our.turnoversLost}`, "Recorded our-team turnover events only; no possession changes inferred.")}</div>
  <p class="ht-method">Kickout percentages use known outcomes only. Unknown results remain in totals. All figures recalculate from recorded H1 events.</p>
  <div class="ht-body"><section class="card ht-map"><h2>OUR SHOTS — FIRST HALF</h2><div class="ht-map-content"><div class="ht-pitch">${pitchMarkup(d.shots, false, { direction: attackingDirection(match, "our", 1), teamName: our, mapLabel: "First-half shot map" })}</div><div class="ht-map-details"><div class="shot-legend"><span><i class="legend-goal">●</i> Goal</span><span><i class="legend-point">●</i> Point</span><span><i class="legend-two">◎</i> 2-Point</span><span><i class="legend-miss">×</i> Miss</span><span><i class="legend-blocked">▣</i> Blocked</span></div>${["inside", "outside"].map((z) => `<div class="ht-zone" data-ht-zone="${z}"><h3>${z === "inside" ? "Inside" : "Outside"} 40m</h3><strong>${d.zones[z].successful} / ${d.zones[z].attempts}</strong><span>${pct(d.zones[z].conversion)} conversion</span></div>`).join("")}<p class="small-note">${d.shots.filter(hasLocation).length} plotted / ${d.shots.length} attempts.<br>${d.zones.unknown.attempts} without a classifiable location.</p><details class="small-note"><summary>40m classification rule</summary>Uses the existing pitch arc and its 20m-line joins. On the boundary counts inside. Missing or out-of-field locations are excluded. Stored coordinates never change.</details></div></div></section>
  <div class="ht-coaching"><section class="card ht-observations"><h2>KEY OBSERVATIONS</h2>${d.observations.length ? d.observations.map((o) => `<article class="ht-observation ${o.kind}" data-observation="${o.kind}"><span>${{ working: "WORKING ✓", watch: "WATCH ⚠", opportunity: "OPPORTUNITY ↑" }[o.kind]}</span><h3>${esc(o.title)}</h3><p>${esc(o.detail)}</p></article>`).join("") : '<p class="ht-neutral">Insufficient evidence for a coaching observation yet. Figures above show only what has been recorded.</p>'}</section>
  <section class="card ht-contributors"><h2>KEY CONTRIBUTORS — FIRST HALF</h2>${d.contributors.length ? `<ul>${d.contributors.map((p) => `<li><strong>#${esc(p.number)} ${esc(p.name)}</strong><span>${[p.successful ? `${p.goals}-${p.points + 2 * p.twoPointers} (${p.total} pts${p.twoPointers ? `; ${p.twoPointers} × 2P` : ""})` : "", p.defensiveBlocks ? `${p.defensiveBlocks} defensive blocks` : "", p.kickoutMarks ? `${p.kickoutMarks} Kickout Marks` : "", p.turnoversWon ? `${p.turnoversWon} turnovers won` : "", p.interceptions ? `${p.interceptions} interceptions` : ""].filter(Boolean).join(" · ")}</span></li>`).join("")}</ul>` : '<p class="small-note">No attributed scoring or defensive contributions recorded yet.</p>'}<p class="small-note">Listed by jersey number, without ratings. Unattributed events stay in team totals.</p></section></div></div>
  </div>`;
}
