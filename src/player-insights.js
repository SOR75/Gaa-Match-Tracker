import { validPlayerId, participantRef } from "./identity.js";
import { playerStatistics, percentage } from "./analysis.js";
import { participationFor, hasMatchEvidence } from "./participation.js";
const metrics = [
  "goals",
  "points",
  "twoPointers",
  "total",
  "attempts",
  "successful",
  "misses",
  "wides",
  "blockedAttempts",
  "defensiveBlocks",
  "interceptions",
  "turnoversWon",
  "turnoversLost",
  "kickoutMarks",
  "possessions",
  "kickoutInvolvement",
];
function dateValue(record) {
  return (
    Date.parse(
      record.match.setup.date ||
        record.match.lifecycle?.completedAt ||
        record.archivedAt ||
        "",
    ) || 0
  );
}
function recordedTime(record) {
  const m = record.match;
  return (
    Date.parse(m.lifecycle?.completedAt || record.archivedAt || "") ||
    Math.max(0, ...m.events.map((e) => Date.parse(e.createdAt || "") || 0))
  );
}
export function playerReviews(records, squads = [], active = null) {
  const matches = new Map(records.map((r) => [r.match.id, r]));
  if (active)
    matches.set(active.id, { id: active.id, match: active, current: true });
  const profiles = new Map();
  function profile(id, name) {
    if (!validPlayerId(id)) return null;
    if (!profiles.has(id))
      profiles.set(id, { playerId: id, name, squads: new Set(), matches: [] });
    return profiles.get(id);
  }
  for (const s of squads)
    for (const p of s.players) {
      const q = profile(p.playerId, p.name);
      if (q) q.squads.add(s.name);
    }
  for (const record of [...matches.values()].sort(
    (a, b) =>
      dateValue(b) - dateValue(a) ||
      recordedTime(b) - recordedTime(a) ||
      b.match.id.localeCompare(a.match.id),
  )) {
    const m = record.match;
    if (!hasMatchEvidence(m)) continue;
    const roster = new Map();
    for (const p of m.players)
      if (validPlayerId(p.playerId)) roster.set(p.playerId, p);
    for (const e of m.events)
      for (const role of ["player", "blocker", "markWinner"]) {
        const ref = participantRef(e, role);
        if (
          ref?.team === "our" &&
          validPlayerId(ref.playerId) &&
          !roster.has(ref.playerId)
        )
          roster.set(ref.playerId, {
            id: ref.matchPlayerId,
            matchPlayerId: ref.matchPlayerId,
            playerId: ref.playerId,
            name: ref.nameSnapshot,
            number: ref.jerseyNumber,
            role: "unknown",
            eventOnly: true,
          });
      }
    const stats = playerStatistics(m, "our");
    for (const [id, p] of roster) {
      const q = profile(id, p.name),
        participation = participationFor(m, p);
      const total = Object.fromEntries(
        metrics.map((key) => [
          key,
          stats
            .filter((s) => s.playerId === id)
            .reduce((n, s) => n + (s[key] || 0), 0),
        ]),
      );
      q.matches.push({
        matchId: m.id,
        nameSnapshot: p.name,
        opponent: m.setup.opposition || "Opposition",
        date: m.setup.date || "",
        jersey: p.number,
        role: p.role,
        ...participation,
        named: !p.eventOnly,
        ...total,
        current: !!record.current,
      });
      // No name/number matching: historical source Squad is shown only by stored ID.
      const source = squads.find(
        (s) => s.id === (p.sourceSquadId || m.squadId),
      );
      if (source) q.squads.add(source.name);
    }
  }
  return [...profiles.values()]
    .map((q) => {
      const total = Object.fromEntries(
          metrics.map((key) => [
            key,
            q.matches.reduce((n, m) => n + m[key], 0),
          ]),
        ),
        recent = q.matches.slice(0, 6);
      return {
        ...q,
        squads: [...q.squads],
        ...total,
        conversion: percentage(total.successful, total.attempts),
        named: q.matches.filter((m) => m.named).length,
        appearances: q.matches.filter((m) => m.appeared).length,
        starts: q.matches.filter((m) => m.started).length,
        substituteAppearances: q.matches.filter((m) => m.substituteAppearance)
          .length,
        didNotPlay: q.matches.filter((m) => m.didNotPlay).length,
        recent: {
          sample: recent.length,
          played: recent.filter((m) => m.appeared).length,
          started: recent.filter((m) => m.started).length,
        },
      };
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId),
    );
}
