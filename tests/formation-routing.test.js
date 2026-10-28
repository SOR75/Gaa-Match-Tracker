import { test } from "node:test";
import assert from "node:assert/strict";
import { referenceFormationRoute } from "../src/formation-routing.js";
import { slots } from "../src/programme-geometry.js";
const word = (text, x, y, w = 60, confidence = 96) => ({
  text,
  x,
  y,
  w,
  h: 16,
  confidence,
});
function sheet() {
  const words = [];
  for (const x of [60, 360]) {
    words.push(word("Player", x, 50));
    for (let i = 0; i < 8; i++)
      words.push(
        word(String(i + 1), x - 30, 100 + i * 35, 20),
        word("Nora", x, 100 + i * 35),
        word("Surname", x + 70, 100 + i * 35, 80),
      );
  }
  words.push(
    ...slots.map(([x, y], i) =>
      word(String(i + 1), 500 + x * 300 - 10, 1000 + y * 100, 20),
    ),
  );
  return { words };
}
test("specific two-column roster plus lower formation selects the normalised pass first", () => {
  const normal = sheet(),
    source = sheet(),
    r = referenceFormationRoute(normal, source);
  assert.ok(r);
  assert.equal(r.scan, normal);
  assert.equal(r.reference.columns.length, 2);
  assert.equal(r.grid.count, 15);
});
test("missing normalised anchors do not send a valid source-pass formation to generic routing", () => {
  const source = sheet(),
    normal = { words: source.words.filter((w) => !/^\d+$/.test(w.text)) };
  const r = referenceFormationRoute(normal, source);
  assert.ok(r);
  assert.equal(r.scan, normal);
  assert.equal(r.grid.count, 15);
});
test("a vertical printed numbered roster alone does not acquire formation priority", () => {
  const scan = { words: sheet().words.filter((w) => w.y < 900) };
  assert.equal(referenceFormationRoute(scan, scan), null);
});
test("a formation without printed-roster headings does not acquire this special route", () => {
  const scan = { words: sheet().words.filter((w) => w.text !== "Player") };
  assert.equal(referenceFormationRoute(scan, scan), null);
});
test("a single upper roster column is not enough to preempt protected generic imports", () => {
  const scan = { words: sheet().words.filter((w) => w.y >= 900 || w.x < 300) };
  assert.equal(referenceFormationRoute(scan, scan), null);
});
test("routing does not lower the existing 85-confidence formation-anchor threshold", () => {
  const scan = {
    words: sheet().words.map((w) =>
      w.y >= 900 ? { ...w, confidence: 84 } : w,
    ),
  };
  assert.equal(referenceFormationRoute(scan, scan), null);
});
