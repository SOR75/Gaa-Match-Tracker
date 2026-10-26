import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  totals,
  migrateMatch,
} from "../src/domain.js";
import { playerStatistics, summarize } from "../src/analysis.js";
const player = (number, name) => ({
  id: `p${number}`,
  number,
  name,
  role: "starter",
  notes: "",
  position: "",
});
const stat = (match, team, number) =>
  playerStatistics(match, team).find((p) => p.number === String(number));

test("our shooter has six attempts and four blocked attempts with no invented defensive credit", () => {
  const match = blankMatch();
  match.players = [player(15, "Shooter"), player(3, "Defender")];
  for (let i = 0; i < 6; i++)
    match.events = saveEvent(match.events, {
      ...createEvent(match, i === 4 ? "point" : "miss", "our"),
      playerNumber: "15",
      missReason: i < 4 ? "blocked" : i === 5 ? "wide" : "",
      blockedByNumber: "3",
    });
  assert.equal(match.events.length, 6);
  assert.equal(stat(match, "our", 15).attempts, 6);
  assert.equal(stat(match, "our", 15).blockedAttempts, 4);
  assert.equal(stat(match, "our", 15).total, 1);
  assert.equal(stat(match, "our", 3).defensiveBlocks, 0);
  assert.equal(stat(match, "our", 15).defensiveBlocks, 0);
  assert.ok(match.events.every((e) => e.blockedByNumber === ""));
  assert.equal(totals(match.events, "our").total, 1);
});
test("three opposition blocked attempts credit three defensive blocks to our player without changing shooters or event count", () => {
  const match = blankMatch();
  match.players = [player(3, "Sarah")];
  match.oppositionPlayers = [player(15, "Their Shooter")];
  for (let i = 0; i < 3; i++)
    match.events = saveEvent(match.events, {
      ...createEvent(match, "miss", "opposition"),
      playerNumber: "15",
      missReason: "blocked",
      blockedByNumber: "3",
    });
  assert.equal(match.events.length, 3);
  assert.equal(stat(match, "our", 3).defensiveBlocks, 3);
  assert.equal(stat(match, "our", 3).attempts, 0);
  assert.equal(stat(match, "opposition", 15).blockedAttempts, 3);
  assert.equal(stat(match, "opposition", 15).attempts, 3);
  assert.equal(totals(match.events, "opposition").total, 0);
  assert.ok(
    match.events.every(
      (e) => e.playerNumber === "15" && e.blockedByNumber === "3",
    ),
  );
});
test("blocker/reason edits recalculate legacy and new events while preserving the sole shot ID and shooter", () => {
  const match = blankMatch();
  match.players = [player(3, "First"), player(4, "Second")];
  const legacy = {
    ...createEvent(match, "miss", "opposition"),
    playerNumber: "15",
    outcome: "blocked",
    blockedByNumber: "3",
  };
  delete legacy.missReason;
  delete legacy.shotOutcome;
  delete legacy.shotSource;
  match.events = [legacy];
  const raw = JSON.stringify(match);
  assert.deepEqual(migrateMatch(match), match);
  assert.equal(JSON.stringify(match), raw);
  assert.equal(stat(match, "our", 3).defensiveBlocks, 1);
  for (const [credit, reason, first, second, blocked] of [
    ["4", "blocked", 0, 1, 1],
    ["", "blocked", 0, 0, 1],
    ["3", "blocked", 1, 0, 1],
    ["3", "wide", 0, 0, 0],
  ]) {
    match.events = saveEvent(match.events, {
      ...match.events[0],
      blockedByNumber: credit,
      missReason: reason,
    });
    assert.equal(match.events.length, 1);
    assert.equal(match.events[0].id, legacy.id);
    assert.equal(match.events[0].playerNumber, "15");
    assert.equal(stat(match, "our", 3).defensiveBlocks, first);
    assert.equal(stat(match, "our", 4).defensiveBlocks, second);
    assert.equal(
      summarize(match.events, "opposition").blockedAttempts,
      blocked,
    );
  }
  assert.equal(match.events[0].blockedByNumber, "");
});
