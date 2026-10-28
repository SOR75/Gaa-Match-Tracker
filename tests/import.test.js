import { createMatchPlayer } from "../src/identity.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTablePlayers,
  parseTextPlayers,
  parseSpatialPlayers,
  POSITIONS,
} from "../src/import-parser.js";
import {
  validatePlayers,
  snapshotSquad,
  loadSquadPlayers,
} from "../src/squads.js";
import { blankMatch, validMatch, createEvent, totals } from "../src/domain.js";
import { onFieldNumbers } from "../src/matchday.js";
import { playerStatistics } from "../src/analysis.js";
const word = (text, x, y, w = 100, confidence = 100) => ({
  text,
  x,
  y,
  w,
  h: 20,
  confidence,
});

test("Foireann table uses handwritten jersey and first Starting column, not alphabetical row order", () => {
  const rows = [
    ["Jersey", "Player Name", "Starting", "Starting 2", "Position"],
    ["22", "Anna Byrne", "✓", "", "Centre Half Back"],
    ["6", "Bella Murphy", "", "x", ""],
    ["", "Ciara Kelly", "✓", "", ""],
  ];
  const players = parseTablePlayers(rows, { layout: "registered" });
  assert.deepEqual(
    players.map((p) => [p.number, p.role]),
    [
      ["22", "starter"],
      ["6", "substitute"],
      ["", "panel"],
    ],
  );
  assert.equal(players[0].position, "Centre Half Back");
  const serial = parseTablePlayers(
    [
      ["No.", "Player Name", "Starting"],
      [1, "Unselected Panel", "x"],
    ],
    { layout: "registered" },
  );
  assert.equal(serial[0].number, "");
  assert.equal(serial[0].role, "panel");
});
test("positioned PDF checkbox marks use first Starting column; uncertain OCR digits stay blank", () => {
  const words = [
    word("Jersey", 10, 10, 60),
    word("Player Name", 120, 10, 120),
    word("Starting", 400, 10, 65),
    word("Starting", 520, 10, 65),
    word("8", 10, 60, 15, 99),
    word("Anna Byrne", 120, 60, 140),
    word("✓", 400, 60, 15),
    word("9", 10, 100, 15, 99),
    word("Bella Murphy", 120, 100, 140),
    word("✓", 520, 100, 15),
    word("Ciara Kelly", 120, 140, 140),
  ];
  const players = parseSpatialPlayers(words, { layout: "registered" });
  assert.deepEqual(
    players.map((p) => [p.number, p.role]),
    [
      ["8", "starter"],
      ["9", "substitute"],
      ["", "panel"],
    ],
  );
  words[4].confidence = 40;
  const uncertain = parseSpatialPlayers(words, {
    layout: "registered",
    ocr: true,
  });
  assert.equal(uncertain[0].number, "");
  assert.match(uncertain[0].confidence, /uncertain/);
});
test("formation placement assigns position, never invents jerseys; 22 can start at Centre Half Back", () => {
  const words = [];
  let i = 0;
  const names = [
    "Alpha Keeper",
    "Bravo Back",
    "Charlie Back",
    "Delta Back",
    "Echo Wing",
    "Foxtrot Centre",
    "Golf Wing",
    "Hotel Midfield",
    "India Midfield",
    "Juliet Forward",
    "Kilo Forward",
    "Lima Forward",
    "Mike Corner",
    "November Full",
    "Oscar Corner",
  ];
  for (const [row, count] of [1, 3, 3, 2, 3, 3].entries()) {
    const xs = count === 1 ? [500] : count === 2 ? [300, 700] : [100, 500, 900];
    for (const x of xs) {
      words.push(
        word(i === 5 ? "22 " + names[i] : names[i], x, row * 150, 170),
      );
      i++;
    }
  }
  const players = parseSpatialPlayers(words, { layout: "formation" });
  assert.equal(players.length, 15);
  assert.equal(players[5].number, "22");
  assert.equal(players[5].position, "Centre Half Back");
  assert.equal(players[5].role, "starter");
  assert.equal(players.filter((p) => p.number === "").length, 14);
  assert.deepEqual(
    players.map((p) => p.position),
    POSITIONS,
  );
  const reversed = words.map((w) => ({
    ...w,
    x: 1200 - w.x - w.w,
    y: 1000 - w.y,
  }));
  assert.equal(
    parseSpatialPlayers(reversed, { layout: "formation", goal: "bottom" }).find(
      (p) => p.name === "Foxtrot Centre",
    ).position,
    "Centre Half Back",
  );
});
test("ambiguous formation does not guess missing positions, numeric order is never generated", () => {
  const players = parseSpatialPlayers(
    [word("Alpha Keeper", 100, 100), word("Bella Player", 400, 200)],
    { layout: "formation" },
  );
  assert.equal(players.length, 0);
  assert.ok(
    players.every(
      (p) => p.number === "" && p.position === "" && p.role === "starter",
    ),
  );
  // Selecting formation mode alone is not evidence that arbitrary words are players.
  assert.deepEqual(
    parseTextPlayers("Registered panel\nAnna Byrne\nBella Murphy", {
      layout: "registered",
    }).map((p) => [p.number, p.role]),
    [
      ["", "panel"],
      ["", "panel"],
    ],
  );
});
test("multiple blank jerseys and unselected panel survive storage validation, library copies and analysis", () => {
  const players = validatePlayers([
    {
      name: "Blank Starter",
      number: "",
      role: "starter",
      position: "Full Back",
    },
    { name: "Panel Player", number: "", role: "panel" },
    { name: "Numbered Starter", number: 8, role: "starter" },
  ]);
  const match = blankMatch();
  match.players = players.map(createMatchPlayer);
  match.events = [createEvent(match, "goal", "our")];
  assert.equal(validMatch(match), true);
  assert.deepEqual([...onFieldNumbers(match, "our")], ["8"]);
  assert.equal(playerStatistics(match, "our").length, 1);
  assert.equal(totals(match.events, "our").total, 3);
  const copied = loadSquadPlayers(snapshotSquad("Reusable", players));
  assert.equal(copied[0].number, null);
  assert.equal(copied[1].role, "panel");
  assert.equal(copied[0].position, "Full Back");
  assert.throws(
    () =>
      validatePlayers([
        { name: "A B", number: 8 },
        { name: "C D", number: 8 },
      ]),
    /Duplicate/,
  );
});

test("starting-list jersey 22 is a starter, and split names/registered columns are joined without making up numbers", () => {
  const list = parseTextPlayers(
    "Starting XV\n22 Patrick Murphy\nSubstitutes\n6 Sean Kelly",
  );
  assert.equal(list[0].role, "starter");
  assert.equal(list[0].position, "");
  assert.equal(list[1].role, "substitute");
  const multiline = parseSpatialPlayers(
    [word("Patrick", 170, 100, 60), word("Murphy", 165, 127, 70)],
    { layout: "formation" },
  );
  assert.equal(multiline.length, 0); // no jersey or complete formation: no invented player row
  const panel = parseSpatialPlayers(
    [
      word("Forename", 120, 10, 100),
      word("Surname", 280, 10, 90),
      word("Jersey", 20, 10, 60),
      word("Starting", 500, 10, 65),
      word("Anna", 120, 60, 45),
      word("Byrne", 280, 60, 50),
      word("8", 20, 60, 15),
      word("✓", 500, 60, 15),
    ],
    { layout: "registered" },
  );
  assert.equal(panel[0].name, "Anna Byrne");
  assert.equal(panel[0].number, "8");
  assert.equal(panel[0].role, "starter");
});
