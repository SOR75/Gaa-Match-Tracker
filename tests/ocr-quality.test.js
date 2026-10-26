import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanOcrToken,
  cleanPlayerText,
  substituteReadQuality,
} from "../src/programme-geometry.js";
test("safe OCR cleanup removes edge punctuation/noise but never guesses alphabetic suffixes", () => {
  assert.equal(cleanPlayerText("Zoe McMahon ’"), "Zoe McMahon");
  assert.equal(cleanPlayerText("Faye Robins."), "Faye Robins");
  assert.equal(cleanPlayerText("Anna Kenny ="), "Anna Kenny");
  assert.equal(
    cleanPlayerText("Mary O’Neill-Smith (VC)"),
    "Mary O’Neill-Smith (VC)",
  );
  assert.equal(cleanPlayerText("R. O’Donnell (C)"), "O’Donnell (C)"); // Existing leading-initial cleanup is unchanged.
  assert.equal(
    cleanPlayerText("Mary O’Neill-Smith ( VC )"),
    "Mary O’Neill-Smith (VC)",
  );
  assert.equal(cleanOcrToken("R."), "R.");
  assert.equal(cleanOcrToken("O’Donnell,"), "O’Donnell");
  assert.equal(cleanOcrToken("Flynnv"), "Flynnv");
  assert.equal(cleanOcrToken("Ivanov"), "Ivanov");
});
test("substitute evidence cannot jump far beyond the jersey into staff text or use oversized clipped glyphs", () => {
  const words = [
    { text: "John", x: 300, y: 400, h: 30, confidence: 95 },
    { text: "Brown", x: 370, y: 400, h: 30, confidence: 95 },
  ];
  assert.equal(
    substituteReadQuality(
      { text: "John Brown", words, spatial: true },
      30,
      150,
    ),
    -1,
  );
  assert.equal(
    substituteReadQuality(
      { text: "John Brown", words: words.map((w) => ({ ...w, y: 0, h: 100 })) },
      30,
      150,
    ),
    -1,
  );
  assert.equal(
    substituteReadQuality(
      { text: "John Brown", words, spatial: true },
      30,
      250,
    ),
    95,
  );
  assert.equal(
    substituteReadQuality(
      { text: "John Brown", words: words.map((w) => ({ ...w, y: 12, h: 60 })) },
      30,
      150,
    ),
    95,
  );
  assert.equal(substituteReadQuality({ text: "", words: [] }, 30, 150), -1);
});
