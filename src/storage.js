import { blankMatch, migrateMatch } from "./domain.js";
const KEY = "sideline.match.v1";
export function loadMatch() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { match: blankMatch(), error: "" };
    const match = JSON.parse(raw);
    return { match: migrateMatch(match), error: "" };
  } catch {
    return {
      match: null,
      error:
        "Your saved match could not be opened. It has been preserved in this browser. Please keep this tab open and seek recovery help before clearing browser data.",
    };
  }
}
export function persistMatch(match) {
  try {
    const previous = localStorage.getItem(KEY);
    if (
      previous &&
      JSON.parse(previous).schemaVersion === 1 &&
      !localStorage.getItem("sideline.match.v1.backup")
    ) {
      localStorage.setItem("sideline.match.v1.backup", previous);
    }
    localStorage.setItem(KEY, JSON.stringify(match));
    return "";
  } catch {
    return "Autosave failed. Keep this tab open: recent changes are only in memory. Check that browser storage is available.";
  }
}
