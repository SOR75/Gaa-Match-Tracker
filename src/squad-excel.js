import { snapshotSquad } from "./squads.js";

export const SQUAD_COLUMNS = ["Player Name *", "Default No."];
const legacyColumns = ["preferred position", "second position", "status"];
const setupFields = {
  "club name": "clubName",
  "squad name": "squadName",
  season: "seasonLabel",
  code: "code",
  "coach / manager": "coach",
};
const text = (value) =>
  value == null ? "" : String(value).replace(/\s+/gu, " ").trim();
const heading = (value) =>
  text(value)
    .toLowerCase()
    .replace(/\s*\*$/, "")
    .replace(/\.$/, "")
    .replace(/\s+/g, " ");
const unsupported = (detail) =>
  new Error(
    `${detail} Use the official Sideline Squad Import Template (.xlsx) with Squad Setup and Players sheets.`,
  );

// A deliberately narrow contract, independent of the match-day OCR/XLSX route.
export function parseOfficialSquad(sheets) {
  if (!Array.isArray(sheets)) throw unsupported("Unsupported workbook.");
  const find = (name) => sheets.filter((s) => s.sheet === name);
  if (find("Players").length !== 1)
    throw unsupported("Missing or duplicate Players sheet.");
  if (find("Squad Setup").length !== 1)
    throw unsupported("Missing or duplicate Squad Setup sheet.");
  const setup = find("Squad Setup")[0].data,
    table = find("Players")[0].data;
  if (!Array.isArray(setup) || !Array.isArray(table))
    throw unsupported("Malformed workbook.");
  const metadata = {},
    seen = new Set();
  for (const row of setup) {
    const key = heading(row?.[0]),
      field = Object.hasOwn(setupFields, key) ? setupFields[key] : null;
    if (field) {
      if (seen.has(key)) throw unsupported("Duplicate Squad Setup field.");
      seen.add(key);
      metadata[field] = text(row.slice(1).find((v) => text(v) !== ""));
    }
  }
  if (
    ["club name", "squad name", "season", "code"].some((key) => !seen.has(key))
  )
    throw unsupported("Missing expected Squad Setup fields.");
  const index = table.findIndex((row) => heading(row?.[0]) === "player name");
  if (index < 0) throw unsupported("Missing Player Name column.");
  const headers = table[index].map(heading);
  while (headers.at(-1) === "") headers.pop();
  const hasNumber = headers[1] === "default no";
  const tail = headers.slice(hasNumber ? 2 : 1);
  if (
    tail.some((h) => !legacyColumns.includes(h)) ||
    new Set(headers).size !== headers.length
  )
    throw unsupported("Missing or incorrect Players columns.");
  const players = [];
  table.slice(index + 1).forEach((row, i) => {
    if (!row) return;
    if (row.slice(headers.length).some((v) => text(v)))
      throw unsupported("Unexpected player columns.");
    const name = text(row[0]),
      number = hasNumber ? text(row[1]) : "";
    // Deprecated position/status cells are deliberately ignored, including on
    // unused rows. They are not Squad membership or availability information.
    if (!name && !number) return;
    players.push({ sourceRow: index + i + 2, name, number });
  });
  return { metadata, players };
}
export function validateSquadDraft(draft) {
  const names = new Map(),
    numbers = new Map();
  for (const p of draft.players) {
    const name = text(p.name).toLowerCase(),
      number = text(p.number);
    if (name) names.set(name, (names.get(name) || 0) + 1);
    if (/^\d{1,2}$/.test(number) && +number >= 1 && +number <= 99)
      numbers.set(+number, (numbers.get(+number) || 0) + 1);
  }
  const rows = draft.players.map((p) => {
    const errors = [],
      warnings = [],
      name = text(p.name),
      raw = text(p.number);
    if (!name || name.length > 80)
      errors.push("Review name: enter a player name (up to 80 characters).");
    if (raw && (!/^\d{1,2}$/.test(raw) || +raw < 1 || +raw > 99))
      errors.push("Review default number: blank or 1–99.");
    else if (raw && numbers.get(+raw) > 1)
      errors.push(
        "Duplicate default number: correct or clear before creating.",
      );
    if (names.get(name.toLowerCase()) > 1)
      warnings.push(
        "Duplicate name: keep both only if they are different players. Separate IDs will be created.",
      );
    return {
      errors,
      warnings,
      player: {
        name,
        number: raw ? Number(raw) : null,
        position: "",
        secondaryPosition: "",
        status: "active",
        role: "starter",
        notes: "",
      },
    };
  });
  const metadataErrors = Object.values(draft.metadata).some(
    (v) => text(v).length > 80,
  )
    ? ["Squad fields must be up to 80 characters."]
    : [];
  return {
    rows,
    metadataErrors,
    valid:
      rows.length > 0 &&
      rows.every((r) => !r.errors.length) &&
      !metadataErrors.length,
    ready: rows.filter((r) => !r.errors.length && !r.warnings.length).length,
  };
}
export const importedSquadName = (metadata) =>
  [metadata.clubName, metadata.squadName, metadata.seasonLabel]
    .map(text)
    .filter(Boolean)
    .join(" — ") || "Imported squad";
export function createImportedSquad(draft) {
  const result = validateSquadDraft(draft);
  if (!result.valid)
    throw new Error(
      "Correct the highlighted fields before creating the squad.",
    );
  const metadata = Object.fromEntries(
    Object.keys(setupFields).map((key) => {
      const field = Object.hasOwn(setupFields, key) ? setupFields[key] : null;
      return [field, text(draft.metadata[field])];
    }),
  );
  // This is the first identity-creation boundary; review/parsing never creates IDs.
  return snapshotSquad(
    importedSquadName(metadata),
    result.rows.map((r) => r.player),
    undefined,
    metadata,
  );
}
export async function readOfficialSquad(file) {
  if (!/\.xlsx$/i.test(file.name) || file.size > 15 * 1024 * 1024)
    throw unsupported("Choose an .xlsx workbook smaller than 15 MB.");
  let sheets;
  try {
    const { default: readWorkbook } = await import("read-excel-file/browser");
    sheets = await readWorkbook(file);
  } catch {
    throw unsupported(
      "The workbook could not be read (it may be malformed or protected).",
    );
  }
  return parseOfficialSquad(sheets);
}
