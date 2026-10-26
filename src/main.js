import { openDefensiveBlockDetails } from "./defensive-block-capture.js";
import { isDefensiveBlockEvent } from "./defensive-blocks.js";
import {
  openKickoutCapture,
  kickoutFieldsMarkup,
  kickoutFormFields,
} from "./kickout-capture.js";
import { kickoutDetails, kickoutLabel } from "./kickouts.js";
import { openShotDetails, shotFieldsMarkup } from "./shot-capture.js";
import { gaelicScore, isBlockedShot } from "./shots.js";
import "./style.css";
import {
  EVENT_TYPES,
  eventType,
  uid,
  elapsedMs,
  formatTime,
  toggleClock,
  totals,
  createEvent,
  saveEvent,
  undoEvent,
  playersFor,
  isShot,
  isKickout,
} from "./domain.js";
import { loadMatch, persistMatch, startBlankMatch } from "./storage.js";
import { openNoteCapture } from "./capture.js";
import {
  squadTools,
  openSaveSquad,
  openSquadLibrary,
  openImportReview,
  openPasteImport,
} from "./squad-ui.js";
import { analysisScreen } from "./analysis-ui.js";
import { noteMarkup, bindSpeech } from "./speech.js";
import { hasLocation } from "./pitch.js";
import {
  createTapGuard,
  onFieldNumbers,
  attackingDirection,
} from "./matchday.js";
import { createVoiceMatch } from "./voice-match.js";
import { openSubstitution } from "./substitution.js";

