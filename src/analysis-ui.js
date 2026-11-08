import './report-print.js';
import {reportStatus,SHOT_CATEGORY_NOTE} from './report-evidence.js';
import {reportKickoutTables,reportHalfComparison,reportScoringTimeline} from './report-tables-ui.js';
import {periodId} from "./periods.js";
import { scoringSourceSummary } from './scoring-sources.js';
import { isReportShooter, hasReportEventData, REPORT_EVENT_METRICS, reportPlayerStatistics } from './report-player-data.js';
import {fullMatchReportModel} from "./full-match-report-data.js";
import {reportRecordsMarkup} from "./report-record-ui.js";
import { shotLocationAnalysis } from "./shot-location-analysis.js";
import { goalkeeperCards } from "./goalkeeper-ui.js";
import { isDefensiveBlockEvent } from "./defensive-blocks.js";
import { SHOT_SOURCES, gaelicScore } from "./shots.js";
import {
  summarize,
  playerStatistics,
  filterShots,
  scoringTimeline,
} from "./analysis.js";
import { formatTime } from "./domain.js";
import { pitchMarkup, hasLocation } from "./pitch.js";
import { esc } from "./ui.js";
const pct = (value) => (value === null ? "—" : `${value}%`);
const score = (value) =>
  `${value.total} pts (${value.goals}G · ${value.points}P · ${value.twoPointers} × 2P)`;
