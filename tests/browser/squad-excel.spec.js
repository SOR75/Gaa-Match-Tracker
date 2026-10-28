import { test, expect } from "@playwright/test";
const fixture = (name) => `tests/fixtures/squad-template/${name}.xlsx`;
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const library = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.squads.v2")));
async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
}
async function upload(page, name) {
  await page.locator("#sideline-squad-file").setInputFiles(fixture(name));
}
async function review(page) {
  await expect(
    page.getByRole("heading", { name: "SQUAD IMPORT REVIEW", exact: true }),
  ).toBeVisible();
}
async function load(page) {
  await nav(page, "Saved squads");
  await page.locator("[data-load-squad]").click();
}

test("offline official County workbook → review → create → reload → Load → match → native History preserves permanent identity", async ({
  page,
  context,
}) => {
  await setup(page);
  const activeBefore = await state(page),
    libraryBefore = await library(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await nav(page, "Squad");
  await upload(page, "County-30");
  await review(page);
  await expect(page.locator("[data-excel-title]")).toHaveText(
    "Fictional County — U16 Girls — 2027",
  );
  await expect(page.locator("[data-excel-summary]")).toContainText(
    "30 players found · 30 ready · 0 need review",
  );
  await expect(page.locator("[data-excel-row]")).toHaveCount(30);
  expect(await library(page)).toEqual(libraryBefore);
  expect((await state(page)).players).toEqual(activeBefore.players);
  await nav(page, "CREATE SQUAD");
  const saved = (await library(page)).squads[0],
    ids = saved.players.map((p) => p.playerId);
  expect(ids).toHaveLength(30);
  expect(new Set(ids).size).toBe(30);
  for (const id of ids) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(saved).toMatchObject({
    clubName: "Fictional County",
    squadName: "U16 Girls",
    seasonLabel: "2027",
    code: "LGFA",
    coach: "Test Coach",
    seasonId: null,
  });
  await page.reload();
  await nav(page, "Squad");
  await load(page);
  let m = await state(page);
  expect(m.squadId).toBe(saved.id);
  expect(m.players.map((p) => p.playerId)).toEqual(ids);
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=point]").click();
  await page.locator('[data-shot-player="6"]').click();
  await nav(page, "Close shot details");
  m = await state(page);
  expect(m.events[0].participants.player.playerId).toBe(ids[5]);
  expect(m.events[0].playerNumber).toBe("6");
  await nav(page, "Match setup");
  page.once("dialog", (d) => d.accept());
  await nav(page, "Start a new blank match");
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
  await nav(page, "Match History");
  const card = page.locator(`[data-history-id="${m.id}"]`);
  await card.getByRole("button", { name: "VIEW MATCH", exact: true }).click();
  await expect(page.locator("[data-ht-score=our]")).toHaveText("0-01 (1)");
  const archived = await page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("sideline.history", 1);
        r.onsuccess = () => {
          const q = r.result
            .transaction("matches")
            .objectStore("matches")
            .get(id);
          q.onsuccess = () => {
            resolve(q.result.match);
            r.result.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
    m.id,
  );
  expect(archived.players).toEqual(m.players);
  expect(archived.events).toEqual(m.events);
  // Load the same canonical roster into another match, with a deliberate jersey edit.
  await nav(page, "Match setup");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("New Away");
  await nav(page, "Squad");
  await load(page);
  await page
    .getByRole("button", { name: "Edit Fia Field", exact: true })
    .click();
  await page.getByLabel("Jersey number", { exact: true }).fill("38");
  await nav(page, "Save player");
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=point]").click();
  await page.locator('[data-shot-player="38"]').click();
  await nav(page, "Close shot details");
  const next = await state(page);
  expect(next.events[0].participants.player.playerId).toBe(ids[5]);
  expect(next.events[0].participants.player.jerseyNumber).toBe(38);
  expect(archived.events[0].participants.player.jerseyNumber).toBe(6);
});

test("Club name-only 21 players ignores unused rows and saved edits of default/name edits retain IDs", async ({
  page,
}) => {
  await setup(page);
  await upload(page, "Club-21");
  await review(page);
  await expect(page.locator("[data-excel-row]")).toHaveCount(21);
  await nav(page, "CREATE SQUAD");
  const before = (await library(page)).squads[0];
  expect(
    before.players.every((p) => p.number === null && p.status === "active"),
  ).toBe(true);
  await nav(page, "Saved squads");
  await page.locator("[data-edit-squad]").click();
  await page
    .getByLabel("Player name row 1", { exact: true })
    .fill("Aria Renamed");
  await page.getByLabel("Jersey number row 1", { exact: true }).fill("6");
  await nav(page, "Save library changes");
  await nav(page, "Close squad dialog");
  await page.reload();
  const after = (await library(page)).squads[0];
  expect(after.players[0]).toMatchObject({
    playerId: before.players[0].playerId,
    name: "Aria Renamed",
    number: 6,
    position: "",
    secondaryPosition: "",
    status: "active",
  });
  expect(after.clubName).toBe(before.clubName);
  expect(after.id).toBe(before.id);
  await nav(page, "Squad");
  await load(page);
  expect((await state(page)).players[0].playerId).toBe(
    before.players[0].playerId,
  );
});