const icons = {
  pitch:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 12h14M9 3v4h6V3M9 21v-4h6v4"/><circle cx="12" cy="12" r="3"/>',
  setup:
    '<path d="M9 3h6v4H9zM9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M8 12h8M8 16h5"/>',
  squad:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  live: '<path d="m9 5 11 7-11 7z"/>',
  timeline:
    '<path d="M8 5h12M8 12h12M8 19h12"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m9 8 6 1 1 6-6 2-4-5zM9 8l-1-4M15 9l5-2M16 15l3 3M10 17l-1 4M6 12l-3 1"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  block: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM7 12h10"/',
  miss: '<path d="M5 19 19 5M9 5h10v10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.ball}</svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const app = document.querySelector("#app");
const loaded = loadMatch();
let match = loaded.match;
let storageError = loaded.error;
let view =
  match &&
  (match.events.length ||
    match.clock.startedAt !== null ||
    match.clock.elapsedMs > 0)
    ? "live"
    : "setup";
let selectedTeam = match?.recordingTeam === "opposition" ? "opposition" : "our";
let playerEditing = null;
let squadTeam = "our";
let analysisFilters = {
  team: "all",
  half: "all",
  player: "all",
  result: "all",
};
let reportMode = false;
const setPlayers = (players) => {
  match[squadTeam === "our" ? "players" : "oppositionPlayers"] = players;
};
let toastTimer;
let timelineTeam = "all";
let timelineKind = "all";
let voiceMode = false;
let offlineStatus = import.meta.env.PROD
  ? "Offline cache not yet verified"
  : "Development mode — use production build for offline";
const acceptTap = createTapGuard();
function recordEvent(event) {
  match.events = saveEvent(match.events, event);
  persist();
  render();
  toast(`${eventType(event.event).label} recorded`);
}
function enrichShot(event) {
  openShotDetails(
    document.querySelector("#event-dialog"),
    structuredClone(event),
    match,
    (details) => {
      const current = match.events.find((item) => item.id === details.id);
      if (!current) return;
      match.events = saveEvent(match.events, {
        ...current,
        playerNumber: details.playerNumber,
        shotX: details.shotX,
        shotY: details.shotY,
        shotSource: details.shotSource,
        missReason: details.missReason,
        blockedByNumber: details.blockedByNumber,
      });
      persist();
    },
    () => render(),
  );
}
function enrichDefensiveBlock(event) {
  openDefensiveBlockDetails(
    document.querySelector("#event-dialog"),
    structuredClone(event),
    match,
    (details) => {
      const current = match.events.find((e) => e.id === details.id);
      if (!current) return;
      match.events = saveEvent(match.events, {
        ...current,
        playerNumber: details.playerNumber,
        shotX: details.shotX,
        shotY: details.shotY,
      });
      persist();
    },
    () => render(),
  );
}
function saveEventNote(event) {
  if (!match) return;
  const current = match.events.find((item) => item.id === event.id);
  if (!current) return;
  match.events = saveEvent(match.events, {
    ...current,
    notes: event.notes,
    dictatedNote: event.dictatedNote,
  });
  persist();
}
const voice = createVoiceMatch({
  getMatch: () => match,
  getTeam: () => selectedTeam,
  onSave: recordEvent,
});
const ready = () => match.setup.ourTeam.trim() && match.setup.opposition.trim();
const teamName = (team) =>
  team === "our"
    ? match.setup.ourTeam || "Our team"
    : match.setup.opposition || "Opposition";
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "—";

function persist() {
  storageError = persistMatch(match);
  refreshSaveStatus();
}
function refreshSaveStatus() {
  document.querySelectorAll("[data-save-status]").forEach((node) => {
    node.classList.toggle("save-error", Boolean(storageError));
    node.innerHTML = storageError
      ? "Save failed"
      : `${icon("check")} Saved on this device`;
  });
  const banner = document.querySelector("#storage-warning");
  if (banner) {
    banner.hidden = !storageError;
    banner.textContent = storageError;
  }
}
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 3500);
}
function render() {
  voice.dispose();
  app.dataset.view = view;
  if (!match) {
    app.innerHTML = `<main class="recovery"><div class="brand-mark">${icon("pitch")}</div><h1>Saved match needs recovery</h1><p class="warning">${esc(storageError)}</p><p>No saved data has been overwritten.</p></main>`;
    return;
  }
  const tabs = [
    ["setup", "setup", "Match setup"],
    ["squad", "squad", "Squad"],
    ["live", "pitch", "Live match"],
    ["timeline", "timeline", "Timeline"],
    ["analysis", "setup", "Match analysis"],
  ];
  app.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#setup" aria-label="Sideline match setup"><span class="brand-mark">${icon("pitch")}</span><span>sideline<span class="brand-sub">GAELIC MATCH TRACKER</span></span></a>
      <div class="workspace-label">YOUR MATCH</div>
      <nav class="navigation" aria-label="Main navigation">${tabs.map(([id, glyph, label], index) => `<button class="nav-item ${view === id ? "active" : ""}" data-view="${id}" ${view === id ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${label}</span><span class="nav-number" aria-hidden="true">0${index + 1}</span></button>`).join("")}</nav>
      <div class="sidebar-bottom"><span class="local-dot"></span><div>Made for the sideline<small>Your match stays on this device.</small></div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><span class="build-tag">V0.3.5-dev</span><span class="breadcrumb">Match workspace <span>/</span> <strong>${tabs.find((tab) => tab[0] === view)[2]}</strong></span><span class="save-status" data-save-status></span></header>
      <main id="main"><p id="storage-warning" class="warning" role="alert" hidden></p>${view === "setup" ? setupScreen() : view === "squad" ? squadScreen() : view === "live" ? liveScreen() : view === "timeline" ? timelineScreen() : analysisScreen(match, analysisFilters, reportMode)}</main>
      <footer class="actionbar"><div class="last-event">${lastEventSummary()}</div><div class="history-actions"><button class="button subtle" data-action="edit-last" aria-label="Edit last event" ${match.events.length ? "" : "disabled"}>${icon("edit")}<span>Edit last<span class="wide-label"> event</span></span></button><button class="button undo" data-action="undo" aria-label="Undo last event" ${match.events.length ? "" : "disabled"}>${icon("undo")}<span>Undo last<span class="wide-label"> event</span></span></button></div></footer>
    </div>
    <dialog id="event-dialog" aria-labelledby="event-dialog-title"></dialog>
  `;
  refreshSaveStatus();
  updateClock();
  if (view === "live" && voiceMode)
    voice.mount(document.querySelector("#voice-match-panel"));
}
function heading(kicker, title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="page-description">${description}</p></div>${action}</div>`;
}
function input(label, name, value, extra = "", type = "text") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function setupScreen() {
  const setup = match.setup;
  return `${heading("BEFORE THE THROW-IN", "Every match starts here.", "Set the scene. Add your squad. Be ready when the ball is.")}<div class="setup-layout">
    <section class="card setup-card"><div class="card-heading"><div class="section-icon">${icon("setup")}</div><div><h2>Match details</h2><p>The essentials for your day on the sideline.</p></div><span class="step-tag">STEP 01</span></div>
      <form id="setup-form"><div class="form-section-label">THE TEAMS <span>Required</span></div><div class="teams-fields">${input("Our team", "ourTeam", setup.ourTeam, 'placeholder="Enter your team name" required maxlength="80" autocomplete="off"')}<span class="versus">VS</span>${input("Opposition", "opposition", setup.opposition, 'placeholder="Enter opposition name" required maxlength="80" autocomplete="off"')}</div>
      <div class="form-divider"></div><div class="form-section-label">THE OCCASION</div><div class="form-grid">${input("Competition", "competition", setup.competition, 'placeholder="e.g. Senior championship" maxlength="100"')}${input("Venue", "venue", setup.venue, 'placeholder="Where are we playing?" maxlength="100"')}${input("Match date", "date", setup.date, "", "date")}<label class="field"><span>Half length</span><div class="input-suffix"><input name="halfLength" type="number" inputmode="numeric" min="1" max="90" step="1" required value="${setup.halfLength}"><span>minutes</span></div></label>${input("Tracker / Coach", "coach", setup.coach, 'placeholder="Your name" maxlength="80"')}</div>
      <label class="field direction-setting"><span>Our team attacks in first half (pitch display)</span><select name="ourFirstHalfAttacks" aria-label="Our first-half attacking goal"><option value="top" ${(setup.ourFirstHalfAttacks || "top") === "top" ? "selected" : ""}>Top goal</option><option value="bottom" ${setup.ourFirstHalfAttacks === "bottom" ? "selected" : ""}>Bottom goal</option></select><small>Opposition attacks the other goal; directions reverse in the second half. Stored locations do not change.</small></label><div class="form-end"><span class="form-hint">${icon("check")} Details save as you go</span><button class="button primary" type="submit">Continue to squad ${icon("arrow")}</button></div></form>
    </section>
    <aside class="setup-aside"><div class="match-preview"><div class="preview-top"><span class="eyebrow">MATCH DAY</span>${icon("pitch")}</div><div class="preview-teams"><span class="team-crest" id="preview-crest">${esc(initials(setup.ourTeam))}</span><h2 id="preview-our">${esc(setup.ourTeam || "Your team")}</h2><span class="preview-vs">versus</span><h2 id="preview-opposition">${esc(setup.opposition || "The opposition")}</h2></div><div class="preview-bottom"><span>${icon("clock")} <span id="preview-length">${setup.halfLength}</span> min / half</span><span>GAELIC FOOTBALL</span></div></div>
    <div class="quiet-note"><span class="section-icon">${icon("check")}</span><div><h3>Focus on the game.</h3><p>Your match and every event save automatically on this device. No account. No distractions.</p></div></div><p class="device-note">Keep this browser’s data to keep your match. Private browsing may not retain it.</p></aside></div><button class="button subtle new-match" data-action="new-match">Start a new blank match</button>`;
}
function squadScreen() {
  const squad = playersFor(match, squadTeam);
  const player = squad.find((item) => item.id === playerEditing);
  const active = onFieldNumbers(match, squadTeam);
  const starters = squad.filter((item) => item.role === "starter").length;
  return `${heading("KNOW YOUR SQUAD", "Numbers. Names. Ready.", "Add your players, or head straight to the match. You can return at any time.", `<button class="button primary" data-action="go-live">Go to live match ${icon("arrow")}</button>`)}
  ${squadTools(match, squadTeam)}<p class="small-note">Tap a role to adjust the actual starting lineup without deleting players. Current on-field players are calculated from these roles plus substitution events. During play, record a substitution for an on/off change.</p><div class="squad-layout"><section class="card player-entry"><div class="card-heading"><div class="section-icon">${icon("squad")}</div><div><h2>${player ? "Edit player" : "Add a player"}</h2><p>Your squad starts with a blank sheet.</p></div></div><form id="player-form"><div class="form-grid">${input("Jersey number", "number", player?.number ?? "", 'min="1" max="99" step="1" inputmode="numeric" placeholder="Blank or 1–99"', "number")}${input("Player name", "name", player?.name ?? "", 'required maxlength="80" placeholder="Full name" autocomplete="off"')}</div><label class="field"><span>Match role</span><select name="role"><option value="starter" ${!player || player.role === "starter" ? "selected" : ""}>Starter</option><option value="substitute" ${player?.role === "substitute" ? "selected" : ""}>Substitute</option><option value="panel" ${player?.role === "panel" ? "selected" : ""}>Panel · not selected</option></select></label>${input("Position", "position", player?.position ?? "", 'placeholder="e.g. Full forward" maxlength="60"')}<label class="field"><span>Notes <small>Optional</small></span><textarea name="notes" rows="3" maxlength="2000" placeholder="Anything to keep in mind">${esc(player?.notes ?? "")}</textarea></label><div class="player-form-actions">${player ? '<button class="button subtle" type="button" data-action="cancel-player">Cancel</button>' : ""}<button class="button primary" type="submit">${icon(player ? "check" : "plus")}${player ? "Save player" : "Add player"}</button></div></form></section>
  <section class="card squad-list"><div class="card-heading"><div><h2>Your squad <span class="count-badge">${squad.length}</span></h2><p>${starters} named starters · ${squad.filter((player) => player.role === "substitute").length} substitutes · ${squad.filter((player) => player.role === "panel").length} unselected panel · ${active.size} currently on field</p></div></div>${
    squad.length
      ? `<div class="player-rows">${[...squad]
          .sort((a, b) => (a.number ?? 1000) - (b.number ?? 1000))
          .map(
            (item) =>
              `<div class="player-row"><span class="jersey">${item.number ?? "—"}</span><div class="player-info"><strong>${esc(item.name)}</strong><span>${item.role === "starter" ? "Starter" : item.role === "panel" ? "Panel · not selected" : "Substitute"}${item.position ? ` · ${esc(item.position)}` : ""}</span>${item.notes ? `<small>${esc(item.notes)}</small>` : ""}</div><button class="button lineup-toggle" data-lineup-player="${item.id}" aria-label="${item.role === "starter" ? "Make substitute" : "Make starter"} ${esc(item.name)}">${item.role === "starter" ? "Starter ✓" : item.role === "panel" ? "Panel" : "Substitute"}${active.has(String(item.number)) ? " · on field" : ""}</button><button class="icon-button" data-edit-player="${item.id}" aria-label="Edit ${esc(item.name)}">${icon("edit")}</button><button class="icon-button" data-delete-player="${item.id}" aria-label="Remove ${esc(item.name)}">${icon("close")}</button></div>`,
          )
          .join("")}</div>`
      : `<div class="empty-state"><span class="empty-icon">${icon("squad")}</span><h3>A blank team sheet.</h3><p>Add your first player using the form.<br>Only the players you enter will appear here.</p></div>`
  }</section></div>`;
}
function scoreboard() {
  const score = (team) => {
    const tally = totals(match.events, team);
    return `<div class="score-team ${team}"><span class="score-team-label">${team === "our" ? "OUR TEAM" : "OPPOSITION"}</span><h2>${esc(teamName(team))}</h2><div class="score-total">${gaelicScore(tally)}</div><div class="score-calculated" aria-label="Calculated total points">(${tally.total})</div><div class="score-breakdown"><span><b>${tally.goals}</b> goals</span><span><b>${tally.points}</b> points</span><span><b>${tally.twoPointers}</b> 2-pointers</span></div></div>`;
  };
  return `<section class="scoreboard" aria-label="Live scoreboard">${score("our")}<div class="score-clock"><span class="half-label">${match.clock.half === 1 ? "FIRST" : "SECOND"} HALF</span><div class="clock-digits" data-clock>${formatTime(elapsedMs(match.clock))}</div><span class="clock-status" data-clock-status></span><button class="clock-button" data-action="clock" aria-label="${match.clock.startedAt === null ? "Start clock" : "Pause clock"}">${match.clock.startedAt === null ? `${icon("live")} Start clock` : '<span class="pause-icon">Ⅱ</span> Pause clock'}</button><button class="half-button" data-action="half">${match.clock.half === 1 ? "Start second half" : "Return to first half"}</button></div>${score("opposition")}<span class="score-save-status" data-save-status></span></section>`;
}
function liveScreen() {
  return `${heading("FROM THE SIDELINE", "Every moment counts.", "Tap an event. Keep your eyes on the game.", `<span class="match-status"><span class="local-dot"></span>${match.clock.startedAt === null ? "MATCH WORKSPACE" : "LIVE TRACKING"}</span>`)}
    ${!ready() ? `<div class="inline-notice">Add both team names in Match setup before recording events. <button data-view="setup">Go to setup ${icon("arrow")}</button></div>` : ""}
    <div class="matchday-toolbar"><span class="build-tag">V0.3.5-dev</span><button class="button microphone" data-action="voice-mode" aria-pressed="${voiceMode}">${icon("mic")} Voice Match Mode ${voiceMode ? "ON" : "OFF"}</button><span class="small-note" data-offline-status>${esc(offlineStatus)}</span></div>
    ${scoreboard()}
    ${voiceMode ? '<section class="card voice-match-panel" id="voice-match-panel"></section>' : ""}
    <section class="event-controls recording-${selectedTeam}"><div class="recording-team" role="status">Recording for: <strong>${esc(teamName(selectedTeam))}</strong></div><div class="controls-heading"><div><h2>Record an event</h2><p>Shots save on one tap. Optional pitch/details open after saving.<br>${esc(teamName(selectedTeam))} attacks the ${attackingDirection(match, selectedTeam, match.clock.half).toUpperCase()} goal this half.</p></div><div class="team-toggle" role="group" aria-label="Event team"><button data-team="our" aria-pressed="${selectedTeam === "our"}" class="${selectedTeam === "our" ? "selected" : ""}">${esc(teamName("our"))}</button><button data-team="opposition" aria-pressed="${selectedTeam === "opposition"}" class="${selectedTeam === "opposition" ? "selected" : ""}">${esc(teamName("opposition"))}</button></div></div>
    <div class="scoring-grid">${EVENT_TYPES.slice(0, 4)
      .map(
        (type, index) =>
          `<button class="event-button score-event ${index === 0 ? "goal-event" : ""} ${index === 3 ? "miss-event" : ""}" data-event="${type.id}" ${ready() ? "" : "disabled"}><span class="event-glyph">${index === 3 ? icon("miss") : icon("ball")}</span><strong>${type.label}</strong><span class="event-value">${type.value ? `+${type.value} ${type.value === 1 ? "point" : "points"}` : "No score"}</span></button>`,
      )
      .join("")}</div>
    <div class="form-section-label event-section-label">BUILD-UP & POSSESSION <span>Tap to log · edit details afterwards</span></div><div class="other-events">${EVENT_TYPES.slice(
      4,
    )
      .map(
        (type) =>
          `<button class="event-button compact-event" data-event="${type.id}" ${ready() ? "" : "disabled"}>${icon(type.id === "defensive-block" ? "block" : type.id.includes("kickout") ? "arrow" : type.id === "possession" ? "ball" : "pitch")}<strong>${type.quickLabel || type.label}</strong></button>`,
      )
      .join("")}</div></section>
    ${match.events.length && isShot(match.events.at(-1)) ? '<button class="button subtle shot-enrich" data-action="enrich-shot">Add player / location to last shot (optional)</button>' : ""}
    <div class="live-note-bar"><button class="button microphone" data-action="live-note" ${match.events.length ? "" : "disabled"}>${icon("mic")} Add / dictate note to last event</button><span class="small-note">Optional · no detailed editor needed</span></div><section class="card recent-card"><div class="recent-heading"><h2>Latest events <span class="count-badge">${match.events.length}</span></h2><button class="text-button" data-view="timeline">View timeline ${icon("arrow")}</button></div>${
      match.events.length
        ? match.events
            .slice(-3)
            .reverse()
            .map((event) => eventRow(event))
            .join("")
        : '<p class="recent-empty">The whistle hasn’t gone yet. Your first event will appear here.</p>'
    }</section>`;
}
function eventRow(event) {
  const type = eventType(event.event);
  const label = isBlockedShot(event) ? "Shot · Blocked" : type.label;
  const player = playersFor(match, event.team).find(
    (item) => String(item.number) === String(event.playerNumber),
  );
  return `<button class="event-row" data-edit-event="${event.id}" aria-label="Edit ${esc(label)} at ${formatTime(event.timeMs)}"><span class="event-time">${formatTime(event.timeMs)}<small>H${event.half}</small></span><span class="timeline-dot ${event.team} ${isDefensiveBlockEvent(event) ? "defensive-block" : isBlockedShot(event) ? "blocked-shot" : ""}">${icon(isDefensiveBlockEvent(event) ? "block" : type.value ? "ball" : "pitch")}</span><span class="event-info"><strong>${esc(label)} ${event.event === "substitution" ? `<span class="player-chip">ON #${esc(event.playerOn)} / OFF #${esc(event.playerOff)}</span>` : ""} ${event.playerNumber ? `<span class="player-chip">#${esc(event.playerNumber)}</span>` : ""}</strong><span>${esc(teamName(event.team))}${player ? ` · ${esc(player.name)}` : ""}${isKickout(event) ? ` · ${esc(kickoutLabel(event))}${kickoutDetails(event).markPlayerNumber ? ` · Mark #${kickoutDetails(event).markPlayerNumber}` : ""}` : !type.value && event.outcome ? ` · ${esc(event.outcome)}` : ""}</span>${event.notes || event.dictatedNote ? `<small>${esc([event.notes, event.dictatedNote].filter(Boolean).join(" · "))}</small>` : ""}${(isBlockedShot(event) || isDefensiveBlockEvent(event)) && hasLocation(event) ? "<small>Pitch location recorded</small>" : ""}</span>${type.value && event.outcome === "scored" ? `<span class="event-score">+${type.value}</span>` : ""}<span class="row-edit">${icon("edit")}</span></button>`;
}
function timelineScreen() {
  const filtered = match.events
    .filter(
      (event) =>
        (timelineTeam === "all" || event.team === timelineTeam) &&
        (timelineKind === "all" ||
          (timelineKind === "scores"
            ? eventType(event.event).value > 0
            : eventType(event.event).value === 0)),
    )
    .slice()
    .sort((a, b) => b.half - a.half || b.timeMs - a.timeMs);
  return `${heading("THE STORY OF THE MATCH", "Every event. In order.", "Your event log is the source of truth. Tap any event to review or edit it.", `<span class="total-events">${match.events.length} events recorded</span>`)}
    <section class="card timeline-card"><div class="timeline-toolbar"><h2>Event timeline</h2><div class="timeline-filters"><label class="sr-only" for="timeline-team">Filter team</label><select id="timeline-team"><option value="all">Both teams</option><option value="our" ${timelineTeam === "our" ? "selected" : ""}>${esc(teamName("our"))}</option><option value="opposition" ${timelineTeam === "opposition" ? "selected" : ""}>${esc(teamName("opposition"))}</option></select><label class="sr-only" for="timeline-kind">Filter event type</label><select id="timeline-kind"><option value="all">All events</option><option value="scores" ${timelineKind === "scores" ? "selected" : ""}>Scores</option><option value="other" ${timelineKind === "other" ? "selected" : ""}>Other events</option></select></div></div>${
      filtered.length
        ? [2, 1]
            .map((half) => {
              const events = filtered.filter((event) => event.half === half);
              return events.length
                ? `<div class="timeline-half"><span>${half === 1 ? "FIRST" : "SECOND"} HALF</span><span>${events.length} events</span></div>${events.map(eventRow).join("")}`
                : "";
            })
            .join("")
        : `<div class="empty-state"><span class="empty-icon">${icon("timeline")}</span><h3>${match.events.length ? "No matching events." : "Your match story starts here."}</h3><p>${match.events.length ? "Try another filter to see more of the match." : "Record an event on the Live match screen.<br>Scores and the timeline will update together."}</p><button class="button primary" data-view="live">Go to live match ${icon("arrow")}</button></div>`
    }</section><p class="timeline-note">Most recent match time first · Edits recalculate the scoreboard automatically.</p>`;
}
function lastEventSummary() {
  const last = match.events.at(-1);
  return last
    ? `<span class="footer-dot"></span><div><span class="last-label">LAST RECORDED</span><strong>${esc(isBlockedShot(last) ? "Shot · Blocked" : eventType(last.event).label)} <span>· ${formatTime(last.timeMs)} · H${last.half}</span></strong></div>`
    : `<span class="footer-dot muted"></span><div><span class="last-label">READY WHEN YOU ARE</span><strong>No events recorded yet</strong></div>`;
}
function updateClock() {
  if (!match) return;
  const time = elapsedMs(match.clock);
  document
    .querySelectorAll("[data-clock]")
    .forEach((node) => (node.textContent = formatTime(time)));
  const status = document.querySelector("[data-clock-status]");
  if (status)
    status.textContent =
      time >= match.setup.halfLength * 60000
        ? "Added time"
        : match.clock.startedAt === null
          ? "Clock paused"
          : "Clock running";
}

