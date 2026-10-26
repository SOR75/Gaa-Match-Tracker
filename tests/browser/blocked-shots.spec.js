import { test, expect } from "@playwright/test";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
}
async function add(page, number, name, role = "starter") {
  await page.getByLabel("Jersey number", { exact: true }).fill(String(number));
  await page.getByLabel("Player name", { exact: true }).fill(name);
  await page.locator("#player-form [name=role]").selectOption(role);
  await nav(page, "Add player");
}
async function metric(page, label, column) {
  const section = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Player shooting & event analysis",
      exact: true,
    }),
  });
  const headers = await section.getByRole("columnheader").allTextContents();
  const index = headers.indexOf(column);
  expect(index).toBeGreaterThan(0);
  return section
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) })
    .getByRole("cell")
    .nth(index - 1);
}
async function oppositionBlock(page) {
  await setup(page);
  await add(page, 3, "Sarah");
  await add(page, 4, "Maeve", "substitute");
  await nav(page, "Live match");
  await nav(page, "Away");
  await page.locator(".event-controls [data-event=miss]").click();
  await page.getByLabel("Other player number", { exact: false }).fill("15");
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
}

test("A: our blocked shot saves once, keeps shooter attribution and invents no opposition blocker", async ({
  page,
}) => {
  await setup(page);
  await add(page, 15, "Shooter");
  await add(page, 3, "Sarah");
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=miss]").click();
  let match = await state(page);
  expect(match.events).toHaveLength(1);
  const id = match.events[0].id;
  expect(match.events[0]).toMatchObject({
    event: "miss",
    shotSource: "open-play",
    scoreValue: 0,
    blockedByNumber: "",
  });
  await expect(page.getByLabel("Shot source", { exact: true })).toHaveValue(
    "open-play",
  );
  await expect(
    page.getByLabel("Miss reason", { exact: true }).locator("option"),
  ).toHaveText([
    "Not recorded",
    "Wide",
    "Short",
    "Saved",
    "Blocked",
    "Post",
    "Other",
  ]);
  await page.locator('[data-shot-player="15"]').click();
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
  await expect(page.locator("[data-block-credit]")).toHaveCount(0);
  await nav(page, "Skip / Close");
  match = await state(page);
  expect(match.events).toHaveLength(1);
  expect(match.events[0]).toMatchObject({
    id,
    playerNumber: "15",
    missReason: "blocked",
    blockedByNumber: "",
  });
  await expect(page.locator(".score-team.our .score-total")).toHaveText("0-0");
  await nav(page, "Match analysis");
  await expect(await metric(page, "Home · #15 Shooter", "Attempts")).toHaveText(
    "1",
  );
  await expect(
    await metric(page, "Home · #15 Shooter", "Blocked attempts"),
  ).toHaveText("1");
  await expect(
    await metric(page, "Home · #3 Sarah", "Defensive blocks"),
  ).toHaveText("0");
});

