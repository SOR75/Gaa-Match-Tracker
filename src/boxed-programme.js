import { candidate, POSITIONS, parseSpatialPlayers } from "./import-parser.js";
import { cleanPlayerText } from "./programme-geometry.js";
import { isSubs, isFooter, plausibleName } from "./programme-parser.js";

const median = (values) =>
  values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const centreY = (box) => box.y + box.h / 2;
const inside = (word, box) =>
  word.x + word.w / 2 >= box.x &&
  word.x + word.w / 2 <= box.x + box.w &&
  centreY(word) >= box.y &&
  centreY(word) <= box.y + box.h;
const numberText = (word) =>
  /^\d{1,2}[.)]*$/.test(word.text.trim()) && +word.text.replace(/\D/g, "") > 0;
export function printedNumber(word) {
  return numberText(word) && word.confidence >= 85
    ? String(+word.text.replace(/\D/g, ""))
    : "";
}
function rowsOf(items, tolerance) {
  const rows = [];
  for (const item of items.slice().sort((a, b) => centreY(a) - centreY(b))) {
    let row = rows.find((r) => Math.abs(r.y - centreY(item)) < tolerance);
    if (!row) rows.push((row = { y: centreY(item), items: [] }));
    row.items.push(item);
    row.y = median(row.items.map(centreY));
  }
  return rows.sort((a, b) => a.y - b.y);
}
// Names belong to their card first; read lines top-to-bottom, and words within
// each line left-to-right. A wide surname must never precede its first name.
export function stackedName(words) {
  const usable = words.filter(
    (w) => /\p{L}{2}/u.test(w.text) || /^\(\s*(C|VC)\s*\)$/i.test(w.text),
  );
  if (!usable.length) return { name: "", words: [], lines: [] };
  const rows = rowsOf(usable, median(usable.map((w) => w.h)) * 0.6);
  const lines = rows.map((r) => r.items.sort((a, b) => a.x - b.x));
  return {
    name: cleanPlayerText(
      lines.map((line) => line.map((w) => w.text).join(" ")).join(" "),
    ),
    words: usable,
    lines,
  };
}

