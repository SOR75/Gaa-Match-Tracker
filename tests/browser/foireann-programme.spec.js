import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const photo = "tests/fixtures/Foireann_Bilingual_Team_Sheet.png";
// Independent expectations from the original photograph, never parser vocabulary.
import { foireannExpected as expected } from "../helpers/foireann-expectations.js";
test("exact Foireann photograph imports English detail names with isolated columns, keeps blank jerseys and warns about the real duplicate offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "cd1493219c7d43c19a09e9958bd0184ead013eca1a8c2d216694b0557dbe06bd",
  );
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await page
    .getByRole("button", { name: "Continue to squad", exact: true })
    .click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
  await page.locator("[data-event=point]").click();
  await page.keyboard.press("Escape");
  const events = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sideline.match.v1")).events,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.locator("#team-sheet-photo").setInputFiles(photo);
  await expect(
    page.getByRole("heading", { name: "Review & confirm" }),
  ).toBeVisible({ timeout: 95000 });
  const rows = await page
    .locator("[data-review-row]")
    .evaluateAll((rs) =>
      rs.map((r) => ({
        ...Object.fromEntries(
          [...r.querySelectorAll("input,select")].map((e) => [e.name, e.value]),
        ),
        confidence: r.querySelector(".uncertain").textContent,
      })),
    );
  expect(rows.map((r) => [r.number, r.name, r.role])).toEqual(expected);
  expect(rows.filter((r) => r.role === "starter")).toHaveLength(15);
  expect(rows.filter((r) => r.role === "substitute")).toHaveLength(8);
  expect(rows.filter((r) => r.role === "panel")).toHaveLength(3);
  expect(
    rows.every(
      (r) =>
        r.confidence.includes("English detail name") &&
        r.confidence.includes("name OCR"),
    ),
  ).toBe(true);
  expect(
    rows
      .filter((r) => r.number === "22")
      .every((r) => r.confidence.includes("duplicate jersey")),
  ).toBe(true);
  expect(
    rows
      .filter((r) => !r.number)
      .every((r) => r.confidence.includes("jersey blank/uncertain")),
  ).toBe(true);
  expect(
    rows.some((r) =>
      /\d|Bainiste|Management|FLO|Shane|Alan Kinahan|Mary Shirley|Deirdre/i.test(
        r.name,
      ),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sideline.match.v1")).players,
    ),
  ).toHaveLength(0);
  await testInfo.attach("foireann-review-rows.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.screenshot({
    path: testInfo.outputPath("foireann-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm & add to squad", exact: true })
    .click();
  await expect(page.locator("[data-squad-error]")).toContainText(/Duplicate/i);
  // Explicit human correction, not an inferred jersey: leave the second 22 blank
  // for later verification and retain that registered player as an unassigned panel row.
  await page.getByLabel("Jersey number row 18", { exact: true }).fill("");
  await page.getByLabel("Role row 18", { exact: true }).selectOption("panel");
  await page
    .getByRole("button", { name: "Confirm & add to squad", exact: true })
    .click();
  await page.reload();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sideline.match.v1")),
  );
  expect(saved.players).toHaveLength(26);
  expect(saved.players.filter((p) => p.number === null)).toHaveLength(4);
  expect(saved.events).toEqual(events);
});
