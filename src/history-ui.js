import { esc } from "./ui.js";
import { gaelicScore } from "./shots.js";
import { formatTime } from "./domain.js";
import { completed, historySummary, historySnapshot } from "./history.js";
import { fullTimeScreen } from "./full-time-ui.js";
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
}) {
  let records = [],
    warnings = [],
    loading = false,
    busy = false,
    selected = null,
    panel = "full",
    error = "",
    writable = true,
    search = "";
  let filters = { team: "all", half: "all", player: "all", result: "all" },
    report = false;
  async function refresh() {
    loading = true;
    error = "";
    onChange();
    try {
      ({ records, warnings, writable } = await repository.list());
    } catch (e) {
      error = e.message;
    }
    loading = false;
    onChange();
  }
  function card(record, current = false) {
    const m = record.match,
      s = historySummary(record, !current);
    return `<article class="card history-card" data-history-id="${esc(record.id)}"><div class="history-card-heading"><h2>${esc(teams(m))}</h2><span class="step-tag">${current ? "CURRENT · " : ""}${s.status}</span></div><p>${esc(m.setup.date || "Date unknown")}${m.setup.competition ? ` · ${esc(m.setup.competition)}` : ""}</p><div class="history-score"><span>${esc(m.setup.ourTeam || "Our team")} <strong>${gaelicScore(s.our)} (${s.our.total})</strong></span><span>${esc(m.setup.opposition || "Opposition")} <strong>${gaelicScore(s.opposition)} (${s.opposition.total})</strong></span></div><p class="history-result">${s.result}</p><div class="history-card-actions"><button class="button primary" data-history-action="view" data-id="${esc(record.id)}">VIEW MATCH</button>${!current ? `<details><summary class="button subtle">Manage match</summary><div class="history-management">${!completed(m) ? `<button class="button subtle" data-history-action="resume" data-id="${esc(record.id)}" ${busy ? "disabled" : ""}>RESUME MATCH</button>` : ""}<button class="button subtle" data-history-action="delete" data-id="${esc(record.id)}" ${busy || !writable ? "disabled" : ""}>DELETE MATCH</button></div></details>` : ""}</div></article>`;
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
    const top = `<section data-history-root class="history-view" aria-busy="${busy || loading}"><div class="page-heading"><div><p class="eyebrow">ON THIS DEVICE</p><h1>MATCH HISTORY</h1><p class="page-description">View recorded matches without replacing your current match.</p></div><button class="button subtle" data-history-action="refresh" ${busy ? "disabled" : ""}>Refresh history</button></div>${error ? `<p class="warning" role="alert">${esc(error)}</p>` : ""}`;
    if (selected) {
      const m = historySnapshot(selected),
        summary = historySummary(selected, !selected.current);
      const body =
        panel === "timeline"
          ? renderTimeline(m)
          : panel === "half"
            ? halfTimeScreen(m, { actions: [] })
            : panel === "detail"
              ? analysisScreen(m, filters, report)
              : fullTimeScreen(m, { actions: [], historical: true });
      return `${top}<div class="history-readonly"><button class="button subtle" data-history-action="back">← Back to History</button><strong>READ-ONLY · ${esc(teams(m))}</strong><span>${summary.status} · ${selected.match.clock.startedAt !== null && !selected.archivedAt ? "Last recorded" : "Saved"} H${m.clock.half} ${formatTime(m.clock.elapsedMs)} · Current match is unchanged</span></div><nav class="history-tabs" aria-label="Historical match views">${[
        ["full", "Full Match Analysis"],
        ["half", "Half-Time Analysis"],
        ["timeline", "Timeline"],
        ["detail", "Player stats / shot maps / kickouts"],
        ["report", "Match Report"],
      ]
        .map(
          ([id, label]) =>
            `<button class="button ${panel === id || (id === "report" && report) ? "primary" : "subtle"}" data-history-action="panel" data-panel="${id}">${label}</button>`,
        )
        .join("")}</nav>${body}</section>`;
    }
    const archiveRows = records.filter((r) => r.id !== active.id);
    const visible = archiveRows.filter((r) =>
      teams(r.match).toLowerCase().includes(search.toLowerCase()),
    );
    return `${top}${loading ? '<p role="status">Loading saved matches…</p>' : ""}${warnings.length ? `<aside class="warning" role="status"><strong>Some history needs attention</strong><ul>${warnings.map((w) => `<li>${esc(w.key)}: ${esc(w.error)}. Original records are preserved.</li>`).join("")}</ul></aside>` : ""}<label class="field history-search"><span>Search teams / opposition</span><input id="history-search" value="${esc(search)}" type="search" autocomplete="off"></label><div class="history-grid">${hasCurrent && teams(active).toLowerCase().includes(search.toLowerCase()) ? card(currentRecord(), true) : ""}${visible.map((r) => card(r)).join("")}</div>${!loading && !archiveRows.length && !completed(active) ? `<section class="card history-empty"><h2>${writable ? "No matches in History yet" : "History could not fully load"}</h2><p>${writable ? "Completed and previous matches will appear here." : "History storage is unavailable. No saved matches have been deleted. Try refreshing history when storage is available."}</p><button class="button subtle" data-history-action="setup">Back to Match Setup</button></section>` : ""}${search && !visible.length ? '<p role="status">No archived matches match these teams.</p>' : ""}</section>`;
  }
  async function click(button) {
    if (busy) return;
    const action = button.dataset.historyAction || button.dataset.action;
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
        button.dataset.panel === "report" ? "detail" : button.dataset.panel;
      report = button.dataset.panel === "report";
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
    if (["match-report", "analysis-back", "print-report"].includes(action)) {
      if (action === "print-report") window.print();
      else {
        report = action === "match-report";
        onChange();
      }
      return;
    }
    if (!["delete", "resume"].includes(action)) return;
    const record = records.find((r) => r.id === button.dataset.id);
    if (!record) return;
    const text =
      action === "delete"
        ? `Delete ${teams(record.match)}? This permanently removes this match from Match History on this device. Your current match and saved squads are unaffected.`
        : `Resume ${teams(record.match)}? The current match will first be safely archived. The restored match clock will be paused.`;
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
    click,
    change,
    input,
    open: () => {
      selected = null;
      return refresh();
    },
  };
}
