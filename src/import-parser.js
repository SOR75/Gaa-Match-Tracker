import {
  parseProgrammeSegments,
  isMetadata,
  isFooter,
  stripCaptain,
  plausibleName,
  numberedEntries,
} from "./programme-parser.js";
export const POSITIONS = [
  "Goalkeeper",
  "Right Corner Back",
  "Full Back",
  "Left Corner Back",
  "Right Half Back",
  "Centre Half Back",
  "Left Half Back",
  "Midfield",
  "Midfield",
  "Right Half Forward",
  "Centre Half Forward",
  "Left Half Forward",
  "Right Corner Forward",
  "Full Forward",
  "Left Corner Forward",
];
export const numberOrBlank = (value) =>
  /^\d{1,2}$/.test(String(value ?? "").trim()) && +value >= 1 && +value <= 99
    ? String(+value)
    : "";
export const ticked = (value) =>
  /^(?:✓|✔|☑|\[x\]|x|yes|true|1|starting|starter)$/i.test(
    String(value ?? "").trim(),
  );
const nameLike = (text) =>
  /\p{L}/u.test(text) &&
  text.length <= 100 &&
  !/^(?:substitutes?|subs|starting(?: xv| 15)?|team(?: sheet)?|players?|jersey|position|starting|home|away|foireann|lgfa|registered panel|page \d+)$/i.test(
    text.trim(),
  );
