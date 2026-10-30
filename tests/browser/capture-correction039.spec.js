import { test, expect } from "@playwright/test";
import { blankMatch, createEvent, saveEvent } from "../../src/domain.js";
import { snapshotSquad, loadSquadPlayers } from "../../src/squads.js";
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
async function seed(page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  const squad = snapshotSquad(
    "Match-day squad",
    Array.from({ length: 18 }, (_, i) => ({
      name: `Player ${i + 1}`,
      number: i + 1,
      role: i < 15 ? "starter" : "substitute",
    })),
  );
  const m = blankMatch();
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  m.players = loadSquadPlayers(squad);
  m.squadId = squad.id;
  await page.goto("/");
  await page.evaluate(
    ({ m, squad }) => {
      localStorage.setItem("sideline.match.v1", JSON.stringify(m));
      localStorage.setItem(
        "sideline.squads.v2",
        JSON.stringify({ version: 2, squads: [squad] }),
      );
    },
    { m, squad },
  );
  await page.reload();
  await nav(page, "Live match");
  return m;
}
async function pass(page, from, to, type) {
  await page.locator('[data-event="pass"]').click();
  await page.getByLabel("Passer", { exact: true }).selectOption(String(from));
  await page.getByLabel("Receiver", { exact: true }).selectOption(String(to));
  await page.getByLabel("Pass type", { exact: true }).selectOption(type);
  await nav(page, "Record pass");
}
async function resume(page, m) {
  await page.evaluate((m) => {
    localStorage.setItem("sideline.match.archive." + m.id, JSON.stringify(m));
    const next = structuredClone(m);
    next.id = "different-current";
    next.events = [];
    localStorage.setItem("sideline.match.v1", JSON.stringify(next));
  }, m);
  await page.reload();
  await nav(page, "Match History");
  const card = page.locator(`[data-history-id="${m.id}"]`);
  await card.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "RESUME MATCH", exact: true }).click();
  await expect.poll(async () => (await state(page)).id).toBe(m.id);
}
test("Pass occupies exactly the old Possession slot; Kick #8→#11 then substitute and Hand #18→#11 survives Timeline/reload/Resume", async ({
  page,
}) => {
  await seed(page); // Independent order below protects the old Possession slot and neighbours.
  expect(
    await page
      .locator(".other-events [data-event]")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.event)),
  ).toEqual([
    "our-kickout",
    "opposition-kickout",
    "turnover-won",
    "turnover-lost",
    "interception",
    "pass",
    "defensive-block",
    "substitution",
  ]);
  await expect(page.locator('[data-event="pass"]')).toHaveCount(1);
  await expect(page.locator('[data-event="possession"]')).toHaveCount(0);
  await expect(page.locator("[data-add-build-up]")).toHaveCount(0);
  await pass(page, 8, 11, "kick");
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0]).toMatchObject({
    event: "pass",
    playerNumber: "8",
    receiverNumber: "11",
    passType: "kick",
  });
  await page.locator('[data-event="substitution"]').click();
  await page.locator('[data-sub-on="18"]').click();
  await page.locator('[data-sub-off="10"]').click();
  await nav(page, "Record substitution");
  await page.locator('[data-event="point"]').click();
  await expect(page.locator('[data-shot-player="18"]')).toBeVisible();
  await expect(page.locator('[data-shot-player="10"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await page.locator('[data-event="pass"]').click();
  for (const label of ["Passer", "Receiver"]) {
    await expect(
      page.getByLabel(label, { exact: true }).locator('option[value="18"]'),
    ).toHaveCount(1);
    await expect(
      page.getByLabel(label, { exact: true }).locator('option[value="10"]'),
    ).toHaveCount(0);
  }
  await page.getByLabel("Passer", { exact: true }).selectOption("18");
  await page.getByLabel("Receiver", { exact: true }).selectOption("11");
  await page.getByLabel("Pass type", { exact: true }).selectOption("hand");
  await nav(page, "Record pass");
  const saved = await state(page);
  await nav(page, "Timeline");
  await expect(
    page.locator(".event-row").filter({ hasText: "Kick Pass" }),
  ).toContainText("#8 → #11");
  await expect(
    page.locator(".event-row").filter({ hasText: "Hand Pass" }),
  ).toContainText("#18 → #11");
  await page.reload();
  expect((await state(page)).events).toEqual(saved.events);
  await resume(page, saved);
  expect((await state(page)).events).toEqual(saved.events);
});
test("old Possession stays readable/countable through Timeline, native History view and Resume; not offered as capture", async ({
  page,
}) => {
  const m = await seed(page);
  const e = createEvent(m, "possession", "our");
  delete e.identityVersion;
  delete e.participants;
  m.events = saveEvent([], e, m);
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    m,
  );
  await page.reload();
  await nav(page, "Timeline");
  await expect(page.locator(".event-row")).toContainText("Possession");
  await nav(page, "Match analysis");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", {
        name: "Possession-related events",
        exact: true,
      }),
    });
  await expect(row.getByRole("cell").first()).toHaveText("1");
  await page.evaluate((m) => {
    localStorage.setItem("sideline.match.archive." + m.id, JSON.stringify(m));
    const next = structuredClone(m);
    next.id = "different-current";
    next.events = [];
    localStorage.setItem("sideline.match.v1", JSON.stringify(next));
  }, m);
  await page.reload();
  await nav(page, "Match History");
  const card = page.locator(`[data-history-id="${m.id}"]`);
  await card.getByRole("button", { name: "VIEW MATCH", exact: true }).click();
  await page
    .locator(".history-tabs")
    .getByRole("button", { name: "Timeline", exact: true })
    .click();
  await expect(page.locator(".event-row")).toContainText("Possession");
  await page.locator('[data-history-action="back"]').click();
  await card.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "RESUME MATCH", exact: true }).click();
  await expect.poll(async () => (await state(page)).id).toBe(m.id);
  expect((await state(page)).events).toEqual(m.events);
  await expect(page.locator('[data-event="possession"]')).toHaveCount(0);
});
test("real New Match → saved team setup → automatic GK periods: 4/3 kickouts and one goal conceded each reconcile in Analysis and report", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date("2026-10-30T13:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T13:00:01Z"));
  const old = await seed(page);
  await nav(page, "Squad");
  await nav(page, "Save team setup");
  await page
    .getByLabel("Team setup name", { exact: true })
    .fill("Starting team");
  await nav(page, "Save setup");
  await nav(page, "Match setup");
  page.once("dialog", (d) => d.accept());
  await nav(page, "Start a new blank match");
  await expect.poll(async () => (await state(page)).id).not.toBe(old.id);
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
  await nav(page, "Use saved team setup");
  await nav(page, "Use setup");
  await nav(page, "Live match");
  const m = await state(page);
  expect(m.goalkeeperTrackingVersion).toBe(1);
  expect(m.players[0].matchPlayerId).not.toBe(old.players[0].matchPlayerId);
  expect(m.players[0].playerId).toBe(old.players[0].playerId);
  await expect(page.locator("[data-goalkeeper]")).toHaveCount(0);
  await nav(page, "Start clock");
  const ko = async (length, outcome) => {
    await page.clock.fastForward(60000);
    await page.locator('[data-event="our-kickout"]').click();
    await nav(page, length);
    await nav(page, outcome);
    if (outcome !== "Out of Play / Sideline")
      await page.locator('[data-ko-player="8"]').click();
  };
  await ko("SHORT", "Won by us");
  await ko("LONG", "Won by opposition");
  await ko("LONG", "Mark won by us");
  await ko("LONG", "Out of Play / Sideline");
  await page.clock.fastForward(60000);
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  await page.clock.fastForward(5 * 60000);
  await page.locator('[data-team="our"]').click();
  await page.locator('[data-event="substitution"]').click();
  await page.locator('[data-sub-on="16"]').click();
  await page.locator('[data-sub-off="1"]').click();
  await nav(page, "Record substitution");
  await ko("SHORT", "Won by us");
  await ko("SHORT", "Won by opposition");
  await ko("LONG", "Won by us");
  await page.clock.fastForward(60000);
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  await page.clock.fastForward(16 * 60000);
  await nav(page, "Pause clock");
  await nav(page, "Match analysis");
  const a = page.locator(`[data-gk-card="our:${m.players[0].id}"]`),
    b = page.locator(`[data-gk-card="our:${m.players[15].id}"]`);
  for (const [card, values] of [
    [
      a,
      {
        time: "10:00 recorded",
        taken: "4",
        retained: "2 · 50%",
        marks: "1",
        out: "1",
        conceded: "1",
      },
    ],
    [
      b,
      {
        time: "20:00 recorded",
        taken: "3",
        retained: "2 · 66.7%",
        conceded: "1",
      },
    ],
  ])
    for (const [key, value] of Object.entries(values))
      await expect(card.locator(`[data-gk-metric="${key}"]`)).toHaveText(value);
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", {
        name: "Our Kickouts · Home",
        exact: true,
      }),
    });
  await expect(row.getByRole("cell").first()).toHaveText("7");
  await nav(page, "Match Report");
  await expect(a.locator('[data-gk-metric="conceded"]')).toHaveText("1");
  await expect(b.locator('[data-gk-metric="taken"]')).toHaveText("3");
  const saved = await state(page);
  expect(saved.events.filter((e) => e.event === "our-kickout")).toHaveLength(7);
  expect(saved.events.filter((e) => e.event === "possession")).toHaveLength(0);
  expect(saved.goalkeepers.our.matchPlayerId).toBe(m.players[0].matchPlayerId);
  await page.reload();
  await nav(page, "Match analysis");
  await expect(a.locator('[data-gk-metric="taken"]')).toHaveText("4");
  await expect(b.locator('[data-gk-metric="conceded"]')).toHaveText("1");
});
