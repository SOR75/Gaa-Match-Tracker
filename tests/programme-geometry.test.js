import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fitFormation,
  slots,
  cleanPlayerText,
} from "../src/programme-geometry.js";
import { spatialSegments } from "../src/import-parser.js";
test("formation fit rejects document dates and does not generate jersey numbers", () => {
  const words = slots.map(([x, y], i) => ({
    text: String(i + 1),
    x: 600 + x * 300,
    y: 400 + y * 110,
    w: 20,
    h: 24,
    confidence: 96,
  }));
  words.push({ text: "14", x: 40, y: 20, w: 20, h: 24, confidence: 99 });
  const grid = fitFormation(words);
  assert.equal(grid.count, 15);
  assert.ok(Math.abs(grid.sy - 110) < 1);
  assert.equal(fitFormation(words.slice(0, 3)), null);
});
test("tilted first name and surname share a baseline despite different tops", () => {
  const segments = spatialSegments([
    { text: "Sarah", x: 644, y: 792, w: 102, h: 30, confidence: 96 },
    { text: "Foley", x: 759, y: 763, w: 97, h: 66, confidence: 96 },
  ]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, "Sarah Foley");
});
test("punctuation is cleaned without supplying missing player text", () => {
  assert.equal(cleanPlayerText("Anna Kenny ="), "Anna Kenny");
  assert.equal(cleanPlayerText("Hannah Mitchell (©)"), "Hannah Mitchell (C)");
  assert.equal(cleanPlayerText("Alyssa Hennessy (VC)"), "Alyssa Hennessy (VC)");
});
