import { goalkeeperStatistics } from "./goalkeepers.js";
import { formatTime } from "./domain.js";
import { esc } from "./ui.js";
export function goalkeeperCards(match, { half = null } = {}) {
  const stats = goalkeeperStatistics(match, { half });
  const pct = (n) => (n === null ? "—" : `${n}%`);
  return `<section class="card analysis-section" data-goalkeepers><h2>Goalkeepers</h2>${
    stats.length
      ? `<div class="goalkeeper-cards">${stats
          .map((g) => {
            const roster =
              g.team === "our" ? match.players : match.oppositionPlayers;
            const player = roster.find(
              (p) =>
                (p.matchPlayerId || p.id) === g.matchPlayerId &&
                (p.playerId || null) === (g.playerId || null),
            );
            const metrics = [
              [
                "Time in goal",
                g.gkTimeMs === null
                  ? "Unavailable — half-end clock not recorded"
                  : `${formatTime(g.gkTimeMs)} recorded`,
                "time",
              ],
              ["Kickouts taken", g.gkKickouts, "taken"],
              [
                "Retained",
                `${g.gkRetained} · ${pct(g.gkRetention)}`,
                "retained",
              ],
              ["Lost", g.gkLost, "lost"],
              [
                "Short retained / taken",
                `${g.gkShortRetained}/${g.gkShort} · ${pct(g.gkShortRetention)}`,
                "short",
              ],
              [
                "Long retained / taken",
                `${g.gkLongRetained}/${g.gkLong} · ${pct(g.gkLongRetention)}`,
                "long",
              ],
              ["Marks generated", g.gkMarks, "marks"],
              ["Out of Play / Sideline", g.gkOutOfPlay, "out"],
              ["Saves", g.gkSaves, "saves"],
              ["Goals conceded", g.gkGoalsConceded, "conceded"],
            ];
            return `<article class="goalkeeper-card" data-gk-card="${g.team}:${esc(g.matchPlayerId)}"><h3>#${g.jerseyNumber ?? "—"} ${esc(player?.name || g.nameSnapshot)}</h3><p class="small-note">${esc(g.team === "our" ? match.setup.ourTeam || "Our team" : match.setup.opposition || "Opposition")} · Goalkeeper</p><dl>${metrics.map(([label, value, key]) => `<div><dt>${label}</dt><dd data-gk-metric="${key}">${esc(String(value))}</dd></div>`).join("")}</dl></article>`;
          })
          .join(
            "",
          )}</div><p class="small-note">Derived from recorded keeper periods and events. Retention uses all attributed kickouts; Marks are not additional events. Time uses the match clock, including recorded added time; an unrecorded half boundary remains unknown.</p>`
      : '<p class="small-note">No starting goalkeeper snapshot is available for this match. New matches identify a numbered #1 starter automatically; older or unidentified starts remain unattributed.</p>'
  }</section>`;
}
