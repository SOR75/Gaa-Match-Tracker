import { test, expect } from "@playwright/test";
async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await page.getByRole("button", { name: "Continue to squad" }).click();
}
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function add(page, number, name, role = "starter") {
  await page.getByLabel("Jersey number", { exact: true }).fill(String(number));
  await page.getByLabel("Player name", { exact: true }).fill(name);
  await page.locator("#player-form [name=role]").selectOption(role);
  await nav(page, "Add player");
}

test("iPad landscape tap panel fits, scores save immediately, rapid double taps do not duplicate, undo persists", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setup(page);
  await nav(page, "Live match");
  for (const name of [
    "Goal +3 points",
    "Point +1 point",
    "2 Point +2 points",
    "Substitution",
    "Undo last event",
    "Edit last event",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeInViewport();
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(48);
  }
  await page.locator("[data-event=point]").dblclick({ delay: 40 });
  await expect(page.locator("dialog")).toBeVisible();
  await nav(page, "Close shot details");
  expect((await state(page)).events).toHaveLength(1);
  await page.locator("[data-event=two-point]").dblclick({ delay: 40 });
  expect((await state(page)).events).toHaveLength(2);
  await nav(page, "Close shot details");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(3)",
  );
  await expect(page.locator(".score-save-status")).toContainText(
    "Saved on this device",
  );
  await nav(page, "Undo last event");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(1)",
  );
  await page.reload();
  expect((await state(page)).events).toHaveLength(1);
  await page.locator(".shot-enrich").scrollIntoViewIfNeeded();
  await expect(page.locator(".scoreboard")).toBeInViewport();
});

test("lineup toggles retain squad; manual substitutions store on/off/time and edit/undo restore on-field players", async ({
  page,
}) => {
  await setup(page);
  await add(page, 6, "Six");
  await add(page, 22, "Twenty Two", "substitute");
  await nav(page, "Make starter Twenty Two");
  expect((await state(page)).players).toHaveLength(2);
  expect((await state(page)).players[1].role).toBe("starter");
  await nav(page, "Make substitute Twenty Two");
  await nav(page, "Live match");
  await nav(page, "Substitution");
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe(
    "INPUT",
  );
  await nav(page, "Player on 22");
  await nav(page, "Player off 6");
  await nav(page, "Record substitution");
  expect((await state(page)).events[0]).toMatchObject({
    event: "substitution",
    playerOn: "22",
    playerOff: "6",
    half: 1,
    timeMs: 0,
  });
  await nav(page, "Squad");
  await expect(
    page.locator("[data-lineup-player]").filter({ hasText: "on field" }),
  ).toContainText("Substitute");
  await nav(page, "Edit last event");
  await page.getByLabel("Player on (substitution)").fill("23");
  await nav(page, "Save changes");
  expect((await state(page)).events[0].playerOn).toBe("23");
  await nav(page, "Undo last event");
  await expect(
    page.locator("[data-lineup-player]").filter({ hasText: "on field" }),
  ).toContainText("Starter");
});

test("voice proposes but never silently scores; uncertain/multiple events are rejected and substitutions confirm", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        this.onresult({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: "Goal number eleven" }], {
              isFinal: true,
            }),
          ],
        });
      }
      abort() {}
    };
  });
  await setup(page);
  await nav(page, "Live match");
  await page.locator("[data-action=voice-mode]").click();
  await nav(page, "Start voice capture");
  await expect(page.locator(".voice-preview")).toContainText("Goal");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(0)",
  );
  await nav(page, "Confirm & record event");
  expect((await state(page)).events).toHaveLength(1);
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(3)",
  );
  await page.getByText("Type / review commentary", { exact: true }).click();
  await page.getByLabel("Commentary", { exact: true }).fill("maybe a point");
  await nav(page, "Interpret text");
  await expect(page.locator("[data-vm-confirm]")).toHaveCount(0);
  expect((await state(page)).events).toHaveLength(1);
  await page.getByLabel("Commentary", { exact: true }).fill("22 for 6");
  await nav(page, "Interpret text");
  await nav(page, "Confirm & record event");
  expect((await state(page)).events[1]).toMatchObject({
    event: "substitution",
    playerOn: "22",
    playerOff: "6",
  });
  await nav(page, "Point +1 point");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(4)",
  );
});

