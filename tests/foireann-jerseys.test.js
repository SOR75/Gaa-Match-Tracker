import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handwrittenJerseyBox,
  originalJerseyCrop,
  resolveHandwrittenJersey,
} from "../src/foireann-jerseys.js";
const word = (text, x, y, w = 60, h = 16) => ({
  text,
  x,
  y,
  w,
  h,
  confidence: 96,
});
const row = (offset = 0) => ({
  date: { x: 70 + offset, y: 130 },
  id: { x: 154 + offset, y: 130 },
  dateRecognized: false,
});
const words = (offset = 0) => [
  word("Printed", 154 + offset, 110),
  word("Name", 220 + offset, 110),
  word("5313081", 154 + offset, 130),
  word("English", 230 + offset, 130),
  word("Name", 300 + offset, 130),
];
const box = (r = row(), ws = words(), right = 500) =>
  handwrittenJerseyBox({ row: r, words: ws, height: 12, right, width: 1000 });
const read = (text, confidence = 96, components = 1) => ({
  text,
  words: [{ text, confidence }],
  components,
});
test("jersey field is anchored to this printed name and stops before the member-ID/name area", () => {
  const b = box();
  assert.ok(b[0] < 120 && b[0] + b[2] < 154);
  assert.ok(b[1] < 120 && b[1] + b[3] > 140);
});
test("left/right columns calculate independent row-local number regions", () => {
  const a = box(row(), [...words(), ...words(500)]),
    b = box(row(500), [...words(), ...words(500)], 1000);
  assert.equal(b[0] - a[0], 500);
  assert.ok(Math.abs(b[2] - a[2]) < 1e-9);
});
test("a page-wide DOB/black-layout flag is not a prerequisite for the row pass", () => {
  assert.deepEqual(
    box({ ...row(), dateRecognized: true, blackJerseyOffset: 0 }),
    box(),
  );
});
test("genuine DOB/member layouts do not shift their existing red-number geometry", () => {
  assert.equal(box({ ...row(), id: { x: 274, y: 130 } }), null);
});
test("missing row geometry does not invent a jersey field", () => {
  assert.equal(box({ ...row(), id: null }), null);
  assert.equal(box(row(), []), null);
});
test("digit confidence remains 85; low-confidence and member-ID reads stay blank", () => {
  assert.equal(resolveHandwrittenJersey([read("18", 84, 2)]).number, "");
  assert.equal(resolveHandwrittenJersey([read("5313081", 99)]).number, "");
  assert.equal(resolveHandwrittenJersey([]).number, "");
});
test("whole-field single/multi-digit jersey values survive without sequential inference", () => {
  for (const n of [
    "1",
    "2",
    "5",
    "7",
    "8",
    "9",
    "11",
    "13",
    "15",
    "16",
    "18",
    "19",
  ])
    assert.equal(resolveHandwrittenJersey([read(n, 96, n.length)]).number, n);
});
test("two digit-sized components cannot be truncated into a high-confidence single jersey", () => {
  assert.equal(resolveHandwrittenJersey([read("1", 99, 2)]).number, "");
  assert.equal(
    resolveHandwrittenJersey([read("5", 99, 2), read("15", 96, 2)]).number,
    "15",
  );
  assert.equal(resolveHandwrittenJersey([read("11", 99, 3)]).number, "");
});
test("conflicting high-confidence strings stay blank, not majority-guessed", () => {
  const result = resolveHandwrittenJersey([
    read("18", 96, 2),
    read("13", 95, 2),
    read("18", 97, 2),
  ]);
  assert.equal(result.number, "");
  assert.ok(result.ambiguous);
});
test("full-resolution original crop maps layout coordinates back with integer bounds and no smoothing", () => {
  const previous = globalThis.document,
    calls = [];
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        set imageSmoothingEnabled(v) {
          calls.push(v);
        },
        drawImage: (...args) => calls.push(args),
      }),
    }),
  };
  try {
    const original = { naturalWidth: 4000, naturalHeight: 6000 },
      source = { width: 1000, height: 1500, originalImage: original };
    const c = originalJerseyCrop(source, [10.2, 20.4, 30, 40]);
    assert.equal(c.width, 121);
    assert.equal(c.height, 161);
    assert.equal(calls[0], false);
    assert.equal(calls[1][0], original);
    assert.deepEqual(calls[1].slice(1), [40, 81, 121, 161, 0, 0, 121, 161]);
  } finally {
    globalThis.document = previous;
  }
});
test("a harsher threshold cannot erase a second digit then accept the truncated single digit", () => {
  assert.equal(
    resolveHandwrittenJersey([read("5", 99, 1), read("15", 84, 2)]).number,
    "",
  );
});
