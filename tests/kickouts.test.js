import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankMatch,
  createEvent,
  saveEvent,
  migrateMatch,
  undoEvent,
} from "../src/domain.js";
import { kickoutChoices, kickoutDetails } from "../src/kickouts.js";
import { summarize, playerStatistics } from "../src/analysis.js";
import { SHOT_SOURCES, shotDetails } from "../src/shots.js";
import { interpretCommentary } from "../src/voice-parser.js";
for (const type of ["our-kickout", "opposition-kickout"])
  for (const choice of kickoutChoices(type))
    test(`${type}: ${choice.label} uses our perspective and counts once`, () => {
      const draft = createEvent(blankMatch(), type, "our", 1000);
      const event = saveEvent([], {
        ...draft,
        outcome: choice.outcome,
        mark: choice.mark,
      })[0];
      assert.equal(event.kickoutPerspective, "our");
      assert.equal(event.mark, choice.mark);
      assert.equal(event.outcome, choice.outcome);
      assert.equal(event.markPlayerNumber, "");
      const stat = summarize([event], event.team).kickouts;
      assert.equal(stat.total, 1);
      assert.equal(stat.won, Number(choice.outcome === "won"));
      assert.equal(stat.lost, Number(choice.outcome === "lost"));
      assert.equal(stat.unknown, Number(choice.outcome === "unknown"));
      assert.equal(
        stat.marksWon,
        Number(choice.mark && choice.outcome === "won"),
      );
      assert.equal(
        stat.marksLost,
        Number(choice.mark && choice.outcome === "lost"),
      );
    });
test("legacy outcomes translate without rewriting records; retention keeps kicking-team meaning", () => {
  const match = blankMatch();
  for (const [type, outcome] of [
    ["our-kickout", "won"],
    ["opposition-kickout", "won"],
    ["opposition-kickout", "lost"],
    ["opposition-kickout", ""],
  ]) {
    const e = createEvent(match, type, "our");
    delete e.kickoutPerspective;
    delete e.mark;
    delete e.markPlayerNumber;
    e.outcome = outcome;
    match.events.push(e);
  }
  const raw = JSON.stringify(match);
  assert.deepEqual(migrateMatch(match), match);
  assert.equal(kickoutDetails(match.events[1]).outcome, "lost");
  assert.equal(kickoutDetails(match.events[2]).outcome, "won");
  const stats = summarize(match.events, "opposition").kickouts;
  assert.equal(stats.total, 3);
  assert.equal(stats.won, 1);
  assert.equal(stats.lost, 1);
  assert.equal(stats.unknown, 1);
  assert.equal(stats.retention, 50);
  assert.equal(stats.marksWon, 0);
  assert.equal(
    summarize([match.events[1]], "opposition").kickouts.retention,
    100,
  );
  assert.equal(
    summarize([match.events[2]], "opposition").kickouts.retention,
    0,
  );
  assert.equal(JSON.stringify(match), raw);
  const edited = saveEvent(match.events, {
    ...match.events[1],
    notes: "edited",
  });
  assert.equal(edited[1].outcome, "lost");
  assert.equal(edited[1].kickoutPerspective, "our");
  assert.equal(summarize(edited, "opposition").kickouts.won, 1);
});
test("credit on an opposition kickout goes to OUR player, edits and undo recalculate with no duplicate events", () => {
  const match = blankMatch();
  match.players = [{ id: "p", number: 8, name: "Our Player", role: "starter" }];
  match.oppositionPlayers = [
    { id: "q", number: 8, name: "Their Player", role: "starter" },
  ];
  match.events = saveEvent([], {
    ...createEvent(match, "opposition-kickout", "our"),
    outcome: "won",
    mark: true,
    markPlayerNumber: "8",
  });
  assert.equal(match.events.length, 1);
  assert.equal(playerStatistics(match, "our")[0].kickoutMarks, 1);
  assert.equal(playerStatistics(match, "opposition")[0].kickoutMarks, 0);
  match.events = saveEvent(match.events, {
    ...match.events[0],
    outcome: "lost",
  });
  assert.equal(match.events[0].markPlayerNumber, "");
  assert.equal(summarize(match.events, "opposition").kickouts.marksLost, 1);
  assert.equal(playerStatistics(match, "our")[0].kickoutMarks, 0);
  match.events = saveEvent(match.events, { ...match.events[0], mark: false });
  assert.equal(summarize(match.events, "opposition").kickouts.marksLost, 0);
  match.events = undoEvent(match.events);
  assert.equal(summarize(match.events, "opposition").kickouts.total, 0);
});
test("unknown and non-Mark results cannot retain Mark/player credit", () => {
  const match = blankMatch();
  for (const [outcome, mark] of [
    ["unknown", true],
    ["won", false],
    ["lost", true],
  ]) {
    const e = saveEvent([], {
      ...createEvent(match, "our-kickout", "our"),
      outcome,
      mark,
      markPlayerNumber: "8",
    })[0];
    assert.equal(e.markPlayerNumber, "");
    if (outcome === "unknown") assert.equal(e.mark, false);
  }
});
test("Mark is removed from shot choices, Open Play stays default and legacy shot Marks never become kickouts", () => {
  assert.deepEqual(
    SHOT_SOURCES.map(([, name]) => name),
    ["Open Play", "Free", "Penalty", "45"],
  );
  const match = blankMatch();
  for (const type of ["goal", "point", "two-point", "miss"])
    assert.equal(createEvent(match, type, "our").shotSource, "open-play");
  const old = {
    ...createEvent(match, "point", "our"),
    shotSource: "mark",
    scoreOrigin: "Mark",
  };
  assert.equal(shotDetails(old).shotSource, "mark");
  assert.equal(kickoutDetails(old), null);
  assert.equal(summarize([old], "our").kickouts.total, 0);
  const voice = interpretCommentary(
    "their kickout won by number nine",
  ).candidate;
  assert.equal(voice.kickoutPerspective, "our");
  assert.equal(kickoutDetails(voice).outcome, "won");
});
