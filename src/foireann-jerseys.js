import { playerNumberToken } from "./numbered-rows.js";
const cy = (w) => w.y + w.h / 2;
const score = (r) =>
  r.words.length ? Math.min(...r.words.map((w) => w.confidence)) : 0;

// Derive this row's jersey field from the printed registered-name band, not
// from the page-wide inferred DOB column. Ignore small detail/ID text below it.
export function handwrittenJerseyBox({ row, words, height, right, width }) {
  const { date, id } = row;
  if (!id) return null;
  const names = words.filter(
    (w) =>
      /\p{L}{2}/u.test(w.text) &&
      !/\d/.test(w.text) &&
      w.confidence >= 65 &&
      w.x >= date.x - height &&
      w.x + w.w <= right &&
      cy(w) < date.y - height * 0.3 &&
      cy(w) > date.y - height * 2.3,
  );
  if (names.length < 2) return null;
  const left = Math.min(...names.map((w) => w.x));
  // ID-only bilingual rows: ID and registered-name left edges align. With an
  // actual DOB band the existing red-number reader remains unchanged.
  if (Math.abs(left - id.x) > height * 2) return null;
  const x = Math.max(0, left - height * 5.2);
  const y = Math.max(0, Math.min(...names.map((w) => w.y)) - height * 0.35);
  const edge = Math.min(width, left - height * 0.35, id.x - height * 0.2);
  const bottom = date.y + height * 1.4;
  return edge > x && bottom > y ? [x, y, edge - x, bottom - y] : null;
}

// Original decoded pixels and layout coordinates share the same orientation.
// Scale the small region back to original dimensions before any enlargement.
export function originalJerseyCrop(source, box) {
  const original = source.originalImage || source;
  const sx = (original.naturalWidth || original.width) / source.width;
  const sy = (original.naturalHeight || original.height) / source.height;
  const [x, y, w, h] = box;
  const c = document.createElement("canvas");
  const left = Math.floor(x * sx),
    top = Math.floor(y * sy),
    right = Math.ceil((x + w) * sx),
    bottom = Math.ceil((y + h) * sy);
  c.width = Math.max(1, right - left);
  c.height = Math.max(1, bottom - top);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    original,
    left,
    top,
    c.width,
    c.height,
    0,
    0,
    c.width,
    c.height,
  );
  return c;
}

// Treat the entire number field as one glyph string, never individual digits.
// Remove the printed rule and disconnected tick fragments before upscaling.
export function jerseyInk(source, contrast = 0.72) {
  const { width, height } = source,
    ctx = source.getContext("2d"),
    image = ctx.getImageData(0, 0, width, height);
  const gray = Array.from(
    { length: width * height },
    (_, i) =>
      (image.data[i * 4] + image.data[i * 4 + 1] + image.data[i * 4 + 2]) / 3,
  );
  const background = [...gray].sort((a, b) => a - b)[
    Math.floor(gray.length * 0.6)
  ];
  const mask = Uint8Array.from(gray, (v) =>
    v < background * contrast ? 1 : 0,
  );
  // Underlines are long, shallow strokes near the lower edge of the field.
  let line = { count: 0 };
  for (let slope = -0.2; slope <= 0.2; slope += 0.025)
    for (let y = height * 0.65; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        const yy = Math.round(y + slope * x);
        if (yy >= 0 && yy < height && mask[yy * width + x]) count++;
      }
      if (count > line.count) line = { count, y, slope };
    }
  if (line.count > width * 0.6)
    for (let x = 0; x < width; x++)
      for (let d = -1; d <= 1; d++) {
        const y = Math.round(line.y + line.slope * x) + d;
        if (y >= 0 && y < height) mask[y * width + x] = 0;
      }
  const seen = new Uint8Array(mask.length),
    components = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || seen[seed]) continue;
    const stack = [seed],
      pixels = [];
    seen[seed] = 1;
    let x0 = width,
      x1 = 0,
      y0 = height,
      y1 = 0;
    while (stack.length) {
      const i = stack.pop(),
        x = i % width,
        y = Math.floor(i / width);
      pixels.push(i);
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
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
    }
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    if (
      h >= height * 0.23 &&
      pixels.length >= 5 &&
      w / h < 4 &&
      x0 > width * 0.08
    )
      components.push({ x0, x1, y0, y1, pixels });
  }
  if (!components.length) return null;
  const x0 = Math.min(...components.map((c) => c.x0)),
    y0 = Math.min(...components.map((c) => c.y0)),
    x1 = Math.max(...components.map((c) => c.x1)),
    y1 = Math.max(...components.map((c) => c.y1));
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1,
    ink = document.createElement("canvas");
  ink.width = w;
  ink.height = h;
  const draw = ink.getContext("2d"),
    out = draw.createImageData(w, h);
  out.data.fill(255);
  for (const c of components)
    for (const i of c.pixels) {
      const x = (i % width) - x0,
        y = Math.floor(i / width) - y0,
        j = (y * w + x) * 4;
      out.data[j] = out.data[j + 1] = out.data[j + 2] = 0;
    }
  draw.putImageData(out, 0, 0);
  return {
    canvas: ink,
    components: components.filter((c) => c.y1 - c.y0 + 1 >= h * 0.55).length,
  };
}
export function enlargedJersey(ink, factor = 4) {
  const c = document.createElement("canvas");
  c.width = ink.width * factor + 40;
  c.height = ink.height * factor + 40;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ink, 20, 20, ink.width * factor, ink.height * factor);
  return c;
}
export function resolveHandwrittenJersey(reads) {
  const fieldComponents = Math.max(1, ...reads.map((r) => r.components));
  const valid = reads.filter(
    (r) =>
      playerNumberToken(r.text) &&
      score(r) >= 85 &&
      fieldComponents <= 2 &&
      !(fieldComponents > 1 && playerNumberToken(r.text).length < 2),
  );
  const values = [...new Set(valid.map((r) => playerNumberToken(r.text)))];
  return values.length === 1
    ? {
        number: values[0],
        score: Math.max(...valid.map(score)),
        ambiguous: false,
        possible: values,
      }
    : { number: "", score: 0, ambiguous: values.length > 1, possible: values };
}
export async function readHandwrittenJersey({ source, box, read, worker }) {
  const original = originalJerseyCrop(source, box),
    reads = [];
  await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
  let failed = false;
  try {
    for (const contrast of [0.65, 0.8]) {
      const ink = jerseyInk(original, contrast);
      if (!ink) continue;
      for (const factor of [2, 3, 4]) {
        const c = enlargedJersey(ink.canvas, factor);
        for (const mode of ["7", "13"])
          reads.push({
            ...(await read(c, mode)),
            components: ink.components,
            contrast,
            factor,
          });
      }
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!failed) await worker.setParameters({ tessedit_char_whitelist: "" });
  }
  return {
    ...resolveHandwrittenJersey(reads),
    reads,
    box,
    originalSize: [original.width, original.height],
  };
}
