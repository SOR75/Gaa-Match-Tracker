import { test, expect, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
test.use({
  viewport: { width: 1024, height: 768 },
  deviceScaleFactor: 2,
  hasTouch: true,
  userAgent: devices["iPad (gen 7)"].userAgent,
  serviceWorkers: "block",
});
const photo = "tests/fixtures/Foireann_Black_Handwritten_Jerseys.JPG";
const expected = [
  ["Ruth Carroll", "21"],
  ["Mella Casey", "20"],
  ["Sarah Cleary", "15"],
  ["Avril Flynn", "4"],
  ["Amy Lehane", "2"],
  ["Anne Marie Mec Cormack", "3"],
  ["Saoirse McGuinness", "5"],
  ["Heidi Murray", "13"],
];
for (const core of ["default", "scalar"])
  test(`real production file-input Foireann jersey pass uses original bounded pixels and digit-only OCR (${core} core; iPad-sized Chromium)`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    expect(createHash("sha256").update(readFileSync(photo)).digest("hex")).toBe(
      "44fd42e8685c5e2bbf4e0772ec523a194a318b200b5e83a0ab0ac70b19dfa7ef",
    );
    await page.addInitScript(() => {
      window.originalJerseyCrops = [];
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (
          args[0] instanceof HTMLImageElement &&
          args.length === 9 &&
          this.canvas.width < 300 &&
          this.canvas.height < 300
        )
          window.originalJerseyCrops.push({
            natural: [args[0].naturalWidth, args[0].naturalHeight],
            box: args.slice(1, 5),
            destination: args.slice(5),
            smoothing: this.imageSmoothingEnabled,
          });
        return draw.apply(this, args);
      };
    });
    const whitelists = [],
      worker = readFileSync(
        "node_modules/tesseract.js/dist/worker.min.js",
        "utf8",
      );
    page.on("console", (m) => {
      if (m.text().startsWith("JERSEY_PARAMS:"))
        whitelists.push(JSON.parse(m.text().slice(14)));
    });
    await page.route("**/ocr/worker.min.js", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body:
          `self.addEventListener('message',e=>{if(e.data.action==='setParameters')console.info('JERSEY_PARAMS:'+JSON.stringify(e.data.payload.params))});\n` +
          worker,
      }),
    );
    // Exercise the shipped scalar fallback with the same production UI, pixels
    // and recognition code. This is not a Safari engine simulation.
    if (core === "scalar")
      await page.route("**/ocr/tesseract-core-*.wasm.js", (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: readFileSync(
            "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
          ),
        }),
      );
    await page.goto("/");
    await page.getByRole("button", { name: "Squad", exact: true }).click();
    await page.locator("#team-sheet-photo").setInputFiles(photo);
    await expect(
      page.getByRole("heading", { name: "Review & confirm", exact: true }),
    ).toBeVisible({ timeout: 95000 });
    const rows = await page
      .locator("[data-review-row]")
      .evaluateAll((rs) =>
        rs.map((r) => ({
          ...Object.fromEntries(
            [...r.querySelectorAll("input,select")].map((e) => [
              e.name,
              e.value,
            ]),
          ),
          confidence: r.querySelector(".uncertain").textContent,
        })),
      );
    expect(rows).toHaveLength(37);
    expect(rows.filter((r) => r.number).map((r) => [r.name, r.number])).toEqual(
      expected,
    );
    expect(rows.filter((r) => !r.number)).toHaveLength(29);
    expect(
      rows
        .filter((r) => !r.number)
        .every((r) => r.confidence.includes("jersey blank/uncertain")),
    ).toBe(true);
    const crops = await page.evaluate(() => window.originalJerseyCrops);
    expect(crops.length).toBeGreaterThan(25);
    expect(
      crops.every(
        (c) =>
          c.natural[0] === 1080 &&
          c.natural[1] === 1920 &&
          c.box.every(Number.isInteger) &&
          c.smoothing === false,
      ),
    ).toBe(true);
    expect(crops.some((c) => c.box[0] < 200)).toBe(true);
    expect(crops.some((c) => c.box[0] > 500)).toBe(true);
    expect(
      whitelists.filter((p) => p.tessedit_char_whitelist === "0123456789")
        .length,
    ).toBeGreaterThan(25);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sideline.match.v1") || "null")
            ?.players || [],
      ),
    ).toHaveLength(0);
    await testInfo.attach("foireann-production-jersey-review.json", {
      body: JSON.stringify({ core, rows, crops, whitelists }, null, 2),
      contentType: "application/json",
    });
  });
