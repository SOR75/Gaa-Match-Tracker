import { test, expect } from "@playwright/test";
import { blankMatch } from "../../src/domain.js";
import { createMatchPlayer, createSquadPlayer } from "../../src/identity.js";
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
async function seed(page) {
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
async function substitute(page, on, off) {
  // Respect the existing 650 ms same-action double-tap guard.
  await page.waitForTimeout(700);
  await page.locator('[data-event="substitution"]').click();
  await expect(page.locator(`[data-sub-on="${on}"]`)).toBeVisible();
  await expect(page.locator(`[data-sub-off="${off}"]`)).toBeVisible();
  await page.locator(`[data-sub-on="${on}"]`).click();
  await page.locator(`[data-sub-off="${off}"]`).click();
  await nav(page, "Record substitution");
}
async function shotPlayers(page) {
  await page.waitForTimeout(700);
  await page.locator('[data-event="point"]').click();
  await expect(page.locator('[data-shot-player="18"]')).toBeVisible();
  await expect(page.locator('[data-shot-player="10"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
}
test("real #18 on/#10 off uses roster buttons and every live our selector follows Active XV, including Pass", async ({
  page,
}) => {
  await seed(page);
  await substitute(page, 18, 10);
  await shotPlayers(page);
  await page.reload();
  await nav(page, "Live match");
  await shotPlayers(page);
  for (const type of ["our-kickout", "opposition-kickout"])
    for (const outcome of ["Won by us", "Mark won by us"]) {
      await page.waitForTimeout(700);
      await page.locator(`[data-event="${type}"]`).click();
      await nav(page, outcome);
      await expect(page.locator('[data-ko-player="18"]')).toBeVisible();
      await expect(page.locator('[data-ko-player="10"]')).toHaveCount(0);
      await page.locator('[data-ko-player="18"]').click();
    }
  for (const type of ["turnover-won", "turnover-lost", "interception"]) {
    await page.locator(`[data-event="${type}"]`).click();
    await page.locator("[data-action-credit] summary").click();
    await expect(page.locator('[data-action-player="18"]')).toBeVisible();
    await expect(page.locator('[data-action-player="10"]')).toHaveCount(0);
  }
  await page.locator('[data-event="defensive-block"]').click();
  await expect(
    page.locator('button[data-defensive-player="18"]'),
  ).toBeVisible();
  await expect(page.locator('button[data-defensive-player="10"]')).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
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
  await page.getByLabel("Receiver", { exact: true }).selectOption("1");
  await page.getByLabel("Pass type", { exact: true }).selectOption("hand");
  await nav(page, "Record pass");
});
for (const type of ["our-kickout", "opposition-kickout"])
  for (const outcome of [
    "Won by us",
    "Mark won by us",
    type === "our-kickout" ? "Won by opposition" : "Retained by opposition",
    "Mark won by opposition",
  ])
    test(`${type} ${outcome}: immediate correct grid, one tap finishes, one event and separate win/Mark`, async ({
      page,
    }) => {
      const m = await seed(page);
      await page.waitForTimeout(700);
      await page.locator(`[data-event="${type}"]`).click();
      await nav(page, "LONG");
      await nav(page, outcome);
      const d = page.getByRole("dialog");
      await expect(d.locator('[data-ko-player="8"]')).toBeVisible();
      await expect(d.getByRole("button", { name: /Skip|Save/ })).toHaveCount(0);
      await expect(page.locator("[data-action-credit]")).toHaveCount(0);
      await d.locator('[data-ko-player="8"]').click();
      await expect(d).not.toBeVisible();
      const saved = await state(page);
      expect(saved.events).toHaveLength(1);
      const e = saved.events[0];
      const ours = outcome.endsWith("us");
      expect(e.kickoutWinnerNumber).toBe("8");
      expect(e.mark).toBe(outcome.startsWith("Mark"));
      expect(e.participants.kickoutWinner.team).toBe(
        ours ? "our" : "opposition",
      );
      expect(e.participants.kickoutWinner.playerId).toBe(
        (ours ? m.players : m.oppositionPlayers)[7].playerId,
      );
      await page.reload();
      expect((await state(page)).events[0]).toEqual(e);
    });
test("automatic #1 keeper; outfield replacement sequence attributes goals to correct keeper without manual controls", async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator("[data-goalkeeper]")).toHaveCount(0);
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  await page.locator('[data-team="our"]').click();
  await substitute(page, 18, 4);
  await substitute(page, 4, 1);
  await page.locator('[data-team="opposition"]').click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  await nav(page, "Match analysis");
  for (const n of [1, 4]) {
    const m = await state(page);
    const card = page.locator(`[data-gk-card="our:${m.players[n - 1].id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-gk-metric="conceded"]')).toHaveText("1");
  }
});
test("substitution survives native History resume; editing and undo recalculate live players", async ({
  page,
}) => {
  const m = await seed(page);
  await substitute(page, 18, 10);
  const sub = (await state(page)).events[0];
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("sideline.match.v1"));
    localStorage.setItem("sideline.match.archive." + a.id, JSON.stringify(a));
    const b = structuredClone(a);
    b.id = "another-current";
    b.events = [];
    localStorage.setItem("sideline.match.v1", JSON.stringify(b));
  });
  await page.reload();
  await nav(page, "Match History");
  const card = page.locator(`[data-history-id="${m.id}"]`);
  await card.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "RESUME MATCH", exact: true }).click();
  await shotPlayers(page);
  await nav(page, "Undo last event");
  await nav(page, "Edit last event");
  await page
    .getByLabel("Player off (substitution)", { exact: true })
    .fill("11");
  await nav(page, "Save changes");
  expect((await state(page)).events[0].id).toBe(sub.id);
  await page.waitForTimeout(700);
  await page.locator('[data-event="point"]').click();
  await expect(page.locator('[data-shot-player="10"]')).toBeVisible();
  await expect(page.locator('[data-shot-player="11"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav(page, "Undo last event");
  await nav(page, "Undo last event");
  await page.locator('[data-event="substitution"]').click();
  await expect(page.locator('[data-sub-on="18"]')).toBeVisible();
  await expect(page.locator('[data-sub-off="10"]')).toBeVisible();
});
for (const input of ["#sideline-squad-file", "#team-sheet-file"])
  test(`official workbook through ${input}: metadata never becomes player, identities only on CREATE SQUAD`, async ({
    page,
  }) => {
    await seed(page);
    await nav(page, "Squad");
    await page
      .locator(input)
      .setInputFiles("tests/fixtures/squad-template/Official-routing.xlsx");
    await expect(
      page.getByRole("heading", { name: "SQUAD IMPORT REVIEW", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-excel-row]")).toHaveCount(3);
    await expect(
      page.getByLabel("Imported player 1 name", { exact: true }),
    ).toHaveValue("Éabha Ní Bhriain");
    await expect(page.locator("[data-excel-title]")).toContainText(
      "Offaly LGFA",
    );
    await nav(page, "CREATE SQUAD");
    const library = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sideline.squads.v2")),
    );
    expect(library.squads[0].players.map((p) => p.name)).toEqual([
      "Éabha Ní Bhriain",
      "Test Player Two",
      "Test Player Two",
    ]);
    expect(new Set(library.squads[0].players.map((p) => p.playerId)).size).toBe(
      3,
    );
  });
test("editing possession outcome never silently transfers our #8 to opposition #8", async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-event="our-kickout"]').click();
  await nav(page, "Won by us");
  await page.locator('[data-ko-player="8"]').click();
  await nav(page, "Edit last event");
  await page.getByLabel("Kickout result", { exact: true }).selectOption("lost");
  await expect(page.getByLabel("Kickout winner", { exact: true })).toHaveValue(
    "",
  );
  await page.getByLabel("Kickout winner", { exact: true }).selectOption("9");
  await nav(page, "Save changes");
  const e = (await state(page)).events[0];
  expect(e.participants.kickoutWinner.team).toBe("opposition");
  expect(e.kickoutWinnerNumber).toBe("9");
});
