import {
  foireannSelection,
  expandedSelectedJerseyBox,
  prioritiseFoireannReview,
  selectedRetryCompatible,
} from "./foireann-ticks.js";
import {
  handwrittenJerseyBox,
  readHandwrittenJersey,
} from "./foireann-jerseys.js";
import { playerNumberToken } from "./numbered-rows.js";
import { candidate, POSITIONS } from "./import-parser.js";
import { plausibleName } from "./programme-parser.js";

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const cy = (w) => w.y + w.h / 2;
const dateLike = (text) =>
  /^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(text) ||
  /^\d{3,4}\/\d{4}$/.test(text);
const jersey = playerNumberToken;
export const cleanFoireannName = (text) =>
  text
    .replace(/[’‘]/g, "'")
    .replace(/\b(\p{Lu}')\s+(?=\p{L})/gu, "$1")
    .replace(/\s+[.,;|~{}()\[\]\-*†‡]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /(^|\s)(\p{Ll})/gu,
      (_, space, letter) => space + letter.toUpperCase(),
    );
const nameWords = (words) =>
  words.filter((w) => /\p{L}/u.test(w.text) && !/\d/.test(w.text));
const score = (words) =>
  words.length ? Math.min(...words.map((w) => w.confidence)) : 0;

// Repeated bilingual detail bands establish two-column context. Visible number
// boxes anchor player entries independently of DOB/ID recognition. No names,
// jersey sequences, colours or exact image coordinates act as templates.
export function detectFoireannRows(words) {
  const letters = (text) =>
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z]/gi, "");
  const extended = words.filter(
    (w) =>
      /^(extended|additional|unselected)$/i.test(letters(w.text)) &&
      words.some(
        (n) =>
          /^panel$/i.test(letters(n.text)) &&
          n.x > w.x &&
          Math.abs(cy(n) - cy(w)) < Math.max(n.h, w.h),
      ),
  );
  const footer = Math.min(
    ...extended.map((w) => w.y),
    ...words
      .filter((w) =>
        /^(?:bainisteoiri?|management|coaches?|officials?|flo)$/i.test(
          letters(w.text),
        ),
      )
      .map((w) => w.y),
    Infinity,
  );
  const dates = words.filter((w) => w.y < footer && dateLike(w.text));
  const ids = words.filter((w) => w.y < footer && /^\d{5,10}$/.test(w.text));
  const details = [];
  for (const id of ids) {
    const date = dates
      .filter(
        (w) =>
          id.x > w.x + w.w &&
          id.x < w.x + w.w + w.h * 4 &&
          Math.abs(cy(id) - cy(w)) < w.h,
      )
      .sort((a, b) => b.confidence - a.confidence)[0];
    // Member-ID detail lines are layout evidence, not player/jersey values.
    // Retain the entry when DOB OCR is missing; require a name beside the ID
    // and a separate registered-name band above, bounded to this column/row.
    const english = words.filter(
      (w) =>
        w.x > id.x + id.w &&
        w.x < id.x + id.w + id.h * 14 &&
        Math.abs(cy(w) - cy(id)) < id.h &&
        /\p{L}/u.test(w.text),
    );
    const registered = words.filter(
      (w) =>
        w.x > id.x - id.h * 9 &&
        w.x < id.x + id.h * 12 &&
        cy(w) < id.y &&
        cy(w) > id.y - id.h * 3 &&
        /\p{L}/u.test(w.text),
    );
    if (!date && (english.length < 2 || registered.length < 2)) continue;
    const duplicate = details.find(
      (r) =>
        Math.abs(r.id.x - id.x) < id.h && Math.abs(cy(r.id) - cy(id)) < id.h,
    );
    if (duplicate) {
      if (
        date &&
        (!duplicate.date || date.confidence > duplicate.date.confidence)
      ) {
        duplicate.date = date;
        duplicate.id = id;
      }
    } else details.push({ date, id });
  }
  if (details.length < 6) return null;
  const paired = details.filter((r) => r.date);
  const h = median(
    paired.length ? paired.map((r) => r.date.h) : details.map((r) => r.id.h),
  );
  const registeredOffsets = details.map(({ id }) => {
    const above = words.filter(
      (w) =>
        /\p{L}/u.test(w.text) &&
        !/\d/.test(w.text) &&
        w.x > id.x - h * 9 &&
        w.x < id.x + h * 12 &&
        cy(w) < id.y &&
        cy(w) > id.y - h * 3,
    );
    return above.length ? id.x - Math.min(...above.map((w) => w.x)) : h * 7;
  });
  const offsetX = paired.length
    ? median(paired.map((r) => r.id.x - r.date.x))
    : h * 7;
  const offsetY = paired.length
    ? median(paired.map((r) => r.id.y - r.date.y))
    : 0;
  // Estimated detail-line bounds are search geometry only. No DOB, jersey or
  // player value is manufactured from a missing field or sequence position.
  for (const r of details) {
    r.dateRecognized = !!r.date;
    r.date ||= {
      x: r.id.x - offsetX,
      y: r.id.y - offsetY,
      w: offsetX - h,
      h,
      text: "",
      confidence: 0,
    };
  }
  const columns = [];
  for (const r of details.sort((a, b) => a.date.x - b.date.x)) {
    let column = columns.find((c) => Math.abs(c.x - r.date.x) < h * 3);
    if (!column) columns.push((column = { x: r.date.x, rows: [] }));
    column.rows.push(r);
    column.x = median(column.rows.map((v) => v.date.x));
  }
  const selected = columns
    .filter((c) => c.rows.length >= 3)
    .sort((a, b) => a.x - b.x);
  if (selected.length !== 2 || selected[1].x - selected[0].x < h * 12)
    return null;
  for (const [ci, c] of selected.entries()) {
    const right = selected[ci + 1] ? selected[ci + 1].x - h * 7 : Infinity;
    const anchors = words.filter(
      (w) =>
        jersey(w.text) &&
        w.y < footer &&
        w.x >= c.x - h * 4.8 &&
        w.x + w.w < c.x - h * 0.3,
    );
    for (const anchor of anchors) {
      const adjacent = words.filter(
        (w) =>
          w.x >= c.x - h * 0.6 &&
          w.x + w.w < right &&
          Math.abs(cy(w) - cy(anchor)) < Math.max(w.h, anchor.h) * 0.85 &&
          /\p{L}/u.test(w.text) &&
          !/\d/.test(w.text),
      );
      if (adjacent.length < 2) continue;
      const existing = c.rows.find(
        (r) => Math.abs(cy(anchor) - r.date.y) < h * 1.7,
      );
      if (existing) {
        existing.numberAnchor ||= anchor;
        continue;
      }
      // A visible number + adjacent registered name establishes a missing entry
      // even if both DOB and member-ID failed OCR. Never infer the jersey value
      // from row order. The synthetic box is only the local detail search area.
      c.rows.push({
        numberAnchor: anchor,
        dateRecognized: false,
        id: null,
        date: {
          x: c.x,
          y: anchor.y + h * 1.25,
          w: h * 6,
          h,
          text: "",
          confidence: 0,
        },
      });
    }
    c.rows.sort((a, b) => a.date.y - b.date.y);
  }
  return {
    columns: selected,
    height: h,
    blackJerseyOffset:
      !paired.length && Math.abs(median(registeredOffsets)) < h * 2 ? h * 7 : 0,
  };
}