export function candidate(
  number,
  name,
  role = "starter",
  position = "",
  confidence = "Review required",
) {
  const cleaned = stripCaptain(name);
  return {
    number: numberOrBlank(number),
    name: cleaned.name,
    role,
    position,
    notes: cleaned.notes,
    confidence: confidence + (cleaned.notes ? ` · ${cleaned.notes}` : ""),
  };
}
export function parseTextPlayers(text, { layout = "auto" } = {}) {
  const players = [];
  let substitutes = false,
    explicitStarters = false,
    registered = layout === "registered";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isFooter(line)) break;
    if (/foireann|registered panel|starting.*(?:sub|jersey)/i.test(line))
      registered = true;
    if (/^(subs(?:titutes)?|replacements?|fir ionaid)\b/i.test(line)) {
      substitutes = true;
      explicitStarters = false;
      const rest = line.replace(
        /^(subs(?:titutes)?|replacements?|fir ionaid)\s*[:.\-]?\s*/i,
        "",
      );
      for (const entry of numberedEntries(rest))
        players.push(
          candidate(
            entry.number,
            entry.name,
            "substitute",
            "",
            "Number/name pair in Subs section — verify",
          ),
        );
      continue;
    }
    if (/^(starting\s*(?:xv|15)|starters)\s*:?$/i.test(line)) {
      substitutes = false;
      explicitStarters = true;
      continue;
    }
    if (isMetadata(line)) continue;
    // Pasted tabular data is handled by the table adapter; these are ordinary lines.
    const match = line.match(
      /^(?:#?\(?\s*(\d{1,2}|\?)\s*[.)\-:]?\s+)?(.+?)(?:\s+(✓|✔|☑|\[x\]|\[ \]))?$/u,
    );
    if (!match) continue;
    let [, number, name, tick] = match;
    const suffix = name.match(/\s+\((starter|substitute|sub|panel)\)$/i);
    if (suffix) name = name.slice(0, suffix.index);
    if (
      !plausibleName(name, { uncertain: Boolean(number) }) ||
      (!number && !explicitStarters && !registered)
    )
      continue;
    const jersey = numberOrBlank(number);
    const role = registered
      ? jersey
        ? ticked(tick)
          ? "starter"
          : "substitute"
        : "panel"
      : suffix
        ? suffix[1].toLowerCase() === "starter"
          ? "starter"
          : suffix[1].toLowerCase() === "panel"
            ? "panel"
            : "substitute"
        : substitutes
          ? "substitute"
          : explicitStarters
            ? "starter"
            : layout === "formation"
              ? "starter"
              : jersey && +jersey > 15
                ? "substitute"
                : "starter";
    const position =
      !registered && layout !== "formation" && !substitutes && +jersey <= 15
        ? POSITIONS[+jersey - 1] || ""
        : "";
    players.push(
      candidate(
        jersey,
        name,
        role,
        position,
        registered
          ? "Printed/pasted text — verify jersey and Starting marker"
          : position
            ? "Default jersey position suggestion — verify actual position"
            : "Text extracted — verify name, jersey and role",
      ),
    );
  }
  if (players.length > 1000)
    throw new Error(
      "More than 1,000 candidates. Import the team-sheet section only.",
    );
  return players;
}
export function parseTablePlayers(rows, { layout = "auto" } = {}) {
  rows = rows.filter((row) => row.some((value) => String(value ?? "").trim()));
  const header = (rows[0] || []).map((value) =>
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
  const find = (names) => header.findIndex((value) => names.includes(value));
  const nameAt = find([
    "name",
    "player",
    "player name",
    "full name",
    "registered name",
  ]);
  let numberAt = find([
    "number",
    "jersey",
    "jersey number",
    "jersey no",
    "jersey no.",
    "shirt",
    "shirt number",
    "no",
    "no.",
  ]);
  const positionAt = find(["position", "playing position"]);
  const roleAt = find([
    "role",
    "starter/substitute",
    "starter/sub",
    "match role",
    "status",
  ]);
  const startingAt = header.findIndex((value) => /^starting\b/.test(value)); // first Starting column only
  const hasHeader = nameAt >= 0;
  const registered = layout === "registered" || startingAt >= 0;
  if (registered && ["no", "no."].includes(header[numberAt])) numberAt = -1;
  const data = hasHeader ? rows.slice(1) : rows;
  if (data.length > 1000)
    throw new Error(
      "More than 1,000 rows. Import the team-sheet section only.",
    );
  return data
    .map((row) => {
      const number = numberOrBlank(row[hasHeader ? numberAt : 0]);
      const name = String(row[hasHeader ? nameAt : 1] ?? "").trim();
      const statedRole = String(row[hasHeader ? roleAt : 2] ?? "")
        .toLowerCase()
        .trim();
      const role = registered
        ? number
          ? ticked(row[startingAt])
            ? "starter"
            : "substitute"
          : "panel"
        : /^(sub|substitute)$/.test(statedRole)
          ? "substitute"
          : /^(panel|not selected|registered)$/.test(statedRole)
            ? "panel"
            : "starter";
      return candidate(
        number,
        name,
        role,
        String(row[positionAt] ?? ""),
        registered
          ? "Table: jersey + first Starting column — verify marks"
          : "Structured table — Review required",
      );
    })
    .filter((player) => player.name);
}
// Group spatial words into visual rows and split widely separated formation columns.
export function spatialSegments(words) {
  const cleaned = words.filter(
    (word) =>
      word.text?.trim() && Number.isFinite(word.x) && Number.isFinite(word.y),
  );
  if (!cleaned.length) return [];
  const heights = cleaned.map((word) => word.h || 12).sort((a, b) => a - b);
  const height = heights[Math.floor(heights.length / 2)] || 12;
  const rows = [];
  for (const word of cleaned.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find(
      (row) => Math.abs(row.y - word.y) < Math.max(height * 0.65, 4),
    );
    if (!row) {
      row = { y: word.y, words: [] };
      rows.push(row);
    }
    row.words.push(word);
  }
  return rows.flatMap((row) => {
    const parts = [];
    let part = [];
    const finish = () => {
      if (!part.length) return;
      const x = Math.min(...part.map((w) => w.x)),
        y = Math.min(...part.map((w) => w.y));
      parts.push({
        text: part.map((w) => w.text).join(" "),
        x,
        y,
        w: Math.max(...part.map((w) => w.x + w.w)) - x,
        h: Math.max(...part.map((w) => w.y + w.h)) - y,
        confidence: Math.min(...part.map((w) => w.confidence ?? 100)),
      });
      part = [];
    };
    for (const word of row.words.sort((a, b) => a.x - b.x)) {
      if (part.length && word.x - (part.at(-1).x + part.at(-1).w) >= height * 2)
        finish();
      part.push(word);
    }
    finish();
    return parts;
  });
}
export function parseSpatialPlayers(
  words,
  { layout = "auto", goal = "top", ocr = false } = {},
) {
  let segments = spatialSegments(words);
  if (
    layout === "registered" ||
    (layout === "auto" &&
      segments.some((s) => /^starting\b/i.test(s.text)) &&
      segments.some((s) =>
        /^(?:player name|name|surname|forename)$/i.test(s.text),
      ))
  )
    return parseRegisteredSegments(segments, { ocr });
  return parseProgrammeSegments(segments, {
    layout,
    goal,
    ocr,
    positions: POSITIONS,
    candidate,
  });
}

function parseRegisteredSegments(segments, { ocr }) {
  let nameHeader = segments.find((s) =>
    /^(?:player\s*name|full\s*name|name)$/i.test(s.text),
  );
  const jerseyHeader = segments.find((s) =>
    /^(?:jersey(?: number)?|shirt(?: number)?)$/i.test(s.text),
  );
  const startingHeaders = segments
    .filter((s) => /^starting\b/i.test(s.text))
    .sort((a, b) => a.x - b.x);
  const start = startingHeaders[0];
  const given = segments.find((s) =>
    /^(?:forename|first name|given name|forenames)$/i.test(s.text),
  );
  const family = segments.find((s) =>
    /^(?:surname|last name|family name)$/i.test(s.text),
  );
  let nameSegments = segments;
  if (!nameHeader && given && family) {
    nameHeader = given;
    nameSegments = segments
      .filter(
        (s) =>
          s.y > given.y + given.h &&
          Math.abs(s.x - given.x) < Math.max(given.w, 40) &&
          nameLike(s.text),
      )
      .flatMap((s) => {
        const surname = segments.find(
          (n) =>
            Math.abs(n.y - s.y) < s.h &&
            Math.abs(n.x - family.x) < Math.max(family.w, 40) &&
            nameLike(n.text),
        );
        return surname
          ? [
              {
                ...s,
                text: s.text + " " + surname.text,
                confidence: Math.min(s.confidence, surname.confidence),
              },
            ]
          : [];
      });
  }
  if (!nameHeader) {
    return parseTextPlayers(
      segments.map((segment) => segment.text).join("\n"),
      { layout: "registered" },
    ).map((player) => ({
      ...player,
      confidence:
        "Panel text — no reliable column alignment; verify handwritten jersey and first Starting tick",
    }));
  }
  const rows = [];
  for (const segment of nameSegments.filter(
    (s) => !nameHeader || s.y > nameHeader.y + nameHeader.h,
  )) {
    if (
      !nameLike(segment.text) ||
      /^(?:registration|jersey|starting|surname|forename|date|club)\b/i.test(
        segment.text,
      ) ||
      !/[\p{L}’'-]+\s+[\p{L}’'-]+/u.test(segment.text)
    )
      continue;
    if (
      nameHeader &&
      Math.abs(segment.x - nameHeader.x) > Math.max(nameHeader.w * 2, 100)
    )
      continue;
    const neighbors = segments.filter(
      (s) => Math.abs(s.y - segment.y) < Math.max(segment.h, 10),
    );
    const numberMark = jerseyHeader
      ? neighbors
          .filter(
            (s) =>
              Math.abs(s.x - jerseyHeader.x) < Math.max(jerseyHeader.w, 40) &&
              /^\d{1,2}$/.test(s.text),
          )
          .sort(
            (a, b) =>
              Math.abs(a.x - jerseyHeader.x) - Math.abs(b.x - jerseyHeader.x),
          )[0]
      : null;
    const number =
      numberMark && (!ocr || numberMark.confidence >= 85)
        ? numberMark.text
        : "";
    const marker = start
      ? neighbors.find(
          (s) =>
            Math.abs(s.x - start.x) < Math.max(start.w, 35) && ticked(s.text),
        )
      : null;
    rows.push(
      candidate(
        number,
        segment.text,
        number ? (marker ? "starter" : "substitute") : "panel",
        "",
        ocr
          ? "OCR panel — handwriting / first Starting checkbox uncertain; verify all selection fields"
          : marker
            ? "PDF text + Starting marker — verify"
            : "PDF panel: verify handwritten jersey / Starting checkbox; blank jersey = not selected",
      ),
    );
  }
  return rows;
}
