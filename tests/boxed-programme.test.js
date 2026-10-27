import { test } from "node:test";
import assert from "node:assert/strict";
import {
  printedNumber,
  stackedName,
  selectCardFormation,
  readBoxedProgramme,
} from "../src/boxed-programme.js";
const w = (text, x, y, width = 60, h = 18, confidence = 96) => ({
  text,
  x,
  y,
  w: width,
  h,
  confidence,
});
test("stacked card names use vertical order and merge nearby words on each line", () => {
  const r = stackedName([
    w("O’Donnell", 80, 150, 130),
    w("Nora", 110, 115, 60),
  ]);
  assert.equal(r.name, "Nora O’Donnell");
  assert.equal(r.lines.length, 2);
  assert.equal(
    stackedName([
      w("Doyle", 95, 155, 90),
      w("Rose", 150, 119, 55),
      w("Nora", 90, 115, 55),
    ]).name,
    "Nora Rose Doyle",
  );
  assert.equal(stackedName([]).name, "");
});
test("zero-padded jerseys come from recognised digits; low-confidence and non-numeric text remain blank", () => {
  assert.equal(printedNumber(w("08", 0, 0)), "8");
  assert.equal(printedNumber(w("09", 0, 0)), "9");
  assert.equal(printedNumber(w("22.", 0, 0)), "22");
  assert.equal(printedNumber(w("00", 0, 0)), "");
  assert.equal(printedNumber(w("11", 0, 0, 20, 18, 72)), "");
  assert.equal(printedNumber(w("O8", 0, 0)), "");
});
// Supplemental geometry examples; the real-image browser regression is primary.
const centres = [
  [500],
  [200, 500, 800],
  [200, 500, 800],
  [275, 725],
  [200, 500, 800],
  [200, 500, 800],
];
function sheet() {
  const cards = centres.flatMap((row, i) =>
    row.map((x) => ({ x: x - 120, y: 100 + i * 150, w: 240, h: 120 })),
  );
  const words = cards.flatMap((c, i) => [
    w(String(i + 1).padStart(2, "0"), c.x + 105, c.y + 10, 30),
    w("Nora", c.x + 90, c.y + 45),
    w("Byrne", c.x + 75, c.y + 78, 90),
  ]);
  return { cards, words, grid: { x0: 500, y0: 110, sx: 300, sy: 150 } };
}
test("actual card positions associate wider-spaced midfield boxes; arbitrary rectangles and metadata are not a team", () => {
  const { cards, words, grid } = sheet();
  assert.deepEqual(selectCardFormation(cards, words, grid), cards);
  assert.equal(selectCardFormation(cards.slice(1), words, grid), null);
  assert.equal(
    selectCardFormation(
      cards,
      words.filter((w) => !/\d/.test(w.text)),
      grid,
    ),
    null,
  );
  assert.equal(selectCardFormation(cards, [], grid), null);
});
test("card boundaries exclude neighbours; jersey and formation position remain independent; missing digits are never filled", async () => {
  const { cards, words } = sheet();
  words.find((w) => w.text === "06").text = "22";
  words.find((w) => w.text === "08").confidence = 40;
  words.push(w("Management", cards[0].x + cards[0].w + 15, cards[0].y + 45));
  const worker = { setParameters: async () => {} };
  const result = await readBoxedProgramme({
    cards,
    scan: { words, text: "" },
    source: {},
    normalized: {},
    crop: () => ({}),
    read: async () => ({ text: "?", words: [w("?", 0, 0)] }),
    worker,
    onProgress: () => {},
  });
  assert.equal(result.players.length, 15);
  assert.equal(result.players[5].number, "22");
  assert.equal(result.players[5].position, "Centre Half Back");
  assert.equal(result.players[7].number, "");
  assert.match(result.players[7].confidence, /jersey unreadable/);
  assert.ok(
    result.players.every(
      (p) => p.name === "Nora Byrne" && p.role === "starter",
    ),
  );
});
test("Subs switches independently to unboxed number-above-multiline-name parsing", async () => {
  const { cards, words } = sheet();
  words.push(
    w("Subs", 10, 1050),
    w("22", 100, 1100, 25),
    w("Cara", 90, 1135),
    w("White", 80, 1170, 85),
    w("23", 300, 1100, 25),
    w("Nora", 290, 1135),
    w("Rose", 355, 1135),
    w("Kelly", 310, 1170),
  );
  const result = await readBoxedProgramme({
    cards,
    scan: { words, text: "" },
    source: {},
    normalized: {},
    crop: () => ({}),
    read: async () => {
      throw Error("Clear numbers need no extra OCR");
    },
    worker: {},
    onProgress: () => {},
  });
  assert.deepEqual(
    result.players.slice(15).map((p) => [p.number, p.name, p.role]),
    [
      ["22", "Cara White", "substitute"],
      ["23", "Nora Rose Kelly", "substitute"],
    ],
  );
});