// Responsive flag adds presentation labels/roles only; cells and statistics are unchanged.
function table(headers, rows, caption = "", responsive = false) {
  return `<div class="table-scroll"><table class="${rows.length<=10?'report-table-short':''} ${responsive?'kickout-readable':''}" ${responsive ? 'role="table"' : ""}>${caption ? `<caption>${esc(caption)}</caption>` : ""}<thead ${responsive ? 'role="rowgroup"' : ""}><tr ${responsive ? 'role="row"' : ""}>${headers.map((header) => `<th scope="col" ${responsive ? 'role="columnheader"' : ""}>${esc(header)}</th>`).join("")}</tr></thead><tbody ${responsive ? 'role="rowgroup"' : ""}>${rows.map((row) => `<tr ${responsive ? 'role="row"' : ""}>${row.map((cell, index) => (index === 0 ? `<th scope="row" ${responsive ? 'role="rowheader"' : ""}>${esc(cell)}</th>` : `<td ${responsive ? `role="cell" data-label="${esc(headers[index])}"` : ""}>${esc(cell)}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
}

const section = (title, body, extra = "") =>
  `<section class="card analysis-section ${extra}"><h2>${title}</h2>${body}</section>`;
export function analysisScreen(
  match,
  filters = {},
  report = false,
  scopeHalf = null,
) {
  // A Full Match Report is independent of an on-screen H1/map filter.
  if(report)scopeHalf=null;
  const recordedMatch=match;
  const reportData=report?fullMatchReportModel(match):null;
  if(report)match={...match,events:reportData.events};
  const status=reportStatus(match);
  const keepersMarkup = goalkeeperCards(match, { half: scopeHalf });
  if (scopeHalf !== null)
    match = {
      ...match,
      events: match.events.filter((e) => e.half === scopeHalf),
    };
  const name = (team) =>
    team === "our"
      ? match.setup.ourTeam || "Our team"
      : match.setup.opposition || "Opposition";
  const teams = ["our", "opposition"];
  const stats = Object.fromEntries(
    teams.map((team) => [team, summarize(match.events, team)]),
  );
  const shots = filterShots(match.events, report ? {} : filters);
  const mapped = shots.filter(hasLocation);
  const teamMetrics = [
    ["Goals", "goals"],
    ["Points", "points"],
    ["2-pointers", "twoPointers"],
    ["Total points", "total"],
    ["Scoring attempts", "attempts"],
    ["Successful attempts", "successful"],
    ["Unsuccessful shots", "misses"],
    [report?"Wides (subset)":"Wides", "wides"],
    ["Conversion %", "conversion"],
    [report?"Blocked attempts (subset)":"Blocked attempts", "blockedAttempts"],
    ["Defensive blocks", "defensiveBlocks"],
    ["Turnovers won", "turnoversWon"],
    ["Turnovers lost", "turnoversLost"],
    ["Interceptions", "interceptions"],
    ["Possession-related events", "possessions"],
  ];
  const reportPlayers=teams.flatMap(team=>(report?reportPlayerStatistics(match,team):playerStatistics(match,team)).map(player=>({...player,team})));
  const playerLabel=player=>`${name(player.team)} · #${player.number} ${player.name}`;
  const showPlayerSources=report && reportPlayers.some(p=>isReportShooter(p)&&scoringSourceSummary(p.scoringSources));
  const shootingRows=reportPlayers.filter(isReportShooter).map(p=>[
    playerLabel(p),p.goals,p.points,p.twoPointers,p.total,p.attempts,p.successful,p.wides,p.misses,pct(p.conversion),p.blockedAttempts,...(showPlayerSources?[scoringSourceSummary(p.scoringSources)||"—"]:[]),
  ]);
  const eventPlayers=reportPlayers.filter(hasReportEventData);
  const eventColumns=REPORT_EVENT_METRICS.filter(([,key])=>eventPlayers.some(p=>Number(p[key])>0));
  const eventRows=eventPlayers.map(p=>[playerLabel(p),...eventColumns.map(([,key])=>p[key]||0)]);
  // Retain the existing interactive analysis matrix. Report output below uses
  // statistic-specific rows; no roster/Player Review records are changed.
  const playerRows=reportPlayers.map(p=>[playerLabel(p),p.goals,p.points,p.twoPointers,p.total,p.attempts,p.wides,p.misses,pct(p.conversion),p.turnoversWon,p.turnoversLost,p.interceptions,p.kickoutInvolvement,p.blockedAttempts,p.defensiveBlocks,p.kickoutMarks,p.kickoutPossessionsWon||0,p.otherKickoutPossessionsWon||0]);
  const options = (values, current) =>
    values
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${String(current || "all") === String(value) ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  const players = teams.flatMap((team) =>
    playerStatistics(match, team).map((player) => [
      player.filterKey || `${team}:${player.number}`,
      `${name(team)} #${player.number} · ${player.name}`,
    ]),
  );
  const timeline = scoringTimeline(match.events);
  const observations = match.events.filter(
    (event) => event.dictatedNote || event.coachObservation || event.notes,
  );
  return `<div class="analysis-view ${report ? "report-view" : ""}">${scopeHalf !== null ? `<div class="inline-notice"><strong>FIRST HALF ONLY</strong> · All statistics below use H1 events. <button class="button subtle" data-view="halftime">Back to Half-Time Analysis</button></div>` : ""}<div class="page-heading"><div><p class="eyebrow">05 — MATCH ANALYSIS</p><h1>${report ? "Full Match Report" : "The game, in perspective."}</h1><p class="page-description">${report ? "A printable snapshot of the recorded match." : "Calculated from your event log. Corrections and undo update every figure."}</p></div><div class="report-actions">${report ? '<button class="button subtle" data-action="analysis-back">Back to analysis</button><button class="button subtle" data-timeline-csv>Download Timeline CSV</button><button class="button primary" data-action="print-report">Print / Save as PDF</button>' : '<button class="button primary" data-action="match-report">Full Match Report</button>'}</div></div>
  ${
    report
      ? section(
          "Match details",
          `<dl class="report-details">${[
            ["Our team", name("our")],
            ["Opposition", name("opposition")],
            ["Competition", match.setup.competition],
            ["Venue", match.setup.venue],
            ["Date", match.setup.date],
            ["Tracker / coach", match.setup.coach],
            ["Half length", `${match.setup.halfLength} minutes`],
          ]
            .map(
              ([key, value]) =>
                `<div><dt>${esc(key)}</dt><dd>${esc(value || "Not recorded")}</dd></div>`,
            )
            .join("")}</dl>`,
        )
      : ""
  }
  ${section(report ? status.scoreLabel : "Match summary", `<div class="analysis-scores">${teams.map((team) => `<div><span>${esc(name(team))}</span><strong>${gaelicScore(stats[team])}</strong><small>(${stats[team].total})</small><small>${stats[team].goals} goals · ${stats[team].points} points · ${stats[team].twoPointers} 2-pointers</small></div>`).join("")}</div><p class="small-note">${report?reportData.eventCount:match.events.length} recorded events · ${periodId(match.clock.half)} · ${report ? esc(status.label)+(reportData.excludedCount?` · ${reportData.excludedCount} entries excluded from statistics by existing eligibility rules; retained in Timeline CSV.`:"")+". Football periods are included; shootout data is separate. Full event details and original metadata are available in Timeline CSV. Statistics describe recorded events only; — means no denominator is available. Unattributed events remain in team totals, not player totals." : "No independent score totals are stored."}</p>`)}
  ${section(
    report ? "Score by period" : "Score by half",
    table(
      [report?"Period":"Half", name("our"), name("opposition")],
      [1, 2,...(report?[3,4].filter(h=>match.events.some(e=>e.half===h)):[])].map((half) => [
        report?periodId(half):`Half ${half}`,
        ...teams.map((team) =>
          score(
            summarize(
              match.events.filter((event) => event.half === half),
              team,
            ),
          ),
        ),
      ]),
    ),
  )}
  ${section(
    "Team comparison · shooting & possession",
    table(
      ["Recorded metric", name("our"), name("opposition")],
      [
        ...teamMetrics.map(([label, key]) => [
          label,
          ...teams.map((team) =>
            key === "conversion" ? pct(stats[team][key]) : stats[team][key],
          ),
        ]),
        ...SHOT_SOURCES.map(([id, label]) => [
          `Scores from ${label.toLowerCase()}`,
          ...teams.map((team) => stats[team].scoresBySource[id]),
        ]),
      ],
    ) +
      `<p class="small-note">${report?esc(SHOT_CATEGORY_NOTE)+' ':''}Conversion = successful attempts ÷ recorded attempts. Wides count only shots explicitly marked Wide; blocked attempts remain unsuccessful shots but are not wides. Possession events are counts only; no possession percentage is inferred.</p>`,
    report ? "report-team-comparison" : "",
  )}
  ${section(
    "Shot map",
    `${
      !report
        ? `<div class="shot-filters"><label class="field"><span>Shot map team</span><select id="shot-team">${options(
            [
              ["all", "Both teams"],
              ["our", name("our")],
              ["opposition", name("opposition")],
            ],
            filters.team,
          )}</select></label><label class="field"><span>Shot map half</span><select id="shot-half">${options(
            [
              ["all", "Both halves"],
              ["1", "First half"],
              ["2", "Second half"],["3", "ET1"],["4", "ET2"],
            ],
            filters.half,
          )}</select></label><label class="field"><span>Shot map player</span><select id="shot-player">${options([["all", "All players"], ...players], filters.player)}</select></label><label class="field"><span>Shot map result</span><select id="shot-result">${options(
            [
              ["all", "All attempts"],
              ["score", "Scores"],
              ["miss", "Misses"],
            ],
            filters.result,
          )}</select></label></div>`
        : ""
    } ${report&&!mapped.length?'<p class="small-note">No recorded shot locations to plot.</p>':`<div class="analysis-map-layout"><div class="analysis-pitch">${pitchMarkup(shots)}</div><div><div class="shot-legend"><span><i class="legend-goal">●</i> Goal</span><span><i class="legend-point">●</i> Point</span><span><i class="legend-two">◎</i> 2 Point</span><span><i class="legend-miss">×</i> ${report?"Unsuccessful":"Wide / Miss"}</span><span><i class="legend-blocked">▣</i> Blocked shot</span></div><p class="small-note" data-map-count>${mapped.length} plotted / ${shots.length} attempts in this selection.</p><p class="small-note">${shots.length - mapped.length} attempts have no recorded location. Legacy events remain in all statistics; no location is invented. Attacking goal is at top for both halves.</p><p class="small-note">Filters affect the shot map only. Overlapping marks may hide shots taken at the same location.</p></div></div>`}`,
    report ? "report-shot-map" : "",
  )}
  ${section("40m shooting locations", table(["Team", "Inside 40m · scores / attempts", "Inside conversion", "Outside 40m · scores / attempts", "Outside conversion", "Unclassifiable"], teams.map(team => {
    const {zones:z,invalidTwoPointers}=shotLocationAnalysis(match.events,team);
    return [name(team),`${z.inside.successful} / ${z.inside.attempts}`,pct(z.inside.conversion),`${z.outside.successful} / ${z.outside.attempts}`,pct(z.outside.conversion),`${z.unknown.attempts}${invalidTwoPointers ? ` (${invalidTwoPointers} inside-arc two-point location(s) require review)` : ''}`];
  }),"Located attempts only · team-relative attacking goal at top · 40m boundary counts outside")+'<p class="small-note">Conversion counts successful attempts, not points value. Missing, off-pitch and contradictory inside-arc two-point locations are excluded from location buckets; all attempts remain in overall statistics. Original coordinates are unchanged.</p>')}
  ${section("Defensive block locations", report ? (match.events.some(e=>isDefensiveBlockEvent(e)&&hasLocation(e))?`<div class="analysis-map-layout"><div class="analysis-pitch">${pitchMarkup(match.events.filter(isDefensiveBlockEvent),false,{mapLabel:"Defensive block map",teamName:name("opposition")})}</div><p class="small-note">Purple D marks recorded defensive blocks, not shots or automatic possession wins.</p></div>`:'<p class="small-note">No located defensive blocks recorded.</p>') : `<details class="defensive-map"><summary>Show recorded defensive blocks · ${match.events.filter(isDefensiveBlockEvent).length}</summary><div class="analysis-pitch">${pitchMarkup(match.events.filter(isDefensiveBlockEvent), false, { mapLabel: "Defensive block map", teamName: name("opposition") })}</div><p class="small-note">Purple D = Defensive Block. Locations are normalized toward the opposition attacking goal. These actions are not shot attempts or possession changes. Legacy defensive credits on opposition shots remain in the shooting map and analysis.</p></details>`)}
  ${report?'':keepersMarkup}
  ${section(
    "Kickout analysis",
    (report?reportKickoutTables(match,stats):table(
      [
        "Kicking team",
        "Total",
        "Won by us",
        "Won / retained by opposition",
        "Unknown · legacy",
        "Kicking-team retention",
        "Marks won by us",
        "Marks won by opposition",
        "Short",
        "Short won by us / known",
        "Short retention",
        "Long",
        "Long won by us / known",
        "Long retention",
        "Out of Play / Sideline",
      ],
      teams.map((team) => {
        const k = stats[team].kickouts;
        return [
          `${team === "our" ? "Our Kickouts" : "Opposition Kickouts"} · ${name(team)}`,
          k.total,
          k.won,
          k.lost,
          k.unknown,
          pct(k.retention),
          k.marksWon,
          k.marksLost,
          k.short.total,
          `${k.short.won} / ${k.short.won + k.short.lost}`,
          pct(k.short.success),
          k.long.total,
          `${k.long.won} / ${k.long.won + k.long.lost}`,
          pct(k.long.success),
          k.outOfPlay,
        ];
      }),
      "",
      true,
    )) +
      (report?'<p class="small-note">Retention uses known outcomes. Out of Play/Sideline is one kickout and a loss by the kicking team; unknown outcomes are excluded from the denominator. Marks are attributes, not extra kickouts. All recorded lengths are shown; absent categories have no recorded kickouts. Player credit is not an inferred receiver.</p>':`<p class="small-note">${report?'Stored Won/Lost outcomes use our team’s perspective; the report columns Retained and Lost by kicking team use the named kicking team’s perspective.':'Won/lost is always from our team’s perspective.'} Retention is the percentage retained by the kicking team (our wins on our kickouts, opposition wins on their kickouts), using known outcomes including Out of Play / Sideline as a loss for the kicking team (our Out of Play counts in Lost; opposition Out of Play counts in Won by us). The Out of Play figure is a subset of these losses, not an additional kickout or player possession credit. Older kicking-team results are translated on read. Marks are attributes of these kickouts, never additional events. Unrecorded or legacy Medium lengths are counted in total kickouts, not short/long. Player involvement below reflects attribution, not an inferred receiver.</p>`),
  )}
  ${report?keepersMarkup:''}
  ${report ? section("Player shooting analysis", shootingRows.length ? table(["Player","Goals","Points","2P","Total pts","Attempts","Scores","Wides (subset)","Misses (all)","Conv.","Blocked (subset)",...(showPlayerSources?["Scoring sources"]:[])],shootingRows,"Recorded shooters only · at least one attempt") : '<p class="small-note">No player-attributed shooting attempts recorded.</p>', 'player-shooting-section') + section("Player event data", eventRows.length ? table(["Player",...eventColumns.map(([label])=>label)],eventRows,"Recorded event statistics only; zero-only roster rows and empty statistic columns are omitted") + '<p class="small-note">KO events = attributed kickout involvement, not automatically possession won. KO wins = explicit possession wins; KO other = non-Mark possession wins. Interceptions and turnovers remain separate. Goalkeeper details are above; squad membership and appearances are not event statistics.</p>' : '<p class="small-note">No player-attributed event statistics recorded.</p>', 'player-event-section') : section("Player shooting & event analysis", playerRows.length ? table(["Player", "Goals", "Points", "2P", "Total pts", "Attempts", "Wides", "Misses", "Conv.", "TO won", "TO lost", "Intercept.", "Kickouts", "Blocked attempts", "Defensive blocks", "Kickout Marks", "Kickout possessions won", "Other kickout possessions won"],playerRows) : '<p class="small-note">Add players or record attributed events to populate this table.</p>')}
  ${section(
    "Half comparison",
    report ? reportHalfComparison(match) : table(
      ["Team / metric", "First half", "Second half"],
      teams.flatMap((team) =>
        [
          ["Total points", "total"],
          ["Attempts", "attempts"],
          ["Conversion", "conversion"],
          ["Kickouts", "kickouts"],
          ["Turnovers won", "turnoversWon"],
          ["Turnovers lost", "turnoversLost"],
          ["Interceptions", "interceptions"],
          ...(report?[["Defensive blocks","defensiveBlocks"],["Successful attempts","successful"],["Kickout retention","kickoutRetention"]]:[]),
          ["Possession events", "possessions"],
        ].map(([label, key]) => [
          `${name(team)} · ${label}`,
          ...[1, 2].map((half) => {
            const stat = summarize(
              match.events.filter((event) => event.half === half),
              team,
            );
            return key === "kickoutRetention" ? `${team==='our'?stat.kickouts.won:stat.kickouts.lost}/${stat.kickouts.won+stat.kickouts.lost} · ${pct(stat.kickouts.retention)}` : key === "conversion"
              ? pct(stat[key])
              : key === "kickouts"
                ? stat.kickouts.total
                : stat[key];
          }),
        ]),
      ),
    ),
  )}
  ${section(
    "Scoring timeline",
    report ? reportScoringTimeline(match) : timeline.length
      ? table(
          ["Time", "Team", "Score", "Running score"],
          timeline.map(({ event, our, opposition }) => [
            `${periodId(event.half)} ${formatTime(event.timeMs)}`,
            name(event.team),
            event.event === "two-point" ? "2 Point" : event.event,
            `${our} — ${opposition}`,
          ]),
        )
      : '<p class="small-note">No scores recorded yet.</p>',
  )}
  ${report?reportRecordsMarkup(recordedMatch,reportData):section(
    "Notes & coach observations",
    observations.length
      ? `<ol class="observation-list">${observations
          .map(
            (event) =>
              `<li><strong>${periodId(event.half)} ${formatTime(event.timeMs)} · ${esc(name(event.team))}${event.playerNumber ? ` · #${esc(event.playerNumber)}` : ""}</strong>${[
                ["Dictation", event.dictatedNote],
                ["Coach", event.coachObservation],
                ["Note", event.notes],
              ]
                .filter(([, text]) => text)
                .map(([label, text]) => `<p><b>${label}:</b> ${esc(text)}</p>`)
                .join("")}</li>`,
          )
          .join("")}</ol>`
      : '<p class="small-note">No notes or observations recorded.</p>',
  )}
  ${report?'':'<p class="small-note">Statistics describe recorded events only. “—” means no denominator is available. Unattributed events remain in team totals but cannot be assigned to a player.</p>'}</div>`;
}
