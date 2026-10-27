import { test, expect } from "@playwright/test";
async function start(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Squad", exact: true }).click();
}
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));

test("real PNG OCR populates editable candidates offline without any external OCR requests", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90000);
  const external = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith(`${new URL(baseURL).origin}/`) &&
      !request.url().startsWith("blob:") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await start(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await start(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page
    .locator("#team-sheet-photo")
    .setInputFiles("tests/fixtures/programme.png");
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "On-device printed-text OCR completed",
    { timeout: 60000 },
  );
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("Patrick Murphy", { timeout: 60000 });
  const rows = page.locator("[data-review-row]");
  expect(await rows.count()).toBeGreaterThanOrEqual(4);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("sideline.match.v1") || '{"players":[]}',
        ).players,
    ),
  ).toEqual([]);
  await page
    .getByLabel("Position row 1", { exact: true })
    .fill("Centre Half Back");
  await page.getByLabel("Jersey number row 1", { exact: true }).fill("22");
  await page.getByLabel("Role row 1", { exact: true }).selectOption("starter");
  await nav(page, "Remove row 4");
  await nav(page, "Confirm & add to squad");
  expect(
    (await state(page)).players.find((player) => player.number === 22).position,
  ).toBe("Centre Half Back");
  expect(external).toEqual([]);
});

test("scanned PDF really renders and OCRs the printed names rather than returning a blank fallback", async ({
  page,
}) => {
  test.setTimeout(90000);
  await start(page);
  await page
    .locator("#team-sheet-file")
    .setInputFiles("tests/fixtures/scanned-programme.pdf");
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "scanned page(s) OCR processed locally",
    { timeout: 60000 },
  );
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("Patrick Murphy", { timeout: 60000 });
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "scanned page(s) OCR processed locally",
  );
  expect(
    await page.locator("[data-review-row]").count(),
  ).toBeGreaterThanOrEqual(4);
});

test("formation OCR extracts names with blank jerseys and formation positions; blanks persist in saved squads", async ({
  page,
}) => {
  test.setTimeout(90000);
  await start(page);
  await page.getByLabel("Import layout").selectOption("formation");
  await page
    .locator("#team-sheet-photo")
    .setInputFiles("tests/fixtures/formation.png");
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("Alpha Keeper", { timeout: 60000 });
  expect(await page.locator("[data-review-row]").count()).toBe(15);
  const jerseys = await page
    .locator("[data-review-row] [name=number]")
    .evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(jerseys.every((value) => value === "")).toBe(true);
  await expect(page.getByLabel("Position row 6", { exact: true })).toHaveValue(
    "Centre Half Back",
  );
  await nav(page, "Confirm & add to squad");
  expect((await state(page)).players).toHaveLength(15);
  expect(
    (await state(page)).players.every(
      (player) => player.number === null && player.role === "starter",
    ),
  ).toBe(true);
  await nav(page, "Save this squad");
  await page
    .getByLabel("Squad name", { exact: true })
    .fill("Formation Blank Jerseys");
  await nav(page, "Save squad");
  await page.reload();
  await nav(page, "Squad");
  await expect(page.getByText("Alpha Keeper", { exact: true })).toBeVisible();
  await nav(page, "Match setup");
  await page.getByLabel("Our team", { exact: true }).fill("Formation Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Formation Away");
  await nav(page, "Live match");
  await nav(page, "Substitution");
  await expect(page.locator("[data-sub-on], [data-sub-off]")).toHaveCount(0);
});

test("pasted Foireann table applies first Starting marker, preserves unselected panel and exposes all review edits", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Import layout").selectOption("registered");
  await nav(page, "Paste team-sheet text");
  await page
    .getByLabel("Team-sheet text", { exact: true })
    .fill(
      "Jersey\tPlayer Name\tStarting\tStarting 2\tPosition\n8\tSelected Starter\tx\t\tMidfield\n9\tSelected Sub\t\tx\tForward\n\tPanel Member\tx\t\t",
    );
  await nav(page, "Extract & review text");
  await expect(page.getByLabel("Role row 1", { exact: true })).toHaveValue(
    "starter",
  );
  await expect(page.getByLabel("Role row 2", { exact: true })).toHaveValue(
    "substitute",
  );
  await expect(page.getByLabel("Role row 3", { exact: true })).toHaveValue(
    "panel",
  );
  await page
    .getByLabel("Player name row 1", { exact: true })
    .fill("Corrected Starter");
  await page.getByLabel("Jersey number row 2", { exact: true }).fill("");
  await page
    .getByLabel("Position row 2", { exact: true })
    .fill("Left Half Forward");
  await page.getByLabel("Role row 2", { exact: true }).selectOption("starter");
  await nav(page, "Remove row 3");
  await nav(page, "+ Add row");
  await page
    .getByLabel("Player name row 3", { exact: true })
    .fill("Added Player");
  await page.getByLabel("Role row 3", { exact: true }).selectOption("panel");
  await nav(page, "Confirm & add to squad");
  const players = (await state(page)).players;
  expect(players[1]).toMatchObject({
    number: null,
    role: "starter",
    position: "Left Half Forward",
  });
  expect(players[2]).toMatchObject({
    number: null,
    role: "panel",
    name: "Added Player",
  });
});

test("HEIC explicitly reports unsupported conversion instead of claiming OCR success", async ({
  page,
}) => {
  await start(page);
  await page.locator("#team-sheet-photo").setInputFiles({
    name: "iphone.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("HEIC fixture deliberately not decoded"),
  });
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "HEIC/HEIF is not supported",
  );
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("");
});

test("machine-readable registered PDF reads names and first Starting form checkbox directly", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Import layout").selectOption("registered");
  await page
    .locator("#team-sheet-file")
    .setInputFiles("tests/fixtures/registered-panel.pdf");
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "PDF extraction",
  );
  await expect(
    page.getByLabel("Player name row 1", { exact: true }),
  ).toHaveValue("Anna Byrne");
  await expect(
    page.getByLabel("Jersey number row 1", { exact: true }),
  ).toHaveValue("8");
  await expect(page.getByLabel("Role row 1", { exact: true })).toHaveValue(
    "starter",
  );
  await expect(page.getByLabel("Role row 2", { exact: true })).toHaveValue(
    "substitute",
  );
  await expect(page.getByLabel("Role row 3", { exact: true })).toHaveValue(
    "panel",
  );
  await expect(
    page.getByLabel("Jersey number row 3", { exact: true }),
  ).toHaveValue("");
  await expect(page.locator("dialog .inline-notice")).toContainText(
    "no OCR needed for printed text",
  );
});

test("cancelling OCR adds nothing and leaves normal match controls usable", async ({
  page,
}) => {
  await start(page);
  await page
    .locator("#team-sheet-photo")
    .setInputFiles("tests/fixtures/formation.png");
  await page
    .getByRole("button", { name: "Close squad dialog", exact: true })
    .click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await nav(page, "Match setup");
  await page.getByLabel("Our team", { exact: true }).fill("Cancel Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Cancel Away");
  await nav(page, "Live match");
  await nav(page, "Point +1 point");
  expect((await state(page)).players).toEqual([]);
  expect((await state(page)).events).toHaveLength(1);
});
