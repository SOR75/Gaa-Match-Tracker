import { playerReviews } from "./player-insights.js";
import { loadSquads } from "./squads.js";
import { esc } from "./ui.js";
export function createPlayerInsightsUI({
  repository,
  getActive,
  onChange,
  onViewMatch,
}) {
  let records = [],
    squads = [],
    selected = null,
    loading = false,
    error = "";
  async function open() {
    loading = true;
    error = "";
    onChange();
    try {
      const h = await repository.list(),
        s = loadSquads();
      records = h.records;
      squads = s.squads;
      error = [...h.warnings.map((w) => `${w.key}: ${w.error}`), s.error]
        .filter(Boolean)
        .join(" ");
    } catch (e) {
      error = e.message;
    }
    loading = false;
    onChange();
  }
  function screen() {
    const profiles = playerReviews(records, squads, getActive());
    const p = profiles.find((p) => p.playerId === selected) || profiles[0];
    const card = (label, value, key) =>
      `<div class="card"><p>${label}</p><strong ${key ? `data-review-metric="${key}"` : ""}>${value}</strong></div>`;
    return `<section data-player-review><div class="page-heading"><div><p class="eyebrow">ON THIS DEVICE · PERMANENT PLAYER IDENTITY</p><h1>PLAYER REVIEW</h1><p class="page-description">Our-team performances linked by player ID across matches. Jerseys belong to each match.</p></div><button class="button subtle" data-player-refresh>Refresh players</button></div>${error ? `<p role="status" class="warning">${esc(error)}</p>` : ""}${loading ? '<p role="status">Loading player records…</p>' : ""}${!profiles.length ? '<section class="card"><h2>No linked players yet</h2><p>Load a Saved Squad to link future match players. Legacy names/numbers are never automatically joined.</p></section>' : `<label class="field"><span>Player</span><select id="review-player">${profiles.map((q, i) => `<option value="${q.playerId}" ${q.playerId === p.playerId ? "selected" : ""}>${esc(q.name)}${q.squads.length ? ` · ${esc(q.squads.join(", "))}` : ""}${profiles.filter((v) => v.name === q.name).length > 1 ? ` · entry ${i + 1}` : ""}</option>`).join("")}</select></label><section class="card"><h2 data-review-name>${esc(p.name)}</h2><p>${esc(p.squads.join(" · ") || "Squad not recorded")}</p><p class="small-note">Participation comes from starting roles and recorded substitutions/actions in matches with play evidence. A bench listing alone is not an appearance. Did not play means no entry/action recorded in a completed match. Availability is not tracked. Older squads with more than 15 recorded starters require lineup review; they do not automatically create appearances.</p></section><div class="insights-grid">${card("Matches in squad", p.named, "named")}${card("Appearances", p.appearances, "appearances")}${card("Starts · confirmed", p.starts, "starts")}${card("Substitute appearances", p.substituteAppearances, "substituteAppearances")}${card("Did not play · completed", p.didNotPlay, "didNotPlay")}${card(`Recent form · last ${p.recent.sample} of up to 6 qualifying matches`, p.recent.sample ? `Played ${p.recent.played}/${p.recent.sample} · Started ${p.recent.started}/${p.recent.sample}` : "No qualifying matches", "recent")}${card("Attempts", p.attempts, "attempts")}${card("Shooting conversion", p.conversion === null ? "—" : p.conversion + "%", "conversion")}${card("Goals / Points / 2-pointers", `${p.goals} / ${p.points} / ${p.twoPointers}`, "scores")}${card("Misses / Blocked attempts", `${p.misses} / ${p.blockedAttempts}`, "misses")}${card("Defensive blocks", p.defensiveBlocks, "defensiveBlocks")}${card("Interceptions / Turnovers won", `${p.interceptions} / ${p.turnoversWon}`, "contributions")}${card("Kickout Marks", p.kickoutMarks, "kickoutMarks")}${card("Kickout possessions won / other wins", `${p.kickoutPossessionsWon} / ${p.otherKickoutPossessionsWon}`, "kickoutPossessionsWon")}${p.goalkeeperAppearances ? card("Goalkeeper appearances", p.goalkeeperAppearances, "goalkeeperAppearances") + card("GK kickouts retained / taken", `${p.gkRetained}/${p.gkKickouts} · ${p.gkRetention ?? "—"}%`, "gkKickouts") + card("GK Short / Long retained", `${p.gkShortRetained}/${p.gkShort} (${p.gkShortRetention ?? "—"}%) · ${p.gkLongRetained}/${p.gkLong} (${p.gkLongRetention ?? "—"}%)`, "gkLengths") + card("GK Marks / Out of Play", `${p.gkMarks} / ${p.gkOutOfPlay}`, "gkMarks") + card("GK Saves / Goals conceded", `${p.gkSaves} / ${p.gkGoalsConceded}`, "gkSaves") : ""}</div>${p.goalkeeperAppearances ? `<section class="card"><h2>Goalkeeper history · by season</h2><p class="small-note">Career totals above include all linked matches. Season groups use stored season IDs only; missing seasons are never guessed from dates.</p><div class="table-scroll"><table><thead><tr><th>Season</th><th>GK appearances</th><th>Retained / taken</th><th>Retention</th><th>Short</th><th>Long</th><th>Marks</th><th>Out of Play</th><th>Saves</th><th>Goals conceded</th></tr></thead><tbody>${p.goalkeeperSeasons.map((s) => `<tr><th>${esc(s.label)}</th><td>${s.goalkeeperAppearances}</td><td>${s.gkRetained}/${s.gkKickouts}</td><td>${s.gkRetention ?? "—"}%</td><td>${s.gkShortRetained}/${s.gkShort} (${s.gkShortRetention ?? "—"}%)</td><td>${s.gkLongRetained}/${s.gkLong} (${s.gkLongRetention ?? "—"}%)</td><td>${s.gkMarks}</td><td>${s.gkOutOfPlay}</td><td>${s.gkSaves}</td><td>${s.gkGoalsConceded}</td></tr>`).join("")}</tbody></table></div></section>` : ""}<section class="card"><h2>Match-by-match record</h2><div class="table-scroll"><table><thead><tr><th>Date / Opponent</th><th>Jersey</th><th>Participation</th><th>Score</th><th>Shooting</th><th>Other contributions</th><th></th></tr></thead><tbody>${p.matches.map((m) => `<tr data-review-match="${esc(m.matchId)}"><th>${esc(m.date || "Date unknown")} · ${esc(m.opponent)}${m.current ? " · Current" : ""}</th><td>#${m.jersey ?? "—"}</td><td>${m.started ? "Started" : m.substituteAppearance ? "Substitute appearance" : m.appeared ? "Appearance · role unverified" : m.didNotPlay ? "Did not play" : "No appearance recorded"}<small> · ${esc(m.evidence)}</small></td><td>${m.goals}G · ${m.points}P · ${m.twoPointers} × 2P (${m.total})</td><td>${m.successful}/${m.attempts} · ${m.misses} misses · ${m.blockedAttempts} blocked</td><td>${m.defensiveBlocks} defensive blocks · ${m.interceptions} interceptions · ${m.turnoversWon} TO won · ${m.kickoutMarks} Marks · ${m.turnoversLost} TO lost · ${m.possessions} possessions · ${m.kickoutInvolvement} kickout involvements</td><td><button class="button subtle" data-review-open="${esc(m.matchId)}">View match</button></td></tr>`).join("")}</tbody></table></div>${!p.matches.length ? "<p>No qualifying linked matches yet.</p>" : ""}</section>`}</section>`;
  }
  return {
    open,
    screen,
    click: (b) => {
      if (b.hasAttribute("data-player-refresh")) void open();
      if (b.dataset.reviewOpen) void onViewMatch(b.dataset.reviewOpen);
    },
    change: (t) => {
      if (t.id === "review-player") {
        selected = t.value;
        onChange();
      }
    },
  };
}
