// Conventional formation geometry is evidence, never a source of jersey numbers.
export const slots = [
  [0, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [-1, 2],
  [0, 2],
  [1, 2],
  [-0.5, 3],
  [0.5, 3],
  [-1, 4],
  [0, 4],
  [1, 4],
  [-1, 5],
  [0, 5],
  [1, 5],
];
export function fitFormation(words) {
  const anchors = words
    .filter(
      (w) =>
        /^\d{1,2}[.)]*$/.test(w.text) &&
        +w.text.replace(/\D/g, "") <= 15 &&
        +w.text.replace(/\D/g, "") > 0 &&
        w.confidence >= 85,
    )
    .map((w) => ({ ...w, n: +w.text.replace(/\D/g, ""), cx: w.x + w.w / 2 }));
  let best = null;
  for (const a of anchors)
    for (const b of anchors) {
      const [ax, ay] = slots[a.n - 1],
        [bx, by] = slots[b.n - 1];
      if (ax === bx || ay === by) continue;
      const sx = (b.cx - a.cx) / (bx - ax),
        sy = (b.y - a.y) / (by - ay);
      if (sx < 80 || sy < 40 || sx / sy < 1 || sx / sy > 5) continue;
      const x0 = a.cx - sx * ax,
        y0 = a.y - sy * ay;
      const matched = anchors.filter((w) => {
        const [x, y] = slots[w.n - 1];
        return (
          Math.abs(w.cx - x0 - sx * x) < sx * 0.13 &&
          Math.abs(w.y - y0 - sy * y) < sy * 0.23
        );
      });
      const count = new Set(matched.map((w) => w.n)).size;
      if (count >= 7 && (!best || count > best.count))
        best = { x0, y0, sx, sy, count, anchors: matched };
    }
  if (best) {
    // Least-squares refinement over all inliers, including page slope.
    const solve = (features, values) => {
      const size = features[0].length,
        a = Array.from({ length: size }, (_, i) =>
          Array.from({ length: size + 1 }, (_, j) =>
            j === size
              ? features.reduce((s, f, k) => s + f[i] * values[k], 0)
              : features.reduce((s, f) => s + f[i] * f[j], 0),
          ),
        );
      for (let i = 0; i < size; i++) {
        let pivot = i;
        for (let j = i + 1; j < size; j++)
          if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
        [a[i], a[pivot]] = [a[pivot], a[i]];
        const d = a[i][i];
        if (Math.abs(d) < 1e-6) return null;
        for (let j = i; j <= size; j++) a[i][j] /= d;
        for (let k = 0; k < size; k++)
          if (k !== i) {
            const factor = a[k][i];
            for (let j = i; j <= size; j++) a[k][j] -= factor * a[i][j];
          }
      }
      return a.map((r) => r[size]);
    };
    const x = solve(
      best.anchors.map((a) => [1, slots[a.n - 1][0]]),
      best.anchors.map((a) => a.cx),
    );
    const y = solve(
      best.anchors.map((a) => [1, slots[a.n - 1][1], slots[a.n - 1][0]]),
      best.anchors.map((a) => a.y),
    );
    if (x && y)
      Object.assign(best, {
        x0: x[0],
        sx: x[1],
        y0: y[0],
        sy: y[1],
        tilt: y[2],
      });
  }
  return best;
}
// Strip punctuation at token edges, never alphabetic suffixes: a final v may
// be a tick, but can also be part of a real surname. Preserve initials/Irish
// apostrophes/hyphenated names and handle captain markers before token cleanup.
export function cleanOcrToken(text) {
  return /^[\p{L}]\.$/u.test(text)
    ? text
    : text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}
export function cleanPlayerText(text) {
  return text
    .replace(/\(\s*©\s*\)/g, "(C)")
    .replace(/\s+©\s*$/g, " (C)")
    .replace(/\(\s*(VC|C)\s*\)/gi, (_, marker) => `(${marker.toUpperCase()})`)
    .replace(/^[^\p{L}(]+/u, "")
    .replace(/[=|~_<>]+/g, " ")
    .replace(/^(?:[a-z]\.\s+)+/i, "")
    .split(/\s+/)
    .map((token) =>
      /^\((?:C|VC)\)$/i.test(token) ? token : cleanOcrToken(token),
    )
    .filter(Boolean)
    .join(" ")
    .trim();
}

// Dense substitute blocks can sit immediately above a sloping staff footer.
// A high word score alone cannot justify reaching far away from the jersey or
// trusting oversized glyphs clipped against the edge of a regional crop.
export function substituteReadQuality(read, height, anchorEnd) {
  const words = read.words.filter((w) => /\p{L}{2}/u.test(w.text));
  if (!words.length || /\d/.test(read.text) || words.length > 4) return -1;
  if (read.spatial && words[0].x - anchorEnd > height * 3) return -1;
  if (!read.spatial && words.some((w) => w.y <= 1 && w.h > height * 2.6))
    return -1;
  return (
    words.reduce((sum, w) => sum + w.confidence * w.text.length, 0) /
    words.reduce((sum, w) => sum + w.text.length, 0)
  );
}
