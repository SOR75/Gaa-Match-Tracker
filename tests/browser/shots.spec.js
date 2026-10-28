import { test, expect } from "@playwright/test";
import { blankMatch, createEvent } from "../../src/domain.js";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
  await nav(page, "Live match");
}
async function close(page) {
  await nav(page, "Close shot details");
}

test("each first tap saves and recalculates before optional UI; close and Escape never remove shots", async ({
  page,
}) => {
  await setup(page);
  const actions = [
    ["goal", "Goal", 3, "1-0"],
    ["point", "Point", 4, "1-1"],
    ["two-point", "2 Point", 6, "1-3"],
    ["miss", "Miss", 6, "1-3"],
  ];
  for (const [i, [event, label, total, gaelic]] of actions.entries()) {
    await page.locator(`[data-event="${event}"]`).click();
    await expect(page.locator("dialog")).toBeVisible();
    const match = await state(page);
    expect(match.events).toHaveLength(i + 1);
    expect(match.events.at(-1)).toMatchObject({
      event,
      shotOutcome: event,
      shotSource: "open-play",
      scoreValue:
        event === "miss"
          ? 0
          : event === "goal"
            ? 3
            : event === "two-point"
              ? 2
              : 1,
    });
    await expect(page.locator(".score-team.our .score-total")).toHaveText(
      gaelic,
    );
    await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
      `(${total})`,
    );
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe(
      "INPUT",
    );
    if (event === "point") await page.keyboard.press("Escape");
    else await close(page);
    expect((await state(page)).events).toHaveLength(i + 1);
  }
  await nav(page, "Undo last event");
  expect((await state(page)).events).toHaveLength(3);
  await page.reload();
  expect((await state(page)).events).toHaveLength(3);
  await expect(page.locator(".score-team.our .score-total")).toHaveText("1-3");
});

test("free and penalty enrich the existing shot, persist immediately, and appear separately in analysis", async ({
  page,
}) => {
  await setup(page);
  await page.locator("[data-event=point]").click();
  await page.getByLabel("Shot source", { exact: true }).selectOption("free");
  expect((await state(page)).events[0].shotSource).toBe("free");
  await close(page);
  await page.locator("[data-event=goal]").click();
  await page.getByLabel("Shot source", { exact: true }).selectOption("penalty");
  await page.reload();
  expect((await state(page)).events).toHaveLength(2);
  expect((await state(page)).events[1]).toMatchObject({
    event: "goal",
    shotOutcome: "goal",
    shotSource: "penalty",
    scoreValue: 3,
  });
  await expect(page.locator(".score-team.our .score-total")).toHaveText("1-1");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(4)",
  );
  await nav(page, "Edit last event");
  await page.getByLabel("Shot source", { exact: true }).selectOption("45");
  await nav(page, "Save changes");
  expect((await state(page)).events[1].shotSource).toBe("45");
  await page.locator("[data-event=two-point]").click();
  await close(page);
  await nav(page, "Match analysis");
  for (const label of [
    "Scores from free",
    "Scores from 45",
    "Scores from open play",
  ]) {
    const row = page.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: label, exact: true }),
    });
    await expect(row.getByRole("cell").first()).toHaveText("1");
  }
});

