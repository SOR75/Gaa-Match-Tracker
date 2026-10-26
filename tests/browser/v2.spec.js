import { test, expect } from "@playwright/test";
import { blankMatch, createEvent } from "../../src/domain.js";
import { readFileSync } from "node:fs";

async function start(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await page.getByRole("button", { name: "Continue to squad" }).click();
}
async function addPlayer(page, number, name) {
  await page.getByLabel("Jersey number", { exact: true }).fill(String(number));
  await page.getByLabel("Player name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add player", exact: true }).click();
}
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
async function nav(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function shot(page, type = "Point", player = "") {
  await page.getByRole("button", { name: new RegExp(`^${type} \\+`) }).click();
  await page
    .getByRole("button", { name: "Shot location pitch" })
    .click({ position: { x: 80, y: 110 } });
  if (player) await page.locator(`[data-shot-player="${player}"]`).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

test("quick kickouts capture known outcome and optional length at initial tap time", async ({
  page,
}) => {
  await start(page);
  await nav(page, "Live match");
  await nav(page, "Start clock");
  await nav(page, "Our Kickout");
  await expect(
    page.getByRole("button", { name: "Won by us", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await nav(page, "SHORT");
  await nav(page, "Won by us");
  let match = await state(page);
  expect(match.events).toHaveLength(1);
  expect(match.events[0]).toMatchObject({
    event: "our-kickout",
    team: "our",
    outcome: "won",
    kickoutLength: "Short",
    timeMs: 0,
  });
  await nav(page, "Opposition Kickout");
  await nav(page, "Retained by opposition");
  match = await state(page);
  expect(match.events[1]).toMatchObject({
    team: "opposition",
    outcome: "lost",
    kickoutLength: "",
  });
  await nav(page, "Undo last event");
  expect((await state(page)).events).toHaveLength(1);
  await nav(page, "Edit last event");
  await page.getByLabel("Player number").fill("8");
  await page.getByLabel("Kickout length").selectOption("Long");
  await nav(page, "Save changes");
  expect((await state(page)).events[0]).toMatchObject({
    outcome: "won",
    playerNumber: "8",
    kickoutLength: "Long",
  });
});

test("shots save immediately and optional enrichment retains normalized location and player; edit/undo updates analysis", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await addPlayer(page, 7, "Home Shooter");
  await nav(page, "Live match");
  await shot(page, "Goal", "7");
  let match = await state(page);
  expect(match.events[0]).toMatchObject({
    event: "goal",
    playerNumber: "7",
    outcome: "scored",
    scoreValue: 3,
  });
  expect(match.events[0].shotX).toBeGreaterThan(0);
  expect(match.events[0].shotX).toBeLessThan(1);
  expect(match.events[0].shotY).toBeGreaterThan(0);
  await nav(page, "Away");
  await shot(page, "2 Point");
  await nav(page, "Home");
  await page.getByRole("button", { name: /Wide \/ Miss/ }).click();
  await nav(page, "Done");
  expect((await state(page)).events[2]).toMatchObject({
    outcome: "missed",
    shotX: null,
    shotY: null,
  });
  await nav(page, "Match analysis");
  await expect(page.locator("[data-map-count]")).toHaveText(
    "2 plotted / 3 attempts in this selection.",
  );
  await page.getByLabel("Shot map team").selectOption("our");
  await expect(page.locator("[data-map-count]")).toHaveText(
    "1 plotted / 2 attempts in this selection.",
  );
  await page.getByLabel("Shot map player").selectOption("our:7");
  await expect(page.locator(".shot-marker")).toHaveCount(1);
  await page.getByLabel("Shot map result").selectOption("miss");
  await expect(page.locator(".shot-marker")).toHaveCount(0);
  await page.getByLabel("Shot map result").selectOption("all");
  await nav(page, "Edit last event");
  await page.getByLabel("Shot X (0–1)").fill("0.3");
  await page.getByLabel("Shot Y (0–1)").fill("0.6");
  await nav(page, "Save changes");
  expect((await state(page)).events[2].shotX).toBe(0.3);
  await nav(page, "Undo last event");
  expect((await state(page)).events).toHaveLength(2);
  await nav(page, "Match Report");
  await expect(
    page.getByRole("heading", { name: "Match details", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  const pdf = await page.pdf({
    path: testInfo.outputPath("match-report.pdf"),
    format: "A4",
  });
  expect(pdf.length).toBeGreaterThan(3000);
  await page.emulateMedia({ media: "screen" });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("saved squads load for both teams and library edits leave the match unchanged", async ({
  page,
}) => {
  await start(page);
  await addPlayer(page, 7, "Original Name");
  await nav(page, "Save this squad");
  await page.getByLabel("Squad name", { exact: true }).fill("Offaly U15");
  await nav(page, "Save squad");
  await nav(page, "Saved squads");
  await nav(page, "Edit");
  await page
    .getByLabel("Player name row 1", { exact: true })
    .fill("Library Name");
  await nav(page, "Save library changes");
  await nav(page, "Close squad dialog");
  expect((await state(page)).players[0].name).toBe("Original Name");
  await page.locator('[data-squad-team="opposition"]').click();
  await nav(page, "Saved squads");
  await nav(page, "Load");
  let match = await state(page);
  expect(match.oppositionPlayers[0].name).toBe("Library Name");
  expect(match.players[0].name).toBe("Original Name");
  await nav(page, "Live match");
  await nav(page, "Away");
  await shot(page, "Point", "7");
  expect((await state(page)).events[0].team).toBe("opposition");
});

test("CSV review is editable and rejects existing or within-file duplicate jerseys", async ({
  page,
}) => {
  await start(page);
  await addPlayer(page, 7, "Existing Player");
  await page.locator("#team-sheet-file").setInputFiles({
    name: "squad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Jersey Number,Player Name\n7,Imported Player\n8,Second Player",
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Review & confirm" }),
  ).toBeVisible();
  expect((await state(page)).players).toHaveLength(1);
  await nav(page, "Confirm & add to squad");
  await expect(page.locator("[data-squad-error]")).toContainText(
    "Duplicate jersey #7",
  );
  await page.getByLabel("Jersey number row 1", { exact: true }).fill("9");
  await page
    .getByLabel("Player name row 1", { exact: true })
    .fill("Reviewed Name");
  await nav(page, "Confirm & add to squad");
  expect((await state(page)).players.map((player) => player.number)).toEqual([
    7, 9, 8,
  ]);
  await expect(page.getByText("Reviewed Name", { exact: true })).toBeVisible();
});

function pdfBuffer() {
  const text =
    "BT /F1 18 Tf 50 780 Td (7 PDF Player) Tj 0 -30 Td (8 Another Player) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 850] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test("XLSX, text PDF and photo OCR extract locally with mandatory review", async ({
  page,
}) => {
  test.setTimeout(90000);
  await start(page);
  await page
    .locator("#team-sheet-file")
    .setInputFiles("tests/fixtures/squad.xlsx");
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("Excel Player");
  await nav(page, "Confirm & add to squad");
  await page.locator("#team-sheet-file").setInputFiles({
    name: "sheet.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer(),
  });
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "text layers read directly",
  );
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("PDF Player");
  await nav(page, "Cancel import");
  await page
    .locator("#team-sheet-photo")
    .setInputFiles("tests/fixtures/programme.jpg");
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("Patrick Murphy", { timeout: 60000 });
  await expect(
    page.getByRole("columnheader", { name: "Position", exact: true }),
  ).toBeVisible();
  await nav(page, "Cancel import");
  expect((await state(page)).players.map((player) => player.name)).toEqual([
    "Excel Player",
  ]);
});

test("browser dictation attaches a reviewed transcription to one event; typed fallback works", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        this.onstart();
        this.onresult({
          resultIndex: 0,
          results: [
            Object.assign([{ transcript: "Number seven scores a point." }], {
              isFinal: true,
            }),
          ],
        });
      }
      stop() {
        this.onend();
      }
      abort() {}
    };
  });
  await start(page);
  await nav(page, "Live match");
  await nav(page, "Interception");
  await nav(page, "Add / dictate note to last event");
  await page.getByLabel("Typed notes").fill("Coach observation");
  await nav(page, "Dictate note");
  await expect(page.getByLabel("Dictated note")).toHaveValue(
    "Number seven scores a point.",
  );
  await nav(page, "Stop dictation");
  await nav(page, "Save note");
  let match = await state(page);
  expect(match.events).toHaveLength(1);
  expect(match.events[0]).toMatchObject({
    event: "interception",
    outcome: "won",
    dictatedNote: "Number seven scores a point.",
    notes: "Coach observation",
  });
  expect(match.events[0].scoreValue).toBe(0);
  await page.evaluate(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
  await nav(page, "Add / dictate note to last event");
  await expect(
    page.getByRole("button", { name: "Dictate note", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Browser speech recognition is unavailable/),
  ).toBeVisible();
  await page.getByLabel("Typed notes").fill("Typed fallback");
  await nav(page, "Save note");
  expect((await state(page)).events[0].notes).toBe("Typed fallback");
});

test("legacy V1 is migrated in browser without losing old events or clock and backed up on first V2 save", async ({
  page,
}) => {
  const old = blankMatch();
  old.schemaVersion = 1;
  delete old.oppositionPlayers;
  old.setup.ourTeam = "Legacy Home";
  old.setup.opposition = "Legacy Away";
  old.clock = { half: 2, elapsedMs: 1870000, startedAt: null };
  old.events = Array.from({ length: 85 }, (_, index) => {
    const event = createEvent(old, index % 2 ? "point" : "our-kickout", "our");
    delete event.shotX;
    delete event.shotY;
    delete event.dictatedNote;
    return event;
  });
  const raw = JSON.stringify(old);
  await page.addInitScript((raw) => {
    if (!localStorage.getItem("sideline.match.v1"))
      localStorage.setItem("sideline.match.v1", raw);
  }, raw);
  await page.goto("/");
  await expect(page.locator("[data-clock]")).toHaveText("31:10");
  await expect(page.locator("[data-clock-status]")).toHaveText("Added time");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(42)",
  );
  await nav(page, "Interception");
  const match = await state(page);
  expect(match.schemaVersion).toBe(2);
  expect(match.events).toHaveLength(86);
  expect(
    await page.evaluate(() => localStorage.getItem("sideline.match.v1.backup")),
  ).toBe(raw);
  await nav(page, "Undo last event");
  await page.reload();
  expect((await state(page)).events).toHaveLength(85);
  await nav(page, "Match analysis");
  await expect(page.locator("[data-map-count]")).toHaveText(
    "0 plotted / 42 attempts in this selection.",
  );
});

test("microphone denial keeps notes editable and secure UUID fallback supports LAN development", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    window.SpeechRecognition = class {
      start() {
        this.onerror({ error: "not-allowed" });
      }
      abort() {}
    };
  });
  await start(page);
  await nav(page, "Live match");
  await nav(page, "Possession");
  await nav(page, "Add / dictate note to last event");
  await page.getByLabel("Typed notes").fill("Keep this note");
  await nav(page, "Dictate note");
  await expect(
    page.getByText(/Dictation unavailable \(not-allowed\)/),
  ).toBeVisible();
  await nav(page, "Save note");
  expect((await state(page)).events[0].notes).toBe("Keep this note");
  expect((await state(page)).id).toMatch(/^[a-f0-9-]{36}$/);
});
