import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkmarkInArea,
  expandedSelectedJerseyBox,
  prioritiseFoireannReview,
  selectedRetryCompatible,
} from "../src/foireann-ticks.js";
function area(kind, scale = 1, paper = 240) {
  const width = 62 * scale,
    height = 50 * scale,
    data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([paper, paper, paper, 255], i * 4);
  }
  const dot = (x, y, r = 1) => {
    for (let yy = Math.round(y - r); yy <= y + r; yy++)
      for (let xx = Math.round(x - r); xx <= x + r; xx++)
        if (xx >= 0 && xx < 62 && yy >= 0 && yy < 50)
          for (let b = 0; b < scale; b++)
            for (let a = 0; a < scale; a++)
              data.set(
                [35, 35, 35, 255],
                ((yy * scale + b) * width + xx * scale + a) * 4,
              );
  };
  const line = (x, y, xx, yy) => {
    const steps = Math.max(Math.abs(xx - x), Math.abs(yy - y)) * 2;
    for (let i = 0; i <= steps; i++)
      dot(x + ((xx - x) * i) / steps, y + ((yy - y) * i) / steps);
  };
  line(10, 10, 32, 10);
  line(32, 10, 32, 32);
  line(32, 32, 10, 32);
  line(10, 32, 10, 10);
  if (kind === "tick") {
    line(20, 22, 24, 28);
    line(24, 28, 47, 12);
  }
  if (kind === "edge-tick") {
    line(28, 20, 30, 27);
    line(30, 27, 47, 12);
  }
  if (kind === "smudge") dot(22, 25, 2);
  if (kind === "cross") {
    line(16, 16, 27, 27);
    line(16, 27, 27, 16);
  }
  if (kind === "overwritten") {
    for (let x = 17; x < 31; x++) line(x, 16, x, 30);
    line(30, 24, 47, 12);
  }
  if (kind === "nearby-number") {
    line(42, 18, 48, 18);
    line(48, 18, 42, 31);
  }
  return { data, width, height };
}
test("an empty printed checkbox never counts as a selected player", () =>
  assert.equal(checkmarkInArea(area("empty"), 12).ticked, false));
test("a clear checkmark requires interior stroke and an external rising tail", () =>
  assert.equal(checkmarkInArea(area("tick"), 12).ticked, true));
test("a check near the right border can still be detected", () =>
  assert.equal(checkmarkInArea(area("edge-tick"), 12).ticked, true));
test("paper shade and full-resolution scaling preserve clear tick detection", () => {
  assert.equal(checkmarkInArea(area("tick", 2, 170), 24).ticked, true);
});
test("smudges, crosses, heavy overwriting and adjacent jersey-like digits do not manufacture ticks", () => {
  for (const kind of ["smudge", "cross", "overwritten", "nearby-number"])
    assert.equal(checkmarkInArea(area(kind), 12).ticked, false, kind);
});
test("selected retry stays bounded to this row and before the printed ID/name area", () => {
  const b = expandedSelectedJerseyBox(
    [100, 200, 50, 40],
    12,
    { id: { x: 155 } },
    { date: { y: 275 } },
  );
  assert.ok(b[0] >= 97);
  assert.ok(b[0] + b[2] < 155);
  assert.ok(b[1] + b[3] <= 245);
});
test("review priority keeps ticked blank jerseys first without assigning or changing player data", () => {
  const players = [
    { name: "Unticked", number: "", role: "panel", confidence: "" },
    {
      name: "Known",
      number: "20",
      selectedTick: true,
      role: "substitute",
      confidence: "",
    },
    {
      name: "Resolve",
      number: "",
      selectedTick: true,
      role: "panel",
      confidence: "",
    },
  ];
  const before = JSON.stringify(players),
    ordered = prioritiseFoireannReview(players);
  assert.deepEqual(
    ordered.map((p) => p.name),
    ["Resolve", "Known", "Unticked"],
  );
  assert.equal(JSON.stringify(players), before);
  assert.equal(ordered[0].number, "");
  assert.equal(ordered[0].role, "panel");
});

test("a tick-triggered retry cannot override ambiguous or conflicting reliable jersey evidence", () => {
  assert.equal(
    selectedRetryCompatible(
      { ambiguous: true, possible: ["1", "11"] },
      { number: "11" },
    ),
    false,
  );
  assert.equal(
    selectedRetryCompatible({ possible: ["15"] }, { number: "5" }),
    false,
  );
  assert.equal(
    selectedRetryCompatible({ possible: [] }, { number: "5" }, "15"),
    false,
  );
  assert.equal(
    selectedRetryCompatible({ possible: ["15"] }, { number: "15" }),
    true,
  );
  assert.equal(
    selectedRetryCompatible({ possible: [] }, { number: "" }),
    false,
  );
});