function selectField(label, name, value, options) {
  return `<label class="field"><span>${label}</span><select name="${name}" aria-label="${label}"><option value="">Not recorded</option>${options.map((option) => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
}
function openEvent(event, editing = false) {
  const dialog = document.querySelector("#event-dialog");
  const type = eventType(event.event);
  const displayLabel = isBlockedShot(event) ? "Shot · Blocked" : type.label;
  const kickout = event.event.includes("kickout");
  const scoring = type.value > 0;
  const playerRelevant = type.player || editing;
  dialog.innerHTML = `<form id="event-form"><div class="dialog-heading"><div><p class="eyebrow">${editing ? "EDIT EVENT" : "RECORD EVENT"} · H${event.half} · ${formatTime(event.timeMs)}</p><h2 id="event-dialog-title">${esc(displayLabel)}</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cancel event">${icon("close")}</button></div><p class="dialog-team"><span class="local-dot"></span>${esc(teamName(event.team))}${scoring ? ` <span>+${type.value} ${type.value === 1 ? "point" : "points"}</span>` : ""}</p>
    ${
      playerRelevant
        ? `<label class="field"><span>Player number <small>Optional</small></span><input name="playerNumber" type="number" min="1" max="99" step="1" inputmode="numeric" placeholder="Jersey number" value="${esc(event.playerNumber)}"></label>${
            playersFor(match, event.team).length
              ? `<div class="player-picks" aria-label="Choose player">${[
                  ...playersFor(match, event.team).filter((player) =>
                    Number.isInteger(player.number),
                  ),
                ]
                  .sort((a, b) => (a.number ?? 1000) - (b.number ?? 1000))
                  .map(
                    (player) =>
                      `<button type="button" class="player-pick ${String(event.playerNumber) === String(player.number) ? "chosen" : ""}" data-pick-player="${player.number}" title="${esc(player.name)}">${player.number}<span>${esc(player.name.split(" ")[0])}</span></button>`,
                  )
                  .join("")}</div>`
              : ""
          }`
        : ""
    }
    <div data-edit-shot-fields>${shotFieldsMarkup(event, match, { editing: true })}</div><div data-edit-kickout-fields>${kickoutFieldsMarkup(event, match)}</div>
    <details class="event-details" ${editing ? "open" : ""}><summary>${editing ? "Event details" : "Add details"} <span>Optional</span></summary><div class="detail-fields">
    ${editing ? `<div class="form-grid"><label class="field"><span>Event</span><select name="event" aria-label="Event">${EVENT_TYPES.map((item) => `<option value="${item.id}" ${item.id === event.event ? "selected" : ""}>${item.label}</option>`).join("")}</select></label><label class="field"><span>Team</span><select name="team" aria-label="Team" ${type.team ? "disabled" : ""}><option value="our" ${event.team === "our" ? "selected" : ""}>${esc(teamName("our"))}</option><option value="opposition" ${event.team === "opposition" ? "selected" : ""}>${esc(teamName("opposition"))}</option></select></label><label class="field"><span>Half</span><select name="half" aria-label="Half"><option value="1" ${event.half === 1 ? "selected" : ""}>First half</option><option value="2" ${event.half === 2 ? "selected" : ""}>Second half</option></select></label>${input("Half time (mm:ss)", "time", formatTime(event.timeMs), 'required pattern="[0-9]{1,3}:[0-5][0-9]" inputmode="text" title="Use minutes:seconds, for example 05:30"')}</div>` : ""}
    <div class="form-grid">${!scoring && event.event !== "miss" && !kickout && !isDefensiveBlockEvent(event) ? selectField("Outcome", "outcome", event.outcome, ["won", "lost", "retained", "completed", "incomplete"]) : ""}${selectField("Zone", "zone", event.zone, ["Defensive third", "Middle third", "Attacking third"])}${selectField("Side", "side", event.side, ["Left", "Centre", "Right"])}${kickout || editing ? selectField("Kickout length", "kickoutLength", event.kickoutLength, ["Short", "Medium", "Long"]) : ""}${!isShot(event) && editing ? selectField("Score origin", "scoreOrigin", event.scoreOrigin, ["Open play", "Free", "45", "Penalty", "Sideline"]) : ""}${selectField("Possession result", "possessionResult", event.possessionResult, ["Retained", "Lost", "Shot", "Score"])}${input("Attack pattern", "attackPattern", event.attackPattern, 'maxlength="120" placeholder="Optional"')}</div>
    ${noteMarkup(event)}${input("Coach observation", "coachObservation", event.coachObservation, 'maxlength="500" placeholder="Optional"')}
    <label class="field"><span>Direct score link</span><select name="directScoreLink"><option value="">No linked score</option>${match.events
      .filter(
        (item) =>
          item.id !== event.id &&
          eventType(item.event).value > 0 &&
          item.outcome === "scored",
      )
      .map(
        (item) =>
          `<option value="${item.id}" ${event.directScoreLink === item.id ? "selected" : ""}>H${item.half} ${formatTime(item.timeMs)} · ${esc(teamName(item.team))} · ${esc(eventType(item.event).label)}</option>`,
      )
      .join("")}</select></label>
    <div class="form-grid">${input("Player on (substitution)", "playerOn", event.playerOn || "", 'min="1" max="99" inputmode="numeric"', "number")}${input("Player off (substitution)", "playerOff", event.playerOff || "", 'min="1" max="99" inputmode="numeric"', "number")}</div>
    <div class="form-grid">${input(isDefensiveBlockEvent(event) ? "Block X (0–1)" : "Shot X (0–1)", "shotX", event.shotX ?? "", 'min="0" max="1" step="any"', "number")}${input(isDefensiveBlockEvent(event) ? "Block Y (0–1)" : "Shot Y (0–1)", "shotY", event.shotY ?? "", 'min="0" max="1" step="any"', "number")}</div><p class="small-note">Coordinates are normalized; attacking goal at top. Leave both empty for no location.</p>
    </div></details><div class="dialog-actions"><button type="button" class="button subtle" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${icon("check")}${editing ? "Save changes" : "Record event"}</button></div><p class="dialog-hint">${editing ? "Changes update the scoreboard and timeline." : "The match time was captured when you tapped the event."}</p></form>`;
  const stopDictation = bindSpeech(dialog, {
    onTranscript: (fields) => saveEventNote({ ...event, ...fields }),
  });
  dialog.addEventListener("close", stopDictation, { once: true });
  dialog.showModal();
  // Prevent the iPhone keyboard covering the quick-save controls on opening.
  dialog.querySelector("input")?.blur();
  dialog.querySelector('[data-action="close-dialog"]').focus();
  dialog.querySelector("#event-form").addEventListener("submit", (submit) => {
    submit.preventDefault();
    const data = Object.fromEntries(new FormData(submit.target));
    const updated = { ...event, ...data };
    if (data.time) {
      const [minutes, seconds] = data.time.split(":").map(Number);
      updated.timeMs = (minutes * 60 + seconds) * 1000;
      delete updated.time;
    }
    updated.half = Number(updated.half);
    updated.shotX = data.shotX === "" ? null : Number(data.shotX);
    updated.shotY = data.shotY === "" ? null : Number(data.shotY);
    if ((updated.shotX === null) !== (updated.shotY === null)) {
      toast("Enter both shot coordinates or leave both empty.");
      return;
    }
    stopDictation();
    const nextType = eventType(updated.event);
    if (updated.event !== event.event) updated.outcome = nextType.outcome;
    if (nextType.value > 0) updated.outcome = "scored";
    if (isKickout(updated))
      Object.assign(updated, kickoutFormFields(data, updated));
    delete updated.kickoutResult;
    try {
      match.events = saveEvent(match.events, updated);
    } catch (error) {
      toast(error.message);
      return;
    }
    persist();
    dialog.close();
    render();
    toast(
      editing
        ? "Event updated. Scoreboard recalculated."
        : `${nextType.label} recorded`,
    );
  });
  const refreshShotFields = () => {
    const form = dialog.querySelector("#event-form");
    const data = Object.fromEntries(new FormData(form));
    const next = eventType(data.event || event.event);
    const draft = {
      ...event,
      ...data,
      event: next.id,
      outcome: next.id === event.event ? event.outcome : next.outcome,
      ...(next.id === event.event && isKickout(event)
        ? kickoutDetails(event)
        : {}),
      ...kickoutFormFields(data, { event: next.id }),
    };
    dialog.querySelector("#event-dialog-title").textContent = isBlockedShot(
      draft,
    )
      ? "Shot · Blocked"
      : next.label;
    dialog.querySelector("[data-edit-shot-fields]").innerHTML =
      shotFieldsMarkup(draft, match, { editing: true });
    dialog.querySelector("[data-edit-kickout-fields]").innerHTML =
      kickoutFieldsMarkup(draft, match);
  };
  dialog
    .querySelector('[name="team"]')
    ?.addEventListener("change", refreshShotFields);
  dialog
    .querySelector("[data-edit-shot-fields]")
    .addEventListener("change", refreshShotFields);
  dialog
    .querySelector("[data-edit-kickout-fields]")
    .addEventListener("change", refreshShotFields);
  dialog
    .querySelector('[name="event"]')
    ?.addEventListener("change", (eventChange) => {
      const nextType = eventType(eventChange.target.value);
      const team = dialog.querySelector('[name="team"]');
      team.disabled = Boolean(nextType.team);
      if (nextType.team) team.value = nextType.team;
      refreshShotFields();
    });
}

document.addEventListener("click", (event) => {
  if (!match) return;
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.dataset.view) {
    view = button.dataset.view;
    render();
    window.scrollTo(0, 0);
  }
  if (button.dataset.squadTeam) {
    squadTeam = button.dataset.squadTeam;
    playerEditing = null;
    render();
  }
  if (button.hasAttribute("data-paste-squad"))
    openPasteImport(
      document.querySelector("#event-dialog"),
      playersFor(match, squadTeam),
      (players) => {
        setPlayers([...playersFor(match, squadTeam), ...players]);
        persist();
        render();
        toast(`${players.length} reviewed players added.`);
      },
    );
  if (button.hasAttribute("data-save-squad"))
    openSaveSquad(
      document.querySelector("#event-dialog"),
      match,
      squadTeam,
      () => toast("Reusable squad saved on this device."),
    );
  if (button.hasAttribute("data-squad-library"))
    openSquadLibrary(
      document.querySelector("#event-dialog"),
      match,
      squadTeam,
      (players) => {
        playerEditing = null;
        setPlayers(players);
        persist();
        render();
        toast("Squad loaded as a separate match copy.");
      },
    );
  if (button.dataset.team) {
    selectedTeam = button.dataset.team;
    match.recordingTeam = selectedTeam;
    persist();
    render();
  }
  if (button.dataset.event) {
    if (!ready()) {
      view = "setup";
      render();
      return;
    }
    const record = createEvent(match, button.dataset.event, selectedTeam);
    if (!acceptTap(`event:${record.event}:${record.team}`)) {
      toast("Repeat tap ignored");
      return;
    }
    if (record.event === "substitution")
      openSubstitution(
        document.querySelector("#event-dialog"),
        record,
        match,
        recordEvent,
      );
    else if (isKickout(record))
      openKickoutCapture(
        document.querySelector("#event-dialog"),
        record,
        match,
        (updated) => {
          match.events = saveEvent(match.events, updated);
          persist();
        },
        () => render(),
      );
    else {
      recordEvent(record);
      if (isShot(record))
        enrichShot(match.events.find((e) => e.id === record.id));
      else if (isDefensiveBlockEvent(record))
        enrichDefensiveBlock(match.events.find((e) => e.id === record.id));
    }
  }

  if (button.dataset.editEvent)
    openEvent(
      match.events.find((item) => item.id === button.dataset.editEvent),
      true,
    );
  if (button.dataset.editPlayer) {
    playerEditing = button.dataset.editPlayer;
    render();
    document.querySelector("#player-form input").focus();
  }
  if (button.dataset.deletePlayer) {
    const player = playersFor(match, squadTeam).find(
      (item) => item.id === button.dataset.deletePlayer,
    );
    if (
      confirm(
        `Remove #${player.number} ${player.name} from the squad? Recorded events will be kept.`,
      )
    ) {
      setPlayers(
        playersFor(match, squadTeam).filter((item) => item.id !== player.id),
      );
      if (playerEditing === player.id) playerEditing = null;
      persist();
      render();
    }
  }
  if (button.dataset.pickPlayer) {
    document.querySelector('[name="playerNumber"]').value =
      button.dataset.pickPlayer;
    document
      .querySelectorAll("[data-pick-player]")
      .forEach((item) => item.classList.toggle("chosen", item === button));
  }
  if (button.dataset.lineupPlayer) {
    setPlayers(
      playersFor(match, squadTeam).map((player) =>
        player.id === button.dataset.lineupPlayer
          ? {
              ...player,
              role: player.role === "starter" ? "substitute" : "starter",
            }
          : player,
      ),
    );
    persist();
    render();
  }
  switch (button.dataset.action) {
    case "voice-mode":
      voiceMode = !voiceMode;
      render();
      break;
    case "enrich-shot": {
      const last = match.events.at(-1);
      if (last && isShot(last)) enrichShot(last);
      break;
    }
    case "new-match": {
      if (
        !confirm(
          "Start a blank match? Current match is preserved as a local recovery snapshot. Teams and both squads will be empty; saved squad templates remain available.",
        )
      )
        break;
      const result = startBlankMatch(match);
      if (result.error) {
        storageError = result.error;
        refreshSaveStatus();
        break;
      }
      match = result.match;
      storageError = "";
      selectedTeam = "our";
      squadTeam = "our";
      playerEditing = null;
      voice.reset();
      voiceMode = false;
      view = "setup";
      render();
      break;
    }
    case "live-note":
      if (match.events.length)
        openNoteCapture(
          document.querySelector("#event-dialog"),
          match.events.at(-1),
          (updated) => {
            try {
              match.events = saveEvent(match.events, updated);
            } catch (error) {
              toast(error.message);
              return;
            }
            persist();
            render();
            toast("Note saved with the event.");
          },
          saveEventNote,
        );
      break;
    case "match-report":
      reportMode = true;
      render();
      break;
    case "analysis-back":
      reportMode = false;
      render();
      break;
    case "print-report":
      window.print();
      break;
    case "go-live":
      view = ready() ? "live" : "setup";
      render();
      if (!ready()) toast("Add both team names to begin.");
      break;
    case "cancel-player":
      playerEditing = null;
      render();
      break;
    case "close-dialog":
      document.querySelector("#event-dialog").close();
      break;
    case "clock":
      match.clock = toggleClock(match.clock);
      persist();
      render();
      break;
    case "half": {
      const next = match.clock.half === 1 ? 2 : 1;
      if (
        confirm(
          `Switch to the ${next === 2 ? "second" : "first"} half? The clock will reset to 00:00 and pause. All recorded events are kept.`,
        )
      ) {
        match.clock = { half: next, elapsedMs: 0, startedAt: null };
        persist();
        render();
      }
      break;
    }
    case "undo": {
      const removed = match.events.at(-1);
      match.events = undoEvent(match.events);
      persist();
      render();
      toast(`${eventType(removed.event).label} undone`);
      break;
    }
    case "edit-last":
      if (match.events.length) openEvent(match.events.at(-1), true);
      break;
  }
});
document.addEventListener("input", (event) => {
  if (!event.target.closest("#setup-form")) return;
  const { name, value } = event.target;
  if (!Object.hasOwn(match.setup, name) && name !== "ourFirstHalfAttacks")
    return;
  if (name === "halfLength" && (!event.target.validity.valid || !value)) return;
  match.setup[name] = name === "halfLength" ? Number(value) : value;
  persist();
  document.querySelector("#preview-our").textContent =
    match.setup.ourTeam || "Your team";
  document.querySelector("#preview-opposition").textContent =
    match.setup.opposition || "The opposition";
  document.querySelector("#preview-crest").textContent = initials(
    match.setup.ourTeam,
  );
  document.querySelector("#preview-length").textContent =
    match.setup.halfLength;
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "setup-form") {
    event.preventDefault();
    if (!ready()) {
      toast("Enter both team names to continue.");
      return;
    }
    match.setup.ourTeam = match.setup.ourTeam.trim();
    match.setup.opposition = match.setup.opposition.trim();
    persist();
    view = "squad";
    render();
    window.scrollTo(0, 0);
  }
  if (event.target.id === "player-form") {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const number = data.number === "" ? null : Number(data.number);
    if (
      playersFor(match, squadTeam).some(
        (item) =>
          number !== null &&
          item.number === number &&
          item.id !== playerEditing,
      )
    ) {
      toast(`Jersey #${number} is already in your squad.`);
      return;
    }
    if (!data.name.trim()) {
      toast("Enter a player name.");
      return;
    }
    const player = {
      ...data,
      name: data.name.trim(),
      number,
      id: playerEditing || uid(),
    };
    setPlayers(
      playerEditing
        ? playersFor(match, squadTeam).map((item) =>
            item.id === playerEditing ? player : item,
          )
        : [...playersFor(match, squadTeam), player],
    );
    playerEditing = null;
    persist();
    render();
    toast(`#${number ?? "—"} ${player.name} saved`);
    document.querySelector('[name="number"]').focus();
  }
});
document.addEventListener("change", (event) => {
  if (!match) return;
  if (
    ["team-sheet-file", "team-sheet-photo"].includes(event.target.id) &&
    event.target.files[0]
  ) {
    const file = event.target.files[0];
    openImportReview(
      document.querySelector("#event-dialog"),
      file,
      playersFor(match, squadTeam),
      (players) => {
        setPlayers([...playersFor(match, squadTeam), ...players]);
        persist();
        render();
        toast(`${players.length} reviewed players added.`);
      },
    );
    event.target.value = "";
  }
  if (event.target.id.startsWith("shot-")) {
    analysisFilters[event.target.id.slice(5)] = event.target.value;
    render();
  }

  if (event.target.id === "timeline-team") {
    timelineTeam = event.target.value;
    render();
  }
  if (event.target.id === "timeline-kind") {
    timelineKind = event.target.value;
    render();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClock();
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#setup") {
    view = "setup";
    render();
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === "sideline.match.v1") {
    // Avoid silently replacing an active tab's match or allowing stale overwrites.
    voice.reset();
    document.querySelector("#event-dialog")?.close();
    app.innerHTML =
      '<main class="recovery"><h1>Match updated in another tab</h1><p>Use one tab to track this match. Reload this tab to use the latest saved version.</p><button class="button primary" onclick="location.reload()">Reload saved match</button></main>';
    match = null;
  }
});
render();
setInterval(updateClock, 500);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      offlineStatus = navigator.serviceWorker.controller
        ? "Offline app ready"
        : "App cached — reload once before going offline";
      document
        .querySelectorAll("[data-offline-status]")
        .forEach((node) => (node.textContent = offlineStatus));
      if (registration.waiting)
        toast(
          "An app update is ready. Close all Sideline tabs after the match to apply it.",
        );
    } catch {
      toast(
        "Offline app installation is unavailable. Local match autosave is still active.",
      );
    }
  });
}
