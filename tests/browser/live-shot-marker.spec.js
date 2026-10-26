import { writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function begin(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
  await page.getByLabel("Jersey number", { exact: true }).fill("6");
  await page.getByLabel("Player name", { exact: true }).fill("Isabel");
  await nav(page, "Add player");
  await nav(page, "Live match");
  await page.locator(".event-controls [data-event=miss]").click();
  const events = (await state(page)).events;
  expect(events).toHaveLength(1);
  return events[0].id;
}
async function blockedMarker(page, id) {
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  const pitch = modal.getByRole("button", {
    name: "Shot location pitch",
    exact: true,
  });
  const marker = pitch.locator(`[data-shot-id="${id}"]`);
  await expect(modal.locator(".capture-pitch")).toHaveCount(1);
  await expect(modal.locator(".capture-pitch svg")).toHaveCount(1);
  await expect(
    modal.locator(".capture-pitch canvas, .capture-pitch img"),
  ).toHaveCount(0);
  await expect(pitch.locator("[data-shot-id]")).toHaveCount(1);
  await expect(pitch.locator(".shot-marker")).toHaveCount(1);
  await expect(marker).toHaveClass(/blocked-shot-marker/);
  await expect(marker).toHaveAttribute("data-marker-kind", "blocked-shot");
  await marker.scrollIntoViewIfNeeded();
  await expect(marker).toBeInViewport();
  await expect(marker).toHaveCSS("opacity", "1");
  await expect(marker.locator("rect")).toBeVisible();
  await expect(marker.locator("rect")).toHaveCSS("fill", "rgb(255, 198, 91)");
  await expect(marker.locator("text")).toBeVisible();
  await expect(marker.locator("text")).toHaveText("B");
  await expect(marker.locator("path, line, polyline")).toHaveCount(0);
  await expect(marker.locator("title")).toContainText("Blocked shot");
  await expect(marker.locator("title")).not.toContainText("Wide");
  await expect(pitch.locator('[data-marker-kind="miss"]')).toHaveCount(0);
  const visual = await pitch.evaluate((svg) => {
    const marker = svg.querySelector("[data-shot-id]");
    const rect = marker?.querySelector("rect")?.getBoundingClientRect();
    const hit = rect
      ? document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        )
      : null;
    return {
      outerHTML: svg.outerHTML,
      reason: document.querySelector('dialog[open] [name="missReason"]')?.value,
      player: document.querySelector('dialog[open] [name="playerNumber"]')
        ?.value,
      layers: [...svg.querySelectorAll("[data-shot-id]")].map((n) => ({
        class: n.getAttribute("class"),
        html: n.outerHTML,
      })),
      topMarkerId: hit?.closest("[data-shot-id]")?.getAttribute("data-shot-id"),
      redOrCrossPaths: [...svg.querySelectorAll("path,line,polyline")]
        .filter(
          (n) =>
            getComputedStyle(n).stroke === "rgb(255, 176, 163)" ||
            /l20 20m-20 0l20-20/.test(n.getAttribute("d") || ""),
        )
        .map((n) => n.outerHTML),
      pseudoLayers: [svg, svg.parentElement, marker]
        .filter(Boolean)
        .flatMap((n) =>
          ["::before", "::after"].map((p) => ({
            tag: n.tagName,
            pseudo: p,
            content: getComputedStyle(n, p).content,
          })),
        ),
    };
  });
  expect(visual.reason).toBe("blocked");
  expect(visual.redOrCrossPaths).toEqual([]);
  expect(visual.topMarkerId).toBe(id);
  const info = test.info();
  if (!info.attachments.some((a) => a.name === "actual-live-capture.png")) {
    const png = info.outputPath("actual-live-capture.png");
    await pitch.screenshot({ path: png });
    const dom = info.outputPath("actual-live-capture-dom.json");
    writeFileSync(dom, JSON.stringify(visual, null, 2));
    await info.attach("actual-live-capture.png", {
      path: png,
      contentType: "image/png",
    });
    await info.attach("actual-live-capture-dom.json", {
      path: dom,
      contentType: "application/json",
    });
  }
}
async function verifySaved(page, id, location) {
  const events = (await state(page)).events;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    id,
    event: "miss",
    team: "our",
    playerNumber: "6",
    missReason: "blocked",
    shotSource: "open-play",
    shotX: location.shotX,
    shotY: location.shotY,
  });
  await nav(page, "Skip / Close");
  await nav(page, "Timeline");
  await expect(page.locator(".event-row")).toHaveCount(1);
  await expect(page.locator(".event-row")).toContainText("Shot · Blocked");
  await expect(page.locator(".event-row")).not.toContainText("Wide / Miss");
  await nav(page, "Match analysis");
  const table = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Player shooting & event analysis",
      exact: true,
    }),
  });
  const headers = await table.getByRole("columnheader").allTextContents();
  const row = table.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #6 Isabel",
      exact: true,
    }),
  });
  for (const [label, value] of [
    ["Attempts", "1"],
    ["Blocked attempts", "1"],
    ["Wides", "0"],
  ])
    await expect(
      row.getByRole("cell").nth(headers.indexOf(label) - 1),
    ).toHaveText(value);
}
for (const order of ["location-before-reason", "reason-before-location"])
  test(`visible Live Match capture marker: ${order}, including player tap`, async ({
    page,
  }) => {
    const id = await begin(page);
    const modal = page.getByRole("dialog");
    const pitch = modal.getByRole("button", {
      name: "Shot location pitch",
      exact: true,
    });
    if (order === "location-before-reason") {
      await pitch.click({ position: { x: 80, y: 110 } });
      await expect(
        pitch.locator('[data-marker-kind="miss"] path'),
      ).toBeVisible();
      const location = (await state(page)).events[0];
      await modal
        .getByLabel("Miss reason", { exact: true })
        .selectOption("blocked");
      await blockedMarker(page, id);
      await modal.locator('[data-shot-player="6"]').click();
      await blockedMarker(page, id);
      await verifySaved(page, id, location);
    } else {
      await modal
        .getByLabel("Miss reason", { exact: true })
        .selectOption("blocked");
      await modal.locator('[data-shot-player="6"]').click();
      await expect(modal.locator('[name="playerNumber"]')).toHaveValue("6");
      await pitch.click({ position: { x: 80, y: 110 } });
      await blockedMarker(page, id);
      const location = (await state(page)).events[0];
      await modal
        .getByLabel("Miss reason", { exact: true })
        .selectOption("wide");
      await expect(
        pitch.locator('[data-marker-kind="miss"] path'),
      ).toBeVisible();
      await expect(
        pitch.locator('[data-marker-kind="blocked-shot"]'),
      ).toHaveCount(0);
      await modal
        .getByLabel("Miss reason", { exact: true })
        .selectOption("blocked");
      await blockedMarker(page, id);
      await verifySaved(page, id, location);
    }
  });
