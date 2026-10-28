import { migrateMatch, totals, elapsedMs, toggleClock } from "./domain.js";
export const ARCHIVE_PREFIX = "sideline.match.archive.";
export const ACTIVE_KEY = "sideline.match.v1";
export const HISTORY_DB = "sideline.history";
export const HISTORY_STORE = "matches";
export function timestamp(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
}
export function completed(match) {
  return (
    match.lifecycle?.status === "completed" &&
    timestamp(match.lifecycle.completedAt) !== null
  );
}
export function matchStatus(match, archived = false) {
  return completed(match)
    ? "Completed"
    : archived
      ? "Archived"
      : match.clock.startedAt !== null
        ? "Live"
        : "Paused";
}
export function completeMatch(match, now = Date.now()) {
  if (completed(match) && match.clock.startedAt === null)
    return structuredClone(match);
  return {
    ...match,
    clock:
      match.clock.startedAt === null
        ? { ...match.clock }
        : toggleClock(match.clock, now),
    lifecycle: {
      ...match.lifecycle,
      status: "completed",
      completedAt: new Date(now).toISOString(),
    },
  };
}
export function historySnapshot(record) {
  const match = migrateMatch(record.match);
  if (match.clock.startedAt !== null) {
    const savedAt = timestamp(record.archivedAt);
    match.clock.elapsedMs =
      savedAt !== null
        ? elapsedMs(match.clock, savedAt)
        : Math.max(
            match.clock.elapsedMs,
            ...match.events
              .filter((e) => e.half === match.clock.half)
              .map((e) => e.timeMs),
          );
    match.clock.startedAt = null;
  }
  return match;
}
function orderValue(r) {
  const m = r.match;
  const eventTimes = m.events
    .map((e) => timestamp(e.createdAt))
    .filter((n) => n !== null);
  return (
    (completed(m) ? timestamp(m.lifecycle.completedAt) : null) ??
    timestamp(m.setup.date) ??
    timestamp(m.lifecycle?.createdAt) ??
    (eventTimes.length ? Math.min(...eventTimes) : timestamp(r.archivedAt)) ??
    0
  );
}
export function historySummary(record, archived = true) {
  const m = record.match,
    our = totals(m.events, "our"),
    opposition = totals(m.events, "opposition"),
    margin = our.total - opposition.total;
  return {
    our,
    opposition,
    status: matchStatus(m, archived),
    result: completed(m)
      ? margin > 0
        ? `WIN +${margin}`
        : margin < 0
          ? `LOSS ${margin}`
          : "DRAW"
      : "Result not final",
  };
}
export function sortHistory(records) {
  return [...records].sort(
    (a, b) => orderValue(b) - orderValue(a) || a.id.localeCompare(b.id),
  );
}