export function redNumberCanvas(source, box) {
  const [x, y, w, h] = box;
  const raw = document.createElement("canvas");
  raw.width = Math.ceil(w);
  raw.height = Math.ceil(h);
  const ctx = raw.getContext("2d");
  ctx.drawImage(source, x, y, w, h, 0, 0, raw.width, raw.height);
  const image = ctx.getImageData(0, 0, raw.width, raw.height);
  let ink = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i],
      g = image.data[i + 1],
      b = image.data[i + 2];
    const red = r - g > 22 && r - b > 20;
    const value = red ? 0 : 255;
    if (red) ink++;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
  const canvas = document.createElement("canvas");
  canvas.width = raw.width * 4 + 40;
  canvas.height = raw.height * 4 + 40;
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(raw, 20, 20, raw.width * 4, raw.height * 4);
  return { canvas, ink };
}

// Isolate dark pen strokes inside the established jersey field. Remove long
// printed underline runs before single-number OCR; never read member-ID areas.
export function blackNumberCanvas(source, box) {
  const [x, y, w, h] = box,
    raw = document.createElement("canvas");
  raw.width = Math.ceil(w);
  raw.height = Math.ceil(h);
  const ctx = raw.getContext("2d");
  ctx.drawImage(source, x, y, w, h, 0, 0, raw.width, raw.height);
  const image = ctx.getImageData(0, 0, raw.width, raw.height),
    gray = [];
  for (let i = 0; i < image.data.length; i += 4)
    gray.push((image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3);
  const threshold = median(gray) * 0.72,
    mask = gray.map((v) => (v < threshold ? 1 : 0));
  // A tick may cross the left edge from the separate Starting checkbox.
  for (let y = 0; y < raw.height; y++)
    for (let x = 0; x < raw.width * 0.13; x++) mask[y * raw.width + x] = 0;
  // Find and erase the shallow printed underline, including photographed tilt.
  let best = { count: 0 };
  for (let slope = -0.2; slope <= 0.2; slope += 0.025)
    for (let y = raw.height * 0.5; y < raw.height; y++) {
      let count = 0;
      for (let x = 0; x < raw.width; x++) {
        const yy = Math.round(y + slope * x);
        if (yy >= 0 && yy < raw.height && mask[yy * raw.width + x]) count++;
      }
      if (count > best.count) best = { count, y, slope };
    }
  if (best.count > raw.width * 0.55)
    for (let x = 0; x < raw.width; x++)
      for (let d = -2; d <= 2; d++) {
        const y = Math.round(best.y + best.slope * x) + d;
        if (y >= 0 && y < raw.height) mask[y * raw.width + x] = 0;
      }
  // Disconnected pen/tick tips and remnants of the printed rule are not digits.
  const visited = new Uint8Array(mask.length);
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    const stack = [seed],
      component = [];
    visited[seed] = 1;
    let low = raw.height,
      high = 0;
    while (stack.length) {
      const n = stack.pop(),
        x = n % raw.width,
        y = Math.floor(n / raw.width);
      component.push(n);
      low = Math.min(low, y);
      high = Math.max(high, y);
      for (const next of [
        x ? n - 1 : -1,
        x + 1 < raw.width ? n + 1 : -1,
        y ? n - raw.width : -1,
        y + 1 < raw.height ? n + raw.width : -1,
      ])
        if (next >= 0 && mask[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
    }
    if (high - low + 1 < raw.height * 0.18)
      for (const n of component) mask[n] = 0;
  }
  let x0 = raw.width,
    y0 = raw.height,
    x1 = 0,
    y1 = 0,
    ink = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      ink++;
      x0 = Math.min(x0, i % raw.width);
      x1 = Math.max(x1, i % raw.width);
      y0 = Math.min(y0, Math.floor(i / raw.width));
      y1 = Math.max(y1, Math.floor(i / raw.width));
    }
    image.data[i * 4] =
      image.data[i * 4 + 1] =
      image.data[i * 4 + 2] =
        mask[i] ? 0 : 255;
  }
  ctx.putImageData(image, 0, 0);
  const out = document.createElement("canvas"),
    width = Math.max(1, x1 - x0 + 1),
    height = Math.max(1, y1 - y0 + 1);
  out.width = width * 4 + 40;
  out.height = height * 4 + 40;
  const draw = out.getContext("2d");
  draw.fillStyle = "white";
  draw.fillRect(0, 0, out.width, out.height);
  if (ink)
    draw.drawImage(raw, x0, y0, width, height, 20, 20, width * 4, height * 4);
  return { canvas: out, ink };
}

