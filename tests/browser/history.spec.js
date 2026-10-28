import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { blankMatch, createEvent } from "../../src/domain.js";
const legacy = JSON.parse(
  readFileSync("tests/fixtures/History_V037_Archive.json", "utf8"),
);
const archiveKey = (id) => "sideline.match.archive." + id;
function activeMatch() {
  const m = blankMatch();
  m.id = "active-match";
  m.setup.ourTeam = "Current";
  m.setup.opposition = "Visitors";
  m.events = [createEvent(m, "point", "our")];
  return m;
}
async function seed(page, archives = [legacy], active = activeMatch()) {
  await page.goto("/");
  await page.evaluate(
    ({ archives, active }) => {
      localStorage.setItem("sideline.match.v1", JSON.stringify(active));
      localStorage.setItem(
        "sideline.squads.v1",
        JSON.stringify({ version: 1, squads: [] }),
      );
      for (const m of archives)
        localStorage.setItem(
          "sideline.match.archive." + m.id,
          JSON.stringify(m),
        );
    },
    { archives, active },
  );
  await page.reload();
  return active;
}
const activeRaw = (page) =>
  page.evaluate(() => localStorage.getItem("sideline.match.v1"));
async function openHistory(page) {
  await page
    .getByRole("button", { name: "Match History", exact: true })
    .click();
  await expect(page.getByText("Loading saved matches…")).toHaveCount(0);
}
const card = (page, id = legacy.id) =>
  page.locator(`[data-history-id="${id}"]`);
async function dbRows(page) {
  return await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("sideline.history", 1);
        r.onsuccess = () => {
          const q = r.result
            .transaction("matches", "readonly")
            .objectStore("matches")
            .getAll();
          q.onsuccess = () => {
            resolve(q.result);
            r.result.close();
          };
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
}
async function manage(page, id = legacy.id) {
  await card(page, id).locator("summary").click();
}

test("V0.3.7 archive upgrades into read-only History with correct analysis, timeline, coordinates and unchanged active match offline", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await seed(page);
  const before = await activeRaw(page),
    raw = JSON.stringify(legacy);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await openHistory(page);
  await expect(card(page)).toContainText("(6)");
  await expect(card(page)).toContainText("(4)");
  await expect(card(page)).toContainText("Archived");
  await expect(card(page)).toContainText("Result not final");
  await page.screenshot({
    path: info.outputPath("history-ipad-landscape.png"),
    fullPage: true,
  });
  await card(page)
    .getByRole("button", { name: "VIEW MATCH", exact: true })
    .click();
  await expect(page.locator(".history-readonly")).toContainText("READ-ONLY");
  await expect(page.locator(".history-readonly")).toContainText("12:00");
  await expect(page.locator("[data-ht-score=our]")).toHaveText("1-03 (6)");
  await expect(page.locator("[data-ht-score=opposition]")).toHaveText(
    "1-01 (4)",
  );
  const marker = page
    .getByRole("img", { name: "Full-match shot map" })
    .locator('[data-shot-id="legacy-event-1"]');
  await expect(marker.locator("circle").first()).toHaveAttribute("cx", "150");
  await expect(marker.locator("circle").first()).toHaveAttribute("cy", "270");
  const blocked = page
    .getByRole("img", { name: "Full-match shot map" })
    .locator('[data-shot-id="legacy-event-6"]');
  await expect(blocked.locator("rect")).toHaveAttribute("x", "346");
  await expect(blocked.locator("rect")).toHaveAttribute("y", "526");
  await expect(page.locator("[data-edit-event]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo last event", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /START SECOND HALF/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Half-Time Analysis", exact: true })
    .click();
  await expect(page.locator("[data-ht-score=our]")).toHaveText("1-01 (4)");
  await expect(page.locator("[data-ht-score=opposition]")).toHaveText(
    "1-00 (3)",
  );
  await page
    .getByRole("button", { name: "Timeline", exact: true })
    .last()
    .click();
  await expect(page.locator(".timeline-card .event-row")).toHaveCount(10);
  await expect(page.locator(".timeline-card")).toContainText("Shot · Blocked");
  await expect(page.locator(".timeline-card")).toContainText("Rory Midfield");
  await page
    .getByRole("button", {
      name: "Player stats / shot maps / kickouts",
      exact: true,
    })
    .click();
  await expect(page.locator(".analysis-view")).toContainText("Kickout");
  await expect(page.locator(".analysis-view")).toContainText("Nora Defender");
  await expect(page.locator(".analysis-view")).toContainText("Rory Midfield");
  await page
    .getByRole("button", { name: "Match Report", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Print / Save as PDF", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (window.print = () => (window.didPrint = true)));
  await page
    .getByRole("button", { name: "Print / Save as PDF", exact: true })
    .click();
  expect(await page.evaluate(() => window.didPrint)).toBe(true);
  expect(await activeRaw(page)).toBe(before);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), archiveKey(legacy.id)),
  ).toBe(raw);
  await page.reload();
  await openHistory(page);
  await expect(card(page)).toBeVisible();
  expect(await activeRaw(page)).toBe(before);
});

test("legacy copy is idempotent, sorts newest first, retains undated/corrupt sources and supports team search", async ({
  page,
}) => {
  const newer = structuredClone(legacy);
  newer.id = "newer";
  newer.setup.date = "2026-10-20";
  const unknown = structuredClone(legacy);
  unknown.id = "undated";
  unknown.setup.date = "";
  unknown.events = [];
  await seed(page, [legacy, newer, unknown]);
  await page.evaluate(() =>
    localStorage.setItem("sideline.match.archive.corrupt", "not-json"),
  );
  await openHistory(page);
  await expect(page.locator("[data-history-id]")).toHaveCount(4);
  expect(
    await page
      .locator("[data-history-id]")
      .evaluateAll((es) => es.map((e) => e.dataset.historyId)),
  ).toEqual(["active-match", "newer", legacy.id, "undated"]);
  await expect(page.locator(".history-view aside[role=status]")).toContainText(
    "corrupt",
  );
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(page.locator("[data-history-id]")).toHaveCount(4);
  expect((await dbRows(page)).filter((r) => !r.deleted)).toHaveLength(3);
  await page.getByLabel("Search teams / opposition").fill("valley");
  await expect(page.locator("[data-history-id]")).toHaveCount(3);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("sideline.match.archive.corrupt"),
    ),
  ).toBe("not-json");
});

