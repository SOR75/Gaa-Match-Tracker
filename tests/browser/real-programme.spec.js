import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const photo = "tests/fixtures/Naomh_Ciaran_U14_Shield_Final.jpg";
const starters = [
  "Clodagh Rigney",
  "Lauren Heavin",
  "Sarah Foley",
  "Anna Kenny",
  "Lara Cullinan",
  "Alyssa Hennessy",
  "Holly Maloney",
  "Moya McManus",
  "Alana Ryan",
  "Ayda Kenny",
  "Hannah Mitchell",
  "Ava Clancy",
  "Ella Shrahan",
  "Meabh Flynn",
  "Saoirse McQuaid",
];
test("original wrinkled programme JPEG recovers XV and twelve subs without document text or cross-row names", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "106919611ccf665504958e5ce190c9696b5945e616bae025162b90299c7db7f8",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.locator("#team-sheet-photo").setInputFiles(photo);
  await expect(
    page.getByRole("heading", { name: "Review & confirm" }),
  ).toBeVisible({ timeout: 95000 });
  const rows = await page
    .locator("[data-review-row]")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        ...Object.fromEntries(
          [...row.querySelectorAll("input,select")].map((n) => [
            n.name,
            n.value,
          ]),
        ),
        review: row.textContent,
      })),
    );
  expect(rows.filter((r) => r.role === "starter").map((r) => r.name)).toEqual(
    starters,
  );
  const subs = rows.filter((r) => r.role === "substitute");
  expect(subs).toHaveLength(12);
  expect(subs.at(-1).name).toBe("Kara Kelly");
  expect(subs.at(-1).number).toBe("27");
  expect(subs[5].name).toMatch(/Brazil/); // Middle folded line must not steal Niamh Egan from the following row.
  expect(rows.every((r) => /Review required/.test(r.review))).toBe(true);
  expect(
    rows.some((r) =>
      /LGFA|Cumann|Venue|Shield|Management|FLO|^Fi$/i.test(r.name),
    ),
  ).toBe(false);
  expect(rows[5].review).toContain("Vice-captain");
  expect(rows[10].review).toContain("Captain");
  expect(
    rows.every((r) => !r.name.includes("(C)") && !r.name.includes("(VC)")),
  ).toBe(true);
  for (const label of [
    "Jersey",
    "Player",
    "Position",
    "Starter/Sub",
    "Confidence",
  ])
    await expect(
      page.locator("dialog th").filter({ hasText: label }).first(),
    ).toBeVisible();
  await testInfo.attach("real-photo-review-rows.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: testInfo.outputPath("real-photo-review.png"),
    fullPage: true,
  });
});
