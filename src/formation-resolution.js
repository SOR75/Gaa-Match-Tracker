import { POSITIONS, candidate } from "./import-parser.js";
import { associateRosterClue } from "./roster-formation.js";
const identity = (name) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
export function createFormationResolution({ roster, formation }) {
  const pool = roster.map((p, i) => ({ ...p, id: `roster-${i}` }));
  const slots = Array.from({ length: 15 }, (_, i) => {
    const source = formation[i] || { number: "", reads: [] };
    const result = associateRosterClue(source.reads, pool);
    const possible = new Set(
      result.evidence?.flatMap((e) => e.possible.map((p) => p.id)) || [],
    );
    const clue =
      source.reads
        .flatMap((r) => r.words)
        .filter(
          (w) =>
            w.confidence >= 25 &&
            /\p{L}{3}/u.test(w.text) &&
            result.evidence?.some((e) => e.token === identity(w.text)),
        )
        .sort((a, b) => b.confidence - a.confidence)[0]?.text || "";
    return {
      number: i + 1,
      position: POSITIONS[i],
      playerId: result.matched?.id || "",
      automatic: !!result.matched,
      alternatives: [...possible],
      clue,
      warning: result.warning,
    };
  });
  const duplicateIds = new Set(
    slots
      .filter(
        (slot) =>
          slot.playerId &&
          slots.some(
            (other) =>
              other !== slot &&
              other.playerId &&
              identity(pool.find((p) => p.id === other.playerId).name) ===
                identity(pool.find((p) => p.id === slot.playerId).name),
          ),
      )
      .map((slot) => slot.playerId),
  );
  for (const slot of slots)
    if (duplicateIds.has(slot.playerId)) {
      slot.playerId = "";
      slot.automatic = false;
      slot.warning =
        "Review: the same printed player matched more than one position";
    }
  return { roster: pool, slots };
}
export function assignedElsewhere(state, playerId, number) {
  const p = state.roster.find((p) => p.id === playerId);
  return state.slots.find(
    (s) =>
      s.number !== number &&
      s.playerId &&
      identity(state.roster.find((p) => p.id === s.playerId)?.name || "") ===
        identity(p?.name || ""),
  );
}
export function assignFormationPlayer(state, number, playerId) {
  if (!state.slots.some((s) => s.number === number))
    throw Error("Unknown formation position");
  if (playerId && !state.roster.some((p) => p.id === playerId))
    throw Error("Choose a player from this sheet's printed roster");
  if (playerId && assignedElsewhere(state, playerId, number))
    throw Error("That player is already assigned to another position");
  return {
    ...state,
    slots: state.slots.map((s) =>
      s.number === number ? { ...s, playerId, automatic: false } : s,
    ),
  };
}
export function correctRosterName(state, id, name) {
  name = name.trim();
  if (!name || name.length > 80)
    throw Error("Enter the printed full name (up to 80 characters)");
  if (
    state.roster.some((p) => p.id !== id && identity(p.name) === identity(name))
  )
    throw Error("That printed player is already in the roster");
  return {
    ...state,
    roster: state.roster.map((p) =>
      p.id === id ? { ...p, name, uncertain: false, corrected: true } : p,
    ),
  };
}
export function formationReady(state) {
  return (
    state.slots.length === 15 &&
    state.slots.every((s) => s.playerId)
  );
}
export function confirmedFormationPlayers(state) {
  if (!formationReady(state))
    throw Error(
      "Assign a printed-roster player to all 15 positions before confirming",
    );
  const used = new Set(),
    names = new Set();
  const starters = state.slots.map((s) => {
    const p = state.roster.find((p) => p.id === s.playerId);
    if (!p || used.has(p.id) || names.has(identity(p.name)))
      throw Error("Duplicate player assignment: review the formation");
    used.add(p.id);
    names.add(identity(p.name));
    const row = candidate(
      String(s.number),
      p.name,
      "starter",
      s.position,
      "Coach-confirmed formation assignment",
    );
    row.notes = `Printed reference: ${p.name} · ${s.automatic ? "OCR pairing verified by team confirmation" : "Player selected by coach"}${p.uncertain ? " · Review printed name: OCR uncertain" : ""}${p.corrected ? " · Printed name corrected by coach" : ""}`;
    return row;
  });
  return [
    ...starters,
    ...state.roster
      .filter((p) => !used.has(p.id))
      .map((p) => {
        const row = candidate(
          "",
          p.name,
          "substitute",
          "",
          "Unassigned printed roster; substitute jersey unknown",
        );
        row.notes = `Printed reference roster · Substitute jersey unknown; no list index used${p.uncertain ? " · Review printed name: OCR uncertain" : ""}`;
        return row;
      }),
  ];
}
