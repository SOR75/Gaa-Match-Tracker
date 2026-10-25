import { uid, validPlayer } from "./domain.js";
const KEY = "sideline.squads.v1";
export function loadSquads() {
  try {
    const data = JSON.parse(
      localStorage.getItem(KEY) || '{"version":1,"squads":[]}',
    );
    if (
      data.version !== 1 ||
      !Array.isArray(data.squads) ||
      !data.squads.every(
        (squad) =>
          typeof squad.id === "string" &&
          typeof squad.name === "string" &&
          Array.isArray(squad.players) &&
          squad.players.every(validPlayer),
      )
    )
      throw new Error();
    return { squads: data.squads, error: "" };
  } catch {
    return {
      squads: [],
      error:
        "Saved squads could not be read. Existing squad storage has been preserved; reload after recovery before saving squads.",
    };
  }
}
export function persistSquads(squads) {
  // Never overwrite a corrupt library with an apparently empty one.
  if (loadSquads().error) throw new Error(loadSquads().error);
  localStorage.setItem(KEY, JSON.stringify({ version: 1, squads }));
}
export function validatePlayers(players, existing = []) {
  const numbers = new Set(
    existing
      .filter((player) => Number.isInteger(player.number))
      .map((player) => player.number),
  );
  if (!players.length) throw new Error("Add at least one player.");
  return players.map((player, index) => {
    const number =
      player.number === null || String(player.number ?? " ").trim() === ""
        ? null
        : Number(player.number);
    const name = String(player.name || "").trim();
    if (
      (number !== null &&
        (!Number.isInteger(number) || number < 1 || number > 99)) ||
      !name ||
      name.length > 80
    )
      throw new Error(
        `Row ${index + 1}: enter a name and either a blank jersey or a number 1–99 (up to 80 characters).`,
      );
    if (number !== null && numbers.has(number))
      throw new Error(
        `Duplicate jersey #${number}. Edit or remove the duplicate row before confirming.`,
      );
    if (number !== null) numbers.add(number);
    return {
      id: uid(),
      number,
      name,
      role: ["starter", "substitute", "panel"].includes(player.role)
        ? player.role
        : "starter",
      position: String(player.position || ""),
      notes: String(player.notes || ""),
    };
  });
}
// Copies protect saved templates and match snapshots from sharing mutable objects.
export function snapshotSquad(name, players, id = uid()) {
  if (!name.trim()) throw new Error("Enter a squad name.");
  return { id, name: name.trim(), players: validatePlayers(players) };
}
export function loadSquadPlayers(squad) {
  return validatePlayers(structuredClone(squad.players));
}
