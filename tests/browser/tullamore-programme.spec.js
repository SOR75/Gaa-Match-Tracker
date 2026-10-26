import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const photo = "tests/fixtures/Tullamore_U14_Shield_Final.jpg";
test("exact Tullamore JPEG keeps XV separate from subs and rejects a distant clipped staff-name pairing", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "369142c76decc73b76b08325e68cfe873a60921404ad625a4da77524e3f4bea1",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.locator("#team-sheet-photo").setInputFiles(photo);
  await expect(
    page.getByRole("heading", { name: "Review & confirm" }),
  ).toBeVisible({ timeout: 95000 });
  await expect(page.locator("dialog .inline-notice")).not.toContainText(
    "reference roster and bottom formation",
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
    subs = rows.filter((r) => r.role === "substitute");
  expect(starters).toHaveLength(15);
  // Independent visible ground truth: do not certify noisy OCR as correct.
  for (const [i, name] of [
    [0, "Eliza Dolan"],
    [2, "Cassidy Quinn"],
    [3, "Lily Bourke"],
    [6, "Zoe McMahon"],
    [9, "Ava Colbert"],
    [11, "Jessica Martin"],
    [12, "Martha Dolan"],
    [14, "Meabh Martin"],
  ])
    expect(starters[i].name).toBe(name);
  expect(starters[1].name.normalize("NFD").replace(/\p{M}/gu, "")).toBe(
    "Sophie Ni Mairtin",
  );
  expect(starters[7].name.toLowerCase()).toBe("grace connolly");
  expect(starters[12].number).not.toBe("42"); // Baseline clipped-number misread is not promoted as a nonstandard jersey.
  expect(starters[12].number === "" || starters[12].number === "13").toBe(true);
  expect(starters[12].position).toBe("Right Corner Forward");
  expect(subs.length).toBeGreaterThanOrEqual(10);
  expect(subs.find((r) => r.number === "17")?.name).toMatch(/^Kassy /);
  expect(subs.find((r) => r.number === "21")?.name).toBe("Emily Fitzmaurice");
  expect(subs.find((r) => r.number === "22")?.name).toBe("Freya Grennan");
  expect(subs.find((r) => r.number === "27")?.name).toBe("Diya Saneesh");
  expect(subs.find((r) => r.number === "29")?.name).toBe("Penny Kane");
  const last = subs.find((r) => r.number === "30");
  expect(last).toBeTruthy();
  expect(last.name === "" || /Varvara.*[IL]ypnytska/i.test(last.name)).toBe(
    true,
  );
  expect(rows.every((r) => r.review.includes("Review required"))).toBe(true);
  expect(
    rows.some((r) =>
      /Peter Martin|Martin Connolly|Derek Dolan|Georgina|Gemma Bourke|Management|FLO|First Aid|Final Replay|^Fi$/i.test(
        r.name,
      ),
    ),
  ).toBe(false);
  expect(rows.filter((r) => r.role === "panel")).toHaveLength(0);
  await testInfo.attach("tullamore-real-photo-review.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.screenshot({
    path: testInfo.outputPath("tullamore-review.png"),
    fullPage: true,
  });
});
