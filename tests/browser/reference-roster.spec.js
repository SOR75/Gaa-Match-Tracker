import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const photo = "tests/fixtures/Regression_Team_Sheet_3.jpeg";
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const pick = (page, name) =>
  page.locator("[data-formation-pick]").filter({
    has: page
      .locator("strong")
      .filter({ hasText: new RegExp("^" + name + "$") }),
  });
async function select(page, number, name) {
  await page.locator(`[data-formation-open="${number}"]`).click();
  await pick(page, name).click();
}

test("real Sheet 3 photo → assisted fifteen-position review → roster selections/corrections → one confirmed team", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "2cedf658b54a994d81825ca597d667aa77143e1cddccd0455f1975675c998984",
  );
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await page
    .getByRole("button", { name: "Continue to squad", exact: true })
    .click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
  await page.locator('[data-event="point"]').click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  const before = await state(page);
  await page.locator("#team-sheet-photo").setInputFiles(photo);
  await expect(
    page.getByRole("heading", { name: "Formation Review", exact: true }),
  ).toBeVisible({ timeout: 95000 });
  await expect(page.locator("[data-formation-slot]")).toHaveCount(15);
  expect(await page.locator(".formation-number").allTextContents()).toEqual(
    Array.from({ length: 15 }, (_, i) => String(i + 1)),
  );
  await expect(page.locator('[data-formation-open="5"]')).toHaveText(
    "Riona Foley",
  );
  await expect(page.locator(".formation-slot.assigned")).toHaveCount(1);
  await expect(page.locator("[data-formation-confirm]")).toBeDisabled();
  await page.locator("[data-formation-confirm]").evaluate((b) => b.click());
  expect((await state(page)).players).toEqual(before.players);
  await expect(page.locator('[data-formation-slot="2"]')).toContainText(
    "Megan Heavin",
  );
  await expect(page.locator('[data-formation-slot="2"]')).toContainText(
    "Megan Kelly",
  );
  await expect(page.locator('[data-formation-slot="11"]')).toContainText(
    "Mella Casey",
  );
  await expect(page.locator('[data-formation-slot="11"]')).toContainText(
    "Mila Fralkova",
  );
  await expect(page.locator('[data-formation-open="9"]')).toHaveText(
    "Select player",
  );
  await expect(page.locator('[data-formation-slot="15"]')).toBeInViewport({
    ratio: 1,
  });
  await page.locator(".formation-review").screenshot({
    path: testInfo.outputPath("assisted-formation-initial.png"),
  });
  await page.screenshot({
    path: testInfo.outputPath("assisted-formation-ipad.png"),
    fullPage: false,
  });
  // Automatic assignment stays editable; changing and clearing release the player.
  await select(page, 5, "Kara Daly");
  await page.locator('[data-formation-open="6"]').click();
  await expect(pick(page, "Kara Daly")).toBeDisabled();
  await expect(pick(page, "Kara Daly")).toContainText("Assigned to #5");
  await page.screenshot({
    path: testInfo.outputPath("assisted-picker-ipad.png"),
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "← Back to formation", exact: true })
    .click();
  await page.locator('[data-formation-open="5"]').click();
  await page
    .getByRole("button", { name: "Clear assignment", exact: true })
    .click();
  await select(page, 6, "Kara Daly");
  await select(page, 5, "Riona Foley");
  await select(page, 1, "Cliona Molloy");
  // Ambiguous candidates have direct one-tap choices, not arbitrary auto-selection.
  await page
    .locator('[data-formation-slot="2"] [data-formation-suggest]')
    .filter({ hasText: "Megan Heavin" })
    .click();
  // The coach explicitly corrects damaged printed OCR, not the application.
  for (const [number, prefix, corrected] of [
    [3, "Avril", "Avril Flynn"],
    [4, "Eibh", "Eibhleann Lynam"],
  ]) {
    await page.locator(`[data-formation-open="${number}"]`).click();
    const choice = page.locator(".formation-player-choice").filter({
      has: page
        .locator("[data-formation-pick] strong")
        .filter({ hasText: new RegExp("^" + prefix) }),
    });
    await choice
      .getByRole("button", { name: "Edit printed name", exact: true })
      .click();
    await page
      .getByLabel("Correct printed full name", { exact: true })
      .fill(corrected);
    await page
      .getByRole("button", { name: "Save printed name", exact: true })
      .click();
    await pick(page, corrected).click();
  }
  for (const [number, name] of [
    [7, "Ruth Carroll"],
    [8, "Eabha Mai Tierney"],
    [9, "Emily Lynam"],
    [10, "Marie Cronin"],
    [11, "Mella Casey"],
    [12, "Aine Flynn"],
    [13, "Heidi Murray"],
    [14, "Sophie McDonagh"],
    [15, "Aoife Cronin"],
  ])
    await select(page, number, name);
  await expect(page.locator(".formation-slot.assigned")).toHaveCount(15);
  await expect(page.locator("[data-formation-confirm]")).toBeEnabled();
  expect((await state(page)).players).toEqual(before.players);
  await page.locator(".formation-review").screenshot({
    path: testInfo.outputPath("assisted-formation-complete.png"),
  });
  await page.getByRole("button", { name: "CONFIRM TEAM", exact: true }).click();
  const saved = await state(page);
  expect(saved.players).toHaveLength(27);
  expect(saved.players.filter((p) => p.role === "starter")).toHaveLength(15);
  expect(saved.players.filter((p) => p.role === "substitute")).toHaveLength(12);
  expect(
    saved.players.filter((p) => p.role === "starter").map((p) => p.number),
  ).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  expect(
    saved.players
      .filter((p) => p.role === "substitute")
      .every((p) => p.number === null),
  ).toBe(true);
  expect(new Set(saved.players.map((p) => p.name)).size).toBe(27);
  expect(saved.events).toEqual(before.events);
  expect(saved.players.find((p) => p.number === 3).name).toBe("Avril Flynn");
  expect(saved.players.find((p) => p.number === 4).name).toBe(
    "Eibhleann Lynam",
  );
  await page.reload();
  expect((await state(page)).players).toEqual(saved.players);
  await testInfo.attach("coach-confirmed-formation.json", {
    body: JSON.stringify(saved.players, null, 2),
    contentType: "application/json",
  });
});
