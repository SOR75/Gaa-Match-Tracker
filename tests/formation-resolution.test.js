import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFormationResolution,
  assignFormationPlayer,
  assignedElsewhere,
  formationReady,
  confirmedFormationPlayers,
  correctRosterName,
} from "../src/formation-resolution.js";
const read = (text) => ({
  text,
  words: text ? text.split(" ").map((text) => ({ text, confidence: 96 })) : [],
});
function source() {
  return {
    roster: [
      { name: "Nora Blackwell", score: 96 },
      { name: "Megan Heavin", score: 96 },
      { name: "Megan Kelly", score: 96 },
      ...Array.from({ length: 14 }, (_, i) => ({
        name: `Reference Player${String.fromCharCode(65 + i)}`,
        score: 96,
      })),
    ],
    formation: Array.from({ length: 15 }, (_, i) => ({
      number: String(i + 1),
      reads: [read(i === 4 ? "Nora" : i === 1 ? "Megan" : "")],
    })),
  };
}
test("all 15 positions remain, with safe unresolved/ambiguous slots and one editable automatic match", () => {
  const s = createFormationResolution(source());
  assert.equal(s.slots.length, 15);
  assert.equal(s.slots[0].playerId, "");
  assert.equal(s.slots[1].alternatives.length, 2);
  assert.equal(s.slots[4].playerId, "roster-0");
  assert.ok(s.slots[4].automatic);
  assert.ok(!formationReady(s));
});
test("selection changes the assignment without typing or mutating the source", () => {
  const raw = source(),
    before = JSON.stringify(raw);
  const s = createFormationResolution(raw),
    next = assignFormationPlayer(s, 1, "roster-3");
  assert.equal(next.slots[0].playerId, "roster-3");
  assert.equal(s.slots[0].playerId, "");
  assert.equal(JSON.stringify(raw), before);
});
test("changing/clearing a selection returns its previous player to the pool", () => {
  let s = createFormationResolution(source());
  s = assignFormationPlayer(s, 5, "roster-3");
  assert.equal(assignedElsewhere(s, "roster-0", 1), undefined);
  assert.equal(assignedElsewhere(s, "roster-3", 1).number, 5);
  s = assignFormationPlayer(s, 5, "");
  assert.equal(assignedElsewhere(s, "roster-3", 1), undefined);
});
test("duplicate selection is rejected rather than silently moved to another position", () => {
  const s = createFormationResolution(source());
  assert.throws(
    () => assignFormationPlayer(s, 1, "roster-0"),
    /already assigned/,
  );
  assert.throws(
    () => assignFormationPlayer(s, 1, "invented-player"),
    /printed roster/,
  );
});
test("confirmation requires all 15 assignments, not separate position-anchor verification", () => {
  const raw = source();
  raw.formation[14].number = "";
  const s = createFormationResolution(raw);
  assert.throws(() => confirmedFormationPlayers(s), /all 15/);
  const full = {
    ...s,
    slots: s.slots.map((slot, i) => ({
      ...slot,
      playerId: `roster-${i}`,
    })),
  };
  assert.ok(formationReady(full));
  assert.equal(confirmedFormationPlayers(full)[14].number, "15");
});
test("confirmed starters use formation numbers; remaining roster becomes substitutes with blank jerseys", () => {
  const raw = source();
  raw.roster.forEach((p, i) => (p.number = i + 30));
  let s = createFormationResolution(raw);
  s = {
    ...s,
    slots: s.slots.map((slot, i) => ({ ...slot, playerId: `roster-${i}` })),
  };
  const p = confirmedFormationPlayers(s);
  assert.ok(formationReady(s));
  assert.deepEqual(
    p.slice(0, 15).map((p) => p.number),
    Array.from({ length: 15 }, (_, i) => String(i + 1)),
  );
  assert.ok(
    p.slice(15).every((p) => p.role === "substitute" && p.number === ""),
  );
  assert.equal(p.length, raw.roster.length);
});
test("printed-name corrections are explicit, retained in assigned names, and cannot create duplicates", () => {
  const s = createFormationResolution(source());
  const next = correctRosterName(s, "roster-0", "Nora Corrected");
  assert.equal(next.roster[0].name, "Nora Corrected");
  assert.equal(s.roster[0].name, "Nora Blackwell");
  assert.throws(
    () => correctRosterName(next, "roster-0", "Megan Kelly"),
    /already/,
  );
});
test("one automatic roster match at two formation positions leaves both for human review", () => {
  const raw = source();
  raw.formation[0].reads = [read("Nora")];
  const s = createFormationResolution(raw);
  assert.equal(s.slots[0].playerId, "");
  assert.equal(s.slots[4].playerId, "");
});
test("a forged duplicate cannot bypass confirmation validation", () => {
  let s = createFormationResolution(source());
  s = {
    ...s,
    slots: s.slots.map((slot, i) => ({ ...slot, playerId: `roster-${i}` })),
  };
  s.slots[1].playerId = s.slots[0].playerId;
  assert.throws(() => confirmedFormationPlayers(s), /Duplicate/);
});
