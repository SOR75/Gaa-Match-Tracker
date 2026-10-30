// Results are always exposed from our team's perspective. Unmarked legacy records
// used the kicking team's perspective and are translated on read, never in place.
export const isKickoutEvent = (event) =>
  ["our-kickout", "opposition-kickout"].includes(event.event);
export function kickoutDetails(event) {
  if (!isKickoutEvent(event)) return null;
  let outcome = ["won", "lost", "out-of-play"].includes(event.outcome)
    ? event.outcome
    : "unknown";
  if (
    event.kickoutPerspective !== "our" &&
    event.event === "opposition-kickout" &&
    ["won", "lost"].includes(outcome)
  )
    outcome = outcome === "won" ? "lost" : "won";
  const mark = event.mark === true && ["won", "lost"].includes(outcome);
  const markPlayerNumber =
    mark &&
    outcome === "won" &&
    /^[1-9]\d?$/.test(String(event.markPlayerNumber || ""))
      ? String(event.markPlayerNumber)
      : "";
  return {
    outcome,
    kickoutPerspective: "our",
    mark,
    markPlayerNumber,
    ...(event.kickoutWinnerNumber !== undefined
      ? {
          kickoutWinnerNumber:
            ["won", "lost"].includes(outcome) &&
            /^[1-9]\d?$/.test(String(event.kickoutWinnerNumber || ""))
              ? String(event.kickoutWinnerNumber)
              : "",
        }
      : {}),
  };
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
    {
      id: "out-of-play",
      label: "Out of Play / Sideline",
      outcome: "out-of-play",
      mark: false,
    },
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