test("review corrects invalid number, clears duplicate defaults, retains duplicate-name people and removes blank-name partial row", async ({
  page,
}) => {
  await setup(page);
  await upload(page, "Review-errors");
  await review(page);
  const rows = page.locator("[data-excel-row]");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Duplicate default number");
  await expect(rows.nth(0)).toContainText("Duplicate name");
  await expect(rows.nth(2)).toContainText("Review default number");
  await expect(rows.nth(3)).toContainText("Review name");
  await expect(
    page.getByRole("button", { name: "CREATE SQUAD", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Imported player 2 default number", { exact: true })
    .fill("");
  await page
    .getByLabel("Imported player 3 default number", { exact: true })
    .fill("18");
  await page
    .getByRole("button", { name: "Remove imported player 4", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "CREATE SQUAD", exact: true }),
  ).toBeEnabled();
  await nav(page, "CREATE SQUAD");
  const saved = (await library(page)).squads[0];
  expect(saved.players).toHaveLength(3);
  expect(saved.players[0].name).toBe(saved.players[1].name);
  expect(saved.players[0].playerId).not.toBe(saved.players[1].playerId);
  expect(saved.players.map((p) => p.number)).toEqual([6, null, 18]);
});
for (const name of ["Missing-Players", "Wrong-columns", "Malformed"])
  test(`${name} workbook explains official-template support and does not save anything`, async ({
    page,
  }) => {
    await setup(page);
    const before = await state(page),
      saved = await library(page);
    await upload(page, name);
    await expect(
      page.getByRole("heading", {
        name: "Squad import unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      "official Sideline Squad Import Template",
    );
    expect(await library(page)).toEqual(saved);
    expect(await state(page)).toEqual(before);
    await nav(page, "Close Squad Import");
    await nav(page, "Live match");
    await page.locator(".event-controls [data-event=point]").click();
    await nav(page, "Close shot details");
    expect((await state(page)).events).toHaveLength(1);
  });
test("cancel review creates no squad or IDs and subsequent touch capture stays usable", async ({
  page,
}) => {
  await setup(page);
  await upload(page, "County-30");
  await review(page);
  const before = await library(page);
  await nav(page, "Cancel import");
  expect(await library(page)).toEqual(before);
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=point]").click();
  await nav(page, "Close shot details");
  expect((await state(page)).events).toHaveLength(1);
});

test("older richer workbook ignores positions/status and presents only name/default-number player fields", async ({
  page,
}) => {
  await setup(page);
  await upload(page, "Legacy-rich");
  await review(page);
  await expect(page.locator("[data-excel-row]")).toHaveCount(2);
  await expect(
    page.locator(
      "[data-excel-row] input[name=position], [data-excel-row] input[name=status], [data-excel-row] input[name=secondaryPosition]",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "CREATE SQUAD", exact: true }),
  ).toBeEnabled();
  await nav(page, "CREATE SQUAD");
  const s = (await library(page)).squads[0];
  expect(
    s.players.every(
      (p) =>
        p.status === "active" &&
        p.position === "" &&
        p.secondaryPosition === "",
    ),
  ).toBe(true);
  expect(s.players.map((p) => p.number)).toEqual([23, null]);
});
test("two-column workbook preserves Unicode/capitalisation and cleans line breaks without merging duplicate names", async ({
  page,
}) => {
  await setup(page);
  await upload(page, "Unicode-names");
  await review(page);
  await expect(
    page.getByLabel("Imported player 1 name", { exact: true }),
  ).toHaveValue("Éabha Ní Bhriain");
  await expect(
    page.getByLabel("Imported player 2 name", { exact: true }),
  ).toHaveValue("Siún O’Neill");
  await nav(page, "CREATE SQUAD");
  const players = (await library(page)).squads[0].players;
  expect(players.map((p) => p.name)).toEqual([
    "Éabha Ní Bhriain",
    "Siún O’Neill",
    "mÁire McDONAGH",
    "Same Name",
    "Same Name",
  ]);
  expect(players[3].playerId).not.toBe(players[4].playerId);
});
test("29-player County workbook and single-column name-only workbook both create current members", async ({
  page,
}) => {
  await setup(page);
  await upload(page, "County-29");
  await review(page);
  await expect(page.locator("[data-excel-row]")).toHaveCount(29);
  await nav(page, "CREATE SQUAD");
  expect((await library(page)).squads[0].players).toHaveLength(29);
  await upload(page, "Name-only");
  await review(page);
  await expect(page.locator("[data-excel-row]")).toHaveCount(2);
  await page.getByLabel("Squad Name", { exact: true }).fill("Name only");
  await nav(page, "CREATE SQUAD");
  const s = (await library(page)).squads[1];
  expect(
    s.players.every((p) => p.number === null && p.status === "active"),
  ).toBe(true);
});
