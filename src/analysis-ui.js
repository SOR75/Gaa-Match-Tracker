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
function table(headers, rows, caption = "") {
  return `<div class="table-scroll"><table>${caption ? `<caption>${esc(caption)}</caption>` : ""}<thead><tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => (index === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const section = (title, body, extra = "") =>
  `<section class="card analysis-section ${extra}"><h2>${title}</h2>${body}</section>`;
export function analysisScreen(match, filters = {}, report = false) {
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
    ["Wides", "wides"],
    ["Conversion %", "conversion"],
    ["Blocked attempts", "blockedAttempts"],
    ["Defensive blocks", "defensiveBlocks"],
    ["Turnovers won", "turnoversWon"],
    ["Turnovers lost", "turnoversLost"],
    ["Interceptions", "interceptions"],
    ["Possession-related events", "possessions"],
  ];
  const playerRows = teams.flatMap((team) =>
    playerStatistics(match, team).map((player) => [
      `${name(team)} · #${player.number} ${player.name}`,
      player.goals,
      player.points,
      player.twoPointers,
      player.total,
      player.attempts,
      player.wides,
      player.misses,
      pct(player.conversion),
      player.turnoversWon,
      player.turnoversLost,
      player.interceptions,
      player.kickoutInvolvement,
      player.blockedAttempts,
      player.defensiveBlocks,
      player.kickoutMarks,
    ]),
  );
  const options = (values, current) =>
    values
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${String(current || "all") === String(value) ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  const players = teams.flatMap((team) =>
    playerStatistics(match, team).map((player) => [
      `${team}:${player.number}`,
      `${name(team)} #${player.number} · ${player.name}`,
    ]),
  );
  const timeline = scoringTimeline(match.events);
  const observations = match.events.filter(
    (event) => event.dictatedNote || event.coachObservation || event.notes,
  );
  return `<div class="analysis-view ${report ? "report-view" : ""}"><div class="page-heading"><div><p class="eyebrow">05 — MATCH ANALYSIS</p><h1>${report ? "Match report" : "The game, in perspective."}</h1><p class="page-description">${report ? "A printable snapshot of the recorded match." : "Calculated from your event log. Corrections and undo update every figure."}</p></div><div class="report-actions">${report ? '<button class="button subtle" data-action="analysis-back">Back to analysis</button><button class="button primary" data-action="print-report">Print / Save as PDF</button>' : '<button class="button primary" data-action="match-report">Match Report</button>'}</div></div>
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
  ${section(report ? "Recorded score — current / final" : "Match summary", `<div class="analysis-scores">${teams.map((team) => `<div><span>${esc(name(team))}</span><strong>${gaelicScore(stats[team])}</strong><small>(${stats[team].total})</small><small>${stats[team].goals} goals · ${stats[team].points} points · ${stats[team].twoPointers} 2-pointers</small></div>`).join("")}</div><p class="small-note">${match.events.length} recorded events · ${match.clock.half === 1 ? "First" : "Second"} half · ${report ? "Report uses all recorded events; no full-time status is assumed." : "No independent score totals are stored."}</p>`)}
  ${section(
    "Score by half",
    table(
      ["Half", name("our"), name("opposition")],
      [1, 2].map((half) => [
        `Half ${half}`,
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
      '<p class="small-note">Conversion = successful attempts ÷ recorded attempts. Wides count only shots explicitly marked Wide; blocked attempts remain unsuccessful shots but are not wides. Possession events are counts only; no possession percentage is inferred.</p>',
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
              ["2", "Second half"],
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
    }<div class="analysis-map-layout"><div class="analysis-pitch">${pitchMarkup(shots)}</div><div><div class="shot-legend"><span><i class="legend-goal">●</i> Goal</span><span><i class="legend-point">●</i> Point</span><span><i class="legend-two">◎</i> 2 Point</span><span><i class="legend-miss">×</i> Wide / Miss</span><span><i class="legend-blocked">▣</i> Blocked shot</span></div><p class="small-note" data-map-count>${mapped.length} plotted / ${shots.length} attempts in this selection.</p><p class="small-note">${shots.length - mapped.length} attempts have no recorded location. Legacy events remain in all statistics; no location is invented. Attacking goal is at top for both halves.</p><p class="small-note">Filters affect the shot map only. Overlapping marks may hide shots taken at the same location.</p></div></div>`,
  )}
  ${section("Defensive block locations", `<details class="defensive-map"><summary>Show recorded defensive blocks · ${match.events.filter(isDefensiveBlockEvent).length}</summary><div class="analysis-pitch">${pitchMarkup(match.events.filter(isDefensiveBlockEvent), false, { mapLabel: "Defensive block map", teamName: name("opposition") })}</div><p class="small-note">Purple D = Defensive Block. Locations are normalized toward the opposition attacking goal. These actions are not shot attempts or possession changes. Legacy defensive credits on opposition shots remain in the shooting map and analysis.</p></details>`)}
  ${section(
    "Kickout analysis",
    table(
      [
        "Kicking team",
        "Total",
        "Won by us",
        "Won / retained by opposition",
        "Unknown",
        "Kicking-team retention",
        "Marks won by us",
        "Marks won by opposition",
        "Short",
        "Short won by us / known",
        "Short retention",
        "Long",
        "Long won by us / known",
        "Long retention",
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
        ];
      }),
    ) +
      '<p class="small-note">Won/lost is always from our team’s perspective. Retention is the percentage retained by the kicking team (our wins on our kickouts, opposition wins on their kickouts), using known outcomes only. Older kicking-team results are translated on read. Marks are attributes of these kickouts, never additional events. Unrecorded or legacy Medium lengths are counted in total kickouts, not short/long. Player involvement below reflects attribution, not an inferred receiver.</p>',
  )}
  ${section("Player shooting & event analysis", playerRows.length ? table(["Player", "Goals", "Points", "2P", "Total pts", "Attempts", "Wides", "Misses", "Conv.", "TO won", "TO lost", "Intercept.", "Kickouts", "Blocked attempts", "Defensive blocks", "Kickout Marks"], playerRows) : '<p class="small-note">Add players or record attributed events to populate this table.</p>')}
  ${section(
    "Half comparison",
    table(
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
          ["Possession events", "possessions"],
        ].map(([label, key]) => [
          `${name(team)} · ${label}`,
          ...[1, 2].map((half) => {
            const stat = summarize(
              match.events.filter((event) => event.half === half),
              team,
            );
            return key === "conversion"
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
    timeline.length
      ? table(
          ["Time", "Team", "Score", "Running score"],
          timeline.map(({ event, our, opposition }) => [
            `H${event.half} ${formatTime(event.timeMs)}`,
            name(event.team),
            event.event === "two-point" ? "2 Point" : event.event,
            `${our} — ${opposition}`,
          ]),
        )
      : '<p class="small-note">No scores recorded yet.</p>',
  )}
  ${section(
    "Notes & coach observations",
    observations.length
      ? `<ol class="observation-list">${observations
          .map(
            (event) =>
              `<li><strong>H${event.half} ${formatTime(event.timeMs)} · ${esc(name(event.team))}${event.playerNumber ? ` · #${esc(event.playerNumber)}` : ""}</strong>${[
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
  <p class="small-note">Statistics describe recorded events only. “—” means no denominator is available. Unattributed events remain in team totals but cannot be assigned to a player.</p></div>`;
}
