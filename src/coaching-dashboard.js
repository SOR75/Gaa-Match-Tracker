import { pitchMarkup, hasLocation } from "./pitch.js";
import { esc } from "./ui.js";

const pct = (n) => (n === null ? "—" : `${n}%`);
const score = (s) =>
  `${s.goals}-${String(s.points + 2 * s.twoPointers).padStart(2, "0")} (${s.total})`;
const headline = (id, label, value, rate) =>
  `<section class="ht-kpi" data-ht-kpi="${id}"><h2>${label}</h2><strong>${value}</strong><b>${rate}</b></section>`;
const observationKinds = {
  working: "✓ WORKING",
  watch: "⚠ WATCH",
  opportunity: "↑ OPPORTUNITY",
};
// Presentation only: callers supply scoped calculations, labels and actions.
export function coachingDashboard({
  data: d,
  ourTeam,
  oppositionTeam,
  periodLabel,
  scopeLabel,
  title,
  scoreLabel,
  mapHeading,
  mapLabel,
  contributorsHeading,
  direction,
  actions = [],
  scope = "H1",
  comparison = null,
}) {
  const k = d.our.kickouts,
    t = d.opposition.kickouts;
  const margin = d.our.total - d.opposition.total;
  return `<div class="coaching-dashboard" data-analysis-scope="${esc(scope)}">
    <header class="ht-score" aria-label="${esc(scoreLabel)}">
      <h1 aria-label="${esc(title)}">${esc(periodLabel)}</h1>
      <div class="ht-score-line"><div class="ht-score-team"><span>${esc(ourTeam)}</span><strong data-ht-score="our">${score(d.our)}</strong></div><div class="ht-margin"><small>MARGIN</small><strong>${margin > 0 ? "+" : ""}${margin}</strong></div><div class="ht-score-team opposition"><strong data-ht-score="opposition">${score(d.opposition)}</strong><span>${esc(oppositionTeam)}</span></div></div>
    </header>
    <div class="ht-kpis">${headline("shooting", "SHOOTING", `${d.our.successful} / ${d.our.attempts}`, `${pct(d.our.conversion)} conversion`)}${headline("our-kickouts", "OUR KICKOUTS", `${k.won} / ${k.total}`, `${pct(k.retention)} retained`)}${headline("their-kickouts", "THEIR KICKOUTS", `Won ${t.won} / ${t.total}`, `${pct(t.possessionWinRate)} won by us`)}${headline("turnovers", "TURNOVERS", `Won ${d.our.turnoversWon}`, `Lost ${d.our.turnoversLost}`)}</div>
    <div class="ht-body">
      <section class="card ht-map"><h2>${esc(mapHeading)}</h2><div class="ht-map-content"><div class="ht-pitch">${pitchMarkup(d.shots, false, { direction, teamName: ourTeam, mapLabel })}</div><div class="ht-map-details">
        <div class="shot-legend"><span><i class="legend-goal">●</i> Goal</span><span><i class="legend-point">●</i> Point</span><span><i class="legend-two">◎</i> 2-Point</span><span><i class="legend-miss">×</i> Miss</span><span><i class="legend-blocked">▣</i> Blocked</span></div>
        <div class="ht-zones">${["inside", "outside"].map((z) => `<div class="ht-zone" data-ht-zone="${z}"><h3>${z === "inside" ? "Inside" : "Outside"} 40m</h3><p><strong>${d.zones[z].successful} / ${d.zones[z].attempts}</strong><span>• ${pct(d.zones[z].conversion)} conversion</span></p></div>`).join("")}</div>
        <p class="ht-map-count">${d.shots.filter(hasLocation).length} plotted / ${d.shots.length} attempts${d.zones.unknown.attempts ? `<br>${d.zones.unknown.attempts} without a classifiable location` : ""}</p>
      </div></div></section>
      <section class="card ht-observations"><h2>KEY OBSERVATIONS</h2><div class="ht-observation-list">${d.observations.length ? d.observations.map((o) => `<article class="ht-observation ${o.kind}" data-observation="${o.kind}"><span>${observationKinds[o.kind]}</span><h3>${esc(o.title)}</h3><p>${esc(o.detail)}</p></article>`).join("") : '<p class="ht-neutral">Insufficient evidence for a coaching observation yet. Figures show only what has been recorded.</p>'}</div></section>
    </div>
    <section class="card ht-contributors"><h2>${esc(contributorsHeading)}</h2>${d.contributors.length ? `<ul tabindex="0" aria-label="Recorded player contributions">${d.contributors.map((p) => `<li><strong>#${esc(p.number)} ${esc(p.name)}</strong><span>${[p.successful ? `${p.goals}-${p.points + 2 * p.twoPointers}${p.twoPointers ? ` (${p.twoPointers} × 2P)` : ""}` : "", p.defensiveBlocks ? `${p.defensiveBlocks} ${p.defensiveBlocks === 1 ? "Block" : "Blocks"}` : "", p.kickoutMarks ? `${p.kickoutMarks} ${p.kickoutMarks === 1 ? "Kickout Mark" : "Kickout Marks"}` : "", p.turnoversWon ? `${p.turnoversWon} turnovers won` : "", p.interceptions ? `${p.interceptions} interceptions` : ""].filter(Boolean).join(" • ")}</span></li>`).join("")}</ul>` : '<p class="ht-neutral">No attributed scoring or defensive contributions recorded yet.</p>'}</section>
    ${comparison ? comparisonMarkup(comparison, ourTeam, oppositionTeam) : ""}
    <div class="ht-actions">${actions.map((a) => `<button class="button ${a.primary ? "primary" : "subtle"}" ${a.action ? `data-action="${esc(a.action)}"` : `data-view="${esc(a.view)}"`}>${esc(a.label)}</button>`).join("")}</div>
    <p class="ht-method">${esc(scopeLabel)} only · Kickout percentages use known outcomes${k.unknown + t.unknown ? ` (${k.unknown + t.unknown} unknown)` : ""}${k.outOfPlay + t.outOfPlay ? ` · ${k.outOfPlay + t.outOfPlay} Out of Play / Sideline (included as losses for the kicking team)` : ""} · Locations unchanged; boundary counts inside.</p>
  </div>`;
}

