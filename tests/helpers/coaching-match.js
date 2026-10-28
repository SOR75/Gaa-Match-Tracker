import { blankMatch, createEvent } from "../../src/domain.js";
export function coachingMatch() {
  const match = blankMatch();
  match.setup.ourTeam = "Harbour Athletic";
  match.setup.opposition = "Mountain Rovers";
  match.players = [
    {
      id: "defender",
      number: 4,
      name: "Casey Defender",
      role: "starter",
      position: "",
      notes: "",
    },
    {
      id: "shooter",
      number: 6,
      name: "Riley Forward",
      role: "starter",
      position: "",
      notes: "",
    },
    {
      id: "catcher",
      number: 8,
      name: "Morgan Midfield",
      role: "starter",
      position: "",
      notes: "",
    },
  ];
  function event(half, type, team = "our", extra = {}) {
    match.clock.half = half;
    match.events.push({ ...createEvent(match, type, team), ...extra });
  }
  for (const [half, types] of [
    [1, ["goal", "point", "two-point", "miss"]],
    [2, ["point", "miss", "miss"]],
  ])
    for (const type of types)
      event(half, type, "our", {
        playerNumber: "6",
        shotX: 0.5,
        shotY: type === "miss" ? 0.6 : 0.2,
      });
  event(1, "point", "opposition");
  event(2, "two-point", "opposition");
  event(2, "goal", "opposition");
  for (const [half, outcomes] of [
    [1, ["won", "won", "lost", "unknown"]],
    [2, ["won", "lost", "lost"]],
  ])
    outcomes.forEach((outcome, i) =>
      event(half, "our-kickout", "our", {
        outcome,
        ...(i === 0 ? { mark: true, markPlayerNumber: "8" } : {}),
      }),
    );
  for (const [half, outcomes] of [
    [1, ["won", "lost", "lost", "lost"]],
    [2, ["won", "won", "won", "lost"]],
  ])
    outcomes.forEach((outcome) =>
      event(half, "opposition-kickout", "opposition", { outcome }),
    );
  for (const [half, won, lost] of [
    [1, 3, 1],
    [2, 1, 3],
  ]) {
    for (let i = 0; i < won; i++) event(half, "turnover-won");
    for (let i = 0; i < lost; i++) event(half, "turnover-lost");
  }
  event(1, "defensive-block", "our", { playerNumber: "4" });
  event(2, "defensive-block", "our", { playerNumber: "4" });
  event(2, "defensive-block", "our", { playerNumber: "4" });
  match.clock = { half: 2, elapsedMs: 120000, startedAt: null };
  return match;
}