export async function readFoireannProgramme({
  layout,
  scan,
  detailScan,
  source,
  normalized,
  crop,
  read,
  worker,
  onProgress,
}) {
  const players = [],
    regions = [];
  const h = layout.height;
  for (const [ci, column] of layout.columns.entries()) {
    const right = layout.columns[ci + 1]
      ? layout.columns[ci + 1].x - h * 7
      : source.width - h;
    for (const [ri, row] of column.rows.entries()) {
      onProgress(`Reading bilingual team-sheet player ${players.length + 1}`);
      const { date, id } = row;
      const previous = column.rows[ri - 1],
        next = column.rows[ri + 1];
      const pitch = Math.min(
        date.y - (previous?.date.y ?? date.y - h * 4),
        (next?.date.y ?? date.y + h * 4) - date.y,
      );
      const top = Math.max(0, date.y - Math.min(pitch * 0.65, h * 2.3));
      const bottom = Math.min(
        next ? next.date.y - pitch * 0.55 : source.height,
        date.y + h * 2.05,
      );
      const nameX = id ? id.x + id.w + h * 0.25 : date.x;
      const nameBox = [
        nameX,
        date.y - h * 0.3,
        right - nameX,
        bottom - (date.y - h * 0.3),
      ];
      const rawWords = scan.words.filter(
        (w) =>
          w.x >= nameX &&
          w.x + w.w <= right &&
          cy(w) >= date.y &&
          cy(w) <= date.y + h * 1.85,
      );
      const reads = [
        {
          text: rawWords
            .sort((a, b) => a.x - b.x)
            .map((w) => w.text)
            .join(" "),
          words: rawWords,
          kind: "full scan",
        },
        {
          ...(await read(crop(source, ...nameBox), "7")),
          kind: "English detail crop",
        },
        {
          ...(await read(crop(normalized, ...nameBox), "7")),
          kind: "normalized English detail crop",
        },
      ];
      if (!id) {
        // Without a recognised global ID, separate local English text only after
        // an actual local ID read. Do not strip names or translate Irish text.
        for (const r of reads) {
          const localId = r.words.find((w) => /^\d{5,10}$/.test(w.text));
          const names = localId
            ? r.words.filter(
                (w) =>
                  w.x > localId.x + localId.w &&
                  Math.abs(cy(w) - cy(localId)) < h * 2 &&
                  /\p{L}/u.test(w.text),
              )
            : [];
          r.words = names;
          r.text = names
            .sort((a, b) => a.x - b.x)
            .map((w) => w.text)
            .join(" ");
        }
      }
      const valid = reads.filter(
        (r) =>
          plausibleName(cleanFoireannName(r.text)) &&
          nameWords(r.words).length >= 2 &&
          !/[\d/]/.test(r.text),
      );
      valid.sort(
        (a, b) => score(nameWords(b.words)) - score(nameWords(a.words)),
      );
      let chosen = valid[0],
        english = !!chosen && score(nameWords(chosen.words)) >= 65;
      if (!english) {
        const registered = scan.words
          .filter(
            (w) =>
              w.x >= date.x - h &&
              w.x + w.w <= right &&
              cy(w) >= top &&
              cy(w) < date.y - h * 0.3 &&
              /\p{L}/u.test(w.text),
          )
          .sort((a, b) => a.x - b.x);
        const registeredBox = [
          date.x - h * 0.4,
          top,
          right - date.x + h * 0.4,
          date.y - top - h * 0.15,
        ];
        const fallback = [
          {
            text: registered.map((w) => w.text).join(" "),
            words: registered,
            kind: "registered name",
          },
          {
            ...(await read(crop(source, ...registeredBox), "7")),
            kind: "registered name crop",
          },
        ].filter((r) => plausibleName(cleanFoireannName(r.text)));
        fallback.sort(
          (a, b) => score(nameWords(b.words)) - score(nameWords(a.words)),
        );
        chosen = fallback[0];
      }
      const numberBox = [
        Math.max(0, date.x - h * 4.8 + (layout.blackJerseyOffset || 0)),
        top,
        h * 4.3,
        date.y + h * (layout.blackJerseyOffset ? 1.1 : 0.3) - top,
      ];
      const red = redNumberCanvas(source, numberBox);
      await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
      const anchorWords = [...scan.words, ...(detailScan?.words || [])].filter(
        (w) =>
          jersey(w.text) &&
          w.x >= numberBox[0] &&
          w.x + w.w <= numberBox[0] + numberBox[2] &&
          cy(w) >= top &&
          cy(w) <= date.y + h * (layout.blackJerseyOffset ? 1.1 : 0.4),
      );
      const numberReads = anchorWords.map((w) => ({
        text: w.text,
        words: [w],
        kind: "full-scan number in entry",
      }));
      if (red.ink > 10)
        numberReads.push({ ...(await read(red.canvas, "7")), kind: "red ink" });
      numberReads.push(
        {
          ...(await read(crop(source, ...numberBox), "7")),
          kind: "number crop",
        },
        {
          ...(await read(crop(normalized, ...numberBox), "7")),
          kind: "normalized number crop",
        },
      );
      // Black handwritten numbers on ID-only detail sheets occupy the same
      // bounded jersey field but need underline removal, not a red-ink mask.
      if (layout.blackJerseyOffset) {
        await worker.setParameters({ tessedit_char_whitelist: "" });
        const black = blackNumberCanvas(source, numberBox);
        if (black.ink > 10)
          for (const mode of ["7", "13"])
            numberReads.push({
              ...(await read(black.canvas, mode)),
              kind: "isolated black number",
            });
        if (black.ink > 10 && !resolveFoireannJersey(numberReads).number) {
          const smaller = document.createElement("canvas");
          smaller.width = Math.round(black.canvas.width / 2);
          smaller.height = Math.round(black.canvas.height / 2);
          smaller
            .getContext("2d")
            .drawImage(black.canvas, 0, 0, smaller.width, smaller.height);
          numberReads.push({
            ...(await read(smaller, "7")),
            kind: "isolated black number at half scale",
          });
        }
      }
      await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
      // If the broad entry crop is noisy, reread the actual visible digit box.
      // This uses its own geometry, not a guessed jersey or neighbour's number.
      if (!resolveFoireannJersey(numberReads).number && anchorWords.length) {
        const a = [...anchorWords].sort(
          (a, b) => b.confidence - a.confidence,
        )[0];
        const box = [
          Math.max(0, a.x - a.h * 0.2),
          Math.max(0, a.y - a.h * 0.2),
          a.w + a.h * 0.4,
          a.h * 1.4,
        ];
        numberReads.push(
          {
            ...(await read(crop(source, ...box), "7")),
            kind: "anchored digit crop",
          },
          {
            ...(await read(crop(normalized, ...box), "7")),
            kind: "normalized anchored digit crop",
          },
        );
      }
      await worker.setParameters({ tessedit_char_whitelist: "" });
      const resolved = resolveFoireannJersey(numberReads);
      const number = resolved.number;
      const clear = numberReads.filter(
        (r) => jersey(r.text) === number && score(r.words) >= 85,
      );
      const uncertain = numberReads.filter((r) => jersey(r.text));
      const numberScore = number
        ? Math.max(...clear.map((r) => score(r.words)))
        : 0;
      const name = chosen ? cleanFoireannName(chosen.text) : "";
      const nameScore = chosen ? score(nameWords(chosen.words)) : 0;
      players.push(
        foireannPlayer({
          number,
          name,
          nameScore,
          numberScore,
          english,
          possible: uncertain.map((r) => jersey(r.text)),
        }),
      );
      regions.push({
        column: ci,
        row: ri,
        nameBox,
        numberBox,
        reads,
        chosen,
        numberReads,
        number,
        nameScore,
        numberScore,
        english,
        sourceRow: row,
        right,
        nextRow: next,
      });
    }
  }
  // Names are final before the dedicated jersey pass starts. Only jersey,
  // role/position and its existing confidence text may be updated below.
  for (const region of regions) {
    const box = handwrittenJerseyBox({
      row: region.sourceRow,
      words: scan.words,
      height: h,
      right: region.right,
      width: source.width,
    });
    region.selection = foireannSelection(source, box || region.numberBox, h);
    region.handwrittenBox = box;
  }
  let jerseyPassFailed = false;
  for (const [i, region] of regions.entries()) {
    const box = region.handwrittenBox;
    if (!box) continue;
    onProgress(`Reading handwritten jersey ${i + 1}/${regions.length}`);
    let result;
    try {
      result = await readHandwrittenJersey({ source, box, read, worker });
    } catch (error) {
      // A failed/expired digit pass must not discard already extracted names.
      region.handwritten = { box, error: error.message };
      jerseyPassFailed = true;
      break;
    }
    region.handwritten = result;
    if (result.number || result.ambiguous) {
      // A conflicting second-pass value must remain a coach decision.
      const conflict =
        result.ambiguous || (region.number && region.number !== result.number);
      const number = conflict ? "" : result.number;
      players[i] = foireannPlayer({
        number,
        name: players[i].name,
        nameScore: region.nameScore,
        numberScore: result.score,
        english: region.english,
        possible: conflict
          ? [region.number, ...result.possible].filter(Boolean)
          : [],
      });
    }
  }
  for (const [i, region] of regions.entries()) {
    if (!region.selection?.ticked) continue;
    players[i].selectedTick = true;
    if (!players[i].number && !jerseyPassFailed) {
      onProgress(
        `Selected player: focused jersey search ${i + 1}/${regions.length}`,
      );
      const box = expandedSelectedJerseyBox(
        region.handwritten?.box || region.numberBox,
        h,
        region.sourceRow,
        region.nextRow,
      );
      try {
        const result = await readHandwrittenJersey({
          source,
          box,
          read,
          worker,
        });
        region.selectedRetry = result;
        if (
          selectedRetryCompatible(region.handwritten, result, region.number)
        ) {
          players[i] = {
            ...foireannPlayer({
              number: result.number,
              name: players[i].name,
              nameScore: region.nameScore,
              numberScore: result.score,
              english: region.english,
            }),
            selectedTick: true,
          };
        }
      } catch (error) {
        region.selectedRetry = { error: error.message };
        jerseyPassFailed = true;
      }
    }
    players[i].confidence += players[i].number
      ? " · ✓ Selected — verify jersey"
      : " · ✓ Selected — Review jersey";
  }
  for (const p of players)
    if (
      p.number &&
      players.filter((other) => other.number === p.number).length > 1
    )
      p.confidence += " · duplicate jersey: verify both entries";
  return {
    ...scan,
    players: regions.some((r) => r.selection?.ticked)
      ? prioritiseFoireannReview(players)
      : players,
    diagnostics: { layout: "foireann-bilingual-two-column", regions },
  };
}

