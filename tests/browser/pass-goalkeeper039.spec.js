import { test, expect } from "@playwright/test";
import { blankMatch, createEvent, saveEvent } from "../../src/domain.js";
import { createMatchPlayer, createSquadPlayer } from "../../src/identity.js";
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
async function seed(page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  const m = blankMatch();
  m.setup.ourTeam = "Home";
  m.setup.opposition = "Away";
  const player = (n) =>
    createMatchPlayer({
      ...createSquadPlayer({
        number: n,
        name: `Player ${n}`,
        role: n <= 15 ? "starter" : "substitute",
      }),
      id: undefined,
    });
  m.players = Array.from({ length: 18 }, (_, i) => player(i + 1));
  m.oppositionPlayers = Array.from({ length: 18 }, (_, i) => player(i + 1));
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    m,
  );
  await page.reload();
  await nav(page, "Live match");
  return m;
}
async function sub(page, on, off) {
  await page.locator('[data-event="substitution"]').click();
  await page.locator(`[data-sub-on="${on}"]`).click();
  await page.locator(`[data-sub-off="${off}"]`).click();
  await nav(page, "Record substitution");
}
test("one optional Pass: no event on opening/cancel, Active XV, one Record, unchanged score and no build-up controls", async ({
  page,
}) => {
  await seed(page);
  await sub(page, 18, 10);
  await page.locator('[data-event="point"]').click();
  await page.keyboard.press("Escape");
  const before = await state(page);
  await expect(page.locator('[data-event="pass"]')).toHaveCount(1);
  await expect(page.locator("[data-add-build-up]")).toHaveCount(0);
  await page.locator('[data-event="pass"]').click();
  expect((await state(page)).events).toEqual(before.events);
  await expect(
    page.getByLabel("Build-up to shot", { exact: true }),
  ).toHaveCount(0);
  for (const label of ["FROM", "TO"]) {
    await expect(
      page.getByRole("group", { name: label, exact: true }).locator(':is([data-pass-from="10"], [data-pass-to="10"])'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: label, exact: true }).locator(':is([data-pass-from="18"], [data-pass-to="18"])'),
    ).toHaveCount(1);
  }
  await nav(page, "Close Pass");
  expect((await state(page)).events).toEqual(before.events);
  await page.waitForTimeout(700);
  await page.locator('[data-event="pass"]').click();
  await page.locator('[data-pass-from="18"]').click();
  await page.locator('[data-pass-to="15"]').click();
  await page.locator('[data-pass-type="hand"]').click();
  const m = await state(page);
  expect(m.events).toHaveLength(before.events.length + 1);
  expect(m.events.at(-1)).toMatchObject({
    event: "pass",
    playerNumber: "18",
    receiverNumber: "15",
    passType: "hand",
  });
  expect(m.events.at(-1).participants.player.matchPlayerId).toBe(
    m.players[17].id,
  );
  expect(m.events.at(-1).participants.receiver.matchPlayerId).toBe(
    m.players[14].id,
  );
  await nav(page, "Timeline");
  await expect(
    page.locator(".event-row").filter({ hasText: "Hand Pass" }),
  ).toContainText("#18 → #15");
  await page.reload();
  expect((await state(page)).events).toEqual(m.events);
});
test("legacy shot-linked Pass survives native History Resume and normal historical editing without build-up UI", async ({
  page,
}) => {
  const m = await seed(page);
  m.clock.elapsedMs = 180000;
  const shot = createEvent(m, "point", "our");
  m.events = saveEvent([], shot, m);
  const pass = {
    ...createEvent(m, "pass", "our"),
    timeMs: 120000,
    playerNumber: "9",
    receiverNumber: "15",
    passType: "kick",
    buildUpLink: shot.id,
  };
  m.events = saveEvent(m.events, pass, m);
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
  expect((await state(page)).events).toEqual(m.events);
  await nav(page, "Timeline");
  await expect(
    page.locator(".event-row").filter({ hasText: "Kick Pass" }),
  ).toContainText("#9 → #15");
  await nav(page, "Edit last event");
  await expect(
    page.getByLabel("Build-up to shot", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Receiver", { exact: true }).locator('option[value="18"]'),
  ).toHaveCount(1);
  await page.getByLabel("Receiver", { exact: true }).selectOption("18");
  await page.getByLabel("Pass type", { exact: true }).selectOption("hand");
  await nav(page, "Save changes");
  await page.reload();
  const saved = (await state(page)).events.at(-1);
  expect(saved.buildUpLink).toBe(shot.id);
  expect(saved.receiverNumber).toBe("18");
  expect(saved.passType).toBe("hand");
  expect(saved.id).toBe(pass.id);
});
test("real clock H1→H2, #16 replacement: 32/28 minutes, 5/4 kickouts, 1/2 goals and opposition metrics appear in compact Full-Time cards and survive reload", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-30T12:00:01Z"));
  const m = await seed(page);
  await nav(page, "Start clock");
  await page.clock.fastForward(5 * 60000);
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  for (let i = 0; i < 5; i++) {
    await page.clock.fastForward(60000);
    await page.locator('[data-event="our-kickout"]').click();
    await nav(page, i < 2 ? "SHORT" : "LONG");
    await nav(
      page,
      i === 4
        ? "Out of Play / Sideline"
        : i === 2
          ? "Mark won by us"
          : i % 2 === 0
            ? "Won by us"
            : "Won by opposition",
    );
    if (i !== 4) await page.locator('[data-ko-player="8"]').click();
  }
  await page.clock.fastForward(60000);
  await page.locator('[data-event="opposition-kickout"]').click();
  await nav(page, "LONG");
  await nav(page, "Retained by opposition");
  await page.locator('[data-ko-player="8"]').click();
  await page.clock.fastForward(19 * 60000);
  await nav(page, "HALF-TIME ANALYSIS");
  await nav(page, "START SECOND HALF →");
  expect((await state(page)).clock.completedHalves["1"]).toBe(30 * 60000);
  await nav(page, "Start clock");
  await page.clock.fastForward(2 * 60000);
  await page.locator('[data-team="our"]').click();
  await sub(page, 16, 1);
  for (let i = 0; i < 2; i++) {
    await page.clock.fastForward(60000);
    await page.locator('[data-team="opposition"]').click();
    await page.locator('[data-event="goal"]').click();
    await page.keyboard.press("Escape");
  }
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(60000);
    await page.locator('[data-event="our-kickout"]').click();
    await nav(page, "LONG");
    await nav(page, i < 3 ? "Won by us" : "Out of Play / Sideline");
    if (i < 3) await page.locator('[data-ko-player="8"]').click();
  }
  await page.clock.fastForward(22 * 60000);
  await nav(page, "END MATCH / FULL TIME");
  const a = page.locator(`[data-gk-card="our:${m.players[0].id}"]`),
    b = page.locator(`[data-gk-card="our:${m.players[15].id}"]`),
    opp = page.locator(
      `[data-gk-card="opposition:${m.oppositionPlayers[0].id}"]`,
    );
  for (const [card, values] of [
    [
      a,
      {
        time: "32:00 recorded",
        taken: "5",
        conceded: "1",
        retained: "2 · 40%",
        short: "1/2 · 50%",
        long: "1/3 · 33.3%",
        marks: "1",
        out: "1",
      },
    ],
    [
      b,
      {
        time: "28:00 recorded",
        taken: "4",
        conceded: "2",
        retained: "3 · 75%",
        out: "1",
      },
    ],
    [opp, { taken: "1", retained: "1 · 100%" }],
  ])
    for (const [key, value] of Object.entries(values))
      await expect(card.locator(`[data-gk-metric="${key}"]`)).toHaveText(value);
  await expect(page.locator("[data-goalkeepers] table")).toHaveCount(0);
  await expect(page.locator("[data-goalkeeper]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await nav(page, "Match analysis");
  await expect(a.locator('[data-gk-metric="time"]')).toHaveText(
    "32:00 recorded",
  );
  await expect(b.locator('[data-gk-metric="conceded"]')).toHaveText("2");
});
