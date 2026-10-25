import { test, expect } from "@playwright/test";

async function setupMatch(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Test Club");
  await page.getByLabel("Opposition", { exact: true }).fill("Visitors");
  await page.getByRole("button", { name: "Continue to squad" }).click();
}
async function live(page) {
  await page.getByRole("button", { name: "Live match", exact: true }).click();
}
async function recordScore(page, label, player = "") {
  await page.getByRole("button", { name: new RegExp(`^${label} \\+`) }).click();
  if (player) await page.getByLabel("Player number").fill(player);
  await page.getByRole("button", { name: "Record event", exact: true }).click();
}

test("mobile match workflow: squad, scoring, edits, undo, timeline and refresh", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setupMatch(page);
  await page.getByLabel("Jersey number").fill("7");
  await page.getByLabel("Player name").fill("Test Player");
  await page.getByLabel("Position", { exact: true }).fill("Wing back");
  await page.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(page.getByText("Test Player", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Go to live match" }).click();
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await recordScore(page, "Goal", "7");
  await recordScore(page, "Point");
  await recordScore(page, "2 Point");
  await expect(page.locator(".score-team.our .score-total")).toHaveText(
    "6total pts",
  );
  await page.getByRole("button", { name: "Visitors", exact: true }).click();
  await recordScore(page, "Point");
  await expect(page.locator(".score-team.opposition .score-total")).toHaveText(
    "1total pts",
  );
  await page.getByRole("button", { name: "Our Kickout", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit last event", exact: true })
    .click();
  await page.getByLabel("Kickout length").selectOption("Long");
  await page.getByLabel("Outcome", { exact: true }).selectOption("won");
  await page.getByLabel("Notes / dictation").fill("Clean catch");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Clean catch")).toBeVisible();
  await page
    .getByRole("button", { name: "Undo last event", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit last event", exact: true })
    .click();
  await page.getByLabel("Event", { exact: true }).selectOption("goal");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".score-team.opposition .score-total")).toHaveText(
    "3total pts",
  );
  await page.reload();
  await live(page);
  await expect(page.locator(".score-team.our .score-total")).toHaveText(
    "6total pts",
  );
  await expect(page.locator(".score-team.opposition .score-total")).toHaveText(
    "3total pts",
  );
  await expect(
    page.getByRole("button", { name: "Pause clock", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".event-row")).toHaveCount(4);
  await page.getByLabel("Filter team").selectOption("opposition");
  await expect(page.locator(".event-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Undo last event", exact: true })
    .click();
  await expect(page.locator(".event-row")).toHaveCount(0);
  await live(page);
  await expect(page.locator(".score-team.opposition .score-total")).toHaveText(
    "0total pts",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("clock recovers elapsed time, half resets preserve events, and offline reload works", async ({
  page,
  context,
}) => {
  await setupMatch(page);
  await live(page);
  await recordScore(page, "Goal");
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await page.evaluate(() => {
    const match = JSON.parse(localStorage.getItem("sideline.match.v1"));
    match.clock.startedAt = Date.now() - 90000;
    localStorage.setItem("sideline.match.v1", JSON.stringify(match));
  });
  await page.reload();
  await live(page);
  await expect(page.locator("[data-clock]")).toContainText("01:3");
  await page.getByRole("button", { name: "Pause clock" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Start second half" }).click();
  await expect(page.locator("[data-clock]")).toHaveText("00:00");
  await expect(page.locator(".half-label")).toHaveText("SECOND HALF");
  await expect(page.locator(".score-team.our .score-total")).toHaveText(
    "3total pts",
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const key = (await caches.keys()).find((key) =>
          key.startsWith("sideline-"),
        );
        return key
          ? (await (await caches.open(key)).keys()).some((request) =>
              /assets\/index-.*\.js/.test(request.url),
            )
          : false;
      }),
    )
    .toBe(true);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await live(page);
  await expect(page.locator(".score-team.our .score-total")).toHaveText(
    "3total pts",
  );
  await recordScore(page, "2 Point");
  await expect(page.locator(".score-team.our .score-total")).toHaveText(
    "5total pts",
  );
});

test("blank setup and squad stay blank on a fresh browser; iPad and desktop fit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Opposition", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Half length")).toHaveValue("30");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await expect(page.getByText("A blank team sheet.")).toBeVisible();
});
