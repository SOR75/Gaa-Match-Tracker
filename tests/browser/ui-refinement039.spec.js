import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { uiMatch } from "../fixtures/ui-match.js";
const root = process.env.SIDELINE_UI_REVIEW_DIR || "test-results/ui-review";
const state = (p) =>
  p.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (p, n) => p.getByRole("button", { name: n, exact: true }).click();
async function seed(page, view = "Live match") {
  const m = uiMatch();
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    m,
  );
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await nav(page, view);
  return m;
}
const kickoutSection = (p) =>
  p.locator("section.analysis-section").filter({
    has: p.getByRole("heading", { name: "Kickout analysis", exact: true }),
  });
test("populated landscape: core buttons clear footer, strong active team, touch targets, same data and eight review images", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mkdir(root, { recursive: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  const initial = await seed(page);
  expect((await state(page)).events).toEqual(initial.events);
  expect(
    await page
      .locator(".other-events [data-event]")
      .evaluateAll((ns) => ns.map((n) => n.dataset.event)),
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
  const bounds = await page.evaluate(() => {
    const footer = document.querySelector(".actionbar").getBoundingClientRect();
    return [
      ...document.querySelectorAll(
        ".event-controls button,.clock-button,.half-button,.history-actions button",
      ),
    ].map((n) => {
      const r = n.getBoundingClientRect();
      return {
        label: n.textContent.trim(),
        width: r.width,
        height: r.height,
        bottom: r.bottom,
        footer: footer.top,
        inGrid: !!n.closest(".event-controls"),
      };
    });
  });
  for (const b of bounds) {
    expect(b.width, b.label).toBeGreaterThanOrEqual(44);
    expect(b.height, b.label).toBeGreaterThanOrEqual(44);
    if (b.inGrid) expect(b.bottom, b.label).toBeLessThanOrEqual(b.footer);
  }
  const selected = page.locator('.live-team-toggle [aria-pressed="true"]'),
    other = page.locator('.live-team-toggle [aria-pressed="false"]');
  expect(
    await selected.evaluate((n) => getComputedStyle(n).backgroundColor),
  ).not.toBe(await other.evaluate((n) => getComputedStyle(n).backgroundColor));
  await expect(page.locator(".score-team.our .score-total")).toHaveText("4-16");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(28)",
  );
  await page.screenshot({ path: `${root}/01-ipad-live.png` });
  await page.locator('[data-event="point"]').click();
  const d = page.getByRole("dialog");
  await expect(d.locator('[data-shot-player="18"]')).toHaveCount(1);
  await expect(d.locator('[data-shot-player="10"]')).toHaveCount(0);
  await d.locator('[data-shot-player="18"]').click();
  await d
    .getByRole("button", { name: "Shot location pitch", exact: true })
    .click({ position: { x: 100, y: 150 } });
  const pitch = await d.locator(".capture-pitch svg").boundingBox();
  expect(pitch.height).toBeLessThan(400);
  await page.screenshot({ path: `${root}/02-ipad-shot-player.png` });
  await seed(page);
  await page.locator('[data-event="our-kickout"]').click();
  await nav(page, "LONG");
  await page.screenshot({ path: `${root}/03a-ipad-kickout-outcomes.png` });
  await nav(page, "Mark won by us");
  const picks = await d.locator("[data-ko-player]").evaluateAll((ns) =>
    ns.map((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }),
  );
  expect(picks).toHaveLength(15);
  for (const r of picks) {
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(768);
  }
  await page.screenshot({ path: `${root}/03-ipad-kickout-player.png` });
  await seed(page);
  await page.locator('[data-event="pass"]').click();
  await page.locator('[data-pass-from="8"]').click();
  await page.locator('[data-pass-to="11"]').click();
  await expect(
    d.getByRole("button", { name: "Kick Pass", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${root}/04-ipad-pass.png` });
  await seed(page);
  await page.locator('[data-event="substitution"]').click();
  await page.locator('[data-sub-on="19"]').click();
  await page.locator('[data-sub-off="11"]').click();
  await page.screenshot({ path: `${root}/05-ipad-substitution.png` });
  await seed(page, "Match analysis");
  const before = await state(page);
  await page.screenshot({ path: `${root}/06-ipad-analysis.png` });
  await page
    .locator("[data-goalkeepers] .goalkeeper-card")
    .first()
    .screenshot({ path: `${root}/07-ipad-goalkeepers.png` });
  await page
    .locator("[data-goalkeepers] .goalkeeper-card")
    .nth(2)
    .screenshot({ path: `${root}/07b-ipad-reserve-goalkeeper.png` });
  await kickoutSection(page)
    .locator("table")
    .screenshot({ path: `${root}/08-ipad-kickout-analysis.png` });
  expect(await state(page)).toEqual(before);
});
for (const [name, viewport] of [
  ["ipad-portrait", { width: 768, height: 1024 }],
  ["desktop", { width: 1440, height: 1000 }],
  ["phone", { width: 390, height: 844 }],
])
  test(`${name}: readable responsive kickout values, no horizontal clipping, live data unchanged`, async ({
    page,
  }) => {
    await mkdir(root, { recursive: true });
    await page.setViewportSize(viewport);
    await seed(page);
    await page.screenshot({ path: `${root}/09-${name}-live.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const before = await state(page);
    await nav(page, "Match analysis");
    const section = kickoutSection(page);
    const table = section.getByRole("table");
    const values = await table.getByRole("row").all();
    expect(values).toHaveLength(3);
    const expected = [
      [
        "12",
        "7",
        "4",
        "0",
        "63.6%",
        "2",
        "1",
        "4",
        "0 / 4",
        "0%",
        "8",
        "7 / 7",
        "100%",
        "1",
      ],
      [
        "12",
        "7",
        "4",
        "0",
        "36.4%",
        "2",
        "1",
        "4",
        "0 / 4",
        "100%",
        "8",
        "7 / 7",
        "0%",
        "1",
      ],
    ];
    for (let i = 0; i < 2; i++)
      expect(await values[i + 1].getByRole("cell").allTextContents()).toEqual(
        expected[i],
      );
    await expect(table.getByRole("columnheader")).toHaveCount(15);
    const sizes = await table.evaluate((n) => ({
      scroll: n.scrollWidth,
      client: n.clientWidth,
      parent: n.parentElement.clientWidth,
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.parent + 1);
    expect(
      await table.getByRole("cell").first().getAttribute("data-label"),
    ).toBe("Total");
    await table.screenshot({ path: `${root}/10-${name}-kickouts.png` });
    expect(await state(page)).toEqual(before);
  });