test("capture reflects the selected reason on input before change, then player and location taps retain Blocked", async ({
  page,
}) => {
  const id = await begin(page);
  const modal = page.getByRole("dialog");
  const pitch = modal.getByRole("button", {
    name: "Shot location pitch",
    exact: true,
  });
  await pitch.click({ position: { x: 80, y: 110 } });
  const location = (await state(page)).events[0];
  // Exercise the native-control state boundary: selected value and input arrive
  // before change/blur. No renderer or persisted event is mocked here.
  await modal.getByLabel("Miss reason", { exact: true }).evaluate((select) => {
    select.value = "blocked";
    select.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(modal.getByLabel("Miss reason", { exact: true })).toHaveValue(
    "blocked",
  );
  await blockedMarker(page, id);
  await modal.locator('[data-shot-player="6"]').click();
  await blockedMarker(page, id);
  await pitch.click({ position: { x: 80, y: 110 } });
  await blockedMarker(page, id);
  await verifySaved(page, id, location);
});

test("player/location save reads a pending selected Blocked value even before control events", async ({
  page,
}) => {
  const id = await begin(page);
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Miss reason", { exact: true }).evaluate((select) => {
    select.value = "blocked";
  });
  await modal.locator('[data-shot-player="6"]').click();
  await expect(
    modal.getByRole("heading", {
      name: "Shot · Blocked · optional details",
      exact: true,
    }),
  ).toBeVisible();
  await modal
    .getByRole("button", { name: "Shot location pitch", exact: true })
    .click({ position: { x: 80, y: 110 } });
  await blockedMarker(page, id);
  await verifySaved(page, id, (await state(page)).events[0]);
});
