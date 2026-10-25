import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/naomh-ciaran-synthetic-words.json", import.meta.url),
    "utf8",
  ),
);
test("real OCR of a synthetic programme yields XV + subs, strips captain markers, rejects metadata/staff", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page
    .locator("#team-sheet-photo")
    .setInputFiles("tests/fixtures/naomh-ciaran-synthetic-programme.jpg");
  await expect(
    page.getByRole("heading", { name: "Review & confirm" }),
  ).toBeVisible({ timeout: 60000 });
  const rows = page.locator("[data-review-row]");
  const recovered = await rows.evaluateAll((rows) =>
    rows.map((row) =>
      Object.fromEntries(
        [...row.querySelectorAll("input,select")].map((node) => [
          node.name,
          node.value,
        ]),
      ),
    ),
  );
  expect(recovered.map((p) => p.name)).toEqual([
    ...fixture.expectedNames,
    "Cara Kelly",
    "Eimear Byrne",
  ]);
  expect(recovered.filter((p) => p.role === "starter")).toHaveLength(15);
  expect(recovered.filter((p) => p.role === "substitute")).toHaveLength(2);
  expect(
    recovered.some((p) =>
      /Cumann|LGFA|Westmeath|Management|Venue|Manager|Medical|Business/.test(
        p.name,
      ),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Confirm & add to squad", exact: true })
    .click();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sideline.match.v1")).players,
  );
  expect(stored.find((p) => p.name === "Alyssa Hennessy").notes).toContain(
    "(VC)",
  );
  expect(stored.find((p) => p.name === "Hannah Mitchell").notes).toContain(
    "(C)",
  );
});
