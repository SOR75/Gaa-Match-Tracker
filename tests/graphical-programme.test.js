import { test } from "node:test";
import assert from "node:assert/strict";
import { graphicalNumberRegions } from "../src/graphical-programme.js";
import { slots } from "../src/programme-geometry.js";
const image = (colour = [20, 80, 150], missing = -1) => {
  const width = 600,
    height = 800,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [i, [x, y]] of slots.entries()) {
    if (i === missing) continue;
    for (let yy = 100 + y * 90; yy < 130 + y * 90; yy++)
      for (let xx = 280 + x * 160; xx < 320 + x * 160; xx++) {
        const j = 4 * (yy * width + xx);
        data.set([...colour, 255], j);
      }
  }
  return { data, width, height };
};
test("repeated coloured number regions must form the complete conventional geometry", () => {
  const boxes = graphicalNumberRegions(image());
  assert.equal(boxes.length, 15);
  assert.ok(boxes.every((b) => !("number" in b))); // geometry never manufactures jerseys
});
test("one missing graphic does not divert a generic sheet", () =>
  assert.equal(graphicalNumberRegions(image(undefined, 8)), null));
test("black printed text/handwriting does not establish coloured-shirt routing", () =>
  assert.equal(graphicalNumberRegions(image([0, 0, 0])), null));
