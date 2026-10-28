import { uid } from "./ids.js";
import { validPlayerId } from "./identity.js";
import { loadSquads, loadSquadPlayers, validatePlayers } from "./squads.js";
const KEY = "sideline.team-setups.v1";
function validSetup(s) {
  return (
    s &&
    validPlayerId(s.id) &&
    typeof s.name === "string" &&
    s.name.trim() &&
    typeof s.squadId === "string" &&
    Array.isArray(s.players) &&
    s.players.length &&
    s.players.every(
      (p) =>
        validPlayerId(p.playerId) &&
        ["starter", "substitute", "panel"].includes(p.role) &&
        (p.number === null ||
          (Number.isInteger(p.number) && p.number >= 1 && p.number <= 99)),
    ) &&
    new Set(s.players.map((p) => p.playerId)).size === s.players.length &&
    new Set(s.players.filter((p) => p.number !== null).map((p) => p.number))
      .size === s.players.filter((p) => p.number !== null).length
  );
}
export function loadTeamSetups() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { setups: [], error: "" };
    const d = JSON.parse(raw);
    if (
      d.version !== 1 ||
      !Array.isArray(d.setups) ||
      !d.setups.every(validSetup) ||
      new Set(d.setups.map((s) => s.id)).size !== d.setups.length
    )
      throw Error();
    return { setups: d.setups, error: "" };
  } catch {
    return {
      setups: [],
      error:
        "Saved team setups could not be read. Existing data has been preserved; recover it before saving another setup.",
    };
  }
}
export function saveTeamSetup(name, squadId, players) {
  const current = loadTeamSetups(),
    library = loadSquads();
  if (current.error || library.error)
    throw Error(current.error || library.error);
  if (!name.trim() || name.trim().length > 80)
    throw Error("Enter a team setup name (up to 80 characters).");
  if (
    current.setups.some(
      (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
    )
  )
    throw Error(
      "That setup name already exists. Choose another name; existing setups are never overwritten.",
    );
  const squad = library.squads.find((s) => s.id === squadId);
  if (
    !squad ||
    !players.length ||
    players.some(
      (p) =>
        !validPlayerId(p.playerId) ||
        !squad.players.some((q) => q.playerId === p.playerId),
    )
  )
    throw Error(
      "Load a Saved Squad first. Every setup player must already belong to that permanent Squad; no new players are created here.",
    );
  const rows = validatePlayers(players);
  const setup = {
    id: uid(),
    name: name.trim(),
    squadId,
    createdAt: new Date().toISOString(),
    players: rows.map((p) => ({
      playerId: p.playerId,
      number: p.number,
      role: p.role,
    })),
  };
  if (!validSetup(setup))
    throw Error("Review duplicate players or jerseys before saving.");
  localStorage.setItem(
    KEY,
    JSON.stringify({ version: 1, setups: [...current.setups, setup] }),
  );
  return setup;
}
export function applyTeamSetup(setup, squad, existing = []) {
  if (!validSetup(setup) || !squad || setup.squadId !== squad.id)
    throw Error(
      "This setup needs its original Saved Squad. Historical matches are unaffected.",
    );
  const missing = setup.players.filter(
    (p) => !squad.players.some((q) => q.playerId === p.playerId),
  );
  if (missing.length)
    throw Error(
      `${missing.length} setup players are no longer in the Saved Squad. Review the source squad before using this setup.`,
    );
  const players = loadSquadPlayers(squad, existing, { matchDay: true }).map(
    (p) => {
      const defaults = setup.players.find((q) => q.playerId === p.playerId);
      return {
        ...p,
        number: defaults?.number ?? null,
        jerseyNumber: defaults?.number ?? null,
        role: defaults?.role || "panel",
      };
    },
  );
  return validatePlayers(players);
}