test("Resume is deliberate, archives active first and restores the historical clock paused", async ({
  page,
}) => {
  const active = await seed(page),
    before = await activeRaw(page);
  await openHistory(page);
  await manage(page);
  page.once("dialog", (d) => d.dismiss());
  await card(page).getByRole("button", { name: "RESUME MATCH" }).click();
  expect(await activeRaw(page)).toBe(before);
  page.once("dialog", (d) => d.accept());
  await card(page).getByRole("button", { name: "RESUME MATCH" }).click();
  await expect(page.locator(".recording-team")).toContainText("Harbour");
  const resumed = JSON.parse(await activeRaw(page));
  expect(resumed.id).toBe(legacy.id);
  expect(resumed.clock.startedAt).toBe(null);
  expect(resumed.clock.elapsedMs).toBe(720000);
  expect(resumed.events).toEqual(legacy.events);
  const archive = (await dbRows(page)).find((r) => r.id === active.id);
  expect(archive.match.events).toEqual(active.events);
  expect(archive.match.setup).toEqual(active.setup);
});

test("Delete requires confirmation and removes only one archive and its legacy copy across reload", async ({
  page,
}) => {
  const other = structuredClone(legacy);
  other.id = "other";
  await seed(page, [legacy, other]);
  const before = await activeRaw(page);
  await openHistory(page);
  await manage(page);
  page.once("dialog", (d) => d.dismiss());
  await card(page).getByRole("button", { name: "DELETE MATCH" }).click();
  await expect(card(page)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await card(page).getByRole("button", { name: "DELETE MATCH" }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(card(page, "other")).toBeVisible();
  expect(await activeRaw(page)).toBe(before);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), archiveKey(legacy.id)),
  ).toBe(null);
  expect(
    await page.evaluate(() => localStorage.getItem("sideline.squads.v1")),
  ).toBe('{"version":1,"squads":[]}');
  await page.reload();
  await openHistory(page);
  await expect(card(page)).toHaveCount(0);
  await expect(card(page, "other")).toBeVisible();
  expect((await dbRows(page)).find((r) => r.id === legacy.id).deleted).toBe(
    true,
  );
});

