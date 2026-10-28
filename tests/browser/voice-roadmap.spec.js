import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("iPad roadmap button has zero voice/microphone execution and preserves paused/running clocks and tap capture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    window.voiceAudit = {
      recognitionRead: 0,
      constructed: 0,
      microphone: 0,
      permission: 0,
    };
    for (const key of ["SpeechRecognition", "webkitSpeechRecognition"])
      Object.defineProperty(window, key, {
        configurable: true,
        get() {
          window.voiceAudit.recognitionRead++;
          return class {
            constructor() {
              window.voiceAudit.constructed++;
              throw Error("Speech must not initialise");
            }
          };
        },
      });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia() {
          window.voiceAudit.microphone++;
          throw Error("Microphone must not initialise");
        },
      },
    });
    for (const key of ["getUserMedia", "webkitGetUserMedia"])
      Object.defineProperty(navigator, key, {
        configurable: true,
        value() {
          window.voiceAudit.microphone++;
          throw Error("Microphone must not initialise");
        },
      });
    const query = navigator.permissions?.query.bind(navigator.permissions);
    if (query)
      navigator.permissions.query = (descriptor) => {
        if (descriptor.name === "microphone") {
          window.voiceAudit.permission++;
          throw Error("Permission must not be requested");
        }
        return query(descriptor);
      };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Harbour");
  await page.getByLabel("Opposition", { exact: true }).fill("Mountain");
  await page
    .getByRole("button", { name: "Continue to squad", exact: true })
    .click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
  const state = () =>
    page.evaluate(() => localStorage.getItem("sideline.match.v1"));
  const paused = await state(),
    clock = await page.locator("[data-clock]").innerText();
  const roadmap = page.getByRole("button", {
    name: "Voice Match Mode — Coming soon",
    exact: true,
  });
  await expect(roadmap).toBeVisible();
  await expect(roadmap).toContainText("COMING SOON");
  await roadmap.click();
  await roadmap.click();
  await expect(page.locator("#toast")).toContainText(
    "Coming in a future Sideline update",
  );
  expect(await state()).toBe(paused);
  await expect(page.locator("[data-clock]")).toHaveText(clock);
  await page.getByRole("button", { name: "Start clock", exact: true }).click();
  const running = await state(),
    start = await page.locator("[data-clock]").innerText();
  await roadmap.click();
  await page.waitForTimeout(1200);
  expect(await state()).toBe(running);
  await expect(page.locator("[data-clock]")).not.toHaveText(start);
  await expect(
    page.locator("#voice-match-panel,[data-vm-listen],[data-vm-confirm]"),
  ).toHaveCount(0);
  await page.locator('[data-event="point"]').click();
  const match = JSON.parse(await state());
  expect(match.events).toHaveLength(1);
  expect(match.events[0].event).toBe("point");
  expect(match.clock).toEqual(JSON.parse(running).clock);
  expect(await page.evaluate(() => window.voiceAudit)).toEqual({
    recognitionRead: 0,
    constructed: 0,
    microphone: 0,
    permission: 0,
  });
  expect(errors).toEqual([]);
  expect(readFileSync("src/main.js", "utf8")).not.toContain("./voice-match.js");
});
