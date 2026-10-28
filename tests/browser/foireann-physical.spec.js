import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { foireannExpected } from "../helpers/foireann-expectations.js";

test.use({ serviceWorkers: "block" });

// Real image + real OCR and crop re-reads. Only whole-page DOB tokens are hidden
// to reproduce the routing precondition: names, digits and boxes are not mocked.
test("physical-test PNG keeps every visible jersey/name pair when whole-page DOB OCR is unavailable", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const worker = readFileSync(
    "node_modules/tesseract.js/dist/worker.min.js",
    "utf8",
  );
  const removedDates = [];
  page.on("console", (message) => {
    const match = message.text().match(/FOIREANN_DOB_REMOVED=(\d+)/);
    if (match) removedDates.push(Number(match[1]));
  });
  const install = function () {
    const post = self.postMessage.bind(self);
    self.postMessage = function (packet, ...rest) {
      if (
        packet.action === "recognize" &&
        packet.status === "resolve" &&
        packet.data?.tsv &&
        packet.data.tsv.split("\n").length > 150
      ) {
        let removed = 0;
        packet.data.tsv = packet.data.tsv
          .split("\n")
          .filter((line) => {
            const c = line.split("\t");
            if (
              c[0] === "5" &&
              /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(c[11]?.trim() || "")
            ) {
              removed++;
              return false;
            }
            return true;
          })
          .join("\n");
        console.info("FOIREANN_DOB_REMOVED=" + removed);
      }
      return post(packet, ...rest);
    };
  };
  let routed = 0;
  await page.route("**/ocr/worker.min.js", (route) => {
    routed++;
    return route.fulfill({
      body: "(" + install.toString() + ")();\n" + worker,
      contentType: "application/javascript",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page
    .locator("#team-sheet-photo")
    .setInputFiles("tests/fixtures/Foireann_Bilingual_Team_Sheet.png");
  await expect(
    page.getByRole("heading", { name: "Review & confirm", exact: true }),
  ).toBeVisible({ timeout: 95000 });
  const rows = await page.locator("[data-review-row]").evaluateAll((rs) =>
    rs.map((r) => ({
      ...Object.fromEntries(
        [...r.querySelectorAll("input,select")].map((e) => [e.name, e.value]),
      ),
      confidence: r.querySelector(".uncertain").textContent,
    })),
  );
  await testInfo.attach("physical-photo-metadata-loss-review.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
  expect(routed).toBeGreaterThan(0);
  expect(removedDates.some((n) => n >= 6)).toBe(true);
  expect(rows.map((r) => [r.number, r.name, r.role])).toEqual(foireannExpected);
  expect(rows.filter((r) => r.number).length).toBe(23);
  expect(rows.some((r) => /^(Ma|Evans)$/.test(r.name))).toBe(false);
  expect(rows.filter((r) => r.number).every((r) => r.role !== "panel")).toBe(
    true,
  );
  expect(
    rows
      .filter((r) => r.number === "22")
      .every((r) => r.confidence.includes("duplicate jersey")),
  ).toBe(true);
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.screenshot({
    path: testInfo.outputPath("foireann-physical-review.png"),
    fullPage: true,
  });
});