test("first-half direction and half/team reversals transform display without mutating normalized locations", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Match setup");
  await page.getByLabel("Our first-half attacking goal").selectOption("bottom");
  await nav(page, "Live match");
  await nav(page, "Point +1 point");
  await expect(page.locator("dialog")).toContainText(
    "Home attacks the BOTTOM goal",
  );
  const pitch = page.getByRole("button", { name: "Shot location pitch" });
  const box = await pitch.boundingBox();
  await pitch.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await nav(page, "Done");
  const old = (await state(page)).events[0];
  expect(old.shotX).toBeCloseTo(0.75, 2);
  expect(old.shotY).toBeCloseTo(0.7, 2);
  page.once("dialog", (dialog) => dialog.accept());
  await nav(page, "Start second half");
  await nav(page, "2 Point +2 points");
  await expect(page.locator("dialog")).toContainText(
    "Home attacks the TOP goal",
  );
  await nav(page, "Close shot details");
  expect((await state(page)).events[0].shotX).toBe(old.shotX);
  expect((await state(page)).events[0].shotY).toBe(old.shotY);
  expect((await state(page)).events).toHaveLength(2);
});

test("dictated notes autosave to the event being edited even if editor is closed without Save", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        this.onstart();
        this.onresult({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: "Saved directly to this goal." }], {
              isFinal: true,
            }),
          ],
        });
      }
      abort() {}
      stop() {
        this.onend();
      }
    };
  });
  await setup(page);
  await nav(page, "Live match");
  await nav(page, "Goal +3 points");
  await nav(page, "Close shot details");
  await nav(page, "Edit last event");
  await nav(page, "Dictate note");
  expect((await state(page)).events[0].dictatedNote).toBe(
    "Saved directly to this goal.",
  );
  await nav(page, "Cancel event");
  await page.reload();
  expect((await state(page)).events[0].dictatedNote).toBe(
    "Saved directly to this goal.",
  );
  await nav(page, "Add / dictate note to last event");
  await nav(page, "Dictate note");
  expect((await state(page)).events[0].dictatedNote).toContain(
    "Saved directly to this goal.",
  );
});

test("offline tap mode survives speech network failure and new blank match preserves old snapshot", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        this.onerror({ error: "network" });
      }
      abort() {}
    };
  });
  await setup(page);
  await nav(page, "Live match");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await nav(page, "Live match");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.locator("[data-action=voice-mode]").click();
  await nav(page, "Start voice capture");
  await expect(page.locator("#voice-match-panel")).toContainText(
    "Voice capture failed (network)",
  );
  await nav(page, "2 Point +2 points");
  await page.reload();
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(2)",
  );
  const old = await state(page);
  await nav(page, "Match setup");
  page.once("dialog", (dialog) => dialog.accept());
  await nav(page, "Start a new blank match");
  const blank = await state(page);
  expect(blank.setup.ourTeam).toBe("");
  expect(blank.setup.opposition).toBe("");
  expect(blank.players).toEqual([]);
  expect(blank.oppositionPlayers).toEqual([]);
  expect(blank.events).toEqual([]);
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem(`sideline.match.archive.${id}`)).events
          .length,
      old.id,
    ),
  ).toBe(1);
});

test("low-confidence speech requires transcript review and new capture clears previous unconfirmed proposals", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        this.onresult({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: "Goal number 11", confidence: 0.2 }], {
              isFinal: true,
            }),
          ],
        });
      }
      abort() {}
    };
  });
  await setup(page);
  await nav(page, "Live match");
  await page.locator("[data-action=voice-mode]").click();
  await nav(page, "Start voice capture");
  await expect(page.locator("#voice-match-panel")).toContainText(
    "Low recognition confidence",
  );
  await expect(page.locator("[data-vm-confirm]")).toHaveCount(0);
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(0)",
  );
  await nav(page, "Interpret text");
  await expect(page.locator("[data-vm-confirm]")).toHaveCount(1);
  await nav(page, "Start voice capture");
  await expect(page.locator("[data-vm-confirm]")).toHaveCount(0);
  await nav(page, "Point +1 point");
  expect((await state(page)).events).toHaveLength(1);
});
