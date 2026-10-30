import { test, expect } from "@playwright/test";
import { blankMatch, createEvent, saveEvent } from "../../src/domain.js";
import { createMatchPlayer, createSquadPlayer } from "../../src/identity.js";
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
async function seed(page) {
  const m = blankMatch();
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  const player = (number, name, role = "starter") =>
    createMatchPlayer({
      ...createSquadPlayer({ number, name, role }),
      id: undefined,
    });
  m.players = [
    player(1, "First Keeper"),
    player(16, "Next Keeper", "substitute"),
    player(8, "Home Eight"),
  ];
  m.oppositionPlayers = [player(1, "Away Keeper"), player(8, "Away Eight")];
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    m,
  );
  await page.reload();
  await nav(page, "Live match");
  return m;
}
async function keeper(page) {
  await expect(page.locator("[data-goalkeeper]")).toHaveCount(0);
}

test("real live kickout out of play persists, edits and undo, no unknown choice", async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-event="our-kickout"]').click();
  const d = page.getByRole("dialog");
  await expect(
    d.getByRole("button", { name: "Unknown", exact: true }),
  ).toHaveCount(0);
  await d
    .getByRole("button", { name: "Out of Play / Sideline", exact: true })
    .click();
  expect((await state(page)).events[0].outcome).toBe("out-of-play");
  await page.reload();
  await nav(page, "Live match");
  await page.locator('[data-action="edit-last"]').click();
  await page.getByLabel("Kickout result", { exact: true }).selectOption("won");
  await nav(page, "Save changes");
  expect((await state(page)).events[0].outcome).toBe("won");
  await page.locator('[data-action="undo"]').click();
  expect((await state(page)).events).toHaveLength(0);
});
for (const team of ["our", "opposition"])
  test(`real Pass captures ${team} identity, type, reload and editing`, async ({
    page,
  }) => {
    await seed(page);
    await page.locator(`[data-team="${team}"]`).click();
    await page.locator('[data-event="pass"]').click();
    expect((await state(page)).events).toHaveLength(0);
    await page.getByLabel("Passer", { exact: true }).selectOption("1");
    await page.getByLabel("Receiver", { exact: true }).selectOption("8");
    await page.getByLabel("Pass type", { exact: true }).selectOption("hand");
    await nav(page, "Record pass");
    const e = (await state(page)).events[0];
    expect(e.participants.player.playerId).toBeTruthy();
    expect(e.participants.receiver.team).toBe(team);
    expect(e.passType).toBe("hand");
    await page.reload();
    await nav(page, "Live match");
    await page.locator('[data-action="edit-last"]').click();
    await expect(page.getByLabel("Receiver", { exact: true })).toHaveValue("8");
    await page.getByLabel("Pass type", { exact: true }).selectOption("kick");
    await nav(page, "Save changes");
    expect((await state(page)).events[0].passType).toBe("kick");
  });
