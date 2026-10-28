import { test, expect } from "@playwright/test";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const library = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.squads.v2")));
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
  for (const [number, name, role] of [
    [6, "Isabel", "starter"],
    [22, "Sarah", "substitute"],
  ]) {
    await page
      .getByLabel("Jersey number", { exact: true })
      .fill(String(number));
    await page.getByLabel("Player name", { exact: true }).fill(name);
    await page.locator("#player-form [name=role]").selectOption(role);
    await nav(page, "Add player");
  }
  await nav(page, "Save this squad");
  await page.getByLabel("Squad name", { exact: true }).fill("Permanent panel");
  await nav(page, "Save squad");
  await load(page);
  return (await state(page)).players;
}
async function load(page) {
  await nav(page, "Saved squads");
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-load-squad]").click();
}
async function shot(page) {
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=point]").click();
  await page.locator('[data-shot-player="6"]').click();
  await page
    .getByRole("button", { name: "Shot location pitch", exact: true })
    .click({ position: { x: 80, y: 110 } });
  await nav(page, "Close shot details");
}
async function newMatch(page) {
  await nav(page, "Match setup");
  page.once("dialog", (d) => d.accept());
  await nav(page, "Start a new blank match");
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
}
async function dbRows(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("sideline.history", 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const q = r.result
            .transaction("matches", "readonly")
            .objectStore("matches")
            .getAll();
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
}
async function history(page, id) {
  await nav(page, "Match History");
  const card = page.locator(`[data-history-id="${id}"]`);
  await expect(card).toBeVisible();
  return card;
}

test("real Save Squad / reload / edit / Load keeps permanent UUID and current match snapshots isolated", async ({
  page,
}) => {
  const first = await setup(page),
    saved = (await library(page)).squads[0],
    id = saved.players[0].playerId;
  expect(first[0].playerId).toBe(id);
  expect(first[0].matchPlayerId).not.toBe(id);
  await page.reload();
  await nav(page, "Squad");
  await nav(page, "Saved squads");
  await page.locator("[data-edit-squad]").click();
  await page
    .getByLabel("Player name row 1", { exact: true })
    .fill("Isabel Updated");
  await page.getByLabel("Jersey number row 1", { exact: true }).fill("8");
  await page.getByLabel("Position row 1", { exact: true }).fill("Midfield");
  await nav(page, "Save library changes");
  expect((await library(page)).squads[0].players[0].playerId).toBe(id);
  expect((await state(page)).players).toEqual(first);
  await nav(page, "Close squad dialog");
  await page.reload();
  await nav(page, "Squad");
  await load(page);
  const loaded = (await state(page)).players[0];
  expect(loaded).toMatchObject({
    playerId: id,
    matchPlayerId: first[0].matchPlayerId,
    name: "Isabel Updated",
    nameSnapshot: "Isabel Updated",
    number: 8,
    jerseyNumber: 8,
    position: "Midfield",
    sourceSquadId: saved.id,
  });
});

test("linked Saved Squad → shot → End Match → native IndexedDB → read-only History survives offline reload unchanged", async ({
  page,
  context,
}) => {
  const players = await setup(page);
  await shot(page);
  let m = await state(page);
  const event = m.events[0];
  expect(event.participants.player).toMatchObject({
    matchPlayerId: players[0].matchPlayerId,
    playerId: players[0].playerId,
    jerseyNumber: 6,
  });
  // Arrange only clock phase, then exercise actual completion/archive/history UI.
  await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem("sideline.match.v1"));
    m.clock.half = 2;
    localStorage.setItem("sideline.match.v1", JSON.stringify(m));
  });
  await page.reload();
  await nav(page, "Live match");
  await nav(page, "END MATCH / FULL TIME");
  await nav(page, "Return to Match");
  m = await state(page);
  await newMatch(page);
  const record = (await dbRows(page)).find((r) => r.id === m.id);
  expect(record.match.players).toEqual(m.players);
  expect(record.match.events).toEqual(m.events);
  expect(record.match.squadId).toBe(m.squadId);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const card = await history(page, m.id);
  await card.getByRole("button", { name: "VIEW MATCH", exact: true }).click();
  await expect(page.locator(".history-readonly")).toContainText("READ-ONLY");
  await expect(page.locator("[data-ht-score=our]")).toHaveText("0-01 (1)");
  await expect(page.locator(`[data-shot-id="${event.id}"]`)).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Historical match views" })
    .getByRole("button", { name: "Timeline", exact: true })
    .click();
  await expect(page.locator(".timeline-card .event-row")).toContainText(
    "Isabel",
  );
  expect((await dbRows(page)).find((r) => r.id === m.id).match).toEqual(
    record.match,
  );
});

test("native History Resume retains exact participant IDs, jersey, score and location offline", async ({
  page,
  context,
}) => {
  await setup(page);
  await shot(page);
  const before = await state(page);
  await newMatch(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const card = await history(page, before.id);
  await card.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "RESUME MATCH", exact: true }).click();
  await expect.poll(async () => (await state(page)).id).toBe(before.id);
  const resumed = await state(page);
  expect(resumed.id).toBe(before.id);
  expect(resumed.players).toEqual(before.players);
  expect(resumed.events).toEqual(before.events);
  expect(resumed.squadId).toBe(before.squadId);
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(1)",
  );
  await page.reload();
  expect((await state(page)).events).toEqual(before.events);
});

test("actual Mark, defensive block and substitution capture store the same shared stable roster references", async ({
  page,
}) => {
  const players = await setup(page);
  await nav(page, "Live match");
  await nav(page, "Opposition Kickout");
  await nav(page, "Mark won by us");
  await page.locator('[data-mark-player="6"]').click();
  await page.locator(".event-controls [data-event=defensive-block]").click();
  await page.locator('button[data-defensive-player="6"]').click();
  await nav(page, "Substitution");
  await page.locator('[data-sub-on="22"]').click();
  await page.locator('[data-sub-off="6"]').click();
  await nav(page, "Record substitution");
  const m = await state(page);
  expect(m.events).toHaveLength(3);
  for (const [index, role, p] of [
    [0, "markWinner", players[0]],
    [1, "blocker", players[0]],
    [2, "playerOn", players[1]],
    [2, "playerOff", players[0]],
  ]) {
    expect(m.events[index].participants[role]).toMatchObject({
      team: "our",
      playerId: p.playerId,
      matchPlayerId: p.matchPlayerId,
      jerseyNumber: p.number,
    });
  }
  await nav(page, "Match analysis");
  const row = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #6 Isabel",
      exact: true,
    }),
  });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Isabel");
  await page.reload();
  expect((await state(page)).events).toEqual(m.events);
});
