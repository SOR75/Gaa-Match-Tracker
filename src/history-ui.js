import {hasNormalTimeBoundary} from './normal-time.js';
import {downloadTimelineCSV} from './analysis-stream.js';
import {periodId} from "./periods.js";
import { esc } from "./ui.js";
import { gaelicScore } from "./shots.js";
import { formatTime } from "./domain.js";
import { completed, historySummary, historySnapshot } from "./history.js";
import { fullTimeScreen, normalTimeScreen } from "./full-time-ui.js";
import { halfTimeScreen } from "./half-time-ui.js";
import { analysisScreen } from "./analysis-ui.js";
import "./history.css";
const teams = (m) =>
  `${m.setup.ourTeam || "Our team"} vs ${m.setup.opposition || "Opposition"}`;
export function createHistoryUI({
  repository,
  getActive,
  onResume,
  onChange,
  renderTimeline,
  onDeleted = () => {},
}) {
  let records = [],
    warnings = [],
    loading = false,
    busy = false,
    selected = null,
    panel = "full",
    error = "",
    writable = true,
    search = "",
    selecting = false,
    chosen = new Set(),
    pendingDeletion = null;
  let filters = { team: "all", half: "all", player: "all", result: "all" },
    report = false;
  async function refresh() {
    loading = true;
    error = "";
    onChange();
    try {
      ({ records, warnings, writable } = await repository.list());
      chosen = new Set([...chosen].filter(id => id !== getActive().id && records.some(r => r.id === id)));
    } catch (e) {
      error = e.message;
    }
    loading = false;
    onChange();
  }
  function card(record, current = false) {
    const m = record.match,
      s = historySummary(record, !current);
    return `<article class="card history-card" data-history-id="${esc(record.id)}">${selecting && !current ? `<label class="history-select"><input type="checkbox" data-history-select="${esc(record.id)}" aria-label="Select ${esc(teams(m))}" ${chosen.has(record.id) ? "checked" : ""} ${busy || pendingDeletion ? "disabled" : ""}>Select match</label>` : ""}<div class="history-card-heading"><h2>${esc(teams(m))}</h2><span class="step-tag">${current ? "CURRENT · " : ""}${s.status}</span></div><p>${esc(m.setup.date || "Date unknown")}${m.setup.competition ? ` · ${esc(m.setup.competition)}` : ""} · ${m.events.length} recorded event${m.events.length === 1 ? "" : "s"}</p><div class="history-score"><span>${esc(m.setup.ourTeam || "Our team")} <strong>${gaelicScore(s.our)} (${s.our.total})</strong></span><span>${esc(m.setup.opposition || "Opposition")} <strong>${gaelicScore(s.opposition)} (${s.opposition.total})</strong></span></div><p class="history-result">${s.result}</p><div class="history-card-actions"><button class="button primary" data-history-action="view" data-id="${esc(record.id)}" ${busy || pendingDeletion ? "disabled" : ""}>VIEW MATCH</button>${!current ? `<details><summary class="button subtle">Manage match</summary><div class="history-management">${!completed(m) ? `<button class="button subtle" data-history-action="resume" data-id="${esc(record.id)}" ${busy || pendingDeletion ? "disabled" : ""}>RESUME MATCH</button>` : ""}<button class="button subtle" data-history-action="delete" data-id="${esc(record.id)}" ${busy || !writable || pendingDeletion ? "disabled" : ""}>DELETE MATCH</button></div></details>` : ""}</div></article>`;
  }
  function confirmation() {
    if (!pendingDeletion) return "";
    const count = pendingDeletion.length;
    return `<section class="card history-delete-confirm" data-history-confirm aria-labelledby="history-delete-title"><h2 id="history-delete-title">${count === 1 ? "Delete Match?" : `Delete ${count} Matches?`}</h2><p>This permanently deletes ${count === 1 ? "this archived match" : `${count} archived matches`} from this device and Player Review. Deletion cannot be undone.</p><ul>${pendingDeletion.map(r=>`<li><strong>${esc(teams(r.match))}</strong> · ${esc(r.match.setup.date || "Date unknown")} · ${r.match.events.length} recorded event${r.match.events.length === 1 ? "" : "s"}</li>`).join("")}</ul><p>Your active match, other archives, Saved Squads, Saved Team Setups and permanent player identities are unaffected.</p><div class="history-management"><button class="button subtle" data-history-action="cancel-delete" ${busy ? "disabled" : ""}>Cancel</button><button class="button primary" data-history-action="confirm-delete" ${busy ? "disabled" : ""}>${busy ? "Deleting…" : "Confirm Delete"}</button></div></section>`;
  }
  function currentRecord() {
    const m = getActive();
    return {
      id: m.id,
      match: m,
      current: true,
      archivedAt: new Date().toISOString(),
    };
  }
  function screen() {
    const active = getActive(),
      hasCurrent =
        active.events.length || active.setup.ourTeam || active.setup.opposition;
    const top = `<section data-history-root class="history-view" aria-busy="${busy || loading}"><div class="page-heading"><div><p class="eyebrow">ON THIS DEVICE</p><h1>MATCH HISTORY</h1><p class="page-description">View recorded matches without replacing your current match.</p></div><div class="history-card-actions"><button class="button subtle" data-history-action="refresh" ${busy || pendingDeletion ? "disabled" : ""}>Refresh history</button>${!selected && !selecting ? `<button class="button subtle" data-history-action="select-matches" ${busy || loading || !writable || pendingDeletion ? "disabled" : ""}>Select Matches</button>` : ""}</div></div>${error ? `<p class="warning" role="alert">${esc(error)}</p>` : ""}`;
    if (selected) {
      const m = historySnapshot(selected),
        summary = historySummary(selected, !selected.current);
      const body =
        panel === "normal"
          ? normalTimeScreen(m,{actions:[],historical:true})
          : panel === "timeline"
          ? renderTimeline(m)
          : panel === "half"
            ? halfTimeScreen(m, { actions: [] })
            : panel === "detail"
              ? analysisScreen(m, filters, report)
              : fullTimeScreen(m, { actions: [], historical: true });
      return `${top}<div class="history-readonly"><button class="button subtle" data-history-action="back">← Back to History</button><strong>READ-ONLY · ${esc(teams(m))}</strong><span>${summary.status} · ${selected.match.clock.startedAt !== null && !selected.archivedAt ? "Last recorded" : "Saved"} ${m.clock.phase==="SHOOTOUT"?"SHOOTOUT":periodId(m.clock.half)} ${formatTime(m.clock.elapsedMs)}${m.setup.matchCode ? ` · ${esc(m.setup.matchCode)}` : ""} · Current match is unchanged</span></div><nav class="history-tabs" aria-label="Historical match views">${[
        ["full", "Full Match Analysis"],
        ...(hasNormalTimeBoundary(m)?[["normal","Normal-Time Analysis"]]:[]),
        ["half", "Half-Time Analysis"],
        ["timeline", "Timeline"],
        ["detail", "Player stats / shot maps / kickouts"],
        ["data", "Full Match Report"],
      ]
        .map(
          ([id, label]) =>
            `<button class="button ${(panel === id && !report) || (id === "data" && report === id) ? "primary" : "subtle"}" data-history-action="panel" data-panel="${id}">${label}</button>`,
        )
        .join("")}</nav>${body}</section>`;
    }
    const archiveRows = records.filter((r) => r.id !== active.id);
    const visible = archiveRows.filter((r) =>
      teams(r.match).toLowerCase().includes(search.toLowerCase()),
    );
    const selection = selecting ? `<section class="card history-selection" aria-label="Select archived matches"><strong role="status" data-history-selection-count>${chosen.size} ${chosen.size === 1 ? "match" : "matches"} selected</strong><div class="history-management">${[["select-all","Select All"],["deselect-all","Deselect All"],["delete-selected","Delete Selected"],["cancel-selection","Cancel Selection"]].map(([action,label])=>`<button class="button ${action === "delete-selected" ? "primary" : "subtle"}" data-history-action="${action}" ${busy || pendingDeletion || action === "delete-selected" && !chosen.size ? "disabled" : ""}>${label}</button>`).join("")}</div><p class="small-note">Select All selects the archived matches shown by your search. The current match is never selected.</p></section>` : "";
    return `${top}${confirmation()}${selection}${loading ? '<p role="status">Loading saved matches…</p>' : ""}${warnings.length ? `<aside class="warning" role="status"><strong>Some history needs attention</strong><ul>${warnings.map((w) => `<li>${esc(w.key)}: ${esc(w.error)}. Original records are preserved.</li>`).join("")}</ul></aside>` : ""}<label class="field history-search"><span>Search teams / opposition</span><input id="history-search" value="${esc(search)}" type="search" autocomplete="off"></label><div class="history-grid">${hasCurrent && teams(active).toLowerCase().includes(search.toLowerCase()) ? card(currentRecord(), true) : ""}${visible.map((r) => card(r)).join("")}</div>${!loading && !archiveRows.length && !completed(active) ? `<section class="card history-empty"><h2>${writable ? "No matches in History yet" : "History could not fully load"}</h2><p>${writable ? "Completed and previous matches will appear here." : "History storage is unavailable. No saved matches have been deleted. Try refreshing history when storage is available."}</p><button class="button subtle" data-history-action="setup">Back to Match Setup</button></section>` : ""}${search && !visible.length ? '<p role="status">No archived matches match these teams.</p>' : ""}</section>`;
  }
  async function click(button) {
    if (busy) return;
    if(button.hasAttribute?.("data-timeline-csv") && selected){downloadTimelineCSV(historySnapshot(selected));return;}
    const action = button.dataset.historyAction || button.dataset.action;
    if (pendingDeletion && !["confirm-delete", "cancel-delete"].includes(action)) return;
    if (action === "cancel-delete") { pendingDeletion = null; onChange(); return; }
    if (action === "confirm-delete") {
      if (!pendingDeletion?.length) return;
      busy = true; error = ""; onChange();
      try {
        const ids = pendingDeletion.map(r => r.id);
        await repository.removeMany(ids, getActive());
        pendingDeletion = null; selecting = false; chosen.clear();
        await onDeleted(ids);
      } catch (e) { error = e.message; }
      busy = false;
      const failure = error;
      try { ({ records, warnings, writable } = await repository.list()); }
      catch (e) { error = e.message; }
      error = failure || error;
      chosen = new Set([...chosen].filter(id => id !== getActive().id && records.some(r => r.id === id)));
      onChange(); return;
    }
    if (action === "select-matches") { selecting = true; chosen.clear(); error = ""; onChange(); return; }
    if (action === "cancel-selection") { selecting = false; chosen.clear(); onChange(); return; }
    if (action === "select-all") {
      chosen = new Set(records.filter(r => r.id !== getActive().id && teams(r.match).toLowerCase().includes(search.toLowerCase())).map(r => r.id)); onChange(); return;
    }
    if (action === "deselect-all") { chosen.clear(); onChange(); return; }
    if (action === "delete-selected") {
      pendingDeletion = records.filter(r => r.id !== getActive().id && chosen.has(r.id));
      if (!pendingDeletion.length) pendingDeletion = null;
      onChange();
      document.querySelector('[data-history-confirm]')?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (action === "refresh" || action === "back") {
      selected = null;
      return refresh();
    }
    if (action === "setup") {
      onResume(null);
      return;
    }
    if (action === "panel") {
      panel =
        ["data"].includes(button.dataset.panel) ? "detail" : button.dataset.panel;
      report = ["data"].includes(button.dataset.panel) ? button.dataset.panel : false;
      onChange();
      return;
    }
    if (action === "view") {
      const id = button.dataset.id,
        record =
          id === getActive().id
            ? currentRecord()
            : records.find((r) => r.id === id);
      if (record) {
        selected = structuredClone(record);
        panel = "full";
        report = false;
        filters = { team: "all", half: "all", player: "all", result: "all" };
        error = "";
        onChange();
        window.scrollTo(0, 0);
      }
      return;
    }
    if (["match-report", "full-match-data", "analysis-back", "print-report"].includes(action)) {
      if (action === "print-report") window.print();
      else {
        report = action === "analysis-back" ? false : "data";
        onChange();
      }
      return;
    }
    if (!["delete", "resume"].includes(action)) return;
    const record = records.find((r) => r.id === button.dataset.id);
    if (!record) return;
    if (action === "delete") {
      if (record.id === getActive().id) { error = "The active match cannot be deleted from History"; onChange(); return; }
      pendingDeletion = [record]; onChange();
      document.querySelector('[data-history-confirm]')?.scrollIntoView({ block: "nearest" });
      return;
    }
    const text = `Resume ${teams(record.match)}? The current match will first be safely archived. The restored match clock will be paused.`;
    if (!window.confirm(text)) return;
    busy = true;
    error = "";
    onChange();
    try {
      if (action === "delete") await repository.remove(record.id, getActive());
      else {
        const next = await repository.resume(record.id, getActive());
        busy = false;
        selected = null;
        onResume(next);
        return;
      }
    } catch (e) {
      error = e.message;
    }
    busy = false;
    const failure = error;
    try {
      ({ records, warnings, writable } = await repository.list());
    } catch (e) {
      error = e.message;
    }
    error = failure || error;
    onChange();
  }
  function change(target) {
    if (target.dataset.historySelect) {
      if (busy || pendingDeletion || !selecting) return;
      const id = target.dataset.historySelect;
      if (id !== getActive().id && records.some(r => r.id === id)) {
        if (target.checked) chosen.add(id); else chosen.delete(id);
        onChange();
      }
      return;
    }
    if (target.id.startsWith("shot-")) {
      filters[target.id.slice(5)] = target.value;
      onChange();
    }
  }
  function input(target) {
    if (target.id !== "history-search") return;
    const position = target.selectionStart;
    search = target.value;
    onChange();
    const field = document.getElementById("history-search");
    field?.focus();
    field?.setSelectionRange(position, position);
  }
  return {
    screen,
    openMatch: async (id) => {
      selected = null;
      await refresh();
      await click({ dataset: { historyAction: "view", id } });
    },
    click,
    change,
    input,
    open: () => {
      selected = null; selecting = false; chosen.clear(); pendingDeletion = null;
      return refresh();
    },
  };
}
