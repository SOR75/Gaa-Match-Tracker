import { test } from "node:test";
import assert from "node:assert/strict";
import readWorkbook from "read-excel-file/node";
import {
  parseOfficialSquad,
  validateSquadDraft,
  createImportedSquad,
  SQUAD_COLUMNS,
} from "../src/squad-excel.js";
import {
  loadSquads,
  persistSquads,
  loadSquadPlayers,
  snapshotSquad,
} from "../src/squads.js";
import { blankMatch, createEvent, saveEvent, totals } from "../src/domain.js";
import { historySnapshot } from "../src/history.js";
import { validPlayerId } from "../src/identity.js";
const path = (name) => `tests/fixtures/squad-template/${name}.xlsx`;
const workbook = (players) => [
  {
    sheet: "Squad Setup",
    data: [
      ["Club Name", "Test"],
      ["Squad Name", "Panel"],
      ["Season", "2027"],
      ["Code", "LGFA"],
      ["Coach / Manager", "Coach"],
    ],
  },
  { sheet: "Players", data: [["Player Name *", "Default No."], ...players] },
];
const draft = (players) => parseOfficialSquad(workbook(players));
function storage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

test("actual official-format County workbook imports 30 full fictional players, ignores ten unused styled rows", async () => {
  const d = parseOfficialSquad(await readWorkbook(path("County-30"))),
    v = validateSquadDraft(d);
  assert.equal(d.players.length, 30);
  assert.equal(v.valid, true);
  assert.equal(v.ready, 30);
  assert.equal(d.metadata.clubName, "Fictional County");
  assert.equal(d.metadata.seasonLabel, "2027");
  assert.equal(v.rows[29].player.status, "active");
  assert.equal(v.rows[7].player.secondaryPosition, "");
  assert.ok(d.players.every((p) => !p.playerId && !p.id));
});
test("actual Club workbook imports 21 player-name-only entries with all optional defaults blank and status active", async () => {
  const d = parseOfficialSquad(await readWorkbook(path("Club-21"))),
    s = createImportedSquad(d);
  assert.equal(s.players.length, 21);
  assert.ok(
    s.players.every(
      (p) =>
        p.number === null &&
        p.position === "" &&
        p.secondaryPosition === "" &&
        p.status === "active",
    ),
  );
});
test("only nonempty incomplete rows require name review; completely unused rows are ignored", () => {
  const d = draft([["Only Name"], [], [null, null], ["", 6]]),
    v = validateSquadDraft(d);
  assert.equal(d.players.length, 1);
  assert.equal(v.valid, true);
  d.players[0].name="";
  assert.match(validateSquadDraft(d).rows[0].errors.join(" "), /Review name/);
});
test("duplicate display names are warnings, create separate permanent IDs, and never merge", () => {
  const d = draft([
      ["Same Name", 6],
      ["Same Name", 8],
    ]),
    v = validateSquadDraft(d);
  assert.equal(v.valid, true);
  assert.equal(v.ready, 0);
  assert.ok(v.rows.every((r) => r.warnings.length === 1));
  const s = createImportedSquad(d);
  assert.notEqual(s.players[0].playerId, s.players[1].playerId);
});
test("legacy duplicate default jerseys are ignored without merging people or forcing match numbers",()=>{
 const s=createImportedSquad(draft([["First Player",6],["Second Player",6]]));
 assert.ok(s.players.every(p=>p.number===null));assert.notEqual(s.players[0].playerId,s.players[1].playerId);
});
for(const number of ["abc","0","100","-1","6.5","1e1","true"])test(`ignored legacy default jersey ${number} cannot block name-only creation`,()=>{
 const s=createImportedSquad(draft([["A Player",number]]));assert.equal(s.players[0].number,null);
});
test("older template position/status columns are ignored even when unsupported, and cannot block creation", async () => {
  const d = parseOfficialSquad(await readWorkbook(path("Legacy-rich")));
  const s = createImportedSquad(d);
  assert.equal(s.players.length, 2);
  assert.ok(
    s.players.every(
      (p) =>
        p.status === "active" &&
        p.position === "" &&
        p.secondaryPosition === "",
    ),
  );
  assert.equal(s.players[0].number, null);
});
test("missing Players, wrong columns, unsupported workbook and missing Setup are rejected with template guidance", async () => {
  for (const name of ["Missing-Players", "Wrong-columns"]) {
    const sheets = await readWorkbook(path(name));
    assert.throws(() => parseOfficialSquad(sheets), /official Sideline/);
  }
  assert.throws(() => parseOfficialSquad([]), /Players/);
  assert.throws(
    () => parseOfficialSquad([{ sheet: "Players", data: [SQUAD_COLUMNS] }]),
    /Squad Setup/,
  );
  assert.throws(() => parseOfficialSquad(null), /Unsupported/);
});
test("unexpected columns are not silently imported; empty squad cannot be created", () => {
  const w = workbook([["A Name"]]);
  w[1].data[0] = ["Name", "Number"];
  assert.throws(() => parseOfficialSquad(w), /column/i);
  assert.equal(validateSquadDraft(draft([])).valid, false);
});
test("Create → save → reload → Load preserves UUIDs and metadata, edit default/name/position/status preserves identity", async () => {
  globalThis.localStorage = storage();
  const s = createImportedSquad(
    parseOfficialSquad(await readWorkbook(path("County-30"))),
  );
  assert.ok(s.players.every((p) => validPlayerId(p.playerId)));
  assert.equal(new Set(s.players.map((p) => p.playerId)).size, 30);
  assert.ok(validPlayerId(s.id));
  assert.equal(s.seasonId, null);
  persistSquads([s]);
  const restored = loadSquads().squads[0],
    loaded = loadSquadPlayers(restored);
  assert.deepEqual(
    loaded.map((p) => p.playerId),
    s.players.map((p) => p.playerId),
  );
  restored.players[0] = {
    ...restored.players[0],
    name: "Updated Fictional Name",
    number: 33,
    position: "Full Back",
    status: "inactive",
  };
  const edited = snapshotSquad(
    restored.name,
    restored.players,
    restored.id,
    restored,
  );
  persistSquads([edited]);
  assert.equal(
    loadSquads().squads[0].players[0].playerId,
    s.players[0].playerId,
  );
  assert.equal(edited.clubName, s.clubName);
  assert.equal(edited.seasonLabel, s.seasonLabel);
});
test("Excel permanent player keeps identity through default 23 and three match jersey assignments and historical event snapshots", () => {
  globalThis.localStorage = storage();
  const created = createImportedSquad(draft([["Isabel", 23]]));
  persistSquads([created]);
  const s = loadSquads().squads[0],
    matches = [6, 8, 11].map((number) => {
      const m = blankMatch();
      m.players = loadSquadPlayers(s);
      m.squadId = s.id;
      m.players[0].number = number;
      m.players[0].jerseyNumber = number;
      m.events = saveEvent(
        [],
        { ...createEvent(m, "point", "our"), playerNumber: String(number) },
        m,
      );
      return historySnapshot({ match: JSON.parse(JSON.stringify(m)) });
    });
  assert.equal(matches[0].players[0].playerId, matches[1].players[0].playerId);
  assert.notEqual(
    matches[0].players[0].matchPlayerId,
    matches[1].players[0].matchPlayerId,
  );
  assert.deepEqual(
    matches.map((m) => m.events[0].participants.player.jerseyNumber),
    [6, 8, 11],
  );
  assert.ok(
    matches.every(
      (m) =>
        m.events[0].participants.player.playerId === s.players[0].playerId &&
        totals(m.events, "our").total === 1,
    ),
  );
});

