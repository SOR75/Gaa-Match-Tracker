import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
test.use({ serviceWorkers: "block" });
// Uses the exact original JPEG and real OCR. Only the normalised full-image
// pass's number tokens are suppressed to reproduce pass-specific anchor loss.
// Source-pass pixels, numbers/names, all regional reads and matching stay real.
test("exact formation photograph selects Assisted Resolution before generic rows when normalised anchors are missed", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1024, height: 768 });
  const photo = "tests/fixtures/Regression_Team_Sheet_3.jpeg";
  expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
    "2cedf658b54a994d81825ca597d667aa77143e1cddccd0455f1975675c998984",
  );
  const worker = readFileSync(
    "node_modules/tesseract.js/dist/worker.min.js",
    "utf8",
  );
  const removed = [];
  page.on("console", (m) => {
    const a = m.text().match(/FORMATION_ANCHORS_SUPPRESSED=(\d+)/);
    if (a) removed.push(+a[1]);
  });
  const install = function () {
    const post = self.postMessage.bind(self);
    let pass = 0;
    self.postMessage = function (packet, ...rest) {
      if (
        packet.action === "recognize" &&
        packet.status === "resolve" &&
        packet.data?.tsv &&
        packet.data.tsv.split("\n").length > 150 &&
        pass < 2
      ) {
        pass++;
        if (pass === 2) {
          let removed = 0;
          packet.data.tsv = packet.data.tsv
            .split("\n")
            .filter((line) => {
              const c = line.split("\t"),
                text = c[11]?.trim() || "";
              const n = +text.replace(/[.)]/g, "");
              if (
                c[0] === "5" &&
                /^\d{1,2}[.)]*$/.test(text) &&
                n >= 1 &&
                n <= 15
              ) {
                removed++;
                return false;
              }
              return true;
            })
            .join("\n");
          console.info("FORMATION_ANCHORS_SUPPRESSED=" + removed);
        }
      }
      return post(packet, ...rest);
    };
  };
  await page.route("**/ocr/worker.min.js", (r) =>
    r.fulfill({
      body: "(" + install.toString() + ")();\n" + worker,
      contentType: "application/javascript",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.locator("#team-sheet-photo").setInputFiles(photo);
  await expect(
    page.getByRole("heading", { name: /Formation Review|Review & confirm/ }),
  ).toBeVisible({ timeout: 95000 });
  await testInfo.attach("actual-import-route.txt", {
    body: await page.locator("dialog").innerText(),
    contentType: "text/plain",
  });
  expect(removed.some((n) => n >= 7)).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Formation Review", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-formation-slot]")).toHaveCount(15);
  await expect(page.locator("[data-review-row]")).toHaveCount(0);
  await expect(page.locator("dialog")).not.toContainText(
    "Numbered team sheet:",
  );
  await expect(
    page.getByRole("button", { name: "CONFIRM TEAM", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sideline.match.v1") || "null")
          ?.players || [],
    ),
  ).toHaveLength(0);
  await page.screenshot({
    path: testInfo.outputPath("formation-priority-ipad.png"),
    fullPage: true,
  });
});
