import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFoireannRows,
  resolveFoireannJersey,
  foireannPlayer,
  cleanFoireannName,
} from "../src/foireann-programme.js";
const word = (text, x, y, w = 60, h = 15, confidence = 96) => ({
  text,
  x,
  y,
  w,
  h,
  confidence,
});
const read = (text, confidence) => ({
  text,
  words: [word(text, 0, 0, 20, 20, confidence)],
});
test("bilingual roster detection requires repeated DOB/ID structures in two separate columns and excludes management", () => {
  const words = [];
  for (const x of [100, 650])
    for (let i = 0; i < 4; i++) {
      words.push(
        word("03/04/2012", x, 100 + i * 60, 100),
        word("7654321", x + 120, 102 + i * 60, 75),
      );
    }
  words.push(
    word("Bainisteoirí", 300, 380),
    word("03/04/2012", 100, 400, 100),
    word("7654321", 220, 402, 75),
  );
  const layout = detectFoireannRows(words);
  assert.equal(layout.columns.length, 2);
  assert.deepEqual(
    layout.columns.map((c) => c.rows.length),
    [4, 4],
  );
  assert.equal(detectFoireannRows(words.filter((w) => w.x < 500)), null);
  assert.equal(
    detectFoireannRows([word("08", 0, 0), word("Example Player", 100, 0)]),
    null,
  );
});
test("handwritten/uncertain jersey retains full English name with blank editable number, not an invented starter", () => {
  const resolved = resolveFoireannJersey([read("18", 64), read("18", 73)]);
  assert.equal(resolved.number, "");
  const p = foireannPlayer({
    number: resolved.number,
    name: "Nora Jane Example",
    nameScore: 96,
    numberScore: 0,
    english: true,
    possible: ["18"],
  });
  assert.equal(p.name, "Nora Jane Example");
  assert.equal(p.number, "");
  assert.equal(p.role, "panel");
  assert.match(p.confidence, /jersey blank\/uncertain/);
  assert.match(p.confidence, /18 \(not assigned\)/);
});
test("jersey needs a clear OCR read; corroboration resolves disagreement, ties stay unresolved", () => {
  assert.equal(
    resolveFoireannJersey([read("29", 95), read("22", 92), read("22", 79)])
      .number,
    "22",
  );
  assert.equal(
    resolveFoireannJersey([read("11", 96), read("1", 87)]).number,
    "",
  );
  assert.equal(
    resolveFoireannJersey([read("8", 84), read("8", 84)]).number,
    "",
  );
  assert.equal(resolveFoireannJersey([read("08", 94)]).number, "8");
});
test("classification depends on shirt number, never source order; registered fallback is retained and flagged", () => {
  for (const [number, role] of [
    ["23", "substitute"],
    ["2", "starter"],
    ["18", "substitute"],
    ["1", "starter"],
  ]) {
    const p = foireannPlayer({
      number,
      name: "Áine Ní Shampla",
      nameScore: 90,
      numberScore: 95,
      english: false,
    });
    assert.equal(p.role, role);
    assert.equal(p.name, "Áine Ní Shampla");
    assert.match(p.confidence, /registered name retained/);
    assert.doesNotMatch(p.name, /\d/);
  }
});
test("safe OCR cleanup joins apostrophe prefixes, preserves multi-word names and removes detached suffix marks", () => {
  assert.equal(cleanFoireannName("Nora O’ Example {"), "Nora O'Example");
  assert.equal(
    cleanFoireannName("Nora Jane McExample -"),
    "Nora Jane McExample",
  );
});

test("actual-photo words still establish two player columns when DOB text is absent, with no invented jersey sequence", async () => {
  const { readFileSync } = await import("node:fs");
  const raw = JSON.parse(
    readFileSync(
      new URL("./fixtures/Foireann_Physical_Test_OCR.json", import.meta.url),
      "utf8",
    ),
  ).words;
  const withoutDates = raw.filter(
    (w) => !/[\d]{1,2}[/.-][\d]{1,2}[/.-][\d]{4}/.test(w.text),
  );
  const layout = detectFoireannRows(withoutDates);
  assert.ok(layout);
  assert.deepEqual(
    layout.columns.map((c) => c.rows.length),
    [13, 13],
  );
  assert.ok(
    layout.columns.every((c) => c.rows.every((r) => !r.dateRecognized)),
  );
});
test("a visible number and adjacent name preserve an entry with missing DOB/member-ID, bounded to its own column", () => {
  const words = [];
  for (const x of [100, 650])
    for (let i = 0; i < 3; i++) {
      words.push(
        word("03/04/2012", x, 100 + i * 60, 100),
        word("7654321", x + 120, 102 + i * 60, 75),
        word("Registered", x, 70 + i * 60, 90),
        word("Name", x + 95, 70 + i * 60, 60),
      );
    }
  words.push(
    word("31)", 35, 252, 30, 22),
    word("Nora", 100, 250, 55, 22),
    word("Example", 165, 252, 90, 22),
  );
  const layout = detectFoireannRows(words);
  const added = layout.columns[0].rows.find(
    (r) => r.numberAnchor?.text === "31)",
  );
  assert.ok(added);
  assert.equal(added.id, null);
  assert.equal(added.date.text, "");
  assert.equal(layout.columns[1].rows.length, 3);
});
test("English fallback does not require colour or circled jerseys and Extended Panel is excluded", () => {
  const words = [];
  for (const x of [100, 650])
    for (let i = 0; i < 4; i++)
      words.push(
        word("03/04/2012", x, 100 + i * 60, 100),
        word("7654321", x + 120, 102 + i * 60, 75),
      );
  words.push(word("Extended", 100, 260, 80), word("panel", 190, 260, 60));
  const layout = detectFoireannRows(words);
  assert.deepEqual(
    layout.columns.map((c) => c.rows.length),
    [3, 3],
  );
  const p = foireannPlayer({
    number: "18",
    name: "Áine Ní Shampla",
    nameScore: 92,
    numberScore: 94,
    english: false,
  });
  assert.equal(p.name, "Áine Ní Shampla");
  assert.equal(p.role, "substitute");
  assert.match(p.confidence, /registered name retained/);
});

test("detached footnote/OCR symbols are not part of a player name", () => {
  assert.equal(cleanFoireannName("Nora Example *"), "Nora Example");
  assert.equal(cleanFoireannName("Nora-Mae Example"), "Nora-Mae Example");
});

test("detached unmatched bracket noise is removed without dropping name words or captain markers", () => {
  assert.equal(cleanFoireannName("Nora Example ("), "Nora Example");
  assert.equal(cleanFoireannName("Nora Example (C)"), "Nora Example (C)");
});
