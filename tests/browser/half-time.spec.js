import { test, expect } from "@playwright/test";
import { blankMatch, createEvent } from "../../src/domain.js";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const review =
  process.env.SIDELINE_REVIEW_DIR || "test-results/half-time-review";
async function live(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Harbour Athletic");
  await page.getByLabel("Opposition", { exact: true }).fill("Mountain Rovers");
  await page
    .getByRole("button", { name: "Continue to squad", exact: true })
    .click();
  for (const [number, name] of [
    [4, "Casey Defender"],
    [6, "Riley Forward"],
  ]) {
    await page
      .getByLabel("Jersey number", { exact: true })
      .fill(String(number));
    await page.getByLabel("Player name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add player", exact: true }).click();
  }
  await page.getByRole("button", { name: "Live match", exact: true }).click();
}
async function shot(page, type, { inside = true, player = "6" } = {}) {
  // Real match shots are separated in time; preserve the existing duplicate-tap guard.
  await page.waitForTimeout(670);
  await page.locator(`[data-event="${type}"]`).click();
  const pitch = page.getByRole("button", {
    name: "Shot location pitch",
    exact: true,
  });
  const box = await pitch.boundingBox();
  await pitch.click({
    position: {
      x:
        box.width *
        ({ goal: 0.35, point: 0.55, "two-point": 0.65, miss: 0.4 }[type] ||
          0.5),
      y: box.height * (inside ? 0.2 : 0.6),
    },
  });
  if (player) await page.locator(`[data-shot-player="${player}"]`).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}
