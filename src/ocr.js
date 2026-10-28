import { referenceFormationRoute } from "./formation-routing.js";
import { detectNotebook, readNotebook } from "./notebook-programme.js";
import {
  detectFoireannRows,
  readFoireannProgramme,
} from "./foireann-programme.js";
import { readNumberedList } from "./list-programme.js";
import {
  lightCardRects,
  selectCardFormation,
  readBoxedProgramme,
} from "./boxed-programme.js";
import {
  detectReferenceRoster,
  readReferenceFormation,
} from "./roster-formation.js";
import { isMetadata, isFooter } from "./programme-parser.js";
import {
  fitFormation,
  slots,
  cleanPlayerText,
  substituteReadQuality,
} from "./programme-geometry.js";
import { candidate, POSITIONS, parseSpatialPlayers } from "./import-parser.js";
import { createWorker } from "tesseract.js";
export async function recognizeImage(
  input,
  { signal, onProgress = () => {} } = {},
) {
  if (signal?.aborted) throw new Error("Import cancelled.");
  let worker,
    finished = false,
    rejectAbort;
  const origin = location.origin;
  const interruption = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    rejectAbort(
      new Error(
        signal?.aborted
          ? "Import cancelled."
          : "OCR timed out. Try a smaller/cropped image or paste text.",
      ),
    );
  };
  const timer = setTimeout(abort, 90000);
  signal?.addEventListener("abort", abort, { once: true });
  const init = createWorker("eng", 1, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr`,
    langPath: `${origin}/ocr`,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none",
    logger: (message) =>
      onProgress(
        `${message.status} ${Math.round((message.progress || 0) * 100)}%`,
      ),
  });
  init
    .then((created) => {
      if (finished) created.terminate();
    })
    .catch(() => {});
  try {
    worker = await Promise.race([init, interruption]);
    await worker.setParameters({
      tessedit_pageseg_mode: "11",
      preserve_interword_spaces: "1",
    });
    const source = input;
    const normalized = normalizeLighting(source);
    async function read(canvas, mode = "11") {
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      const { data } = await Promise.race([
        worker.recognize(canvas, { rotateAuto: false }, { tsv: true }),
        interruption,
      ]);
      return { text: data.text, words: tsvWords(data.tsv) };
    }
    const originalScan = await read(source);
    // Route using both independent image passes. A single missed DOB must not
    // send a bilingual numbered sheet into handwritten/manual row fallback.
    const scan = await read(normalized);
    const layouts = [
      detectFoireannRows(originalScan.words),
      detectFoireannRows(scan.words),
    ].filter(Boolean);
    const rows = (layout) => layout.columns.flatMap((c) => c.rows);
    layouts.sort(
      (a, b) =>
        rows(b).filter((r) => r.dateRecognized).length -
          rows(a).filter((r) => r.dateRecognized).length ||
        rows(b).length - rows(a).length,
    );
    const foireann =
      layouts[0] || detectFoireannRows([...originalScan.words, ...scan.words]);
    if (foireann) {
      return await readFoireannProgramme({
        layout: foireann,
        scan: originalScan,
        detailScan: scan,
        source,
        normalized,
        crop,
        read,
        worker,
        onProgress,
      });
    }
    // A printed reference roster over a separate Gaelic formation is more
    // specific than generic numbered rows. Consider it BEFORE list/notebook
    // routing, using either pass's surviving anchors. Foireann stays first.
    const formationRoute = referenceFormationRoute(scan, originalScan);
    if (formationRoute)
      return await readReferenceFormation({
        ...formationRoute,
        slots,
        source,
        normalized,
        crop,
        read,
        worker,
        onProgress,
      });
    const listPlayers = readNumberedList(originalScan.words);
    if (listPlayers)
      return {
        ...originalScan,
        players: listPlayers,
        diagnostics: { layout: "numbered-list" },
      };
    const grid = fitFormation(scan.words);
    if (!grid) {
      const notebook = await detectNotebook(
        source,
        originalScan.words,
        scan.words,
      );
      if (notebook)
        return await readNotebook({
          layout: notebook,
          crop,
          read,
          worker,
          onProgress,
        });
      return scan;
    }
    const players = [],
      regions = [];
    function crop(canvas, x, y, w, h) {
      const result = document.createElement("canvas");
      result.width = Math.round(w * 2);
      result.height = Math.round(h * 2);
      result
        .getContext("2d")
        .drawImage(canvas, x, y, w, h, 0, 0, result.width, result.height);
      return result;
    }
    const cards = selectCardFormation(
      lightCardRects(
        source.getContext("2d").getImageData(0, 0, source.width, source.height),
      ),
      scan.words,
      grid,
    );
    if (cards)
      return await readBoxedProgramme({
        cards,
        scan,
        source,
        normalized,
        crop,
        read,
        worker,
        onProgress,
      });
    const reference = detectReferenceRoster(scan.words, grid);
    if (reference)
      return await readReferenceFormation({
        reference,
        scan,
        grid,
        slots,
        source,
        normalized,
        crop,
        read,
        worker,
        onProgress,
      });
    for (let i = 0; i < slots.length; i++) {
      onProgress(`Reading formation player ${i + 1}/15`);
      const [tx, ty] = slots[i],
        x = grid.x0 + tx * grid.sx,
        y = grid.y0 + ty * grid.sy + tx * (grid.tilt || 0);
      const box = [
        x - grid.sx * 0.46,
        y + grid.sy * 0.27,
        grid.sx * 0.92,
        grid.sy * 0.6,
      ];
      const alternatives = [
        await read(crop(normalized, ...box), "7"),
        await read(crop(source, ...box), "7"),
      ];
      const spatialWords = scan.words
        .filter(
          (w) =>
            w.x + w.w / 2 > box[0] &&
            w.x + w.w / 2 < box[0] + box[2] &&
            w.y + w.h / 2 > y + grid.sy * 0.25 &&
            w.y + w.h / 2 < y + grid.sy * 0.85 &&
            (/\p{L}{2}/u.test(w.text) || /^\((?:C|VC)\)$/i.test(w.text)),
        )
        .sort((a, b) => a.x - b.x);
      if (spatialWords.length >= 2)
        alternatives.push({
          text: spatialWords.map((w) => w.text).join(" "),
          words: spatialWords,
        });
      const quality = (r) =>
        r.words
          .filter((w) => /\p{L}{2}/u.test(w.text))
          .reduce((sum, w) => sum + w.confidence * w.text.length, 0) /
        Math.max(
          1,
          r.words
            .filter((w) => /\p{L}{2}/u.test(w.text))
            .reduce((sum, w) => sum + w.text.length, 0),
        );
      alternatives.sort((a, b) => quality(b) - quality(a));
      const nameRead = alternatives[0];
      const name = cleanPlayerText(nameRead.text);
      const anchor = grid.anchors.find((a) => a.n === i + 1);
      // Re-read the actual number; do not fill it from the expected slot.
      await worker.setParameters({ tessedit_char_whitelist: "0123456789.)" });
      const numberReads = [
        await read(
          crop(
            source,
            x - grid.sx * 0.065,
            y - grid.sy * 0.1,
            grid.sx * 0.13,
            grid.sy * 0.38,
          ),
          "10",
        ),
        await read(
          crop(
            normalized,
            x - grid.sx * 0.065,
            y - grid.sy * 0.1,
            grid.sx * 0.13,
            grid.sy * 0.38,
          ),
          "10",
        ),
      ];
      const clearNumber = (r) =>
        r.words.length &&
        r.words.every(
          (w) =>
            w.confidence >=
            (+r.text.trim().replace(/\D/g, "") === i + 1 ? 65 : 85),
        );
      const numberRead =
        numberReads.find(
          (r) => /^[1-9]\d?[.)]*$/.test(r.text.trim()) && clearNumber(r),
        ) || numberReads[0];
      await worker.setParameters({ tessedit_char_whitelist: "" });
      const digits = numberRead.text.trim().match(/^([1-9]\d?)[.)]*$/);
      let number = anchor
        ? String(anchor.n)
        : digits && clearNumber(numberRead)
          ? digits[1]
          : "";
      if (!anchor && number && grid.anchors.some((a) => a.n === +number))
        number = "";
      const score = Math.min(
        ...nameRead.words
          .filter((w) => /\p{L}/u.test(w.text))
          .map((w) => w.confidence),
        0 + 100,
      );
      players.push(
        candidate(
          number,
          name,
          "starter",
          POSITIONS[number && +number <= 15 ? +number - 1 : i],
          `Review required · OCR word score ${Math.round(score)}/100${!number ? " · jersey unreadable; left blank" : ""} · position suggestion; editable`,
        ),
      );
      regions.push({ slot: i + 1, box, nameRead, numberRead, alternatives });
    }
    // A dense numbered block below the formation is independent of its heading.
    const left = grid.x0 - grid.sx * 1.45,
      right = grid.x0 + grid.sx * 1.45;
    const footerY = Math.min(
      ...scan.words.filter((w) => isFooter(w.text)).map((w) => w.y),
      Infinity,
    );
    const lower = scan.words.filter(
      (w) =>
        w.x >= left &&
        w.x + w.w <= right &&
        w.y > grid.y0 + grid.sy * 5.65 &&
        w.y < footerY,
    );
    let nums = lower.filter(
      (w) => /^\d{2}$/.test(w.text) && +w.text >= 16 && w.confidence >= 70,
    );
    if (new Set(nums.map((w) => +w.text)).size >= 3) {
      const top = Math.min(...nums.map((w) => w.y)),
        bottom = Math.max(...nums.map((w) => w.y + w.h));
      const height = nums.map((w) => w.h).sort((a, b) => a - b)[
        Math.floor(nums.length / 2)
      ];
      // Re-read ambiguous numeric boxes inside the established dense block.
      for (const w of lower.filter(
        (w) =>
          /^\d{1,2}[!.)]*$/.test(w.text) &&
          !nums.includes(w) &&
          w.y >= top - height &&
          w.y <= bottom,
      )) {
        await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
        const r = await read(
          crop(source, w.x - 4, w.y - 4, w.w + 12, w.h + 8),
          "7",
        );
        await worker.setParameters({ tessedit_char_whitelist: "" });
        if (
          /^\d{2}$/.test(r.text.trim()) &&
          +r.text >= 16 &&
          r.words.every((v) => v.confidence > 60) &&
          !nums.some((n) => +n.text === +r.text)
        )
          nums.push({
            ...w,
            text: r.text.trim(),
            confidence: Math.min(...r.words.map((v) => v.confidence)),
          });
      }
      const uncertainNums = lower.filter(
        (w) =>
          /^\d[!.)]*$/.test(w.text) &&
          w.y >= top &&
          w.y <= bottom &&
          w.x > left + height * 2 &&
          !nums.some(
            (n) => Math.abs(n.x - w.x) < height && Math.abs(n.y - w.y) < height,
          ),
      );
      // Require a gap between two sequential anchors on the same dense row.
      for (const w of uncertainNums) {
        const pair = nums
          .flatMap((before) =>
            nums
              .filter(
                (after) =>
                  +after.text === +before.text + 2 &&
                  !nums.some((n) => +n.text === +before.text + 1) &&
                  before.x < w.x &&
                  after.x > w.x &&
                  Math.abs(before.y - w.y) < height * 1.5 &&
                  Math.abs(after.y - w.y) < height * 1.5,
              )
              .map((after) => ({ before, after })),
          )
          .sort((a, b) => a.after.x - a.before.x - (b.after.x - b.before.x))[0];
        if (pair)
          nums.push({ ...w, uncertain: true, order: +pair.before.text + 1 });
      }
      const ordered = nums
        .slice()
        .sort((a, b) => (a.order || +a.text) - (b.order || +b.text));
      const details = [];
      for (const n of ordered) {
        const next = ordered.find(
          (v) => (v.order || +v.text) === (n.order || +n.text) + 1 && v.x > n.x,
        );
        const prev = ordered.find(
          (v) => (v.order || +v.text) === (n.order || +n.text) - 1 && v.x < n.x,
        );
        const neighbor = next || prev;
        const slope = neighbor ? (neighbor.y - n.y) / (neighbor.x - n.x) : 0;
        const x = n.x + n.w + height * (n.uncertain ? 0.8 : 0.15),
          width = (next ? next.x - height * 0.2 : right) - x;
        if (width < height) continue;
        function band(canvas, padding = 0.4, bandHeight = 2.1, angle = slope) {
          const c = document.createElement("canvas");
          c.width = Math.round(width * 2);
          c.height = Math.round(height * bandHeight * 2);
          const context = c.getContext("2d");
          context.fillStyle = "white";
          context.fillRect(0, 0, c.width, c.height);
          context.setTransform(
            2,
            -2 * angle,
            0,
            2,
            -2 * x,
            2 * (angle * x - n.y + height * padding),
          );
          context.drawImage(canvas, 0, 0);
          return c;
        }
        const reads = [
          await read(band(source), "7"),
          await read(band(normalized), "7"),
          await read(band(source, 0.8, 1.9), "7"),
          await read(band(source, 0.4, 2.1, 0), "7"),
        ];
        const local = lower.filter(
          (w) =>
            w.x >= x &&
            w.x + w.w < x + width + height * 0.2 &&
            Math.abs(w.y - n.y) < height * (n.uncertain ? 1.8 : 1.1) &&
            /\p{L}{2}/u.test(w.text),
        );
        const lines = [];
        for (const w of local.slice().sort((a, b) => a.y + a.h - (b.y + b.h))) {
          let line = lines.find(
            (l) => Math.abs(l.bottom - w.y - w.h) < height * 0.7,
          );
          if (!line) {
            line = { bottom: w.y + w.h, words: [] };
            lines.push(line);
          }
          line.words.push(w);
        }
        const quality = (r) => substituteReadQuality(r, height, n.x + n.w);
        const line = lines
          .filter((l) => l.words.length >= 2)
          .sort((a, b) =>
            n.uncertain && next
              ? Math.abs(a.bottom - next.y - next.h) -
                Math.abs(b.bottom - next.y - next.h)
              : quality({ text: "", words: b.words, spatial: true }) -
                quality({ text: "", words: a.words, spatial: true }),
          )[0];
        if (line) {
          if (n.uncertain) reads.length = 0;
          const ws = line.words.sort((a, b) => a.x - b.x);
          reads.push({
            text: ws.map((w) => w.text).join(" "),
            words: ws,
            spatial: true,
          });
          const y1 = Math.min(...ws.map((w) => w.y)) - height * 0.2,
            y2 = Math.max(...ws.map((w) => w.y + w.h)) + height * 0.2;
          const x2 = Math.max(...ws.map((w) => w.x + w.w)) + height * 0.2;
          reads.push(
            await read(
              crop(source, x, y1, Math.min(width, x2 - x), y2 - y1),
              "7",
            ),
          );
          reads.push(
            await read(
              crop(normalized, x, y1, Math.min(width, x2 - x), y2 - y1),
              "7",
            ),
          );
        }
        reads.sort((a, b) => quality(b) - quality(a));
        let name = (
          quality(reads[0]) < 0 ? "" : cleanPlayerText(reads[0].text)
        ).replace(/\s+[A-Za-z][.,]?$/u, "");
        if (name && n === ordered.at(-1)) {
          const wrap = lower.filter(
            (w) =>
              w.y > bottom &&
              w.y < bottom + height * 2.2 &&
              w.x < left + grid.sx * 0.5 &&
              /^\p{L}{2,}$/u.test(w.text),
          );
          name += wrap.length
            ? " " +
              wrap
                .sort((a, b) => a.x - b.x)
                .map((w) => w.text)
                .join(" ")
            : "";
        }
        players.push(
          candidate(
            n.uncertain ? "" : n.text,
            name,
            "substitute",
            "",
            `Review required · Name uncertain: verify transcription · OCR word score ${Math.max(0, Math.round(quality(reads[0])))}/100${!name ? " · name unresolved: crop may cross another row; left blank" : ""}${n.uncertain ? " · jersey unreadable; left blank" : ""}`,
          ),
        );
        details.push({ number: n.text, reads, slope });
      }
      regions.push({ substitutes: details });
    }
    if (!players.some((p) => p.role === "substitute"))
      players.push(
        ...parseSpatialPlayers(scan.words, { ocr: true }).filter(
          (p) => p.role === "substitute",
        ),
      );
    return {
      ...scan,
      players: players.filter((p) => !isMetadata(p.name)),
      diagnostics: { grid, regions },
    };
  } finally {
    finished = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
export async function imageCanvas(file) {
  if (
    /\.(heic|heif)$/i.test(file.name) ||
    /image\/(heic|heif)/i.test(file.type)
  )
    throw new Error(
      "HEIC/HEIF is not supported by this OCR build. Export/share as JPEG or PNG first (iPhone Camera → Formats → Most Compatible for future photos).",
    );
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      2200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    throw new Error(`Image could not be decoded: ${error.message}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function tsvWords(tsv) {
  return tsv
    .split("\n")
    .slice(1)
    .map((l) => l.split("\t"))
    .filter((r) => r[0] === "5" && r[11]?.trim())
    .map((r) => ({
      text: r.slice(11).join("\t").trim(),
      x: +r[6],
      y: +r[7],
      w: +r[8],
      h: +r[9],
      confidence: +r[10],
    }));
}
// Local mean threshold compensates for paper folds and sideline lighting.
export function normalizeLighting(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height),
    { width: w, height: h } = canvas;
  const gray = new Float32Array(w * h),
    integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        j = i * 4;
      gray[i] =
        image.data[j] * 0.299 +
        image.data[j + 1] * 0.587 +
        image.data[j + 2] * 0.114;
      sum += gray[i];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + sum;
    }
  }
  const radius = Math.max(10, Math.round(w / 77));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius),
        x2 = Math.min(w, x + radius + 1),
        y1 = Math.max(0, y - radius),
        y2 = Math.min(h, y + radius + 1);
      const mean =
        (integral[y2 * (w + 1) + x2] -
          integral[y1 * (w + 1) + x2] -
          integral[y2 * (w + 1) + x1] +
          integral[y1 * (w + 1) + x1]) /
        ((x2 - x1) * (y2 - y1));
      const v = gray[y * w + x] < mean * 0.8 ? 0 : 255;
      const j = (y * w + x) * 4;
      image.data[j] = image.data[j + 1] = image.data[j + 2] = v;
    }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
