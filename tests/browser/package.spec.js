import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const legacyMessage = "Photo OCR is not available " + "in this build";
test("V0.3.7-dev identity and JPEG/PNG runtime path are in this exact package", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const metadata = await (await request.get("/build-info.json")).json();
  expect(metadata.buildId).toBe("0.3.7-dev");
  expect(metadata.version).toBe("0.3.7-dev");
  const source = readFileSync("src/imports.js", "utf8");
  expect(source).not.toContain(legacyMessage);
  expect(source).toContain("recognizeImage");
  expect(readFileSync("src/ocr.js", "utf8")).toContain("createWorker");
  await page.goto("/");
  await expect(page).toHaveTitle("Sideline V0.3.7-dev");
  await expect(page.locator(".topbar .build-tag")).toHaveText("V0.3.7-dev");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  for (const file of [
    "tests/fixtures/programme.jpg",
    "tests/fixtures/programme.png",
  ]) {
    await page.locator("#team-sheet-photo").setInputFiles(file);
    await expect(
      page.getByRole("heading", { name: "Review & confirm" }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByLabel("Player name row 1", { exact: true }),
    ).toHaveValue("Patrick Murphy");
    expect(
      await page.locator("[data-review-row]").count(),
    ).toBeGreaterThanOrEqual(4);
    await expect(page.locator("dialog")).not.toContainText(legacyMessage);
    await expect(page.locator("dialog .inline-notice")).toContainText(
      "On-device printed-text OCR completed",
    );
    await page
      .getByRole("button", { name: "Cancel import", exact: true })
      .click();
  }
});
