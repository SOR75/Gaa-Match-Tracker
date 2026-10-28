import { kickoutDetails } from "./kickouts.js";
import {
  participantRef,
  participantKey,
  resolveParticipant,
  roleNumber,
} from "./identity.js";
export const KICKOUT_PLAYER_THRESHOLD = 3;
// Count distinct successful kickout events, not touches or a separate Mark event.
export function kickoutPlayerPatterns(match, events = match.events) {
  const groups = new Map();
  function credit(e, role, team, mark) {
    const number = roleNumber(e, role);
    if (!/^[1-9]\d?$/.test(number)) return;
    const ref = participantRef(e, role),
      key = ref?.playerId
        ? `${team}:player:${ref.playerId}`
        : participantKey(e, role);
    if (!key) return;
    if (!groups.has(key)) {
      const p = resolveParticipant(match, e, role);
      groups.set(key, {
        key,
        team,
        name: p?.name === "Unlisted player" ? "" : p?.name || "",
        numbers: new Set(),
        events: new Set(),
        marks: new Set(),
      });
    }
    const g = groups.get(key);
    g.numbers.add(number);
    g.events.add(e.id);
    if (mark) g.marks.add(e.id);
  }
  for (const e of events) {
    const k = kickoutDetails(e);
    if (!k) continue;
    if (k.outcome === "won") {
      if (e.team === "our")
        credit(
          e,
          "player",
          "our",
          k.mark && k.markPlayerNumber === String(e.playerNumber),
        );
      if (k.markPlayerNumber) credit(e, "markWinner", "our", true);
    } else if (
      e.event === "opposition-kickout" &&
      e.team === "opposition" &&
      k.outcome === "lost"
    )
      credit(e, "player", "opposition", k.mark);
  }
  return ["our", "opposition"].flatMap((team) => {
    const candidates = [...groups.values()]
      .filter(
        (g) => g.team === team && g.events.size >= KICKOUT_PLAYER_THRESHOLD,
      )
      .sort(
        (a, b) =>
          b.events.size - a.events.size ||
          b.marks.size - a.marks.size ||
          a.key.localeCompare(b.key),
      );
    const g = candidates[0];
    if (!g) return [];
    return [
      {
        team,
        key: g.key,
        name: g.name,
        numbers: [...g.numbers].sort((a, b) => +a - +b),
        count: g.events.size,
        marks: g.marks.size,
      },
    ];
  });
}
export function enhanceKickoutObservations(observations, match, events) {
  const result = observations.map((o) => ({ ...o }));
  for (const p of kickoutPlayerPatterns(match, events)) {
    const jersey = p.numbers.map((n) => "#" + n).join("/"),
      label = `${jersey}${p.name ? " " + p.name : ""}`;
    if (p.team === "opposition") {
      const kickouts = events.filter((e) => e.event === "opposition-kickout"),
        known = kickouts.filter((e) => kickoutDetails(e).outcome !== "unknown"),
        retained = known.filter((e) => kickoutDetails(e).outcome === "lost");
      const team = match.setup.opposition || "Opposition";
      const detail = `${team} retained ${retained.length} of ${known.length} opposition kickouts with a known outcome. ${label} was credited on ${p.count} of those.`;
      const old = result.find(
        (o) => o.kind === "watch" && o.title.startsWith("Opposition kickout"),
      );
      if (old) {
        old.title = `Opposition kickout — ${label} concentration`;
        old.detail = `${old.detail} ${detail}`;
      } else
        result.push({
          kind: "watch",
          title: `Opposition kickout — ${label} concentration`,
          detail,
        });
    } else {
      const detail =
        p.marks === p.count
          ? `${label} was credited with ${p.marks} kickout Marks.`
          : `${label} was credited on ${p.count} kickouts where we secured possession${p.marks ? `, including ${p.marks} recorded Marks` : ""}.`;
      const old = result.find(
        (o) => o.kind === "working" && o.title.startsWith("Our kickout"),
      );
      if (old) {
        old.title = `Our kickout — ${label} contribution`;
        old.detail += ` ${detail}`;
      } else
        result.push({
          kind: "working",
          title: `Kickouts — ${label} contribution`,
          detail,
        });
    }
  }
  return result;
}
