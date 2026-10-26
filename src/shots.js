// Additive shot semantics. Legacy event IDs/outcomes remain the scoring contract.
export const SHOT_SOURCES = [
  ["open-play", "Open Play"],
  ["free", "Free"],
  ["penalty", "Penalty"],
  ["45", "45"],
];
export const MISS_REASONS = [
  "wide",
  "short",
  "saved",
  "blocked",
  "post",
  "other",
];
export const shotAttempt = (event) =>
  ["goal", "point", "two-point", "miss"].includes(event.event);
export function shotDetails(event) {
  if (!shotAttempt(event)) return null;
  const legacySource =
    SHOT_SOURCES.find(
      ([, label]) =>
        label.toLowerCase() === String(event.scoreOrigin || "").toLowerCase(),
    )?.[0] ||
    (String(event.scoreOrigin || "").toLowerCase() === "mark" ? "mark" : "");
  const source =
    event.shotSource === "mark" ||
    event.shotSource === "" ||
    SHOT_SOURCES.some(([id]) => id === event.shotSource)
      ? event.shotSource
      : legacySource;
  const outcome =
    event.event !== "miss" && event.outcome === "scored" ? event.event : "miss";
  const reason =
    outcome === "miss"
      ? event.missReason === "" || MISS_REASONS.includes(event.missReason)
        ? event.missReason
        : MISS_REASONS.includes(event.outcome)
          ? event.outcome
          : ""
      : "";
  const blockedByNumber =
    event.team === "opposition" &&
    reason === "blocked" &&
    /^[1-9]\d?$/.test(String(event.blockedByNumber || ""))
      ? String(event.blockedByNumber)
      : "";
  return {
    shotOutcome: outcome,
    shotSource: source,
    missReason: reason,
    blockedByNumber,
  };
}
export function shotFields(event) {
  const details = shotDetails(event);
  if (!details)
    return {
      shotOutcome: "",
      shotSource: "",
      missReason: "",
      blockedByNumber: "",
    };
  const label = SHOT_SOURCES.find(([id]) => id === details.shotSource)?.[1];
  return {
    ...details,
    ...(label
      ? { scoreOrigin: label === "Open Play" ? "Open play" : label }
      : {}),
  };
}
export const gaelicScore = (tally) =>
  `${tally.goals}-${tally.points + 2 * tally.twoPointers}`;

export const isBlockedShot = (event) =>
  shotDetails(event)?.missReason === "blocked";