// Light rectangular cards with dark borders are a different document structure
// from a printed programme or a reference roster. Detect actual connected card
// interiors, not a product name, player dictionary or screenshot coordinates.
export function lightCardRects({ data, width, height }) {
  const mask = new Uint8Array(width * height),
    queue = new Uint32Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    if (Math.min(r, g, b) >= 235 && Math.max(r, g, b) - Math.min(r, g, b) < 24)
      mask[i] = 1;
  }
  const rectangles = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed]) continue;
    let head = 0,
      tail = 1,
      minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    queue[0] = seed;
    mask[seed] = 0;
    while (head < tail) {
      const index = queue[head++],
        x = index % width,
        y = Math.floor(index / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (x > 0 && mask[index - 1]) {
        mask[index - 1] = 0;
        queue[tail++] = index - 1;
      }
      if (x + 1 < width && mask[index + 1]) {
        mask[index + 1] = 0;
        queue[tail++] = index + 1;
      }
      if (y > 0 && mask[index - width]) {
        mask[index - width] = 0;
        queue[tail++] = index - width;
      }
      if (y + 1 < height && mask[index + width]) {
        mask[index + width] = 0;
        queue[tail++] = index + width;
      }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1;
    if (
      w > width * 0.12 &&
      w < width * 0.4 &&
      h > height * 0.03 &&
      h < height * 0.13 &&
      w / h > 1.3 &&
      w / h < 3.5 &&
      tail / (w * h) > 0.6
    )
      rectangles.push({ x: minX, y: minY, w, h });
  }
  return rectangles;
}
export function selectCardFormation(rectangles, words, grid) {
  const inBody = rectangles.filter(
    (r) => r.y >= grid.y0 - grid.sy * 0.5 && r.y < grid.y0 + grid.sy * 5.7,
  );
  if (inBody.length < 15) return null;
  const height = median(inBody.map((r) => r.h)),
    width = median(inBody.map((r) => r.w));
  const consistent = inBody.filter(
    (r) =>
      Math.abs(r.h - height) < height * 0.3 &&
      Math.abs(r.w - width) < width * 0.25,
  );
  const rows = rowsOf(consistent, height * 0.45),
    shape = [1, 3, 3, 2, 3, 3];
  for (let start = 0; start <= rows.length - shape.length; start++) {
    const selected = rows.slice(start, start + shape.length);
    if (!selected.every((r, i) => r.items.length === shape[i])) continue;
    const cards = selected.flatMap((r) =>
      r.items.slice().sort((a, b) => a.x - b.x),
    );
    // Real printed numbers corroborate the structure, including non-standard
    // jerseys. The expected slot order is never used to manufacture a number.
    const strong = cards.flatMap((card) =>
      words.filter(
        (w) =>
          inside(w, card) &&
          centreY(w) < card.y + card.h * 0.35 &&
          printedNumber(w),
      ),
    );
    if (new Set(strong.map(printedNumber)).size >= 10) return cards;
  }
  return null;
}
export async function readBoxedProgramme({
  cards,
  scan,
  source,
  normalized,
  crop,
  read,
  worker,
  onProgress,
}) {
  const players = [],
    regions = [];
  for (const [i, card] of cards.entries()) {
    onProgress(`Reading player card ${i + 1}/${cards.length}`);
    const local = scan.words.filter((w) => inside(w, card));
    const numberWords = local.filter(
      (w) => centreY(w) < card.y + card.h * 0.35 && numberText(w),
    );
    let anchor = numberWords.find(printedNumber);
    const numberReads = [];
    if (!anchor) {
      const box = [
        card.x + card.w * 0.32,
        card.y,
        card.w * 0.36,
        card.h * 0.34,
      ];
      await worker.setParameters({ tessedit_char_whitelist: "0123456789.)" });
      for (const canvas of [source, normalized])
        numberReads.push(await read(crop(canvas, ...box), "7"));
      await worker.setParameters({ tessedit_char_whitelist: "" });
      anchor = numberReads.flatMap((r) => r.words).find(printedNumber);
    }
    const number = anchor ? printedNumber(anchor) : "";
    const nameWords = local.filter((w) => centreY(w) > card.y + card.h * 0.3);
    const name = stackedName(nameWords);
    const score = name.words.length
      ? Math.min(...name.words.map((w) => w.confidence))
      : 0;
    const nameText = plausibleName(name.name, { uncertain: true })
      ? name.name
      : "";
    const row = candidate(
      number,
      nameText,
      "starter",
      POSITIONS[i],
      `Review required · Boxed player: number above ${name.lines.length} name line(s), read top-to-bottom · OCR word score ${Math.round(score)}/100${!number ? " · jersey unreadable; left blank" : ""}${!nameText ? " · name unreadable; left blank" : ""}${anchor?.text.startsWith("0") ? " · leading jersey zero normalized" : ""} · formation position suggestion; editable`,
    );
    players.push(row);
    regions.push({ card, numberWords, numberReads, nameLines: name.lines });
  }
  // Subs may switch to an unboxed layout. Delegate just that section to the
  // existing vertical number/name parser, rather than extending card bounds.
  const bottom = Math.max(...cards.map((r) => r.y + r.h));
  const heading = scan.words
    .filter((w) => w.y > bottom && isSubs(w.text))
    .sort((a, b) => a.y - b.y)[0];
  if (heading) {
    const footer = Math.min(
      ...scan.words
        .filter((w) => w.y > heading.y && isFooter(w.text))
        .map((w) => w.y),
      Infinity,
    );
    const words = scan.words.filter((w) => w.y >= heading.y && w.y < footer);
    const subs = parseSpatialPlayers(words, { ocr: true, layout: "programme" });
    players.push(
      ...subs.map((p) => ({
        ...p,
        role: "substitute",
        position: "",
        confidence: `Review required · Separate Subs section: number above name · ${p.confidence}`,
      })),
    );
  }
  return {
    ...scan,
    players,
    diagnostics: {
      layout: "boxed-formation-with-stacked-names",
      regions,
      subsHeading: heading,
    },
  };
}
