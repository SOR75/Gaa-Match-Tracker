import { test, expect } from "@playwright/test";
const names = { our: "Harbour Athletic", opposition: "Mountain Rovers" };
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("sideline.match.v1")));
async function setup(page, teams = names) {
  await page.goto("/");
  await page.getByLabel("Our team", { exact: true }).fill(teams.our);
  await page.getByLabel("Opposition", { exact: true }).fill(teams.opposition);
  await page
    .getByRole("button", { name: "Continue to squad", exact: true })
    .click();
  await page.getByRole("button", { name: "Live match", exact: true }).click();
}
async function active(page, team, teams = names) {
  const button = page.locator(`[data-team="${team}"]`);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button.locator(".live-team-state")).toHaveText("✓ Active team");
  await expect(
    page.locator(`[data-team="${team === "our" ? "opposition" : "our"}"]`),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".recording-team strong")).toHaveText(teams[team]);
  await expect(page.locator(".recording-team")).toBeVisible();
  expect((await state(page)).recordingTeam).toBe(team);
}
function contrast(foreground, background) {
  const luminance = (color) => {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
for (const [device, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["landscape iPad", { width: 1024, height: 768 }],
  ["desktop", { width: 1440, height: 900 }],
]) {
  test(`${device}: one-tap team changes, immediate scoring, editing and reload retain the deliberately selected team`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    // Any native confirmation during this workflow is an acceptance failure.
    const dialogs = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await setup(page);
    await page
      .getByRole("group", { name: "Event team", exact: true })
      .getByRole("button", { name: names.opposition, exact: true })
      .click();
    // One click selects A, and the immediately following event is attributed to A.
    await page
      .getByRole("group", { name: "Event team", exact: true })
      .getByRole("button", { name: names.our, exact: true })
      .click();
    await active(page, "our");
    await page.locator("[data-event=point]").click();
    let m = await state(page);
    expect(m.events).toHaveLength(1);
    expect(m.events[0]).toMatchObject({
      event: "point",
      team: "our",
      scoreValue: 1,
      shotSource: "open-play",
    });
    await expect(page.locator(".score-team.our .score-total")).toHaveText(
      "0-1",
    );
    await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
      "(1)",
    );
    await page.keyboard.press("Escape");
    await active(page, "our");
    // Exactly one click switches to B; no confirmation or additional mode.
    await page
      .getByRole("group", { name: "Event team", exact: true })
      .getByRole("button", { name: names.opposition, exact: true })
      .click();
    await active(page, "opposition");
    await page.locator("[data-event=goal]").click();
    m = await state(page);
    expect(m.events).toHaveLength(2);
    expect(m.events[1]).toMatchObject({
      event: "goal",
      team: "opposition",
      scoreValue: 3,
    });
    await page.keyboard.press("Escape");
    await active(page, "opposition");
    // Use Timeline: the landscape Live layout intentionally hides recent rows.
    // The previous A event must retain A while B stays the recording selection.
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await page.locator(`[data-edit-event="${m.events[0].id}"]`).click();
    await expect(page.getByLabel("Team", { exact: true })).toHaveValue("our");
    await expect(page.locator("dialog .dialog-team")).toContainText(names.our);
    await page.getByLabel("Event", { exact: true }).selectOption("two-point");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    expect((await state(page)).recordingTeam).toBe("opposition");
    await page.getByRole("button", { name: "Live match", exact: true }).click();
    await active(page, "opposition");
    m = await state(page);
    expect(m.events).toHaveLength(2);
    expect(m.events[0]).toMatchObject({
      id: m.events[0].id,
      event: "two-point",
      team: "our",
      scoreValue: 2,
    });
    for (const [team, gaelic, total] of [
      ["our", "0-2", "(2)"],
      ["opposition", "1-0", "(3)"],
    ]) {
      await expect(page.locator(`.score-team.${team} .score-total`)).toHaveText(
        gaelic,
      );
      await expect(
        page.locator(`.score-team.${team} .score-calculated`),
      ).toHaveText(total);
    }
    await page.getByRole("button", { name: "Squad", exact: true }).click();
    await page.getByRole("button", { name: "Live match", exact: true }).click();
    await active(page, "opposition");
    await page.reload();
    await active(page, "opposition");
    await expect(page.locator(".score-team.our .score-total")).toHaveText(
      "0-2",
    );
    await expect(
      page.locator(".score-team.opposition .score-total"),
    ).toHaveText("1-0");
    if (device === "landscape iPad") {
      await page.evaluate(() => window.scrollTo(0, 0));
      const dockTop = await page
        .locator(".actionbar")
        .evaluate((el) => el.getBoundingClientRect().top);
      const block = await page
        .locator('[data-event="defensive-block"]')
        .boundingBox();
      expect(block.y + block.height).toBeLessThanOrEqual(dockTop);
    }
    // Inspect the actual rendered hierarchy, not just a class or stored data.
    const appearance = await page
      .locator(".event-team-picker")
      .evaluate((el) => {
        const selected = el.querySelector('[aria-pressed="true"]'),
          other = el.querySelector('[aria-pressed="false"]');
        return {
          selectedBg: getComputedStyle(selected).backgroundColor,
          selectedColor: getComputedStyle(selected).color,
          otherBg: getComputedStyle(other).backgroundColor,
          bannerBg: getComputedStyle(el.querySelector(".recording-team"))
            .backgroundColor,
          bannerColor: getComputedStyle(el.querySelector(".recording-team"))
            .color,
          fontSize: parseFloat(
            getComputedStyle(el.querySelector(".recording-team strong"))
              .fontSize,
          ),
          height: selected.getBoundingClientRect().height,
          gap:
            document.querySelector(".scoring-grid").getBoundingClientRect()
              .top - el.getBoundingClientRect().bottom,
        };
      });
    expect(appearance.selectedBg).not.toBe(appearance.otherBg);
    expect(
      contrast(appearance.selectedColor, appearance.selectedBg),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(appearance.bannerColor, appearance.bannerBg),
    ).toBeGreaterThanOrEqual(4.5);
    expect(appearance.fontSize).toBeGreaterThanOrEqual(21);
    expect(appearance.height).toBeGreaterThanOrEqual(64);
    expect(appearance.gap).toBeGreaterThanOrEqual(0);
    expect(appearance.gap).toBeLessThan(120);
    expect(dialogs).toEqual([]);
    await page.locator(".event-team-picker").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("active-team.png"),
      fullPage: true,
    });
  });
}
test("every existing fast event preserves selected team, including fixed-team kickouts and defensive block", async ({
  page,
}) => {
  await setup(page);
  await page.locator("[data-team=opposition]").click();
  for (const [index, [type, recordedTeam]] of [
    ["goal", "opposition"],
    ["point", "opposition"],
    ["two-point", "opposition"],
    ["miss", "opposition"],
    ["defensive-block", "our"],
    ["our-kickout", "our"],
    ["opposition-kickout", "opposition"],
    ["turnover-won", "opposition"],
    ["turnover-lost", "opposition"],
    ["interception", "opposition"],
    ["possession", "opposition"],
  ].entries()) {
    await page.locator(`[data-event="${type}"]`).click();
    if (type.includes("kickout"))
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Unknown", exact: true })
        .click();
    const m = await state(page);
    expect(m.events).toHaveLength(index + 1);
    expect(m.events.at(-1)).toMatchObject({ event: type, team: recordedTeam });
    expect(m.recordingTeam).toBe("opposition");
    if (await page.getByRole("dialog").isVisible())
      await page.keyboard.press("Escape");
    await active(page, "opposition");
  }
  await page
    .getByRole("button", { name: "Undo last event", exact: true })
    .click();
  await active(page, "opposition");
  await page.reload();
  await active(page, "opposition");
  await expect(page.locator(".score-team.opposition .score-total")).toHaveText(
    "1-3",
  );
  await expect(
    page.locator(".score-team.opposition .score-calculated"),
  ).toHaveText("(6)");
  await expect(page.locator(".score-team.our .score-calculated")).toHaveText(
    "(0)",
  );
});
test("long setup team names wrap visibly on a narrow phone without shrinking the touch targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const teams = {
    our: "Harbour and District Community Gaelic Football Club",
    opposition: "Mountain and Valley United Gaelic Football Club",
  };
  await setup(page, teams);
  await page.locator("[data-team=opposition]").click();
  await active(page, "opposition", teams);
  for (const team of ["our", "opposition"]) {
    const button = page.locator(`[data-team="${team}"]`);
    await expect(button.locator(".live-team-name")).toHaveText(teams[team]);
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(64);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(
      await button.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
});
