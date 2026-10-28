import { test, expect } from "@playwright/test";
import { blankMatch, createEvent, saveEvent } from "../../src/domain.js";
import { snapshotSquad, loadSquadPlayers } from "../../src/squads.js";
import { completeMatch } from "../../src/history.js";
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
function fixture() {
  const s = snapshotSquad("County Squad", [
    { name: "Isabel O'Regan", number: 8, role: "starter" },
    { name: "Defender", number: 3, role: "starter" },
    { name: "Unused Bench", number: 22, role: "substitute" },
  ]);
  function match(opponent, date, jersey) {
    const m = blankMatch();
    m.setup.ourTeam = "Home";
    m.setup.opposition = opponent;
    m.setup.date = date;
    m.players = loadSquadPlayers(s);
    m.squadId = s.id;
    m.players[0].number = jersey;
    m.players[0].jerseyNumber = jersey;
    return m;
  }
  function add(m, event, fields) {
    m.events = saveEvent(
      m.events,
      { ...createEvent(m, event, "our"), ...fields },
      m,
    );
  }
  const a = match("Opponent A", "2026-10-01", 8),
    b = match("Opponent B", "2026-10-08", 6);
  add(a, "point", { playerNumber: "8" });
  add(a, "miss", { playerNumber: "8", missReason: "blocked" });
  b.players[0].role = "substitute";
  add(b, "substitution", { playerOn: "6", playerOff: "3" });
  add(b, "two-point", { playerNumber: "6" });
  return {
    s,
    a: completeMatch(a),
    b: completeMatch(b),
    active: match("Current opposition", "2026-10-20", 11),
  };
}
async function seed(page, data = fixture()) {
  await page.goto("/");
  await page.evaluate((d) => {
    localStorage.setItem(
      "sideline.squads.v2",
      JSON.stringify({ version: 2, squads: [d.s] }),
    );
    localStorage.setItem("sideline.match.v1", JSON.stringify(d.active));
    for (const m of [d.a, d.b])
      localStorage.setItem("sideline.match.archive." + m.id, JSON.stringify(m));
  }, data);
  await page.reload();
  return data;
}
test("physical Isabel #8/#6 acceptance: one profile, two real appearances, separate jerseys, unused bench zero; historical opening is read-only offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const d = await seed(page);
  const before = await state(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await nav(page, "Player Review");
  await page.locator("#review-player").selectOption(d.s.players[0].playerId);
  await expect(page.locator("[data-review-name]")).toHaveText("Isabel O'Regan");
  await expect(
    page.locator("#review-player option").filter({ hasText: "Isabel O'Regan" }),
  ).toHaveCount(1);
  for (const [metric, value] of [
    ["named", "2"],
    ["appearances", "2"],
    ["starts", "1"],
    ["substituteAppearances", "1"],
    ["attempts", "3"],
    ["conversion", "66.7%"],
  ])
    await expect(page.locator(`[data-review-metric=${metric}]`)).toHaveText(
      value,
    );
  await expect(page.locator("[data-review-metric=recent]")).toHaveText(
    "Played 2/2 · Started 1/2",
  );
  await expect(page.locator(`[data-review-match="${d.a.id}"]`)).toContainText(
    "#8",
  );
  await expect(page.locator(`[data-review-match="${d.b.id}"]`)).toContainText(
    "#6",
  );
  await page.locator("#review-player").selectOption(d.s.players[2].playerId);
  await expect(page.locator("[data-review-metric=appearances]")).toHaveText(
    "0",
  );
  await expect(page.locator("[data-review-metric=didNotPlay]")).toHaveText("2");
  await page.locator("#review-player").selectOption(d.s.players[0].playerId);
  await page
    .locator(`[data-review-match="${d.a.id}"] [data-review-open]`)
    .click();
  await expect(page.locator(".history-readonly")).toContainText("READ-ONLY");
  await expect(page.locator("[data-ht-score=our]")).toHaveText("0-01 (1)");
  expect(await state(page)).toEqual(before);
  await page.reload();
  await nav(page, "Player Review");
  await page.locator("#review-player").selectOption(d.s.players[0].playerId);
  await expect(page.locator("[data-review-metric=appearances]")).toHaveText(
    "2",
  );
});

