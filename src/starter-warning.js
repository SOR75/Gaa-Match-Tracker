import { hasMatchEvidence } from "./participation.js";
export const starterLineupKey = (match) =>
  match.players
    .map((p) => `${p.matchPlayerId || p.id}:${p.role}`)
    .sort()
    .join("|");
export function starterWarning(match) {
  const count = match.players.filter((p) => p.role === "starter").length;
  if (
    !match.players.length ||
    count === 15 ||
    hasMatchEvidence(match) ||
    match.starterCountAcknowledgement === starterLineupKey(match)
  )
    return null;
  return {
    count,
    message: `${count} players selected to start. A standard team has 15 starters.`,
  };
}
export function starterWarningMarkup(match) {
  const warning = starterWarning(match);
  return warning
    ? `<aside class="starter-warning" role="status"><p>${warning.message}</p><div><button type="button" class="button subtle" data-review-starters>Review team</button><button type="button" class="button primary" data-continue-starters>Continue anyway</button></div></aside>`
    : "";
}
