import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { POSITIONS } from "../../src/import-parser.js";
const starters = [
  "Ciara Ashe",
  "Mae Fahy",
  "Aideen Guy",
  "Sarah Bagnall",
  "Kate McEvoy",
  "Rachel Troy",
  "Kym McGrath",
  "Nicole Troy",
  "Emma Troy",
  "Laura Bagnall",
  "Amy Troy",
  "Paula Dorian",
  "Claudia Durkan",
  "Susan Kealey",
  "Laura Dempsey",
];
const substitutes = [
  "Edel Guy",
  "Justyna Hebda",
  "Abbie Reilly",
  "Cliona Murray",
  "Holly Reilly",
  "Aoife Byrne",
  "Niamh Purcell",
  "Shona Dixon",
  "Lucy-Mai Dunne",
  "Hannah Kealey",
  "Wendy Farrell",
  "Maeve Murray",
  "Eve Killian",
  "Hayley Kennedy",
  "Soricha Coogan",
];
async function importPhoto(page, context, file, hash) {
  expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(
    hash,
  );
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Squad", exact: true }).click();
  await page.locator("#team-sheet-photo").setInputFiles(file);
  await expect(
    page.getByRole("heading", { name: "Review & confirm", exact: true }),
  ).toBeVisible({ timeout: 95000 });
  return await page.locator("[data-review-row]").evaluateAll((rs) =>
    rs.map((r) => ({
      ...Object.fromEntries(
        [...r.querySelectorAll("input,select")].map((e) => [e.name, e.value]),
      ),
      confidence: r.querySelector(".uncertain").textContent,
    })),
  );
}
test("exact Boardsmill graphic routes before generic numbered rows and imports fifteen full starter names plus fifteen complete substitutes offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const rows = await importPhoto(
    page,
    context,
    "tests/fixtures/Boardsmill_Graphical_Formation.jpg",
    "df02f7e3d476834689ec949cd9117566e607f7f3fede3f51d5dc13c4b8ef724f",
  );
  expect(rows).toHaveLength(30);
  expect(rows.map((r) => [r.number, r.name, r.role])).toEqual(
    [...starters, ...substitutes].map((name, i) => [
      String(i + 1),
      name,
      i < 15 ? "starter" : "substitute",
    ]),
  );
  expect(rows.slice(0, 15).map((r) => r.position)).toEqual(POSITIONS);
  expect(new Set(rows.map((r) => r.number)).size).toBe(30);
  await expect(page.locator("dialog")).toContainText(
    "Graphical number/name region",
  );
  await expect(page.locator("dialog")).not.toContainText(
    "Numbered team sheet:",
  );
  await page
    .getByRole("button", { name: "Confirm & add to squad", exact: true })
    .click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sideline.match.v1")),
  );
  expect(saved.players).toHaveLength(30);
  expect(saved.players.find((p) => p.number === 15).notes).toContain(
    "Captain (C)",
  );
  expect(saved.events).toHaveLength(0);
  await testInfo.attach("boardsmill-extracted.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
});
test("exact black handwritten Foireann photo preserves printed extraction and accepts only reliable bounded jerseys offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const rows = await importPhoto(
    page,
    context,
    "tests/fixtures/Foireann_Black_Handwritten_Jerseys.JPG",
    "44fd42e8685c5e2bbf4e0772ec523a194a318b200b5e83a0ab0ac70b19dfa7ef",
  );
  expect(rows).toHaveLength(37);
  expect(rows.map((r) => r.name)).toEqual([
    "Elaine Bracken",
    "Eimear Carroll",
    "Ruth Carroll",
    "Mella Casey",
    "Lucy Champ",
    "Sarah Cleary",
    "Aoife Castello",
    "Eva Donlon",
    "Hannah Doolan",
    "Ella Doolan",
    "Katie Doolan",
    "Emma Dunne",
    "Halle Anh Egan",
    "Noelle Egan",
    "Avril Flynn",
    "Riona No Fhoghlu",
    "Aine Healy",
    "Emily Heavin",
    "Megan Heavin",
    "Emma Kelly H",
    "Amy Lehane",
    "Emily Lynam Carroll",
    "Caoimhe Laigheanain",
    "Aine Macken",
    "Clara Maloney",
    "Anne Marie Mec Cormack",
    "Sophie McDonagh",
    "Saoirse McGuinness",
    "Cliona Molloy",
    "Irene Murphy",
    "Aisling Murphy",
    "Heidi Murray",
    "Therese Robbins",
    "Sheola Rosney",
    "Orla Ross",
    "EABHA MAI TIERNEY",
    "Heather Touhey",
  ]);
  expect(rows.filter((r) => r.number).map((r) => [r.number, r.name])).toEqual([
    ["21", "Ruth Carroll"],
    ["20", "Mella Casey"],
    ["15", "Sarah Cleary"],
    ["4", "Avril Flynn"],
    ["2", "Amy Lehane"],
    ["3", "Anne Marie Mec Cormack"],
    ["5", "Saoirse McGuinness"],
    ["13", "Heidi Murray"],
  ]);
  expect(rows.filter((r) => !r.number)).toHaveLength(29);
  expect(
    rows
      .filter((r) => !r.number)
      .every((r) => r.confidence.includes("jersey blank/uncertain")),
  ).toBe(true);
  expect(
    rows.every((r) => !r.number || (+r.number >= 1 && +r.number <= 99)),
  ).toBe(true);
  expect(
    rows.every(
      (r) => !/[0-9]{5}|Management|Extended panel|Bainiste/i.test(r.name),
    ),
  ).toBe(true);
  expect(rows.find((r) => r.name === "Ruth Carroll").number).toBe("21"); // full multi-digit crop has a reliable read
  expect(rows.find((r) => r.name === "Therese Robbins").number).toBe(""); // low-confidence 18 remains editable
  expect(rows.find((r) => r.name === "Eimear Carroll").number).toBe(""); // blank source field stays blank
  await testInfo.attach("foireann-black-extracted.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });
});
