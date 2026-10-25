import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSpatialPlayers,
  parseTextPlayers,
  parseTablePlayers,
  POSITIONS,
} from "../src/import-parser.js";
import { validatePlayers } from "../src/squads.js";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/naomh-ciaran-synthetic-words.json", import.meta.url),
    "utf8",
  ),
);
test("synthetic Naomh Ciaran transcription yields XV + Subs and no document/staff candidates", () => {
  const result = parseSpatialPlayers(fixture.words, { ocr: true });
  const starters = result.filter((p) => p.role === "starter");
  assert.equal(result.length, 17);
  assert.equal(starters.length, 15);
  assert.deepEqual(
    starters.map((p) => p.number),
    Array.from({ length: 15 }, (_, i) => String(i + 1)),
  );
  assert.deepEqual(
    starters.map((p) => p.name),
    fixture.expectedNames,
  );
  assert.deepEqual(
    starters.map((p) => p.position),
    POSITIONS,
  );
  assert.deepEqual(
    result
      .filter((p) => p.role === "substitute")
      .map((p) => [p.number, p.name]),
    [
      ["16", "Cara Kelly"],
      ["17", "Eimear Byrne"],
    ],
  );
  assert.equal(
    result.some((p) =>
      /Cumann|LGFA|Venue|Westmeath|Management|Coach|Manager|Medical|Business|14:00/.test(
        p.name,
      ),
    ),
    false,
  );
  assert.match(starters[5].notes, /Vice-captain \(VC\)/);
  assert.match(starters[10].notes, /Captain \(C\)/);
  assert.match(starters[12].confidence, /44/);
  assert.equal(starters[12].name, "Ella Shrahan");
  const stored = validatePlayers(result);
  assert.equal(stored[5].name, "Alyssa Hennessy");
  assert.match(stored[5].notes, /VC/);
});
test("nonstandard starting jersey stays independent of formation position", () => {
  const words = structuredClone(fixture.words);
  words.find((w) => w.text === "6").text = "22";
  const player = parseSpatialPlayers(words, { layout: "formation" }).find(
    (p) => p.name === "Alyssa Hennessy",
  );
  assert.equal(player.number, "22");
  assert.equal(player.role, "starter");
  assert.equal(player.position, "Centre Half Back");
});
test("only credible number-to-name pairs survive when no complete grid exists", () => {
  const words = [
    { text: "Cumann Peil Gael", x: 50, y: 10, w: 200, h: 22 },
    { text: "Random Header", x: 400, y: 40, w: 180, h: 22 },
    { text: "6", x: 80, y: 110, w: 15, h: 22 },
    { text: "Uncertain R?gney", x: 15, y: 145, w: 160, h: 22, confidence: 28 },
    { text: "First Aid", x: 10, y: 210, w: 90, h: 22 },
    { text: "7 Staff Member", x: 10, y: 245, w: 180, h: 22 },
  ];
  for (const layout of ["auto", "programme", "formation"]) {
    const result = parseSpatialPlayers(words, { layout, ocr: true });
    assert.equal(result.length, 1);
    assert.equal(result[0].number, "6");
    assert.equal(result[0].name, "Uncertain R?gney");
    assert.match(result[0].confidence, /28/);
  }
  assert.deepEqual(
    parseSpatialPlayers(words.slice(0, 2), { layout: "formation" }),
    [],
  );
});
test("jerseys pair below or adjacent, once each; inline Subs stop before staff text", () => {
  const words = [
    { text: "1", x: 100, y: 100, w: 12, h: 22 },
    { text: "Clodagh", x: 70, y: 130, w: 70, h: 22 },
    { text: "Rigney", x: 70, y: 156, w: 70, h: 22 },
    { text: "2", x: 300, y: 200, w: 12, h: 22 },
    { text: "Lauren Heavin", x: 330, y: 200, w: 130, h: 22 },
    {
      text: "Subs: 16 Sub Player 17 Other Player Management: Staff Person",
      x: 20,
      y: 300,
      w: 600,
      h: 22,
    },
  ];
  const result = parseSpatialPlayers(words);
  assert.deepEqual(
    result.map((p) => [p.number, p.name]),
    [
      ["1", "Clodagh Rigney"],
      ["2", "Lauren Heavin"],
      ["16", "Sub Player"],
      ["17", "Other Player"],
    ],
  );
});
test("text and table imports retain captain markers separately and reject programme metadata", () => {
  const players = parseTextPlayers(
    "LGFA\nCumann Peil Gael\nNaomh Ciaran\nU14 Shield Final\n26 October 2026\n1 Clodagh Rigney\n6 Alyssa Hennessy (VC)\n11 Hannah Mitchell (C)\nSubs: 16 Cara Kelly 17 Eimear Byrne\nManagement\n18 Manager Person",
  );
  assert.equal(players.length, 5);
  assert.equal(players[1].name, "Alyssa Hennessy");
  assert.match(players[1].notes, /VC/);
  assert.equal(players[4].role, "substitute");
  const table = parseTablePlayers([
    ["Jersey", "Player Name"],
    [11, "Hannah Mitchell (C)"],
  ]);
  assert.equal(table[0].name, "Hannah Mitchell");
  assert.match(table[0].notes, /Captain/);
});

test("an unreadable name within a strong XV is retained blank, not replaced by header text", () => {
  const words = fixture.words.filter((w) => w.text !== "Clodagh Rigney");
  const players = parseSpatialPlayers(words);
  const row = players.find((p) => p.number === "1");
  assert.ok(row);
  assert.equal(row.name, "");
  assert.match(row.confidence, /unreadable/);
});
test("adjacent numbered table rows are not accidentally merged as a multiline name", () => {
  const words = [
    { text: "6", x: 10, y: 100, w: 12, h: 22 },
    { text: "Alyssa Hennessy (VC)", x: 100, y: 100, w: 180, h: 22 },
    { text: "7", x: 10, y: 140, w: 12, h: 22 },
    { text: "Holly Maloney", x: 100, y: 140, w: 140, h: 22 },
  ];
  assert.deepEqual(
    parseSpatialPlayers(words).map((p) => p.name),
    ["Alyssa Hennessy", "Holly Maloney"],
  );
});
