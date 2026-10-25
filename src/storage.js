import { blankMatch, validMatch } from "./domain.js";
const KEY = "sideline.match.v1";
export function loadMatch() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { match: blankMatch(), error: "" };
    const match = JSON.parse(raw);
    if (!validMatch(match)) throw new Error("Invalid saved match");
    return { match, error: "" };
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
    localStorage.setItem(KEY, JSON.stringify(match));
    return "";
  } catch {
    return "Autosave failed. Keep this tab open: recent changes are only in memory. Check that browser storage is available.";
  }
}
