import { test } from "node:test";
import assert from "node:assert/strict";
import {
  referenceNumber,
  associateRosterClue,
  referencePlayers,
  detectReferenceRoster,
} from "../src/roster-formation.js";
import { POSITIONS } from "../src/import-parser.js";
const read = (text, confidence = 95) => ({
  text,
  words: text.split(" ").map((text) => ({ text, confidence })),
});
const roster = [
  { name: "Orla Byrne", score: 95 },
  { name: "Nora Kelly", score: 95 },
  { name: "Ciara Smith", score: 95 },
  { name: "Ciara Moore", score: 90 },
  { name: "Eimear Mai Doyle", score: 95 },
  { name: "Mila Brown", score: 94 },
];
test("reference vocabulary expands a strong unique handwritten first name only from OCR roster", () => {
  assert.equal(associateRosterClue([read("Orla")], roster).name, "Orla Byrne");
  assert.equal(
    associateRosterClue([read("E. Mai")], roster).name,
    "Eimear Mai Doyle",
  );
  assert.equal(associateRosterClue([read("Orla")], []).name, "");
});
test("same first name never arbitrarily selects a surname, including a damaged alternative", () => {
  const result = associateRosterClue(
    [read("Ciara")],
    [roster[2], { ...roster[3], uncertain: true }],
  );
  assert.equal(result.name, "");
  assert.match(result.warning, /Ciara Smith \/ Ciara Moore/);
  assert.equal(associateRosterClue([read("Ciara", 30)], roster).name, "");
  assert.match(
    associateRosterClue([read("Ciara", 30)], roster).warning,
    /ambiguous/,
  );
});
test("blank, garbage, multiple conflicting clues and tiny OCR fragments do not invent starters", () => {
  for (const text of ["", "——", "Mla", "Orla Nora", "ZZZZ"])
    assert.equal(associateRosterClue([read(text)], roster).name, "", text);
  assert.equal(associateRosterClue([read("Nora", 15)], roster).name, "");
});
test("a damaged printed surname is not promoted into a full-name assignment", () => {
  const result = associateRosterClue(
    [read("Orla")],
    [{ name: "Orla B?rn", score: 55, uncertain: true }],
  );
  assert.equal(result.name, "");
  assert.match(result.warning, /printed surname uncertain/);
});
test("single weak fuzzy resemblance is unresolved; corroborated close reads require review", () => {
  assert.equal(associateRosterClue([read("Eimear", 35)], roster).name, "");
  const r = [{ name: "Rowena Smith", score: 95 }];
  assert.equal(associateRosterClue([read("Rowen", 52)], r).name, "");
  assert.equal(
    associateRosterClue([read("Rowen", 52), read("Rowen", 58)], r).name,
    "Rowena Smith",
  );
});
test("bottom formation determines starters; unused roster is panel with no invented jerseys", () => {
  const slots = Array.from({ length: 15 }, (_, i) => ({
    number: i === 5 ? "" : String(i + 1),
    reads: [read(i === 2 ? "Orla" : "")],
  }));
  const result = referencePlayers(roster, slots);
  assert.equal(result.filter((r) => r.role === "starter").length, 15);
  assert.equal(result[2].name, "Orla Byrne");
  assert.equal(result[5].number, "");
  assert.equal(result[8].name, "");
  assert.deepEqual(
    result.slice(0, 15).map((r) => r.position),
    POSITIONS,
  );
  const panel = result.filter((r) => r.role === "panel");
  assert.equal(panel.length, 5);
  assert.ok(panel.every((r) => r.number === "" && r.position === ""));
  assert.ok(result.every((r) => r.confidence.includes("Review required")));
});
test("reference-layout detection needs repeated full-name columns and a roster header, not arbitrary page words", () => {
  const word = (text, x, y, confidence = 95) => ({
    text,
    x,
    y,
    w: 35,
    h: 16,
    confidence,
  });
  const grid = { x0: 400, y0: 900, sx: 270, sy: 80 };
  const rows = Array.from({ length: 10 }, (_, i) => [
    word(String(i + 1), 20, 100 + i * 30),
    word("First", 60, 100 + i * 30),
    word("Surname", 110, 100 + i * 30),
  ]).flat();
  assert.equal(detectReferenceRoster(rows, grid), null);
  const words = [
    word("Player", 60, 65),
    ...rows,
    word("Venue:", 700, 100),
    word("Town", 760, 100),
    word("Management", 60, 450),
    word("Person", 170, 450),
    word("Staff", 60, 480),
    word("Surname", 110, 480),
  ];
  const found = detectReferenceRoster(words, grid);
  assert.equal(found.rows.length, 10);
  assert.ok(found.rows.every((r) => r.text === "First Surname"));
  assert.equal(detectReferenceRoster(words, null), null);
  assert.equal(
    detectReferenceRoster([word("Player", 60, 65), ...rows.slice(0, 12)], grid),
    null,
  );
});

test("reference jerseys come from readable digits, including non-standard jerseys, not inferred slot order", () => {
  assert.equal(referenceNumber([read("22", 95)], [{ n: 8 }]), "22");
  assert.equal(referenceNumber([read("6.)", 95)], [{ n: 8 }]), "6");
  assert.equal(referenceNumber([read("8", 95)], [{ n: 8 }]), "");
  assert.equal(referenceNumber([read("6", 40)], []), "");
  assert.equal(referenceNumber([read("")], []), "");
});

test("distinctive partial names use only the sheet roster and retain strict acceptance scores", () => {
  const pool = [
    { name: "Bernadette Green", score: 95 },
    { name: "Saoirse White", score: 95 },
  ];
  assert.equal(
    associateRosterClue([read("Bernade", 95)], pool).name,
    "Bernadette Green",
  );
  assert.equal(
    associateRosterClue([read("Bernade", 70), read("Bernade", 70)], pool).name,
    "",
  );
  assert.equal(associateRosterClue([read("Bernade", 95)], []).name, "");
  assert.equal(associateRosterClue([read("nad", 99)], pool).name, "");
});
test("exact and partial alternatives are both considered; no arbitrary surname from a prefix", () => {
  const pool = [
    { name: "Andre Smith", score: 95 },
    { name: "Andrea Jones", score: 95 },
  ];
  const result = associateRosterClue([read("Andre", 95)], pool);
  assert.equal(result.name, "");
  assert.match(result.warning, /Andre Smith \/ Andrea Jones/);
});
test("short vowel/joined-letter fragments expose alternatives but cannot automatically assign even a high OCR score", () => {
  const pool = [
    { name: "Nella Smith", score: 95 },
    { name: "Nila Brown", score: 95 },
  ];
  const result = associateRosterClue([read("Nla", 95)], pool);
  assert.equal(result.name, "");
  assert.match(result.warning, /Nella Smith \/ Nila Brown/);
  assert.equal(associateRosterClue([read("Nla", 99)], pool.slice(1)).name, "");
  assert.equal(
    associateRosterClue([read("Nla", 99), read("Nla", 99)], pool.slice(1)).name,
    "",
  );
});
