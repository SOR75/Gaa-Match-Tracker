import { candidate, POSITIONS, parseSpatialPlayers } from "./import-parser.js";
import { fitFormation } from "./programme-geometry.js";
import { stackedName } from "./boxed-programme.js";
import { plausibleName } from "./programme-parser.js";
import { resolveFoireannJersey } from "./foireann-programme.js";

// Repeated filled chromatic symbols establish bounded number regions. Their
// arrangement supplies geometry only: every jersey value still needs OCR.
export function graphicalNumberRegions({ data, width, height }) {
  const mask = new Uint8Array(width * height),
    queue = new Uint32Array(width * height),
    boxes = [];
  for (let i = 0; i < mask.length; i++) {
    const rgb = [data[4 * i], data[4 * i + 1], data[4 * i + 2]];
    if (
      Math.max(...rgb) < 230 &&
      Math.min(...rgb) < 110 &&
      Math.max(...rgb) - Math.min(...rgb) > 55
    )
      mask[i] = 1;
  }
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed]) continue;
    let head = 0,
      tail = 1,
      x0 = width,
      x1 = 0,
      y0 = height,
      y1 = 0;
    queue[0] = seed;
    mask[seed] = 0;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const n of [
        x ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ])
        if (n >= 0 && mask[n]) {
          mask[n] = 0;
          queue[tail++] = n;
        }
    }
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    if (
      w > width * 0.035 &&
      w < width * 0.16 &&
      h > height * 0.025 &&
      h < height * 0.1 &&
      w / h > 0.8 &&
      w / h < 2 &&
      tail / (w * h) > 0.4
    )
      boxes.push({ x: x0, y: y0, w, h });
  }
  const rows = [];
  for (const b of boxes.sort((a, b) => a.y - b.y)) {
    let row = rows.find((r) => Math.abs(r[0].y - b.y) < b.h * 0.4);
    if (!row) rows.push((row = []));
    row.push(b);
  }
  // A full conventional formation is necessary to preempt generic routing.
  for (let start = 0; start + 6 <= rows.length; start++) {
    const group = rows.slice(start, start + 6);
    if (group.map((r) => r.length).join(",") !== "1,3,3,2,3,3") continue;
    const flat = group.flat(),
      median = flat.map((b) => b.w).sort((a, b) => a - b)[7];
    if (flat.some((b) => b.w < median * 0.7 || b.w > median * 1.3)) continue;
    if (group.some((r, i) => i && r[0].y - group[i - 1][0].y < median * 0.8))
      continue;
    return group.flatMap((r) => r.sort((a, b) => a.x - b.x));
  }
  return null;
}
export function lightDigitsCanvas(source, box) {
  const c = document.createElement("canvas");
  c.width = Math.round(box.w * 0.46);
  c.height = Math.round(box.h * 0.5);
  const ctx = c.getContext("2d");
  ctx.drawImage(
    source,
    box.x + box.w * 0.27,
    box.y + box.h * 0.29,
    box.w * 0.46,
    box.h * 0.5,
    0,
    0,
    c.width,
    c.height,
  );
  const image = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.min(...image.data.slice(i, i + 3)) > 180 ? 0 : 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  const out = document.createElement("canvas");
  out.width = c.width * 4 + 40;
  out.height = c.height * 4 + 40;
  const draw = out.getContext("2d");
  draw.fillStyle = "white";
  draw.fillRect(0, 0, out.width, out.height);
  draw.drawImage(c, 20, 20, c.width * 4, c.height * 4);
  return out;
}
export async function readGraphicalProgramme({
  boxes,
  scan,
  source,
  read,
  worker,
  onProgress,
}) {
  const players = [],
    regions = [],
    anchors = [];
  for (const [i, box] of boxes.entries()) {
    onProgress(`Reading graphical formation player ${i + 1}/15`);
    await worker.setParameters({ tessedit_char_whitelist: "" });
    const digitCanvas = lightDigitsCanvas(source, box),
      numberReads = [
        await read(digitCanvas, "7"),
        await read(digitCanvas, "13"),
      ];
    if (!resolveFoireannJersey(numberReads).number) {
      // OCR of a small glyph is sensitive to scale. Independently reread at
      // half scale, retaining the same 85-confidence requirement.
      const smaller = document.createElement("canvas");
      smaller.width = Math.round(digitCanvas.width / 2);
      smaller.height = Math.round(digitCanvas.height / 2);
      smaller
        .getContext("2d")
        .drawImage(digitCanvas, 0, 0, smaller.width, smaller.height);
      numberReads.push(await read(smaller, "7"));
    }
    const { number } = resolveFoireannJersey(numberReads);
    const numberScore = Math.max(
      0,
      ...numberReads
        .filter((r) => r.text.trim() === number)
        .map((r) => Math.min(100, ...r.words.map((w) => w.confidence))),
    );
    if (number && +number <= 15)
      anchors.push({
        text: number,
        confidence: numberScore,
        x: box.x + box.w / 2 - 5,
        y: box.y,
        w: 10,
        h: box.h,
      });
    const words = scan.words.filter(
      (w) =>
        w.y >= box.y + box.h &&
        w.y < box.y + box.h * 1.85 &&
        Math.abs(w.x + w.w / 2 - box.x - box.w / 2) < box.w * 1.8,
    );
    const name = stackedName(words);
    players.push(
      candidate(
        number,
        plausibleName(name.name) ? name.name : "",
        "starter",
        number && +number <= 15 ? POSITIONS[+number - 1] : "",
        `Review required · Graphical number/name region · ${!number ? "Review jersey · " : "jersey OCR " + Math.round(numberScore) + "/100 · "}name OCR ${Math.round(Math.min(100, ...name.words.map((w) => w.confidence)))}/100`,
      ),
    );
    regions.push({ box, numberReads, name });
  }
  // Require independently read numbers fitting the conventional spatial grid.
  // A decorative set of coloured shapes cannot divert a generic team sheet.
  if (!fitFormation(anchors)) return null;
  const bottom = Math.max(...boxes.map((b) => b.y + b.h * 1.9));
  const lower = scan.words.filter((w) => w.y > bottom);
  const subs = parseSpatialPlayers(lower, {
    ocr: true,
    layout: "programme",
  }).filter((p) => p.number && +p.number >= 16);
  players.push(
    ...subs.map((p) => ({
      ...p,
      name: p.name.replace(/[.,;]+$/, ""),
      role: "substitute",
      position: "",
    })),
  );
  return {
    ...scan,
    players,
    diagnostics: { layout: "graphical-numbered-formation", regions },
  };
}