test("blocked opposition shot offers our shared roster; own blocked shot needs no opponent", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Squad");
  for (const [number, name, role] of [
    [3, "Defender", "starter"],
    [22, "Bench", "substitute"],
  ]) {
    await page
      .getByLabel("Jersey number", { exact: true })
      .fill(String(number));
    await page.getByLabel("Player name", { exact: true }).fill(name);
    await page.locator("#player-form [name=role]").selectOption(role);
    await nav(page, "Add player");
  }
  await nav(page, "Live match");
  await nav(page, "Away");
  await page.locator("[data-event=miss]").click();
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
  const blockers = page.getByRole("group", { name: "Our blocker" });
  await expect(blockers.getByRole("button")).toHaveCount(1);
  await expect(
    blockers.getByRole("button", {
      name: "Credit block to #22 Bench",
      exact: true,
    }),
  ).toHaveCount(0);
  await blockers
    .getByRole("button", { name: "Credit block to #3 Defender", exact: true })
    .click();
  await close(page);
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0]).toMatchObject({
    team: "opposition",
    event: "miss",
    missReason: "blocked",
    blockedByNumber: "3",
    scoreValue: 0,
  });
  await nav(page, "Match analysis");
  const row = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #3 Defender",
      exact: true,
    }),
  });
  await expect(row.getByRole("cell").nth(13)).toHaveText("1");
  await nav(page, "Live match");
  await nav(page, "Home");
  await page.locator("[data-event=miss]").click();
  await page.getByLabel("Miss reason", { exact: true }).selectOption("blocked");
  await expect(page.getByLabel("Block by", { exact: true })).toBeHidden();
  await close(page);
  expect((await state(page)).events).toHaveLength(2);
  expect((await state(page)).events[1].blockedByNumber).toBe("");
  await nav(page, "Edit last event");
  await page.getByLabel("Miss reason", { exact: true }).selectOption("wide");
  await nav(page, "Save changes");
  expect((await state(page)).events[1].missReason).toBe("wide");
});

test("recording team persists deliberately; editing scored team recalculates without changing recording selection", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Away");
  await expect(page.locator(".recording-team")).toHaveText(
    "Recording for: Away",
  );
  await page.reload();
  await nav(page, "Live match");
  await expect(page.locator("[data-team=opposition]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-event=goal]").click();
  await close(page);
  await nav(page, "Edit last event");
  await page.getByLabel("Team", { exact: true }).selectOption("our");
  await nav(page, "Save changes");
  await expect(page.locator(".score-team.our .score-total")).toHaveText("1-0");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(3)",
  );
  await expect(page.locator(".score-team.opposition .score-total")).toHaveText(
    "0-0",
  );
  await expect(
    page.locator(".score-team.opposition .score-calculated"),
  ).toHaveText("(0)");
  await expect(page.locator(".recording-team")).toHaveText(
    "Recording for: Away",
  );
  await nav(page, "Undo last event");
  await expect(page.locator(".score-team.our .score-total")).toHaveText("0-0");
});

test("V0.3.4 saved shot reads legacy source/reason and survives offline editing with additive fields", async ({
  page,
  context,
}) => {
  const match = blankMatch();
  match.setup.ourTeam = "Home";
  match.setup.opposition = "Away";
  const event = createEvent(match, "miss", "our");
  for (const key of [
    "shotOutcome",
    "shotSource",
    "missReason",
    "blockedByNumber",
  ])
    delete event[key];
  event.outcome = "blocked";
  event.scoreOrigin = "Free";
  match.events = [event];
  await page.goto("/");
  await page.evaluate(
    (match) => localStorage.setItem("sideline.match.v1", JSON.stringify(match)),
    match,
  );
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await nav(page, "Edit last event");
  await expect(page.getByLabel("Shot source", { exact: true })).toHaveValue(
    "free",
  );
  await expect(page.getByLabel("Miss reason", { exact: true })).toHaveValue(
    "blocked",
  );
  await page.getByLabel("Miss reason", { exact: true }).selectOption("");
  await page.getByLabel("Shot source", { exact: true }).selectOption("");
  await nav(page, "Save changes");
  expect((await state(page)).events[0]).toMatchObject({
    id: event.id,
    missReason: "",
    shotSource: "",
    shotOutcome: "miss",
  });
  await page.locator("[data-event=two-point]").click();
  await close(page);
  await page.reload();
  expect((await state(page)).events).toHaveLength(2);
  await expect(page.locator(".score-team.our .score-total")).toHaveText("0-2");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(2)",
  );
});
