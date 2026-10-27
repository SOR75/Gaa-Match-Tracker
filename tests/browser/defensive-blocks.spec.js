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
async function add(page, n, name, role = "starter") {
  await page.getByLabel("Jersey number", { exact: true }).fill(String(n));
  await page.getByLabel("Player name", { exact: true }).fill(name);
  await page.locator("#player-form [name=role]").selectOption(role);
  await nav(page, "Add player");
}
async function metric(page, name, column) {
  const section = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Player shooting & event analysis",
      exact: true,
    }),
  });
  const headers = await section.getByRole("columnheader").allTextContents();
  const i = headers.indexOf(column);
  expect(i).toBeGreaterThan(0);
  return section
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
    .getByRole("cell")
    .nth(i - 1);
}

test("attacking Blocked remains one shot, not Wide; map and timeline distinguish it and edits preserve location", async ({
  page,
}) => {
  await setup(page);
  await add(page, 10, "Attacker");
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=miss]").click();
  expect((await state(page)).events).toHaveLength(1);
  await expect(page.getByLabel("Shot source", { exact: true })).toHaveValue(
    "open-play",
  );
  await page.locator('[data-shot-player="10"]').click();
  await page
    .getByRole("button", { name: "Shot location pitch", exact: true })
    .click({ position: { x: 80, y: 110 } });
  const before = (await state(page)).events[0];
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
  const marker = page.locator(`dialog [data-shot-id="${before.id}"]`);
  await expect(marker).toHaveAttribute("data-marker-kind", "blocked-shot");
  await expect(marker.locator("rect")).toBeVisible();
  await expect(marker.locator("path")).toHaveCount(0);
  await expect(marker.locator("title")).toContainText("Blocked shot");
  await nav(page, "Skip / Close");
  let m = await state(page);
  expect(m.events).toHaveLength(1);
  expect(m.events[0]).toMatchObject({
    id: before.id,
    event: "miss",
    playerNumber: "10",
    missReason: "blocked",
    shotX: before.shotX,
    shotY: before.shotY,
  });
  await nav(page, "Timeline");
  await expect(page.locator(".event-row")).toHaveCount(1);
  await expect(page.locator(".event-row")).toContainText("Shot · Blocked");
  await expect(page.locator(".event-row")).toContainText(
    "Pitch location recorded",
  );
  await expect(page.locator(".event-row")).not.toContainText("Wide / Miss");
  await nav(page, "Match analysis");
  await expect(
    await metric(page, "Home · #10 Attacker", "Attempts"),
  ).toHaveText("1");
  await expect(await metric(page, "Home · #10 Attacker", "Wides")).toHaveText(
    "0",
  );
  await expect(
    await metric(page, "Home · #10 Attacker", "Blocked attempts"),
  ).toHaveText("1");
  for (const [reason, kind, wide, blocked] of [
    ["wide", "miss", "1", "0"],
    ["blocked", "blocked-shot", "0", "1"],
  ]) {
    await nav(page, "Edit last event");
    await page.getByLabel("Miss reason", { exact: true }).selectOption(reason);
    await nav(page, "Save changes");
    await expect(
      page.locator(`.analysis-pitch [data-shot-id="${before.id}"]`),
    ).toHaveAttribute("data-marker-kind", kind);
    await expect(await metric(page, "Home · #10 Attacker", "Wides")).toHaveText(
      wide,
    );
    await expect(
      await metric(page, "Home · #10 Attacker", "Blocked attempts"),
    ).toHaveText(blocked);
    expect((await state(page)).events).toHaveLength(1);
    expect((await state(page)).events[0].shotX).toBe(before.shotX);
  }
});