async function open(page) {
  await page
    .getByRole("button", { name: "HALF-TIME ANALYSIS", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Half-Time Analysis", exact: true }),
  ).toBeVisible();
}
async function assertDashboardLayout(page) {
  const boxes = await page.evaluate(() => {
    const box = (selector) => {
      const b = document.querySelector(selector).getBoundingClientRect();
      return {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        bottom: b.bottom,
      };
    };
    return {
      score: box(".ht-score"),
      kpis: [...document.querySelectorAll(".ht-kpi")].map(
        (n) => n.getBoundingClientRect().y,
      ),
      body: box(".ht-body"),
      map: box(".ht-map"),
      observations: box(".ht-observations"),
      contributors: box(".ht-contributors"),
      actions: box(".ht-actions"),
      footer: box(".actionbar"),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  expect(Math.max(...boxes.kpis) - Math.min(...boxes.kpis)).toBeLessThan(2);
  expect(boxes.map.width / boxes.body.width).toBeGreaterThan(0.55);
  expect(boxes.map.width / boxes.body.width).toBeLessThan(0.6);
  expect(Math.abs(boxes.map.y - boxes.observations.y)).toBeLessThan(2);
  expect(boxes.contributors.y).toBeGreaterThanOrEqual(boxes.body.bottom);
  expect(boxes.actions.y).toBeGreaterThanOrEqual(boxes.contributors.bottom);
  expect(boxes.actions.bottom).toBeLessThanOrEqual(boxes.footer.y);
  expect(boxes.pageWidth).toBeLessThanOrEqual(boxes.viewportWidth);
  await expect(
    page.getByRole("button", { name: "START SECOND HALF →", exact: true }),
  ).toBeInViewport({ ratio: 1 });
}
const arcs = [
  "M95.122 145A240 240 0 0 0 504.878 145",
  "M95.122 755A240 240 0 0 1 504.878 755",
];
test("real Live Match H1 capture → coaching summary → correction → H2 leaves H1 unchanged", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1024, height: 768 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await live(page);
  for (const [type, inside] of [
    ["goal", true],
    ["point", true],
    ["two-point", true],
    ["point", true],
    ["miss", false],
    ["miss", false],
    ["miss", false],
    ["point", false],
  ]) {
    await shot(page, type, { inside });
  }
  // Capture opposition H1 scores too: these affect the header but never our shot map.
  await page.locator('[data-team="opposition"]').click();
  await shot(page, "goal", { player: "" });
  await shot(page, "point", { player: "" });
  await page.locator('[data-team="our"]').click();
  const firstShot = (await state(page)).events[0];
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(700);
    await page.locator('[data-event="our-kickout"]').click();
    await page
      .locator(
        `[data-ko-result="${i === 0 ? "mark-won" : i === 4 ? "lost" : "won"}"]`,
      )
      .click();
    if (i === 0) await page.locator('[data-mark-player="4"]').click();
    else await page.keyboard.press("Escape");
    await page.locator('[data-event="opposition-kickout"]').click();
    await page
      .locator(`[data-ko-result="${i === 0 ? "won" : "lost"}"]`)
      .click();
    await page.keyboard.press("Escape");
  }
  for (const type of ["turnover-won", "turnover-lost", "turnover-won"]) {
    await page.locator(`[data-event="${type}"]`).click();
    if (await page.getByRole("dialog").isVisible())
      await page.keyboard.press("Escape");
  }
  const before = await state(page);
  await open(page);
  expect(await state(page)).toEqual(before);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("1-05 (8)");
  await expect(page.locator('[data-ht-score="opposition"]')).toHaveText(
    "1-01 (4)",
  );
  await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText("5 / 8");
  await expect(page.locator('[data-ht-kpi="shooting"]')).toContainText(
    "62.5% conversion",
  );
  await expect(page.locator('[data-ht-kpi="our-kickouts"]')).toContainText(
    "80% retained",
  );
  await expect(page.locator('[data-ht-kpi="their-kickouts"]')).toContainText(
    "20% won by us",
  );
  await expect(page.locator('[data-ht-kpi="turnovers"]')).toContainText(
    "Won 2",
  );
  await expect(page.locator('[data-ht-kpi="turnovers"]')).toContainText(
    "Lost 1",
  );
  await expect(page.locator('[data-ht-zone="inside"]')).toContainText("4 / 4");
  await expect(page.locator('[data-ht-zone="outside"]')).toContainText("1 / 4");
  const map = page.getByRole("img", {
    name: "First-half shot map",
    exact: true,
  });
  await expect(map.locator(".shot-marker")).toHaveCount(8);
  expect(
    await map
      .locator(".forty-metre-arc")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("d"))),
  ).toEqual(arcs);
  await expect(map.locator('[data-marker-kind="miss"]')).toHaveCount(3);
  await expect(page.locator("[data-observation]")).toHaveCount(3);
  await expect(page.locator('[data-observation="working"]')).toContainText(
    "80%",
  );
  await expect(page.locator('[data-observation="watch"]')).toContainText(
    "1 of 5",
  );
  await expect(page.locator('[data-observation="opportunity"]')).toContainText(
    "4/4",
  );
  await expect(page.locator(".ht-contributors")).toContainText(
    "#4 Casey Defender",
  );
  await expect(page.locator(".ht-contributors")).toContainText(
    "1 Kickout Mark",
  );
  // Allow the existing live-event toast to clear before review images.
  await expect(page.locator("#toast")).not.toHaveClass(/visible/);
  await expect(page.locator("#toast")).toHaveCSS("opacity", "0");
  await assertDashboardLayout(page);
  // Actual drawn background, not the possibly letterboxed SVG element bounds.
  const drawnPitch = await map.evaluate((svg) => {
    const r = svg.querySelector("rect").getBoundingClientRect();
    const viewport = svg.getBoundingClientRect();
    const matrix = svg.querySelector("rect").getScreenCTM();
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      viewport: {
        left: viewport.left,
        right: viewport.right,
        top: viewport.top,
        bottom: viewport.bottom,
      },
      scaleX: matrix.a,
      scaleY: matrix.d,
    };
  });
  expect(drawnPitch.height / 240).toBeCloseTo(1.3, 2);
  expect(drawnPitch.width / drawnPitch.height).toBeCloseTo(2 / 3, 5);
  expect(drawnPitch.scaleX).toBeCloseTo(drawnPitch.scaleY, 5);
  expect(drawnPitch.left).toBeGreaterThanOrEqual(
    drawnPitch.viewport.left - 0.1,
  );
  expect(drawnPitch.right).toBeLessThanOrEqual(drawnPitch.viewport.right + 0.1);
  expect(drawnPitch.top).toBeGreaterThanOrEqual(drawnPitch.viewport.top - 0.1);
  expect(drawnPitch.bottom).toBeLessThanOrEqual(
    drawnPitch.viewport.bottom + 0.1,
  );
  await page.screenshot({
    path: `${review}/iPad-Landscape-Half-Time.png`,
    fullPage: false,
  });
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.screenshot({
    path: `${review}/iPad-Pro-Landscape-Half-Time.png`,
    fullPage: false,
  });
  await page
    .locator(".ht-map")
    .screenshot({ path: `${review}/Shared-Pitch-Shot-Map.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `${review}/Desktop-Half-Time.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View Full Stats", exact: true })
    .click();
  await expect(page.locator(".inline-notice")).toContainText("FIRST HALF ONLY");
  await page
    .getByRole("button", { name: "Back to Half-Time Analysis", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to Live Match", exact: true })
    .click();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.locator(`[data-edit-event="${firstShot.id}"]`).click();
  await page.getByLabel("Event", { exact: true }).selectOption("point");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
  await open(page);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-06 (6)");
  const h1Data = await page.locator(".ht-kpis").innerText();
  const h1Events = (await state(page)).events;
  await page
    .getByRole("button", { name: "START SECOND HALF →", exact: true })
    .click();
  expect((await state(page)).clock).toEqual({
    half: 2,
    elapsedMs: 0,
    startedAt: null,
    completedHalves: { 1: 0 },
  });
  expect((await state(page)).id).toBe(before.id);
  expect((await state(page)).events).toEqual(h1Events);
  await shot(page, "goal");
  await page.locator('[data-team="opposition"]').click();
  await shot(page, "two-point", { player: "" });
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(9)",
  );
  await expect(
    page.locator(".score-team.opposition .score-calculated"),
  ).toHaveText("(6)");
  await open(page);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-06 (6)");
  await expect(page.locator('[data-ht-score="opposition"]')).toHaveText(
    "1-01 (4)",
  );
  expect(await page.locator(".ht-kpis").innerText()).toBe(h1Data);
  await expect(
    page
      .getByRole("img", { name: "First-half shot map" })
      .locator(".shot-marker"),
  ).toHaveCount(8);
  await page
    .getByRole("button", { name: "View Full Stats", exact: true })
    .click();
  const summary = page.locator(".analysis-section").filter({
    has: page.getByRole("heading", { name: "Match summary", exact: true }),
  });
  await expect(summary.locator(".analysis-scores")).toContainText("(6)");
  await expect(summary.locator(".analysis-scores")).not.toContainText("(9)");
  expect(errors).toEqual([]);
});

test("small/no-data observations are neutral, compatible saved matches and H1 analysis work offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  // Same schema/fields as V0.3.6, with no migration or analysis snapshot required.
  const saved = blankMatch();
  saved.setup.ourTeam = "Riverside";
  saved.setup.opposition = "Hill United";
  saved.events = [createEvent(saved, "point", "our")];
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    saved,
  );
  await page.reload();
  await open(page);
  await expect(page.locator(".ht-observations .ht-neutral")).toBeVisible();
  await expect(page.locator("[data-observation]")).toHaveCount(0);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-01 (1)");
  await expect(page.locator('[data-ht-zone="inside"]')).toContainText(
    "— conversion",
  );
  await page.screenshot({
    path: `${review}/Small-Data-Half-Time.png`,
    fullPage: true,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const before = await state(page);
  await context.setOffline(true);
  await page.reload();
  await open(page);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-01 (1)");
  await expect(page.locator(".ht-observations .ht-neutral")).toBeVisible();
  expect(await state(page)).toEqual(before);
  await page
    .getByRole("button", { name: "START SECOND HALF →", exact: true })
    .click();
  await page.locator('[data-event="goal"]').click();
  await page.keyboard.press("Escape");
  await open(page);
  await expect(page.locator('[data-ht-score="our"]')).toHaveText("0-01 (1)");
  await context.setOffline(false);
});

test("H1 map respects bottom attack, shares renderer byte-for-byte and never rewrites shot coordinates", async ({
  page,
}) => {
  const saved = blankMatch();
  saved.setup.ourTeam = "East";
  saved.setup.opposition = "West";
  saved.setup.ourFirstHalfAttacks = "bottom";
  saved.events = [
    { ...createEvent(saved, "goal", "our"), shotX: 0.3, shotY: 0.2 },
  ];
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    saved,
  );
  await page.reload();
  await open(page);
  const svg = page.getByRole("img", {
    name: "First-half shot map",
    exact: true,
  });
  await expect(svg).toContainText("ATTACKS ↓ BOTTOM");
  await expect(svg.locator(".shot-marker circle")).toHaveAttribute("cx", "420");
  await expect(svg.locator(".shot-marker circle")).toHaveAttribute("cy", "720");
  expect((await state(page)).events[0]).toMatchObject({
    shotX: 0.3,
    shotY: 0.2,
  });
  // Direct equality uses the actual shared SVG output, not a substitute pitch.
  const { pitchMarkup } = await import("../../src/pitch.js");
  const expected = pitchMarkup(saved.events, false, {
    direction: "bottom",
    teamName: "East",
    mapLabel: "First-half shot map",
  });
  expect(
    await svg.evaluate((n, markup) => {
      const div = document.createElement("div");
      div.innerHTML = markup;
      return n.isEqualNode(div.firstElementChild);
    }, expected),
  ).toBe(true);
});

test("normal landscape iPad keeps full dashboard/actions visible with fifteen horizontal contributors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const saved = blankMatch();
  saved.setup.ourTeam = "Harbour Athletic";
  saved.setup.opposition = "Mountain Rovers";
  saved.players = Array.from({ length: 15 }, (_, i) => ({
    id: `player-${i}`,
    number: i + 1,
    name: `Squad player ${i + 1}`,
    role: "starter",
    position: "",
    notes: "",
  }));
  saved.events = saved.players.map((p) => ({
    ...createEvent(saved, "point", "our"),
    playerNumber: String(p.number),
    shotX: 0.5,
    shotY: 0.2,
  }));
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    saved,
  );
  await page.reload();
  await open(page);
  await assertDashboardLayout(page);
  await expect(page.locator(".ht-contributors li")).toHaveCount(15);
  expect(
    await page
      .locator(".ht-contributors")
      .evaluate((n) => n.getBoundingClientRect().height),
  ).toBeLessThan(80);
  expect(
    await page
      .locator(".ht-contributors ul")
      .evaluate((n) => n.scrollWidth > n.clientWidth),
  ).toBe(true);
  await page.locator(".ht-contributors ul").focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("button", { name: "START SECOND HALF →", exact: true }),
  ).toBeInViewport({ ratio: 1 });
});