test("one simple optional Pass after a shot has no build-up decisions and preserves the shot", async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-event="point"]').click();
  await page.keyboard.press("Escape");
  const shot = (await state(page)).events[0];
  await expect(page.locator("[data-add-build-up]")).toHaveCount(0);
  await page.locator('[data-event="pass"]').click();
  await expect(
    page.getByLabel("Build-up to shot", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Passer", { exact: true }).selectOption("8");
  await page.getByLabel("Receiver", { exact: true }).selectOption("1");
  await nav(page, "Record pass");
  const m = await state(page);
  expect(m.events).toHaveLength(2);
  expect(m.events[0]).toEqual(shot);
  expect(m.events[1].buildUpLink || "").toBe("");
  await nav(page, "Timeline");
  await expect(
    page.locator(".event-row").filter({ hasText: "Kick Pass" }),
  ).toContainText("#8 → #1");
});
test("one turnover stores winner and loser from opposite squads", async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-event="turnover-won"]').click();
  await page.locator('[data-action="edit-last"]').click();
  await page
    .getByLabel("Player who won possession", { exact: true })
    .selectOption("8");
  await page
    .getByLabel("Player who lost possession", { exact: true })
    .selectOption("8");
  await nav(page, "Save changes");
  const m = await state(page);
  expect(m.events).toHaveLength(1);
  expect(m.events[0].participants.turnoverWinner.team).toBe("our");
  expect(m.events[0].participants.turnoverLoser.team).toBe("opposition");
  await nav(page, "Match analysis");
  await expect(
    page.getByText("Home · #8 Home Eight", { exact: true }),
  ).toBeVisible();
});
test("automatic goalkeeper and actual substitution drive kickouts, saves and conceded goals", async ({
  page,
}) => {
  await seed(page);
  await keeper(page);
  await page.locator('[data-event="our-kickout"]').click();
  await nav(page, "Won by us");
  await page.locator('[data-ko-player="8"]').click();
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="miss"]').click();
  await page.getByLabel("Miss reason", { exact: true }).selectOption("short");
  await page.keyboard.press("Escape");
  await page.locator('[data-team="our"]').click();
  await page.locator('[data-event="substitution"]').click();
  await page.getByLabel("Player on", { exact: true }).fill("16");
  await page.getByLabel("Player off", { exact: true }).fill("1");
  await nav(page, "Record substitution");
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  await nav(page, "Match analysis");
  const first = page.locator(
    '[data-gk-card="our:' + (await state(page)).players[0].id + '"]',
  );
  const next = page.locator(
    '[data-gk-card="our:' + (await state(page)).players[1].id + '"]',
  );
  await expect(first.locator('[data-gk-metric="taken"]')).toHaveText("1");
  await expect(first.locator('[data-gk-metric="saves"]')).toHaveText("1");
  await expect(next.locator('[data-gk-metric="conceded"]')).toHaveText("1");
  await page.reload();
  await nav(page, "Match analysis");
  await expect(next).toContainText("Next Keeper");
});
test("new participant metadata and GK analysis survive native History and offline reopening", async ({
  page,
  context,
}) => {
  await seed(page);
  await keeper(page);
  await page.locator('[data-event="our-kickout"]').click();
  await nav(page, "Out of Play / Sideline");
  await page.locator('[data-event="pass"]').click();
  await page.getByLabel("Passer", { exact: true }).selectOption("8");
  await page.getByLabel("Receiver", { exact: true }).selectOption("1");
  await nav(page, "Record pass");
  const archived = await state(page);
  await page.evaluate((m) => {
    localStorage.setItem("sideline.match.archive." + m.id, JSON.stringify(m));
  }, archived);
  await nav(page, "Match History");
  await page
    .locator(`[data-history-id="${archived.id}"]`)
    .getByRole("button", { name: "VIEW MATCH", exact: true })
    .click();
  await expect(page.locator(".history-readonly")).toContainText("READ-ONLY");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await nav(page, "Match History");
  await page
    .locator(`[data-history-id="${archived.id}"]`)
    .getByRole("button", { name: "VIEW MATCH", exact: true })
    .click();
  expect((await state(page)).events).toEqual(archived.events);
  expect((await state(page)).goalkeepers).toEqual(archived.goalkeepers);
  const rows = await page.evaluate(
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
          q.onerror = reject;
        };
        r.onerror = reject;
      }),
  );
  expect(rows.find((r) => r.match.id === archived.id).match.events).toEqual(
    archived.events,
  );
});
test("Player Review exposes linked goalkeeper career and safe season grouping", async ({
  page,
}) => {
  const m = await seed(page);
  await keeper(page);
  await page.locator('[data-event="our-kickout"]').click();
  await nav(page, "Won by us");
  await page.locator('[data-ko-player="8"]').click();
  await nav(page, "Player Review");
  await page.locator("#review-player").selectOption(m.players[0].playerId);
  await expect(page.locator('[data-review-metric="gkKickouts"]')).toHaveText(
    "1/1 · 100%",
  );
  await expect(
    page.getByRole("heading", {
      name: "Goalkeeper history · by season",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Season not recorded" }),
  ).toContainText("1/1");
});