test("End Match persists completion metadata, history result and completed matches remain read-only", async ({
  page,
}) => {
  const active = activeMatch();
  active.clock.half = 2;
  await seed(page, [], active);
  await page
    .getByRole("button", { name: "END MATCH / FULL TIME", exact: true })
    .click();
  const ended = JSON.parse(await activeRaw(page));
  expect(ended.lifecycle.status).toBe("completed");
  expect(Number.isFinite(Date.parse(ended.lifecycle.completedAt))).toBe(true);
  expect(ended.events).toEqual(active.events);
  await page
    .getByRole("button", { name: "Return to Match", exact: true })
    .click();
  await page.getByRole("button", { name: "Match setup", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Start a new blank match", exact: true })
    .click();
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
  await openHistory(page);
  await expect(card(page, active.id)).toContainText("Completed");
  await expect(card(page, active.id)).toContainText("WIN +1");
  await manage(page, active.id);
  await expect(
    card(page, active.id).getByRole("button", { name: "RESUME MATCH" }),
  ).toHaveCount(0);
  await page.reload();
  await openHistory(page);
  await expect(card(page, active.id)).toContainText("Completed");
});

test("failed archive write in both stores prevents New Match and preserves every current byte", async ({
  page,
}) => {
  await seed(page);
  const before = await activeRaw(page);
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw Error("History unavailable");
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("sideline.match.archive."))
        throw Error("Archive quota exceeded");
      return set.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Match setup", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Start a new blank match", exact: true })
    .click();
  await expect(page.locator("#storage-warning")).toContainText(
    "Archive quota exceeded",
  );
  expect(await activeRaw(page)).toBe(before);
});

test("IndexedDB outage allows non-destructive legacy discovery and fail-safe local archiving", async ({
  page,
}) => {
  await seed(page);
  const before = JSON.stringify(legacy);
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw Error("History unavailable");
    };
  });
  await openHistory(page);
  await expect(card(page)).toBeVisible();
  await expect(page.locator(".history-view aside[role=status]")).toContainText(
    "History unavailable",
  );
  expect(
    await page.evaluate((k) => localStorage.getItem(k), archiveKey(legacy.id)),
  ).toBe(before);
  await page.getByRole("button", { name: "Match setup", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Start a new blank match", exact: true })
    .click();
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sideline.match.archive.active-match"))
          .events.length,
    ),
  ).toBe(1);
});

test("failed legacy copy is recoverable and repeat-safe without editing original records", async ({
  page,
}) => {
  await seed(page);
  const before = await activeRaw(page);
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...rest) {
      if (value.origin === "legacy") throw Error("Copy failed");
      return window.originalPut.call(this, value, ...rest);
    };
  });
  await openHistory(page);
  await expect(card(page)).toBeVisible();
  await expect(page.locator(".history-view aside[role=status]")).toContainText(
    "Copy failed",
  );
  expect(await activeRaw(page)).toBe(before);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), archiveKey(legacy.id)),
  ).toBe(JSON.stringify(legacy));
  await page.evaluate(
    () => (IDBObjectStore.prototype.put = window.originalPut),
  );
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  expect((await dbRows(page)).filter((r) => !r.deleted)).toHaveLength(1);
  expect(await activeRaw(page)).toBe(before);
});

test("active-save failure after successful archive retains both the active match and durable history copy", async ({
  page,
}) => {
  const current = await seed(page),
    before = await activeRaw(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "sideline.match.v1") throw Error("Active store full");
      return set.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Match setup", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Start a new blank match", exact: true })
    .click();
  await expect(page.locator("#storage-warning")).toContainText(
    "Autosave failed",
  );
  expect(await activeRaw(page)).toBe(before);
  expect(
    (await dbRows(page)).find((r) => r.id === current.id).match.events,
  ).toEqual(current.events);
});