test("active XV: off player disappears from shot, Mark, block and turnover/interception; re-entry, undo, edit and resume restore deterministic selection", async ({
  page,
}) => {
  const d = fixture();
  d.active = d.a;
  delete d.active.lifecycle;
  d.active.events = [];
  await seed(page, d);
  await nav(page, "Live match");
  await nav(page, "Substitution");
  await expect(page.locator('[data-sub-on="8"]')).toHaveCount(0);
  await expect(page.locator('[data-sub-on="22"]')).toBeVisible();
  await expect(page.locator('[data-sub-off="22"]')).toHaveCount(0);
  await page.locator('[data-sub-on="22"]').click();
  await page.locator('[data-sub-off="8"]').click();
  await nav(page, "Record substitution");
  const checkShot = async () => {
    // Respect the existing duplicate-tap guard when repeating a point after undo.
    await page.waitForTimeout(700);
    await page.locator(".event-controls [data-event=point]").click();
    await expect(page.locator('[data-shot-player="8"]')).toHaveCount(0);
    await expect(page.locator('[data-shot-player="22"]')).toBeVisible();
    await nav(page, "Close shot details");
    await nav(page, "Undo last event");
  };
  await checkShot();
  await nav(page, "Our Kickout");
  await nav(page, "Mark won by us");
  await expect(page.locator('[data-mark-player="8"]')).toHaveCount(0);
  await expect(page.locator('[data-mark-player="22"]')).toBeVisible();
  await nav(page, "Skip player / Close");
  await nav(page, "Undo last event");
  await page.locator(".event-controls [data-event=defensive-block]").click();
  await expect(page.locator('button[data-defensive-player="8"]')).toHaveCount(
    0,
  );
  await expect(
    page.locator('button[data-defensive-player="22"]'),
  ).toBeVisible();
  await nav(page, "Skip / Close");
  await nav(page, "Undo last event");
  for (const type of ["interception", "turnover-won", "turnover-lost"]) {
    await page.locator(`.event-controls [data-event="${type}"]`).click();
    await page.locator("[data-action-credit] summary").click();
    await expect(page.locator('[data-action-player="8"]')).toHaveCount(0);
    await expect(page.locator('[data-action-player="22"]')).toBeVisible();
    await page.locator('[data-action-player="22"]').click();
    expect((await state(page)).events.at(-1).playerNumber).toBe("22");
    await nav(page, "Undo last event");
  }
  await nav(page, "Substitution");
  await expect(page.locator('[data-sub-on="8"]')).toBeVisible();
  await expect(page.locator('[data-sub-off="22"]')).toBeVisible();
  await page.locator('[data-sub-on="8"]').click();
  await page.locator('[data-sub-off="22"]').click();
  await nav(page, "Record substitution");
  await page.waitForTimeout(700);
  await page.locator(".event-controls [data-event=point]").click();
  await expect(page.locator('[data-shot-player="8"]')).toBeVisible();
  await expect(page.locator('[data-shot-player="22"]')).toHaveCount(0);
  await nav(page, "Close shot details");
  await nav(page, "Undo last event");
  await nav(page, "Undo last event");
  await checkShot();
  await nav(page, "Edit last event");
  await page.getByLabel("Player off (substitution)", { exact: true }).fill("3");
  await nav(page, "Save changes");
  await page.waitForTimeout(700);
  await page.locator(".event-controls [data-event=point]").click();
  await expect(page.locator('[data-shot-player="8"]')).toBeVisible();
  await expect(page.locator('[data-shot-player="3"]')).toHaveCount(0);
  await nav(page, "Close shot details");
  await nav(page, "Undo last event");
  await nav(page, "Match setup");
  page.once("dialog", (x) => x.accept());
  await nav(page, "Start a new blank match");
  await nav(page, "Match History");
  const card = page.locator(`[data-history-id="${d.active.id}"]`);
  await card.locator("summary").click();
  page.once("dialog", (x) => x.accept());
  await card.getByRole("button", { name: "RESUME MATCH", exact: true }).click();
  await expect(page.locator(".recording-team")).toBeVisible();
  await page.reload();
  await page.waitForTimeout(700);
  await page.locator(".event-controls [data-event=point]").click();
  await expect(page.locator('[data-shot-player="8"]')).toBeVisible();
  await expect(page.locator('[data-shot-player="3"]')).toHaveCount(0);
});

test("name-only load and batch today-team setup prevent default collisions, allow jersey swaps, and New Match is a separate archived record", async ({
  page,
}) => {
  const d = fixture();
  d.active = blankMatch();
  d.s.players[0].number = 6;
  d.s.players[1].number = 6;
  await seed(page, d);
  await nav(page, "Squad");
  await nav(page, "Saved squads");
  await page.locator("[data-load-squad]").click();
  let m = await state(page);
  expect(m.players.every((p) => p.number === null && p.role === "panel")).toBe(
    true,
  );
  await nav(page, "Set today’s team");
  await page.getByLabel("Today's jersey 1", { exact: true }).fill("8");
  await page.getByLabel("Today's jersey 2", { exact: true }).fill("6");
  await page
    .getByLabel("Today's role 1", { exact: true })
    .selectOption("starter");
  await page
    .getByLabel("Today's role 2", { exact: true })
    .selectOption("starter");
  await nav(page, "Save today's team");
  const ids = (await state(page)).players.map((p) => p.playerId);
  await nav(page, "Set today’s team");
  await page.getByLabel("Today's jersey 1", { exact: true }).fill("6");
  await page.getByLabel("Today's jersey 2", { exact: true }).fill("8");
  await nav(page, "Save today's team");
  m = await state(page);
  expect(m.players.map((p) => p.number)).toEqual([6, 8, null]);
  expect(m.players.map((p) => p.playerId)).toEqual(ids);
  await nav(page, "Match setup");
  await expect(
    page.getByText(
      "Edit current match details below. Editing the opponent does not create a new match.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("First opponent");
  const id = (await state(page)).id;
  await page
    .getByLabel("Opposition", { exact: true })
    .fill("Corrected opponent");
  expect((await state(page)).id).toBe(id);
  page.once("dialog", (x) => {
    expect(x.message()).toContain("NEW match");
    x.accept();
  });
  await nav(page, "Start a new blank match");
  await expect(page.getByLabel("Opposition", { exact: true })).toHaveValue("");
  expect((await state(page)).id).not.toBe(id);
  await nav(page, "Match History");
  await expect(page.locator(`[data-history-id="${id}"]`)).toContainText(
    "Corrected opponent",
  );
});