// A number needs a clear read. Corroborating local reads break disagreement;
// equally supported conflicting digits remain blank, never inferred from order.
export function resolveFoireannJersey(reads) {
  const candidates = [
    ...new Set(
      reads
        .filter((r) => jersey(r.text) && score(r.words) >= 85)
        .map((r) => jersey(r.text)),
    ),
  ]
    .map((number) => ({
      number,
      support: reads.filter(
        (r) => jersey(r.text) === number && score(r.words) >= 60,
      ).length,
    }))
    .sort((a, b) => b.support - a.support);
  return candidates.length &&
    (candidates.length === 1 || candidates[0].support > candidates[1].support)
    ? candidates[0]
    : { number: "", support: 0 };
}

export function foireannPlayer({
  number,
  name,
  nameScore,
  numberScore,
  english,
  possible = [],
}) {
  const role = number ? (+number <= 15 ? "starter" : "substitute") : "panel";
  const confidence = `Review required · ${english ? "English detail name" : "English name unresolved; registered name retained — verify"} · name OCR ${Math.round(nameScore)}/100 · ${number ? `jersey OCR ${Math.round(numberScore)}/100` : "jersey blank/uncertain; verify number and Starter/Sub"}${nameScore < 85 ? " · uncertain name transcription" : ""}${!number && possible.length ? " · possible jersey " + [...new Set(possible)].join("/") + " (not assigned)" : ""}`;
  return candidate(
    number,
    name,
    role,
    number && +number <= 15 ? POSITIONS[+number - 1] : "",
    confidence,
  );
}