test("unused richer template rows are ignored even if deprecated fields contain values", async () => {
  const d = parseOfficialSquad(await readWorkbook(path("Legacy-rich")));
  assert.equal(d.players.length, 2);
  assert.equal(validateSquadDraft(d).valid, true);
});
test("names trim whitespace and accidental line breaks while preserving Unicode and entered capitalisation", async () => {
  const d = parseOfficialSquad(await readWorkbook(path("Unicode-names")));
  assert.deepEqual(
    d.players.map((p) => p.name),
    [
      "Éabha Ní Bhriain",
      "Siún O’Neill",
      "mÁire McDONAGH",
      "Same Name",
      "Same Name",
    ],
  );
  const s = createImportedSquad(d);
  assert.notEqual(s.players[3].playerId, s.players[4].playerId);
});
test("single Player Name column is sufficient; Default No column and coach metadata can be absent", async () => {
  const sheets = await readWorkbook(path("Name-only"));
  sheets[0].data = sheets[0].data.filter((row) => row[0] !== "Coach / Manager");
  const s = createImportedSquad(parseOfficialSquad(sheets));
  assert.equal(s.players.length, 2);
  assert.ok(s.players.every((p) => p.number === null));
});
test("29-player county fixture imports 29 players without requiring any playing positions or availability", async () => {
  const s = createImportedSquad(
    parseOfficialSquad(await readWorkbook(path("County-29"))),
  );
  assert.equal(s.players.length, 29);
  assert.equal(new Set(s.players.map((p) => p.playerId)).size, 29);
});
