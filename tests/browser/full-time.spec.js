import { test, expect } from "@playwright/test";
import { coachingMatch } from "../helpers/coaching-match.js";
import { blankMatch, createEvent } from "../../src/domain.js";
const review =
  process.env.SIDELINE_REVIEW_DIR || "test-results/half-time-review";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
async function load(page, match) {
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    match,
  );
  await page.reload();
}
async function end(page) {
  await page
    .getByRole("button", { name: "END MATCH / FULL TIME", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Full-Time Analysis", exact: true }),
  ).toBeVisible();
}
async function comparisonRow(page, label, expected) {
  const row = page
    .locator(".ht-comparison tr")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
  await expect(row.locator("td")).toHaveText(expected);
}

test("H2 live capture → Full-Time dashboard/comparison → detailed report → correction → offline recalculation", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await load(page, coachingMatch());
  const defensiveButton = await page
    .locator('[data-event="defensive-block"]')
    .boundingBox();
  const historyDock = await page.locator(".actionbar").boundingBox();
  expect(defensiveButton.y + defensiveButton.height).toBeLessThanOrEqual(
    historyDock.y,
  );

  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  await page.locator('[data-event="two-point"]').click();
  await expect(page.getByLabel("Shot source", { exact: true })).toHaveValue(
    "open-play",
  );
  await page.locator('[data-shot-player="6"]').click();
  const capture = page.getByRole("button", {
    name: "Shot location pitch",
    exact: true,
  });
  await capture.click({ position: { x: 90, y: 170 } });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const before = await state(page),
    h1Goal = before.events.find((e) => e.team === "our" && e.event === "goal");
  await end(page);
  const ended = await state(page);
  expect(ended.id).toBe(before.id);
  expect(ended.events).toEqual(before.events);
  expect(ended.clock.startedAt).toBe(null);
  expect(ended.clock.half).toBe(2);
  expect(ended.clock.elapsedMs).toBeGreaterThanOrEqual(before.clock.elapsedMs);
  expect(ended.schemaVersion).toBe(2);
  await expect(page.locator(".coaching-dashboard")).toHaveAttribute(
    "data-analysis-scope",
    "FULL_MATCH",
  );
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("1-06 (9)");
  await expect(page.locator('[data-ht-score="opposition"]')).toHaveText(
    "1-03 (6)",
  );
  await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText("5 / 8");
  await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText(
    "62.5% conversion",
  );
  await expect(page.locator('[data-ht-kpi="our-kickouts"]')).toContainText(
    "50% retained",
  );
  await expect(page.locator('[data-ht-kpi="their-kickouts"]')).toContainText(
    "50% won by us",
  );
  await expect(page.locator(".ht-contributors")).toContainText("3 Blocks");
  await expect(page.locator(".ht-contributors")).toContainText(
    "2 Kickout Marks",
  );
  const map = page.getByRole("img", {
    name: "Full-match shot map",
    exact: true,
  });
  await expect(map.locator(".shot-marker")).toHaveCount(8);
  await expect(map).toContainText("ATTACKS ↑ TOP");
  expect(
    await map
      .locator(".forty-metre-arc")
      .evaluateAll((n) => n.map((p) => p.getAttribute("d"))),
  ).toEqual([
    "M95.122 145A240 240 0 0 0 504.878 145",
    "M95.122 755A240 240 0 0 1 504.878 755",
  ]);
  await expect(page.locator(".ht-comparison")).toBeVisible();
  await comparisonRow(page, "Score · our / opposition", [
    "1-03 (6) / 0-01 (1)",
    "0-03 (3) / 1-02 (5)",
    "1-06 (9) / 1-03 (6)",
  ]);
  await comparisonRow(page, "Shooting", [
    "75% (3/4)",
    "50% (2/4)",
    "62.5% (5/8)",
  ]);
  await comparisonRow(page, "Our KO retained", [
    "66.7% (2/3)",
    "33.3% (1/3)",
    "50% (3/6)",
  ]);
  await comparisonRow(page, "Their KO won by us", [
    "25% (1/4)",
    "75% (3/4)",
    "50% (4/8)",
  ]);
  await comparisonRow(page, "Turnovers · won − lost", ["+2", "-2", "0"]);
  await expect(page.locator("#toast")).toHaveCSS("opacity", "0");
  await page.screenshot({
    path: `${review}/iPad-Landscape-Full-Time.png`,
    fullPage: false,
  });
  await page
    .locator(".ht-comparison")
    .evaluate((node) => node.scrollIntoView({ block: "center" }));
  const comparisonBox = await page.locator(".ht-comparison").boundingBox();
  const footerBox = await page.locator(".actionbar").boundingBox();
  expect(comparisonBox.y + comparisonBox.height).toBeLessThanOrEqual(
    footerBox.y,
  );
  await page
    .locator(".ht-comparison")
    .screenshot({ path: `${review}/Full-Time-H1-vs-H2.png` });
  await page
    .getByRole("button", { name: "VIEW DETAILED MATCH REPORT", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Match report", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".analysis-scores")).toContainText("(9)");
  await expect(page.locator(".inline-notice")).toHaveCount(0);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.locator(`[data-edit-event="${h1Goal.id}"]`).click();
  await page.getByLabel("Event", { exact: true }).selectOption("point");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
  await end(page);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-07 (7)");
  await comparisonRow(page, "Score · our / opposition", [
    "0-04 (4) / 0-01 (1)",
    "0-03 (3) / 1-02 (5)",
    "0-07 (7) / 1-03 (6)",
  ]);
  await page
    .getByRole("button", { name: "Return to Match", exact: true })
    .click();
  await page
    .getByRole("button", { name: "HALF-TIME ANALYSIS", exact: true })
    .click();
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-04 (4)");
  await expect(page.locator(".ht-comparison")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Return to Live Match", exact: true })
    .click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const saved = await state(page);
  await context.setOffline(true);
  await page.reload();
  await end(page);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-07 (7)");
  expect(await state(page)).toEqual(saved);
  await page
    .getByRole("button", { name: "Return to Timeline", exact: true })
    .click();
  await expect(page.locator("[data-edit-event]")).toHaveCount(
    saved.events.length,
  );
  await context.setOffline(false);
});

test("Full-Time with missing locations and unknown kickouts shows neutral evidence and no invented percentages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const m = blankMatch();
  m.setup.ourTeam = "River";
  m.setup.opposition = "Hill";
  m.clock.half = 2;
  m.events = [
    createEvent(m, "point", "our"),
    {
      ...createEvent(m, "opposition-kickout", "opposition"),
      outcome: "unknown",
    },
  ];
  await load(page, m);
  await end(page);
  await expect(page.locator(".ht-observations .ht-neutral")).toBeVisible();
  await expect(page.locator('[data-ht-kpi="their-kickouts"]')).toContainText(
    "— won by us",
  );
  await expect(page.locator(".ht-method")).toContainText("1 unknown");
  await expect(
    page
      .getByRole("img", { name: "Full-match shot map" })
      .locator(".shot-marker"),
  ).toHaveCount(0);
  await comparisonRow(page, "Our KO retained", ["—", "—", "—"]);
  await comparisonRow(page, "Their KO won by us", ["—", "—", "—"]);
  await comparisonRow(page, "Shooting", ["—", "100% (1/1)", "100% (1/1)"]);
  const completed = await state(page);
  expect(completed.lifecycle.status).toBe("completed");
  expect(Number.isFinite(Date.parse(completed.lifecycle.completedAt))).toBe(
    true,
  );
  const { lifecycle, ...payload } = completed;
  expect(payload).toEqual(m);
});