function comparisonMarkup(periods, ourTeam, oppositionTeam) {
  const columns = [periods.H1, periods.H2, periods.FULL_MATCH];
  const rate = (value, numerator, denominator) =>
    value === null ? "—" : `${value}% (${numerator}/${denominator})`;
  const rows = [
    [
      "Score · our / opposition",
      columns.map((d) => `${score(d.our)} / ${score(d.opposition)}`),
    ],
    [
      "Shooting",
      columns.map((d) =>
        rate(d.our.conversion, d.our.successful, d.our.attempts),
      ),
    ],
    [
      "Our KO retained",
      columns.map((d) =>
        rate(
          d.our.kickouts.retention,
          d.our.kickouts.won,
          d.our.kickouts.won + d.our.kickouts.lost,
        ),
      ),
    ],
    [
      "Their KO won by us",
      columns.map((d) =>
        rate(
          d.opposition.kickouts.possessionWinRate,
          d.opposition.kickouts.won,
          d.opposition.kickouts.won + d.opposition.kickouts.lost,
        ),
      ),
    ],
    [
      "Turnovers · won − lost",
      columns.map((d) => {
        const net = d.our.turnoversWon - d.our.turnoversLost;
        return `${net > 0 ? "+" : ""}${net}`;
      }),
    ],
  ];
  return `<section class="card ht-comparison" aria-label="First half vs second half"><h2>FIRST HALF vs SECOND HALF</h2><p>${esc(ourTeam)} / ${esc(oppositionTeam)} · Percentages use qualifying events only.</p><div class="table-scroll"><table><thead><tr><th scope="col">Metric</th><th scope="col">H1</th><th scope="col">H2</th><th scope="col">Match</th></tr></thead><tbody>${rows.map(([label, values]) => `<tr><th scope="row">${label}</th>${values.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p>Turnovers: +2 means 2 more won than lost. “—” means no qualifying denominator.</p></section>`;
}