test("main Blocked button saves our defensive action immediately, credits our shared roster and creates no shot or possession event", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setup(page);
  await add(page, 4, "Eibhleann");
  await add(page, 9, "Panel Player", "panel");
  await nav(page, "Live match");
  await nav(page, "Away");
  const button = page.getByRole("button", { name: "Blocked", exact: true });
  await expect(button).toBeInViewport();
  await button.click();
  let m = await state(page);
  expect(m.events).toHaveLength(1);
  const id = m.events[0].id;
  expect(m.events[0]).toMatchObject({
    event: "defensive-block",
    team: "our",
    outcome: "blocked",
    playerNumber: "",
    scoreValue: 0,
    possessionResult: "",
    shotX: null,
    shotY: null,
  });
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByRole("heading", { name: "Defensive Block", exact: true }),
  ).toBeVisible();
  const picker = modal.getByRole("group", { name: "Our defensive blocker" });
  for (const name of [
    "Credit defensive block to #4 Eibhleann",
    "Credit defensive block to #9 Panel Player",
  ])
    await expect(
      picker.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await modal.getByText("Add location · optional", { exact: true }).click();
  await modal
    .getByRole("button", {
      name: "Defensive block location pitch",
      exact: true,
    })
    .click({ position: { x: 80, y: 110 } });
  await expect(modal.locator("[data-marker-kind=defensive-block]")).toHaveCount(
    1,
  );
  await picker
    .getByRole("button", {
      name: "Credit defensive block to #4 Eibhleann",
      exact: true,
    })
    .click();
  await expect(modal).not.toBeVisible();
  m = await state(page);
  expect(m.events).toHaveLength(1);
  expect(m.events[0]).toMatchObject({
    id,
    event: "defensive-block",
    playerNumber: "4",
  });
  expect(m.events[0].shotX).not.toBeNull();
  await expect(page.locator(".score-team.our .score-total")).toHaveText("0-0");
  await nav(page, "Timeline");
  await expect(page.locator(".event-row")).toContainText("Defensive Block");
  await expect(page.locator(".event-row")).toContainText(
    "Pitch location recorded",
  );
  await expect(page.locator(".event-row")).toContainText("Eibhleann");
  await expect(page.locator(".event-row")).not.toContainText("Wide");
  await nav(page, "Match analysis");
  await expect(
    await metric(page, "Home · #4 Eibhleann", "Defensive blocks"),
  ).toHaveText("1");
  await expect(
    await metric(page, "Home · #4 Eibhleann", "Attempts"),
  ).toHaveText("0");
  await expect(page.locator("[data-map-count]")).toHaveText(
    "0 plotted / 0 attempts in this selection.",
  );
  for (const label of [
    "Turnovers won",
    "Turnovers lost",
    "Interceptions",
    "Possession-related events",
  ])
    await expect(
      page
        .getByRole("row")
        .filter({
          has: page.getByRole("rowheader", { name: label, exact: true }),
        })
        .getByRole("cell")
        .first(),
    ).toHaveText("0");
});

test("multiple defensive blocks accumulate; player/location edits clear and recalculate without adding attempts", async ({
  page,
}) => {
  await setup(page);
  await add(page, 4, "Eibhleann");
  await add(page, 9, "Nine");
  await nav(page, "Live match");
  for (let i = 0; i < 3; i++) {
    if (i) await page.waitForTimeout(700);
    await nav(page, "Blocked");
    if (i < 2)
      await page
        .getByRole("button", {
          name: "Credit defensive block to #4 Eibhleann",
          exact: true,
        })
        .click();
    else await nav(page, "Skip / Close");
  }
  expect((await state(page)).events).toHaveLength(3);
  await nav(page, "Match analysis");
  await expect(
    await metric(page, "Home · #4 Eibhleann", "Defensive blocks"),
  ).toHaveText("2");
  for (const [credit, four, nine] of [
    ["4", "3", "0"],
    ["9", "2", "1"],
    ["", "2", "0"],
    ["4", "3", "0"],
  ]) {
    await nav(page, "Edit last event");
    await page.getByLabel("Player number", { exact: false }).fill(credit);
    await page.getByLabel("Block X (0–1)", { exact: true }).fill("0.25");
    await page.getByLabel("Block Y (0–1)", { exact: true }).fill("0.7");
    await nav(page, "Save changes");
    expect((await state(page)).events).toHaveLength(3);
    await expect(
      await metric(page, "Home · #4 Eibhleann", "Defensive blocks"),
    ).toHaveText(four);
    await expect(
      await metric(page, "Home · #9 Nine", "Defensive blocks"),
    ).toHaveText(nine);
    await expect(
      await metric(page, "Home · #4 Eibhleann", "Attempts"),
    ).toHaveText("0");
  }
  await page.locator(".defensive-map > summary").click();
  const map = page.getByRole("img", {
    name: "Defensive block map",
    exact: true,
  });
  await expect(map.locator(".defensive-block-marker")).toHaveCount(1);
  await expect(map.locator(".shot-marker")).toHaveCount(0);
  await nav(page, "Edit last event");
  await page.getByLabel("Block X (0–1)", { exact: true }).fill("");
  await page.getByLabel("Block Y (0–1)", { exact: true }).fill("");
  await nav(page, "Save changes");
  expect((await state(page)).events[2]).toMatchObject({
    shotX: null,
    shotY: null,
  });
  await expect(page.locator(".defensive-block-marker")).toHaveCount(0);
  expect((await state(page)).events).toHaveLength(3);
});

test("empty defensive roster explicitly reports No players loaded, remains valid without credit/location and reloads offline", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.locator("[data-squad-team=opposition]").click();
  await add(page, 3, "Opponent Three");
  await nav(page, "Live match");
  await nav(page, "Blocked");
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByText("No players loaded", { exact: true }),
  ).toBeVisible();
  await expect(modal).not.toContainText("Opponent Three");
  await expect(modal.locator("button[data-defensive-player]")).toHaveCount(15);
  await nav(page, "Skip / Close");
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0]).toMatchObject({
    event: "defensive-block",
    team: "our",
    playerNumber: "",
    shotX: null,
    shotY: null,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  expect((await state(page)).events).toHaveLength(1);
  await nav(page, "Match analysis");
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", {
          name: "Defensive blocks",
          exact: true,
        }),
      })
      .getByRole("cell")
      .first(),
  ).toHaveText("1");
  await expect(page.locator("[data-map-count]")).toHaveText(
    "0 plotted / 0 attempts in this selection.",
  );
});
