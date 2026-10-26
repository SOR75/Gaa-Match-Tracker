import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const photo = "tests/fixtures/Regression_Team_Sheet_3.jpeg";

test("original Sheet 3 JPEG separates printed reference roster from handwritten XV and preserves unresolved names in editable review", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "2cedf658b54a994d81825ca597d667aa77143e1cddccd0455f1975675c998984",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  // Exercise the real file input, local worker, canvas crops and review UI.
  await page.locator("#team-sheet-photo").setInputFiles(photo);
  await expect(
    page.getByRole("heading", { name: "Review & confirm" }),
  ).toBeVisible({ timeout: 95000 });
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "Printed reference roster and bottom formation detected separately",
  );
  const rows = await page.locator("[data-review-row]").evaluateAll((rows) =>
    rows.map((row) => ({
      ...Object.fromEntries(
        [...row.querySelectorAll("input,select")].map((n) => [n.name, n.value]),
      ),
      review: row.textContent,
    })),
  );
  const starters = rows.filter((r) => r.role === "starter"),
    panel = rows.filter((r) => r.role === "panel");
  expect(starters).toHaveLength(15);
  expect(starters.map((r) => r.number)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
  ]);
  expect(starters.map((r) => r.position)).toEqual([
    "Goalkeeper",
    "Right Corner Back",
    "Full Back",
    "Left Corner Back",
    "Right Half Back",
    "Centre Half Back",
    "Left Half Back",
    "Midfield",
    "Midfield",
    "Right Half Forward",
    "Centre Half Forward",
    "Left Half Forward",
    "Right Corner Forward",
    "Full Forward",
    "Left Corner Forward",
  ]);
  expect(starters[4].name).toBe("Riona Foley");
  expect(starters.filter((r) => r.name)).toHaveLength(1); // A single probable OCR/roster pairing, not a claimed handwritten XV.
  for (const index of [0, 1, 8, 10, 12]) expect(starters[index].name).toBe("");
  expect(starters[1].review).toContain("Megan Heavin / Megan Kelly");
  expect(starters[8].review).toContain("blank or unreadable");
  expect(starters[10].review).toContain("Mella Casey");
  expect(starters[10].review).toContain("Mila Fralkova");
  expect(starters[10].name).not.toBe("Mila Fralkova"); // Mla is not permission to pick the wrong roster player.
  expect(panel).toHaveLength(26);
  expect(panel.every((r) => r.number === "" && r.position === "")).toBe(true);
  expect(rows.filter((r) => r.role === "substitute")).toHaveLength(0);
  const names = rows.map((r) => r.name);
  for (const name of [
    "Kara Daly",
    "Eabha Mai Tierney",
    "Aine Flynn",
    "Ruth Carroll",
    "Marie Cronin",
    "Megan Heavin",
    "Cliona Molloy",
    "Heidi Murray",
    "Sophie McDonagh",
    "Heather Tuohy",
    "Riona Foley",
    "Niamh Treacy",
    "Diana Heavin",
    "Mella Casey",
    "Megan Kelly",
    "Emily Lynam",
    "Muireann Phillips",
    "Lucy McManus",
    "Mila Fralkova",
    "Aoife Cronin",
    "Ellen Lehane",
  ])
    expect(names).toContain(name);
  expect(
    names.some((n) =>
      /Competition|Venue|Date|Referee|Manchan|U16|Older|Younger|Changes|^for$|^Fi$|^Subs/i.test(
        n,
      ),
    ),
  ).toBe(false);
  expect(rows.every((r) => r.review.includes("Review required"))).toBe(true);
  for (const partial of ["Avril", "Faye", "Heidi", "Hallie", "Eibh", "Amy"])
    expect(rows.find((r) => r.name.startsWith(partial))?.review).toMatch(
      /verify|uncertain/i,
    );
  await testInfo.attach("sheet3-real-photo-review.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.screenshot({
    path: testInfo.outputPath("sheet3-review.png"),
    fullPage: true,
  });
  // The existing universal review can correct name, jersey independently of
  // position, role, delete mistakes and add a missing player. No import yet.
  const first = page.locator("[data-review-row]").nth(0);
  await first.locator('[name="name"]').fill("Reviewed player");
  await first.locator('[name="number"]').fill("22");
  await first.locator('[name="position"]').fill("Centre Half Back");
  await first.locator('[name="role"]').selectOption("substitute");
  await expect(first.locator('[name="number"]')).toHaveValue("22");
  await expect(first.locator('[name="position"]')).toHaveValue(
    "Centre Half Back",
  );
  await first.locator("[data-remove-review]").click();
  await expect(page.locator("[data-review-row]")).toHaveCount(rows.length - 1);
  await page.locator("[data-add-review]").click();
  await expect(page.locator("[data-review-row]")).toHaveCount(rows.length);
  await expect(
    page.locator("[data-review-row]").last().locator('[name="number"]'),
  ).toHaveValue("");
});
