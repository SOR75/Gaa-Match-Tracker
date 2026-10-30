import { test, expect } from "@playwright/test";
import { blankMatch, createEvent } from "../../src/domain.js";
// Independent acceptance specification: never generate expected menus from the UI helper.
const expectedChoices = {
  "our-kickout": [
    { label: "Won by us", outcome: "won", mark: false },
    { label: "Won by opposition", outcome: "lost", mark: false },
    { label: "Mark won by us", outcome: "won", mark: true },
    { label: "Mark won by opposition", outcome: "lost", mark: true },
    { label: "Out of Play / Sideline", outcome: "out-of-play", mark: false },
  ],
  "opposition-kickout": [
    { label: "Won by us", outcome: "won", mark: false },
    { label: "Retained by opposition", outcome: "lost", mark: false },
    { label: "Mark won by us", outcome: "won", mark: true },
    { label: "Mark won by opposition", outcome: "lost", mark: true },
    { label: "Out of Play / Sideline", outcome: "out-of-play", mark: false },
  ],
};
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
async function markCell(row) {
  const headers = await row
    .locator("xpath=ancestor::table")
    .getByRole("columnheader")
    .allTextContents();
  return row.getByRole("cell").nth(headers.indexOf("Kickout Marks") - 1);
}
const nav = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function setup(page) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill("Home");
  await page.getByLabel("Opposition", { exact: true }).fill("Away");
  await nav(page, "Continue to squad");
}
async function add(page, number, name) {
  await page.getByLabel("Jersey number", { exact: true }).fill(String(number));
  await page.getByLabel("Player name", { exact: true }).fill(name);
  await nav(page, "Add player");
}
for (const type of ["our-kickout", "opposition-kickout"])
  for (const choice of expectedChoices[type])
    test(`${type} / ${choice.label}: one result tap, correct our-team outcome`, async ({
      page,
    }) => {
      await setup(page);
      await nav(page, "Live match");
      // Click the real Live Match event control, then inspect its actual dialog.
      await page.locator(`.event-controls [data-event="${type}"]`).click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible();
      await expect(
        modal.getByRole("heading", {
          name: type === "our-kickout" ? "Our Kickout" : "Opposition Kickout",
          exact: true,
        }),
      ).toBeVisible();
      const length = modal.getByRole("group", {
        name: "Optional kickout length",
      });
      await expect(
        length.getByRole("button", { name: "SHORT", exact: true }),
      ).toBeVisible();
      await expect(
        length.getByRole("button", { name: "LONG", exact: true }),
      ).toBeVisible();
      await expect(modal.locator(".kickout-outcomes button")).toHaveText(
        expectedChoices[type].map((c) => c.label),
      );
      await expect(modal.locator(".kickout-outcomes button")).toHaveCount(5);
      for (const c of expectedChoices[type])
        await expect(
          modal.getByRole("button", { name: c.label, exact: true }),
        ).toBeVisible();
      await expect(modal).not.toContainText(
        "Did the kicking team retain the ball?",
      );
      await expect(
        modal.getByRole("button", { name: /^(WON|LOST)$/, exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.activeElement.tagName),
      ).not.toBe("INPUT");
      await nav(page, choice.label);
      const match = await state(page);
      expect(match.events).toHaveLength(1);
      expect(match.events[0]).toMatchObject({
        event: type,
        team: type === "our-kickout" ? "our" : "opposition",
        outcome: choice.outcome,
        mark: choice.mark,
        markPlayerNumber: "",
        kickoutPerspective: "our",
        half: 1,
        timeMs: 0,
      });
      if (choice.outcome !== "out-of-play") {
        await expect(page.locator("[data-ko-saved]")).toBeVisible();
        await page.keyboard.press("Escape");
      }
      await expect(page.locator("dialog")).not.toBeVisible();
      expect((await state(page)).events).toHaveLength(1);
      await page.reload();
      expect((await state(page)).events[0].mark).toBe(choice.mark);
    });

test("Mark on opposition kickout credits our player; editing player/result and undo recalculate reports", async ({
  page,
}) => {
  await setup(page);
  await add(page, 8, "Our Eight");
  await add(page, 9, "Our Nine");
  await nav(page, "Live match");
  await nav(page, "Opposition Kickout");
  await nav(page, "LONG");
  await nav(page, "Mark won by us");
  expect((await state(page)).events).toHaveLength(1);
  await page.locator('[data-mark-player="8"]').click();
  expect((await state(page)).events[0]).toMatchObject({
    team: "opposition",
    mark: true,
    markPlayerNumber: "8",
    kickoutLength: "Long",
  });
  await nav(page, "Match analysis");
  let row = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #8 Our Eight",
      exact: true,
    }),
  });
  await expect(await markCell(row)).toHaveText("1");
  await nav(page, "Edit last event");
  await expect(page.getByLabel("Kickout result", { exact: true })).toHaveValue(
    "mark-won",
  );
  await page.getByLabel("Mark catcher", { exact: true }).selectOption("9");
  await nav(page, "Save changes");
  row = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #9 Our Nine",
      exact: true,
    }),
  });
  await expect(await markCell(row)).toHaveText("1");
  await nav(page, "Edit last event");
  await page
    .getByLabel("Kickout result", { exact: true })
    .selectOption("mark-lost");
  await expect(page.getByLabel("Mark catcher", { exact: true })).toBeHidden();
  await nav(page, "Save changes");
  expect((await state(page)).events[0]).toMatchObject({
    outcome: "lost",
    mark: true,
    markPlayerNumber: "",
  });
  await expect(await markCell(row)).toHaveText("0");
  const kickouts = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Opposition Kickouts · Away",
      exact: true,
    }),
  });
  await expect(kickouts.getByRole("cell").nth(0)).toHaveText("1");
  await expect(kickouts.getByRole("cell").nth(5)).toHaveText("0");
  await expect(kickouts.getByRole("cell").nth(6)).toHaveText("1");
  await nav(page, "Edit last event");
  await page.getByLabel("Kickout result", { exact: true }).selectOption("lost");
  await nav(page, "Save changes");
  expect((await state(page)).events[0].mark).toBe(false);
  await expect(kickouts.getByRole("cell").nth(6)).toHaveText("0");
  await nav(page, "Undo last event");
  await expect(kickouts.getByRole("cell").first()).toHaveText("0");
});

