import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const photo = "tests/fixtures/Gaelic_Manager_Team_Sheet.png";
const starters = [
  "Clodagh Keane",
  "Moya Larkin",
  "Sarah Hanniffy",
  "Cara Dolan",
  "Rhea Watts",
  "Olivia Carroll",
  "Eithne Sheahan",
  "Maisie Gohery",
  "Sarah Wynne",
  "Annie Donaghy",
  "Siun Ginty",
  "Sarah Keenaghan",
  "Kacey McGarvey",
  "Amy Keenaghan",
  "Cliona Boyd",
];
const subs = [
  "Shannon Connolly",
  "Laoise Byrne",
  "Larisa Shpuryk",
  "Aimee Grogan Doyle",
  "Maisie Lally",
  "Hannah Roe",
  "Fiadh Clarke",
  "Jessica Farrell",
  "Kayla Daly",
  "Meabh Martin",
  "Deryn Larkin",
  "Tara Woods",
];
test("original Gaelic Manager screenshot imports all 27 numbered names offline, keeping stacked names inside cards and unboxed Subs separate", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "dbd0615d241ba1a196b9be2977ed8295a7c99911b712b784aa6f349d970bc95f",
  );
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await page
    .getByRole("button", { name: "Continue to squad", exact: true })
    .click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
  await page.locator("[data-event=goal]").click();
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
    .evaluateAll((rows) =>
      rows.map((row) => ({
        ...Object.fromEntries(
          [...row.querySelectorAll("input,select")].map((el) => [
            el.name,
            el.value,
          ]),
        ),
        review: row.textContent,
      })),
    );
  expect(rows).toHaveLength(27);
  expect(rows.map((r) => r.number)).toEqual([
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
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
  ]);
  expect(rows.filter((r) => r.role === "starter").map((r) => r.name)).toEqual(
    starters,
  );
  expect(
    rows.filter((r) => r.role === "substitute").map((r) => r.name),
  ).toEqual(subs);
  expect(rows.filter((r) => r.role === "panel")).toHaveLength(0);
  expect(rows[7].position).toBe("Midfield");
  expect(rows[8].position).toBe("Midfield");
  expect(rows[12].position).toBe("Right Corner Forward");
  expect(rows[13].position).toBe("Full Forward");
  expect(rows.every((r) => r.review.includes("Review required"))).toBe(true);
  expect(rows[7].review).toContain("leading jersey zero normalized");
  expect(rows[8].review).toContain("leading jersey zero normalized");
  expect(
    rows.some((r) =>
      /Gaelic Manager|Swipe|Team shown|Vs Clara|^Subs$|Select your/i.test(
        r.name,
      ),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sideline.match.v1")).players,
    ),
  ).toHaveLength(0); // Review does not auto-add.
  await testInfo.attach("gaelic-manager-review-rows.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.locator("[data-review-row]").nth(7).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("gaelic-manager-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm & add to squad", exact: true })
    .click();
  let match = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sideline.match.v1")),
  );
  expect(match.players).toHaveLength(27);
  expect(match.events).toEqual(events);
  expect(match.players.find((p) => p.number === 8)?.name).toBe("Maisie Gohery");
  expect(match.players.find((p) => p.number === 9)?.name).toBe("Sarah Wynne");
  expect(match.players.find((p) => p.number === 13)?.name).toBe(
    "Kacey McGarvey",
  );
  expect(match.players.find((p) => p.number === 14)?.name).toBe(
    "Amy Keenaghan",
  );
  await page.reload();
  match = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sideline.match.v1")),
  );
  expect(match.players).toHaveLength(27);
  expect(match.events).toEqual(events);
  await expect(page.locator(".score-team.our .score-total")).toHaveText("1-0");
});
