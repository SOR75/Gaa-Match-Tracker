import { originalJerseyCrop } from "./foireann-jerseys.js";

// A checkbox outline is supporting geometry, not selection evidence. Require
// an interior short stroke plus a rising arm continuing beyond the right edge.
export function checkmarkInArea({ data, width, height }, unit) {
  const gray = Array.from(
    { length: width * height },
    (_, i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3,
  );
  const background = [...gray].sort((a, b) => a - b)[
    Math.floor(gray.length * 0.65)
  ];
  const mask = Uint8Array.from(gray, (v, i) =>
    v < background * 0.76 &&
    Math.max(...data.slice(i * 4, i * 4 + 3)) -
      Math.min(...data.slice(i * 4, i * 4 + 3)) <
      65
      ? 1
      : 0,
  );
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += mask[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] =
        integral[y * (width + 1) + x + 1] + sum;
    }
  }
  const area = (x, y, w, h) => {
    const x0 = Math.max(0, Math.floor(x)),
      y0 = Math.max(0, Math.floor(y)),
      x1 = Math.min(width, Math.ceil(x + w)),
      y1 = Math.min(height, Math.ceil(y + h));
    return x1 > x0 && y1 > y0
      ? integral[y1 * (width + 1) + x1] -
          integral[y0 * (width + 1) + x1] -
          integral[y1 * (width + 1) + x0] +
          integral[y0 * (width + 1) + x0]
      : 0;
  };
  const band = Math.max(1, Math.round(unit * 0.1));
  let best = null;
  for (let size = Math.round(unit * 1.3); size <= unit * 2.5; size++)
    for (let y = 1; y + size < height; y++)
      for (let x = 1; x + size < width; x++) {
        const edges = [
          area(x, y - band, size, band * 2 + 1) / size,
          area(x, y + size - band, size, band * 2 + 1) / size,
          area(x - band, y, band * 2 + 1, size) / size,
          area(x + size - band, y, band * 2 + 1, size) / size,
        ];
        const coverage = edges.map((n) => Math.min(1, n));
        if (coverage.some((n) => n < 0.6)) continue;
        const score =
          coverage.reduce((a, b) => a + b, 0) +
          0.1 * edges.reduce((a, b) => a + b, 0) -
          (Math.abs(size - unit * 1.8) / unit) * 0.05;
        if (!best || score > best.score) best = { x, y, size, score };
      }
  if (!best) return { ticked: false, reason: "No clear checkbox boundary" };
  const { x, y, size } = best,
    pad = Math.max(2, Math.round(size * 0.09));
  const inside = area(x + pad, y + pad, size - pad * 2, size - pad * 2),
    density = inside / Math.pow(size - pad * 2, 2);
  if (inside < size * 0.4)
    return { ticked: false, box: best, reason: "Empty checkbox" };
  // Dense scribbles or enclosed pen loops are not a clear checkmark. A bold
  // but open V remains valid; an overwritten/circled selection stays uncertain.
  const seen = new Set();
  let loops = 0;
  const x0 = x + pad,
    y0 = y + pad,
    x1 = x + size - pad,
    y1 = y + size - pad;
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) {
      const seed = yy * width + xx;
      if (mask[seed] || seen.has(seed)) continue;
      let touches = false,
        count = 0;
      const stack = [seed];
      seen.add(seed);
      while (stack.length) {
        const n = stack.pop(),
          px = n % width,
          py = Math.floor(n / width);
        count++;
        if (px === x0 || px === x1 - 1 || py === y0 || py === y1 - 1)
          touches = true;
        for (const next of [
          px > x0 ? n - 1 : -1,
          px < x1 - 1 ? n + 1 : -1,
          py > y0 ? n - width : -1,
          py < y1 - 1 ? n + width : -1,
        ])
          if (next >= 0 && !mask[next] && !seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
      }
      if (!touches && count >= size * 0.1) loops++;
    }
  if (density > 0.45 || loops)
    return { ticked: false, box: best, reason: "Selection mark unclear" };
  const tail = area(
    x + size + band + 1,
    y - size * 0.25,
    size * 0.65,
    size * 0.95,
  );
  if (tail < size * 0.25)
    return {
      ticked: false,
      box: best,
      reason: "No clear rising checkmark tail",
    };
  const hit = (px, py) =>
    area(px - band, py - band, band * 2 + 1, band * 2 + 1) > 0;
  for (
    let vx = x + size * 0.35;
    vx <= x + size * 0.95;
    vx += Math.max(1, unit * 0.1)
  )
    for (
      let vy = y + size * 0.5;
      vy <= y + size * 0.88;
      vy += Math.max(1, unit * 0.1)
    )
      for (const slope of [-0.4, -0.65, -0.9]) {
        let up = 0,
          total = 0;
        for (let i = 1; i <= 10; i++) {
          const dx = size * 0.09 * i,
            px = vx + dx,
            py = vy + slope * dx;
          if (px >= width - 1 || py < 1) continue;
          total++;
          if (hit(px, py)) up++;
        }
        if (total < 6 || up / total < 0.8) continue;
        for (const lean of [0.08, 0.2, 0.3]) {
          let down = 0;
          for (let i = 1; i <= 5; i++)
            if (hit(vx - (size * lean * i) / 5, vy - (size * 0.3 * i) / 5))
              down++;
          if (down < 4) continue;
          const distance = (px, py, ax, ay, bx, by) => {
            const dx = bx - ax,
              dy = by - ay,
              t = Math.max(
                0,
                Math.min(
                  1,
                  ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy),
                ),
              );
            return Math.hypot(px - ax - t * dx, py - ay - t * dy);
          };
          let stray = 0;
          for (let py = y + pad + band; py < y + size - pad - band; py++)
            for (let px = x + pad + band; px < x + size - pad - band; px++)
              if (
                mask[py * width + px] &&
                Math.min(
                  distance(px, py, vx - size * lean, vy - size * 0.3, vx, vy),
                  distance(
                    px,
                    py,
                    vx,
                    vy,
                    vx + size * 0.9,
                    vy + slope * size * 0.9,
                  ),
                ) > Math.max(2, unit * 0.25)
              )
                stray++;
          if (density > 0.22 && stray / inside > 0.15) continue;
          return {
            ticked: true,
            box: best,
            reason: "Interior check and rising tail",
          };
        }
      }
  return { ticked: false, box: best, reason: "Selection mark unclear" };
}
export function foireannSelection(source, jerseyBox, height) {
  const [x, y, , h] = jerseyBox;
  const box = [Math.max(0, x - height * 3.5), y, height * 4.3, h];
  const crop = originalJerseyCrop(source, box);
  const scale = crop.width / box[2];
  return {
    ...checkmarkInArea(
      crop.getContext("2d").getImageData(0, 0, crop.width, crop.height),
      height * scale,
    ),
    sourceBox: box,
  };
}
export function expandedSelectedJerseyBox(box, height, row, nextRow) {
  const [x, y, w, h] = box,
    left = Math.max(0, x - height * 0.25),
    right = Math.min(
      (row.id?.x ?? Infinity) - height * 0.15,
      x + w + height * 0.15,
    ),
    top = Math.max(0, y - height * 0.2);
  const bottom = Math.min(
    y + h + height * 0.25,
    nextRow ? nextRow.date.y - height * 2.5 : Infinity,
  );
  return right > left && bottom > top
    ? [left, top, right - left, bottom - top]
    : box;
}
export function prioritiseFoireannReview(players) {
  const rank = (p) =>
    p.selectedTick && !p.number
      ? 0
      : p.selectedTick || /uncertain name|duplicate jersey/i.test(p.confidence)
        ? 1
        : 2;
  return [...players].sort((a, b) => rank(a) - rank(b));
}
// A focused retry cannot overrule conflicting reliable evidence from the
// normal pass, even when the retry itself clears the acceptance threshold.
export function selectedRetryCompatible(base, retry, recordedNumber = "") {
  return (
    !!retry.number &&
    !base?.ambiguous &&
    [recordedNumber, ...(base?.possible || [])]
      .filter(Boolean)
      .every((n) => n === retry.number)
  );
}