test("legacy opposition retention survives read/edit/reload, and Mark credit persists offline without a new kickout", async ({
  page,
  context,
}) => {
  const match = blankMatch();
  match.setup.ourTeam = "Home";
  match.setup.opposition = "Away";
  match.players = [
    {
      id: "p8",
      number: 8,
      name: "Eight",
      role: "starter",
      notes: "",
      position: "",
    },
  ];
  const event = createEvent(match, "opposition-kickout", "opposition");
  delete event.kickoutPerspective;
  delete event.mark;
  delete event.markPlayerNumber;
  event.outcome = "won";
  match.events = [event];
  await page.goto("/");
  await page.evaluate(
    (m) => localStorage.setItem("sideline.match.v1", JSON.stringify(m)),
    match,
  );
  await page.reload();
  await nav(page, "Match analysis");
  const row = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Opposition Kickouts · Away",
      exact: true,
    }),
  });
  await expect(row.getByRole("cell").nth(1)).toHaveText("0");
  await expect(row.getByRole("cell").nth(2)).toHaveText("1");
  await expect(row.getByRole("cell").nth(4)).toHaveText("100%");
  expect((await state(page)).events[0]).not.toHaveProperty(
    "kickoutPerspective",
  );
  await nav(page, "Edit last event");
  await expect(page.getByLabel("Kickout result", { exact: true })).toHaveValue(
    "lost",
  );
  await nav(page, "Save changes");
  expect((await state(page)).events[0]).toMatchObject({
    outcome: "lost",
    kickoutPerspective: "our",
    mark: false,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await nav(page, "Live match");
  await nav(page, "Our Kickout");
  await nav(page, "Mark won by us");
  await page.locator('[data-mark-player="8"]').click();
  await page.reload();
  expect((await state(page)).events).toHaveLength(2);
  expect((await state(page)).events[1].markPlayerNumber).toBe("8");
});

test("shot source excludes Mark in quick capture and editor while keeping Open Play default", async ({
  page,
}) => {
  await setup(page);
  await nav(page, "Live match");
  await page.locator("[data-event=point]").click();
  await expect(page.getByLabel("Shot source", { exact: true })).toHaveValue(
    "open-play",
  );
  await expect(
    page.getByLabel("Shot source", { exact: true }).locator("option"),
  ).toHaveText(["Not recorded", "Open Play", "Free", "Penalty", "45"]);
  await nav(page, "Close shot details");
  await nav(page, "Edit last event");
  await expect(
    page
      .getByLabel("Shot source", { exact: true })
      .locator('option[value="mark"]'),
  ).toHaveCount(0);
});

