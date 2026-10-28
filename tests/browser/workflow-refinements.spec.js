import { test, expect } from "@playwright/test";
import { blankMatch, createEvent, saveEvent } from "../../src/domain.js";
import { snapshotSquad, loadSquadPlayers } from "../../src/squads.js";
import { completeMatch } from "../../src/history.js";
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const setups = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.team-setups.v1")));
function fixture(starters = 1, subs = 1) {
  const squad = snapshotSquad(
    "Offaly LGFA — U15 Development — 2027",
    Array.from({ length: starters + subs }, (_, i) => ({
      name: i === 0 ? "Isabel O'Regan" : i === 1 ? "Zoe" : `Player ${i + 1}`,
      number: starters + subs > 2 ? i + 1 : i === 0 ? 9 : 18,
      role: i < starters ? "starter" : "substitute",
    })),
  );
  // Number 18 is reserved for Zoe in the two-player fixture; larger fixtures use natural jerseys.

  const m = blankMatch();
  m.setup.ourTeam = "Offaly";
  m.setup.opposition = "Dublin";
  m.players = loadSquadPlayers(squad);
  m.squadId = squad.id;
  const old = structuredClone(m);
  old.id = "older-completed";
  old.setup.opposition = "Past opponent";
  old.players[0].number = starters + subs > 2 ? 90 : 8;
  old.players[0].jerseyNumber = old.players[0].number;
  old.events = saveEvent(
    [],
    {
      ...createEvent(old, "point", "our"),
      playerNumber: String(old.players[0].number),
    },
    old,
  );
  return { squad, m, old: completeMatch(old) };
}
async function seed(page, data = fixture()) {
  await page.goto("/");
  await page.evaluate((d) => {
    localStorage.setItem(
      "sideline.squads.v2",
      JSON.stringify({ version: 2, squads: [d.squad] }),
    );
    localStorage.setItem("sideline.match.v1", JSON.stringify(d.m));
    localStorage.setItem(
      "sideline.match.archive." + d.old.id,
      JSON.stringify(d.old),
    );
  }, data);
  await page.reload();
  return data;
}
async function rows(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("sideline.history", 1);
        r.onsuccess = () => {
          const q = r.result
            .transaction("matches")
            .objectStore("matches")
            .getAll();
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
}

test("offline reusable Team Setup keeps permanent IDs, restores defaults in a new match and never rewrites saved setup or history", async ({
  page,
  context,
}) => {
  const d = await seed(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await nav(page, "Squad");
  await nav(page, "Save team setup");
  await page
    .getByLabel("Team setup name", { exact: true })
    .fill("Championship team");
  await nav(page, "Save setup");
  const saved = await setups(page);
  expect(saved.setups[0].players.map((p) => p.playerId)).toEqual(
    d.m.players.map((p) => p.playerId),
  );
  expect(Object.keys(saved.setups[0].players[0]).sort()).toEqual([
    "number",
    "playerId",
    "role",
  ]);
  await page.reload();
  await nav(page, "Match setup");
  page.once("dialog", (x) => x.accept());
  await nav(page, "Start a new blank match");
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
  await nav(page, "Squad");
  await nav(page, "Use saved team setup");
  await nav(page, "Use setup");
  let m = await state(page);
  expect(m.players.map((p) => [p.playerId, p.number, p.role])).toEqual(
    d.m.players.map((p) => [p.playerId, p.number, p.role]),
  );
  expect(m.players[0].matchPlayerId).not.toBe(d.m.players[0].matchPlayerId);
  await nav(page, "Set today’s team");
  await page.getByLabel("Today's jersey 1", { exact: true }).fill("6");
  await nav(page, "Save today's team");
  expect((await state(page)).players[0].number).toBe(6);
  expect(await setups(page)).toEqual(saved);
  await nav(page, "Save team setup");
  await page
    .getByLabel("Team setup name", { exact: true })
    .fill("Championship team");
  await nav(page, "Save setup");
  await expect(page.locator("[data-setup-error]")).toContainText(
    "never overwritten",
  );
  expect(await setups(page)).toEqual(saved);
  await nav(page, "Close team setups");
  await nav(page, "Match History");
  await expect(
    page.locator('[data-history-id="older-completed"]'),
  ).toBeVisible();
  const archived = (await rows(page)).find((r) => r.id === d.old.id).match;
  expect(archived.players).toEqual(d.old.players);
  expect(archived.events).toEqual(d.old.events);
  expect(archived.players[0].number).toBe(8);
});
for (const count of [11, 15, 16])
  test(`${count} starters: visible advisory, Review/Continue choices, no block on reduced/extra-player match`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const d = await seed(page, fixture(count, 0));
    await nav(page, "Live match");
    if (count === 15)
      await expect(page.locator(".starter-warning")).toHaveCount(0);
    else {
      await expect(page.locator(".starter-warning")).toContainText(
        `${count} players selected to start`,
      );
      await expect(
        page.getByRole("button", { name: "Review team", exact: true }),
      ).toBeVisible();
      await nav(page, "Continue anyway");
      await expect(page.locator(".starter-warning")).toHaveCount(0);
    }
    expect((await state(page)).players).toEqual(d.m.players);
    await nav(page, "Start clock");
    await expect(
      page.getByRole("button", { name: "Pause clock", exact: true }),
    ).toBeVisible();
    await page.locator(".event-controls [data-event=point]").click();
    await nav(page, "Close shot details");
    expect((await state(page)).events).toHaveLength(1);
  });
test("Review team opens actual Today’s Team and permits 16 starters without an exact-XV gate", async ({
  page,
}) => {
  await seed(page, fixture(11, 6));
  await nav(page, "Live match");
  await nav(page, "Review team");
  await expect(
    page.getByRole("heading", { name: "Today’s team", exact: true }),
  ).toBeVisible();
  for (let i = 12; i <= 16; i++)
    await page
      .getByLabel(`Today's role ${i}`, { exact: true })
      .selectOption("starter");
  await nav(page, "Save today's team");
  expect(
    (await state(page)).players.filter((p) => p.role === "starter"),
  ).toHaveLength(16);
  await nav(page, "Live match");
  await expect(page.locator(".starter-warning")).toContainText(
    "16 players selected to start",
  );
});
test("Delete saved squad has explicit Cancel/Delete confirmation and preserves native History, active match and historical Player Review offline", async ({
  page,
  context,
}) => {
  const d = await seed(page);
  await nav(page, "Match History");
  await expect(
    page.locator('[data-history-id="older-completed"]'),
  ).toBeVisible();
  const before = await rows(page),
    active = await state(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await nav(page, "Squad");
  await nav(page, "Saved squads");
  await page.locator("[data-edit-squad]").click();
  await nav(page, "Delete saved squad");
  await expect(page.getByRole("dialog")).toContainText(d.squad.name);
  await expect(page.getByRole("dialog")).toContainText(
    "Existing matches and historical records will not be deleted",
  );
  await nav(page, "Cancel");
  await expect(
    page.getByRole("heading", { name: "Edit saved squad", exact: true }),
  ).toBeVisible();
  await nav(page, "Delete saved squad");
  await nav(page, "Delete squad");
  await expect(
    page.getByText(
      "No saved squads yet. Save the players you enter on the Squad screen.",
      { exact: true },
    ),
  ).toBeVisible();
  await nav(page, "Close squad dialog");
  expect(await state(page)).toEqual(active);
  expect(await rows(page)).toEqual(before);
  await page.reload();
  await nav(page, "Player Review");
  await page
    .locator("#review-player")
    .selectOption(d.squad.players[0].playerId);
  await expect(page.locator("[data-review-name]")).toHaveText("Isabel O'Regan");
  await expect(page.locator("[data-review-metric=attempts]")).toHaveText("1");
  await expect(page.locator("[data-review-metric=appearances]")).toHaveText(
    "1",
  );
  await expect(
    page.locator('[data-review-match="older-completed"]'),
  ).toContainText("#8");
  await page
    .locator('[data-review-match="older-completed"] [data-review-open]')
    .click();
  await expect(page.locator("[data-ht-score=our]")).toHaveText("0-01 (1)");
});
test("Dublin 6/6 retained and #8 on five kickouts visibly enhance the WATCH in Half and Full Match Analysis", async ({
  page,
}) => {
  const d = fixture();
  d.m.events = [];
  for (let i = 0; i < 6; i++)
    d.m.events = saveEvent(
      d.m.events,
      {
        ...createEvent(d.m, "opposition-kickout", "opposition"),
        outcome: "lost",
        playerNumber: i < 5 ? "8" : "",
      },
      d.m,
    );
  d.m.clock.half = 2;
  await seed(page, d);
  await nav(page, "Live match");
  await nav(page, "HALF-TIME ANALYSIS");
  let observation = page.locator(".ht-observation.watch").filter({
    has: page.getByRole("heading", { name: /Opposition kickout.*#8/ }),
  });
  await expect(observation).toHaveCount(1);
  await expect(observation).toContainText("We won 0 of 6");
  await expect(observation).toContainText("Dublin retained 6 of 6");
  await expect(observation).toContainText("#8 was credited on 5");
  await nav(page, "Return to Live Match");
  await nav(page, "END MATCH / FULL TIME");
  observation = page.locator(".ht-observation.watch").filter({
    has: page.getByRole("heading", { name: /Opposition kickout.*#8/ }),
  });
  await expect(observation).toContainText("#8 was credited on 5");
});
test("four recorded our Marks surface one positive player pattern and still count four kickouts", async ({
  page,
}) => {
  const d = fixture();
  d.m.players[0].number = 7;
  d.m.players[0].jerseyNumber = 7;
  for (let i = 0; i < 4; i++)
    d.m.events = saveEvent(
      d.m.events,
      {
        ...createEvent(d.m, "our-kickout", "our"),
        outcome: "won",
        mark: true,
        markPlayerNumber: "7",
        playerNumber: "7",
      },
      d.m,
    );
  await seed(page, d);
  await nav(page, "Live match");
  await nav(page, "HALF-TIME ANALYSIS");
  const working = page.locator(".ht-observation.working");
  await expect(working).toHaveCount(1);
  await expect(working).toContainText("#7 Isabel O'Regan");
  await expect(working).toContainText("4 kickout Marks");
  await expect(page.locator("[data-ht-kpi=our-kickouts]")).toContainText(
    "4 / 4",
  );
});

test("a reusable setup cannot rewrite the currently completed match", async ({
  page,
}) => {
  const d = fixture();
  d.m = d.old;
  await seed(page, d);
  const before = await state(page);
  await nav(page, "Squad");
  await nav(page, "Save team setup");
  await page
    .getByLabel("Team setup name", { exact: true })
    .fill("From completed game");
  await nav(page, "Save setup");
  await nav(page, "Use saved team setup");
  await expect(page.getByRole("dialog")).toContainText(
    "This completed match will not be changed",
  );
  await expect(
    page.getByRole("button", { name: "Use setup", exact: true }),
  ).toBeDisabled();
  expect(await state(page)).toEqual(before);
});