test("B: opposition blocked shot visibly offers our shared squad; one tap credits defender on the same shot and preserves pitch/shooter", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await oppositionBlock(page);
  const modal = page.getByRole("dialog");
  const picker = modal.getByRole("group", { name: "Our blocker" });
  await expect(
    modal.getByText("Who made the block? · optional", { exact: true }),
  ).toBeVisible();
  await expect(picker.getByRole("button")).toHaveCount(2);
  for (const name of ["Credit block to #3 Sarah", "Credit block to #4 Maeve"]) {
    await expect(
      picker.getByRole("button", { name, exact: true }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name, exact: true }),
    ).toBeInViewport();
  }
  const initial = (await state(page)).events[0];
  await picker
    .getByRole("button", { name: "Credit block to #3 Sarah", exact: true })
    .click();
  let match = await state(page);
  expect(match.events).toHaveLength(1);
  expect(match.events[0]).toMatchObject({
    id: initial.id,
    event: "miss",
    team: "opposition",
    playerNumber: "15",
    blockedByNumber: "3",
    missReason: "blocked",
    scoreValue: 0,
  });
  await expect(modal).toBeVisible();
  await expect(
    modal.getByRole("button", {
      name: "Credit block to #3 Sarah",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await modal
    .getByRole("button", { name: "Clear blocker credit", exact: true })
    .click();
  expect((await state(page)).events[0]).toMatchObject({
    id: initial.id,
    playerNumber: "15",
    blockedByNumber: "",
  });
  await modal
    .getByRole("button", { name: "Credit block to #3 Sarah", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Shot location pitch", exact: true })
    .click({ position: { x: 80, y: 110 } });
  await nav(page, "Skip / Close");
  match = await state(page);
  expect(match.events).toHaveLength(1);
  expect(match.events[0].shotX).not.toBeNull();
  expect(match.events[0].playerNumber).toBe("15");
  await nav(page, "Match analysis");
  await expect(
    await metric(page, "Home · #3 Sarah", "Defensive blocks"),
  ).toHaveText("1");
  await expect(await metric(page, "Home · #3 Sarah", "Attempts")).toHaveText(
    "0",
  );
  await expect(
    await metric(page, "Away · #15 Unlisted player", "Blocked attempts"),
  ).toHaveText("1");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0]).toMatchObject({
    id: initial.id,
    playerNumber: "15",
    blockedByNumber: "3",
  });
});

test("C: editing changes/removes blocker and changes reason to/from Blocked; all analysis recalculates", async ({
  page,
}) => {
  await oppositionBlock(page);
  await page
    .getByRole("button", { name: "Credit block to #3 Sarah", exact: true })
    .click();
  await nav(page, "Skip / Close");
  await nav(page, "Match analysis");
  const id = (await state(page)).events[0].id;
  for (const [credit, first, second] of [
    ["4", "0", "1"],
    ["", "0", "0"],
    ["3", "1", "0"],
  ]) {
    await nav(page, "Edit last event");
    await page.getByLabel("Block by", { exact: true }).selectOption(credit);
    await nav(page, "Save changes");
    expect((await state(page)).events).toHaveLength(1);
    expect((await state(page)).events[0]).toMatchObject({
      id,
      playerNumber: "15",
      blockedByNumber: credit,
    });
    await expect(
      await metric(page, "Home · #3 Sarah", "Defensive blocks"),
    ).toHaveText(first);
    await expect(
      await metric(page, "Home · #4 Maeve", "Defensive blocks"),
    ).toHaveText(second);
  }
  await nav(page, "Edit last event");
  await page.getByLabel("Miss reason", { exact: true }).selectOption("wide");
  await expect(page.getByLabel("Block by", { exact: true })).toBeHidden();
  await nav(page, "Save changes");
  expect((await state(page)).events[0]).toMatchObject({
    id,
    missReason: "wide",
    blockedByNumber: "",
  });
  await expect(
    await metric(page, "Home · #3 Sarah", "Defensive blocks"),
  ).toHaveText("0");
  await expect(
    await metric(page, "Away · #15 Unlisted player", "Blocked attempts"),
  ).toHaveText("0");
  await expect(
    await metric(page, "Away · #15 Unlisted player", "Attempts"),
  ).toHaveText("1");
  await nav(page, "Edit last event");
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
  await expect(page.getByLabel("Block by", { exact: true })).toHaveValue("");
  await page.getByLabel("Block by", { exact: true }).selectOption("4");
  await nav(page, "Save changes");
  await expect(
    await metric(page, "Home · #4 Maeve", "Defensive blocks"),
  ).toHaveText("1");
  expect((await state(page)).events).toHaveLength(1);
});

test("D: empty OUR squad shows No players loaded, does not offer opponents, and Skip preserves one blocked shot", async ({
  page,
}) => {
  await setup(page);
  await page.locator("[data-squad-team=opposition]").click();
  await add(page, 3, "Opponent Three");
  await nav(page, "Live match");
  await nav(page, "Away");
  await page.locator(".event-controls [data-event=miss]").click();
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
  const panel = page.locator("[data-block-credit]");
  await expect(
    panel.getByText("No players loaded", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator("[data-block-player]")).toHaveCount(0);
  await expect(panel).not.toContainText("Opponent Three");
  await nav(page, "Skip / Close");
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0]).toMatchObject({
    event: "miss",
    team: "opposition",
    missReason: "blocked",
    blockedByNumber: "",
  });
  await nav(page, "Edit last event");
  await expect(
    page.getByRole("dialog").getByText("No players loaded", { exact: true }),
  ).toBeVisible();
  await nav(page, "Cancel event");
});
