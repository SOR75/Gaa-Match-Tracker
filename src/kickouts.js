// Results are always exposed from our team's perspective. Unmarked legacy records
// used the kicking team's perspective and are translated on read, never in place.
export const isKickoutEvent = (event) =>
  ["our-kickout", "opposition-kickout"].includes(event.event);
export function kickoutDetails(event) {
  if (!isKickoutEvent(event)) return null;
  let outcome = ["won", "lost"].includes(event.outcome)
    ? event.outcome
    : "unknown";
  if (
    event.kickoutPerspective !== "our" &&
    event.event === "opposition-kickout" &&
    outcome !== "unknown"
  )
    outcome = outcome === "won" ? "lost" : "won";
  const mark = event.mark === true && outcome !== "unknown";
  const markPlayerNumber =
    mark &&
    outcome === "won" &&
    /^[1-9]\d?$/.test(String(event.markPlayerNumber || ""))
      ? String(event.markPlayerNumber)
      : "";
  return { outcome, kickoutPerspective: "our", mark, markPlayerNumber };
}
export function kickoutChoices(type) {
  return [
    { id: "won", label: "Won by us", outcome: "won", mark: false },
    {
      id: "lost",
      label:
        type === "opposition-kickout"
          ? "Retained by opposition"
          : "Won by opposition",
      outcome: "lost",
      mark: false,
    },
    { id: "mark-won", label: "Mark won by us", outcome: "won", mark: true },
    {
      id: "mark-lost",
      label: "Mark won by opposition",
      outcome: "lost",
      mark: true,
    },
    { id: "unknown", label: "Unknown", outcome: "unknown", mark: false },
  ];
}
export function kickoutLabel(event) {
  const detail = kickoutDetails(event);
  if (!detail) return "";
  return (
    kickoutChoices(event.event).find(
      (c) => c.outcome === detail.outcome && c.mark === detail.mark,
    )?.label || "Unknown"
  );
}
