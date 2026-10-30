// Fictional, populated presentation fixture. Never replaces a real OCR fixture.
import { blankMatch, createEvent, saveEvent } from "../../src/domain.js";
import { createMatchPlayer, createSquadPlayer } from "../../src/identity.js";
import { goalkeeperRef } from "../../src/goalkeepers.js";
export function uiMatch() {
  const m = blankMatch();
  m.setup = {
    ...m.setup,
    ourTeam: "Harbour Athletic",
    opposition: "Mountain Rovers",
    competition: "Senior championship",
    venue: "County Grounds",
    coach: "Match analyst",
  };
  const names = [
    "Niamh Kelly",
    "Ciara Walsh",
    "Sarah Doyle",
    "Emma Ryan",
    "Aoife Byrne",
    "Clodagh Murphy",
    "Orla Brennan",
    "Erin Clarke",
    "Katie Nolan",
    "Maeve Flynn",
    "Hannah Daly",
    "Caoimhe Reilly",
    "Amy Burke",
    "Roisin Ward",
    "Ella Moore",
    "Ava Kennedy",
    "Grace Lynch",
    "Tara Quinn",
    "Saoirse Hayes",
    "Mia Foley",
    "Lauren Carroll",
    "Anna Murray",
    "Leah Kavanagh",
  ];
  m.players = names.map((name, i) =>
    createMatchPlayer({
      ...createSquadPlayer({
        name,
        number: i + 1,
        role: i < 15 ? "starter" : "substitute",
      }),
      id: undefined,
    }),
  );
  m.oppositionPlayers = Array.from({ length: 20 }, (_, i) =>
    createMatchPlayer({
      ...createSquadPlayer({
        name: [
          "Eimear Collins",
          "Alannah Reid",
          "Sophie King",
          "Rachel Grant",
          "Lucy O’Brien",
          "Megan Scott",
          "Fiona Keane",
          "Aisling Power",
          "Olivia White",
          "Kate Burns",
          "Chloe Martin",
          "Isabel Fox",
          "Abby Reid",
          "Zoe Green",
          "Ruby Hughes",
          "Emily Wood",
        ][i % 16],
        number: i + 1,
        role: i < 15 ? "starter" : "substitute",
      }),
      id: undefined,
    }),
  );
  m.goalkeepers = {
    our: goalkeeperRef(m, "our", m.players[0].id),
    opposition: goalkeeperRef(m, "opposition", m.oppositionPlayers[0].id),
  };
  const add = (type, team, timeMs, fields = {}) => {
    const e = { ...createEvent(m, type, team), timeMs, ...fields };
    m.events = saveEvent(m.events, e, m);
  };
  add("substitution", "our", 20 * 60000, {
    half: 1,
    playerOn: "18",
    playerOff: "10",
  });
  for (const team of ["our", "opposition"]) {
    const count =
      team === "our"
        ? { goal: 4, point: 12, "two-point": 2, miss: 7 }
        : { goal: 2, point: 9, "two-point": 0, miss: 8 };
    let index = 0;
    for (const [type, n] of Object.entries(count))
      for (let i = 0; i < n; i++) {
        const half = (i % 2) + 1;
        const number =
          team === "our" ? [8, 11, 14, 15][i % 4] : [7, 9, 12, 14][i % 4];
        add(type, team, (3 + (index++ % 18)) * 60000, {
          half,
          playerNumber: String(number),
          shotX: 0.2 + (i % 4) * 0.17,
          shotY: 0.15 + (i % 5) * 0.12,
          missReason:
            type === "miss" ? ["wide", "short", "blocked", "post"][i % 4] : "",
          shotSource: i % 5 === 0 ? "free" : "open-play",
        });
      }
    for (let i = 0; i < 12; i++)
      add(
        team === "our" ? "our-kickout" : "opposition-kickout",
        team,
        (2 + i) * 60000,
        {
          half: (i % 2) + 1,
          outcome: i === 11 ? "out-of-play" : i % 3 === 0 ? "lost" : "won",
          kickoutLength: i % 3 ? "Long" : "Short",
          mark: i === 2 || i === 4 || i === 6,
          kickoutWinnerNumber: i === 11 ? "" : i % 3 === 0 ? "9" : "8",
        },
      );
  }
  add("substitution", "our", 10 * 60000, {
    half: 2,
    playerOn: "16",
    playerOff: "1",
  });
  add("turnover-won", "our", 18 * 60000, {
    half: 2,
    playerNumber: "18",
    turnoverWinnerNumber: "18",
    turnoverLoserNumber: "9",
  });
  add("defensive-block", "our", 19 * 60000, {
    half: 2,
    playerNumber: "4",
    shotX: 0.35,
    shotY: 0.42,
  });
  add("pass", "our", 21 * 60000, {
    half: 2,
    playerNumber: "8",
    receiverNumber: "11",
    passType: "kick",
  });
  m.clock = {
    half: 2,
    elapsedMs: 22 * 60000 + 14000,
    startedAt: null,
    completedHalves: { 1: 32 * 60000 },
  };
  m.recordingTeam = "our";
  return m;
}