test("viewing History never pauses a genuinely running active match or changes recording team", async ({
  page,
}) => {
  const m = activeMatch();
  m.clock.startedAt = Date.now() - 60000;
  m.recordingTeam = "opposition";
  await seed(page, [legacy], m);
  const before = await activeRaw(page);
  await openHistory(page);
  await card(page).getByRole("button", { name: "VIEW MATCH" }).click();
  expect(await activeRaw(page)).toBe(before);
  await page
    .getByRole("button", { name: "Return to current match", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause clock", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-team=opposition]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await activeRaw(page)).toBe(before);
});

test("phone empty state and navigation fit without a new squad or match", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openHistory(page);
  await expect(
    page.getByRole("heading", { name: "No matches in History yet" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back to Match Setup" }).click();
  await expect(page.getByLabel("Our team", { exact: true })).toHaveValue("");
});

test("schema-1 archives migrate only in the repository copy and preserve their exact original bytes", async ({
  page,
}) => {
  const v1 = structuredClone(legacy);
  v1.id = "schema-one";
  v1.schemaVersion = 1;
  delete v1.oppositionPlayers;
  for (const e of v1.events) {
    delete e.shotX;
    delete e.shotY;
    delete e.dictatedNote;
  }
  await seed(page, [v1]);
  await openHistory(page);
  await expect(card(page, v1.id)).toContainText("(6)");
  const copied = (await dbRows(page)).find((r) => r.id === v1.id);
  expect(copied.match.schemaVersion).toBe(2);
  expect(
    copied.match.events.every((e) => e.shotX === null && e.dictatedNote === ""),
  ).toBe(true);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), archiveKey(v1.id)),
  ).toBe(JSON.stringify(v1));
});

test("failed deletion cannot erase the current match or the recoverable legacy copy", async ({
  page,
}) => {
  await seed(page);
  const before = await activeRaw(page);
  await openHistory(page);
  await manage(page);
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k) {
      if (k.startsWith("sideline.match.archive."))
        throw Error("Cannot remove source");
      return remove.call(this, k);
    };
  });
  page.once("dialog", (d) => d.accept());
  await card(page).getByRole("button", { name: "DELETE MATCH" }).click();
  await expect(page.locator(".history-view [role=alert]")).toContainText(
    "Cannot remove source",
  );
  await expect(card(page)).toBeVisible();
  expect(await activeRaw(page)).toBe(before);
  expect(
    (await dbRows(page)).find((r) => r.id === legacy.id).match.events,
  ).toEqual(legacy.events);
});

test("Resume refuses to replace the active match when neither archive store can save it", async ({
  page,
}) => {
  await seed(page);
  const before = await activeRaw(page);
  await openHistory(page);
  await manage(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, ...rest) {
      if (v.origin === "native") throw Error("Native archive full");
      return put.call(this, v, ...rest);
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("sideline.match.archive."))
        throw Error("Archive fallback full");
      return set.call(this, k, v);
    };
  });
  page.once("dialog", (d) => d.accept());
  await card(page).getByRole("button", { name: "RESUME MATCH" }).click();
  await expect(page.locator(".history-view [role=alert]")).toContainText(
    "Archive fallback full",
  );
  expect(await activeRaw(page)).toBe(before);
});

test("a concurrent active-key change while archiving is not overwritten by a blank match", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, ...rest) {
      if (v.origin === "native") {
        const m = JSON.parse(localStorage.getItem("sideline.match.v1"));
        m.setup.coach = "Concurrent update";
        localStorage.setItem("sideline.match.v1", JSON.stringify(m));
      }
      return put.call(this, v, ...rest);
    };
  });
  await page.getByRole("button", { name: "Match setup", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Start a new blank match", exact: true })
    .click();
  await expect(page.locator("#storage-warning")).toContainText(
    "changed while archiving",
  );
  const saved = JSON.parse(await activeRaw(page));
  expect(saved.id).toBe("active-match");
  expect(saved.setup.coach).toBe("Concurrent update");
  expect(saved.events).toHaveLength(1);
});

test("landscape review cards show final result and neutral legacy status; historical views fit a phone", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const done = structuredClone(legacy);
  done.id = "completed-review";
  done.setup.opposition = "Estuary";
  done.lifecycle = { status: "completed", completedAt: "2026-10-20T16:00:00Z" };
  await seed(page, [legacy, done]);
  await openHistory(page);
  await expect(card(page, done.id)).toContainText("WIN +2");
  await expect(card(page, done.id)).toContainText("Completed");
  await expect(card(page, done.id).locator(".step-tag")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("history-cards-ipad-landscape.png"),
    fullPage: true,
  });
  await card(page, done.id).getByRole("button", { name: "VIEW MATCH" }).click();
  await page.screenshot({
    path: info.outputPath("history-analysis-ipad-landscape.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Timeline", exact: true })
    .last()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