test("Our Kickout Mark visibly offers our populated squad and credits one event; editor can change, remove and add credit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await setup(page);
  await add(page, 8, "Our Eight");
  await page.locator('#player-form [name="role"]').selectOption("panel");
  await add(page, 9, "Our Nine");
  await nav(page, "Live match");
  await page.locator('.event-controls [data-event="our-kickout"]').click();
  await nav(page, "Mark won by us");
  const modal = page.getByRole("dialog");
  const picker = modal.getByRole("group", { name: "Our Mark winner" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button")).toHaveCount(1);
  await expect(
    picker.getByRole("button", {
      name: "Credit Mark to #8 Our Eight",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", {
      name: "Credit Mark to #9 Our Nine",
      exact: true,
    }),
  ).toHaveCount(0);
  let match = await state(page);
  expect(match.players).toHaveLength(2);
  expect(match.players.find((p) => p.number === 9).role).toBe("panel");
  expect(match.events).toHaveLength(1);
  const id = match.events[0].id;
  expect(match.events[0].markPlayerNumber).toBe(""); // Saved before optional player selection.
  await picker
    .getByRole("button", { name: "Credit Mark to #8 Our Eight", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  match = await state(page);
  expect(match.events).toHaveLength(1);
  expect(match.events[0]).toMatchObject({
    id,
    event: "our-kickout",
    team: "our",
    outcome: "won",
    mark: true,
    markPlayerNumber: "8",
  });
  await nav(page, "Match analysis");
  const row8 = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #8 Our Eight",
      exact: true,
    }),
  });
  const row9 = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Home · #9 Our Nine",
      exact: true,
    }),
  });
  await expect(await markCell(row8)).toHaveText("1");
  await expect(await markCell(row9)).toHaveText("0");
  for (const [number, eight, nine] of [
    ["9", "0", "1"],
    ["", "0", "0"],
    ["8", "1", "0"],
  ]) {
    await nav(page, "Edit last event");
    await page.getByLabel("Mark catcher", { exact: true }).selectOption(number);
    await nav(page, "Save changes");
    expect((await state(page)).events).toHaveLength(1);
    expect((await state(page)).events[0]).toMatchObject({
      id,
      mark: true,
      markPlayerNumber: number,
    });
    await expect(await markCell(row8)).toHaveText(eight);
    await expect(await markCell(row9)).toHaveText(nine);
  }
  await page.reload();
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0].markPlayerNumber).toBe("8");
});

test("empty OUR squad explicitly says No players loaded, allows skipping and never offers opposition players", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const match = JSON.parse(localStorage.getItem("sideline.match.v1"));
    match.oppositionPlayers = [
      {
        id: "opp8",
        number: 8,
        name: "Opposition Eight",
        role: "starter",
        position: "",
        notes: "",
      },
    ];
    localStorage.setItem("sideline.match.v1", JSON.stringify(match));
  });
  await page.reload();
  await nav(page, "Live match");
  await nav(page, "Our Kickout");
  await nav(page, "Mark won by us");
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByText("No players loaded", { exact: true }),
  ).toBeVisible();
  await expect(modal.locator("[data-mark-player]")).toHaveCount(15);
  await expect(modal).not.toContainText("Opposition Eight");
  await expect(
    modal.getByRole("button", { name: "Close kickout", exact: true }),
  ).toBeVisible();
  expect((await state(page)).events).toHaveLength(1);
  await nav(page, "Close kickout");
  expect((await state(page)).events[0]).toMatchObject({
    mark: true,
    markPlayerNumber: "",
  });
  await nav(page, "Opposition Kickout");
  await nav(page, "Mark won by opposition");
  await expect(page.locator("[data-ko-player]")).toHaveCount(1);
  await nav(page, "Close kickout");
  await expect(modal).not.toBeVisible();
  expect((await state(page)).events).toHaveLength(2);
  expect((await state(page)).events[1]).toMatchObject({
    mark: true,
    outcome: "lost",
    markPlayerNumber: "",
  });
});

test("numberless loaded squad is explained rather than rendered as a blank Mark picker", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const match = JSON.parse(localStorage.getItem("sideline.match.v1"));
    match.players = [
      {
        id: "unnumbered",
        number: null,
        name: "Unnumbered Player",
        role: "starter",
        position: "",
        notes: "",
      },
    ];
    localStorage.setItem("sideline.match.v1", JSON.stringify(match));
  });
  await page.reload();
  await nav(page, "Live match");
  await nav(page, "Our Kickout");
  await nav(page, "Mark won by us");
  await expect(
    page
      .getByRole("dialog")
      .getByText("No numbered players available", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "add jersey numbers in Squad",
  );
  await nav(page, "Close kickout");
  expect((await state(page)).events).toHaveLength(1);
  expect((await state(page)).events[0].markPlayerNumber).toBe("");
});
