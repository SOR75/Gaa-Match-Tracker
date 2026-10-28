import { uid, validPlayer } from "./domain.js";
import {
  createMatchPlayer,
  createSquadPlayer,
  validPlayerId,
} from "./identity.js";
const KEY = "sideline.squads.v2",
  LEGACY = "sideline.squads.v1";
const baseValid = (data) =>
  Array.isArray(data.squads) &&
  data.squads.every(
    (s) =>
      typeof s.id === "string" &&
      typeof s.name === "string" &&
      Array.isArray(s.players) &&
      s.players.every(validPlayer),
  );
function validateLibrary(squads) {
  const squadIds = new Set();
  for (const s of squads) {
    if (squadIds.has(s.id)) throw Error("Duplicate saved squad ID");
    squadIds.add(s.id);
    const ids = new Set();
    for (const p of s.players) {
      if (
        !validPlayerId(p.playerId) ||
        p.id !== p.playerId ||
        ids.has(p.playerId)
      )
        throw Error("Saved player identity needs recovery");
      ids.add(p.playerId);
    }
  }
}
export function loadSquads() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version !== 2 || !baseValid(data))
        throw Error("Invalid library");
      validateLibrary(data.squads);
      return { squads: data.squads, error: "" };
    }
    const oldRaw = localStorage.getItem(LEGACY);
    if (!oldRaw) return { squads: [], error: "" };
    const old = JSON.parse(oldRaw);
    if (old.version !== 1 || !baseValid(old))
      throw Error("Invalid legacy library");
    const counts = new Map();
    for (const s of old.squads)
      for (const p of s.players) counts.set(p.id, (counts.get(p.id) || 0) + 1);
    const squads = old.squads.map((s) => ({
      ...s,
      clubId: null,
      seasonId: null,
      players: s.players.map((p) =>
        createSquadPlayer({
          ...p,
          playerId: validPlayerId(p.id) && counts.get(p.id) === 1 ? p.id : null,
        }),
      ),
    }));
    validateLibrary(squads);
    // Confirm durable v2 storage before exposing newly established identities.
    // Original v1 bytes remain untouched for recovery/frozen-build compatibility.
    localStorage.setItem(KEY, JSON.stringify({ version: 2, squads }));
    return { squads, error: "" };
  } catch {
    return {
      squads: [],
      error:
        "Saved squads could not be read or upgraded. Original squad storage has been preserved; seek recovery before saving squads.",
    };
  }
}
export function persistSquads(squads) {
  const loaded = loadSquads();
  if (loaded.error) throw Error(loaded.error);
  if (!baseValid({ squads })) throw Error("Invalid saved squad");
  validateLibrary(squads);
  localStorage.setItem(KEY, JSON.stringify({ version: 2, squads }));
}
export function validatePlayers(players, existing = []) {
  const numbers = new Set(
      existing.filter((p) => Number.isInteger(p.number)).map((p) => p.number),
    ),
    ids = new Set();
  if (!players.length) throw Error("Add at least one player.");
  return players.map((p, index) => {
    const number =
        p.number === null || String(p.number ?? " ").trim() === ""
          ? null
          : Number(p.number),
      name = String(p.name || "").trim();
    if (
      (number !== null &&
        (!Number.isInteger(number) || number < 1 || number > 99)) ||
      !name ||
      name.length > 80
    )
      throw Error(
        `Row ${index + 1}: enter a name and either a blank jersey or a number 1–99 (up to 80 characters).`,
      );
    if (number !== null && numbers.has(number))
      throw Error(
        `Duplicate jersey #${number}. Edit or remove the duplicate row before confirming.`,
      );
    if (validPlayerId(p.playerId) && ids.has(p.playerId))
      throw Error("The same permanent player is listed more than once.");
    if (validPlayerId(p.playerId)) ids.add(p.playerId);
    if (number !== null) numbers.add(number);
    return {
      ...p,
      number,
      name,
      role: ["starter", "substitute", "panel"].includes(p.role)
        ? p.role
        : "starter",
      position: String(p.position || ""),
      notes: String(p.notes || ""),
    };
  });
}
export function snapshotSquad(name, players, id = uid(), metadata = {}) {
  if (!name.trim()) throw Error("Enter a squad name.");
  return {
    id,
    name: name.trim(),
    clubId: metadata.clubId || null,
    seasonId: metadata.seasonId || null,
    ...Object.fromEntries(
      ["clubName", "squadName", "seasonLabel", "code", "coach"]
        .filter((key) => metadata[key] !== undefined)
        .map((key) => [key, String(metadata[key])]),
    ),
    players: validatePlayers(players).map(createSquadPlayer),
  };
}
export function loadSquadPlayers(
  squad,
  existing = [],
  { matchDay = false } = {},
) {
  return validatePlayers(
    structuredClone(squad.players).map((p) =>
      matchDay ? { ...p, number: null } : p,
    ),
  ).map((p) => {
    const old = validPlayerId(p.playerId)
      ? existing.find((e) => e.playerId === p.playerId)
      : null;
    return createMatchPlayer({
      ...p,
      ...(matchDay
        ? {
            number: old?.number ?? null,
            position: old?.position || "",
            role: old?.role || "panel",
          }
        : {}),
      id: old?.id || uid(),
      matchPlayerId: old?.matchPlayerId || old?.id || undefined,
      sourceSquadId: squad.id,
    });
  });
}
