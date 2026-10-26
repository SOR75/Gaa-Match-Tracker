// Local adapters return candidates, never mutate a squad or auto-confirm recognition.
export function parseDelimited(text) {
  const delimiter = text.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === "\n")) {
      row.push(cell.trim());
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (c !== "\r" || quoted) cell += c;
  }
  if (quoted)
    throw new Error(
      "Unclosed quote in CSV. Correct the file or enter the rows manually.",
    );
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((row) => row.some(Boolean));
}

export {
  parseTablePlayers as candidatesFromRows,
  parseTextPlayers as candidatesFromText,
} from "./import-parser.js";
import {
  parseTablePlayers,
  parseTextPlayers,
  parseSpatialPlayers,
} from "./import-parser.js";
export async function extractCandidates(file, options = {}) {
  const { signal, onProgress = () => {} } = options;
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose a file smaller than 15 MB.");
  const extension = file.name.split(".").at(-1).toLowerCase();
  if (["csv", "tsv", "txt"].includes(extension)) {
    const text = await file.text();
    const tabular = extension !== "txt" || /[,\t]/.test(text.split(/\r?\n/)[0]);
    return {
      players: tabular
        ? parseTablePlayers(parseDelimited(text), options)
        : parseTextPlayers(text, options),
      message:
        "Local text extraction. Blank jerseys stay blank; all names, positions and selection status require review.",
    };
  }
  if (extension === "xlsx") {
    const { readSheet } = await import("read-excel-file/browser");
    return {
      players: parseTablePlayers(await readSheet(file), options),
      message:
        "First worksheet extracted locally. Review positions, blank jerseys and selection status.",
    };
  }
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    const { default: workerUrl } = await import(
      "pdfjs-dist/build/pdf.worker.min.mjs?url"
    );
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    let scanned = 0;
    const players = [],
      warnings = [];
    try {
      const pdfDocument = await task.promise;
      if (pdfDocument.numPages > 20)
        throw new Error(
          "PDF has more than 20 pages. Select the team-sheet pages only.",
        );
      for (let index = 1; index <= pdfDocument.numPages; index++) {
        if (signal?.aborted) throw new Error("Import cancelled.");
        onProgress(`Reading PDF page ${index}/${pdfDocument.numPages}`);
        const page = await pdfDocument.getPage(index),
          viewport = page.getViewport({ scale: 1 });
        const { items } = await page.getTextContent();
        const words = items
          .filter((item) => item.str?.trim())
          .map((item) => {
            const [x, y] = viewport.convertToViewportPoint(
              item.transform[4],
              item.transform[5],
            );
            const h = Math.abs(item.height) || 12;
            return {
              text: item.str.trim(),
              x,
              y: y - h,
              w: item.width,
              h,
              confidence: 100,
            };
          });
        const usable = words.filter((word) => /\p{L}/u.test(word.text)).length;
        if (usable >= 2) {
          // Use real PDF text, not OCR. Checked PDF form widgets supplement the text layer.
          const annotations = await page.getAnnotations();
          for (const mark of annotations.filter(
            (mark) =>
              mark.fieldType === "Btn" &&
              mark.fieldValue &&
              !["Off", "off", "false"].includes(String(mark.fieldValue)),
          )) {
            const [x1, y1] = viewport.convertToViewportPoint(
              mark.rect[0],
              mark.rect[1],
            );
            const [x2, y2] = viewport.convertToViewportPoint(
              mark.rect[2],
              mark.rect[3],
            );
            words.push({
              text: "✓",
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              w: Math.abs(x2 - x1),
              h: Math.abs(y2 - y1),
              confidence: 100,
            });
          }
          const parsed = parseSpatialPlayers(words, options);
          players.push(...parsed);
          if (options.layout === "registered")
            warnings.push(
              "Handwritten marks absent from the PDF text/form layer are not reliably recovered. Review jerseys and first Starting checkbox.",
            );
        } else {
          scanned++;
          if (scanned > 3) {
            warnings.push(
              `Page ${index} not OCR processed: device limit is 3 scanned pages per import. Split the remaining pages into another PDF.`,
            );
            continue;
          }
          const scale = Math.min(
            2,
            2200 / Math.max(viewport.width, viewport.height),
          );
          const rendering = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(rendering.width);
          canvas.height = Math.ceil(rendering.height);
          try {
            await page.render({
              canvas,
              canvasContext: canvas.getContext("2d"),
              viewport: rendering,
            }).promise;
            const { recognizeImage } = await import("./ocr.js");
            const result = await recognizeImage(canvas, { signal, onProgress });
            players.push(
              ...(result.players ??
                parseSpatialPlayers(result.words, { ...options, ocr: true })),
            );
          } finally {
            canvas.width = canvas.height = 0;
          }
        }
      }
      return {
        players,
        message: `PDF extraction: text layers read directly; ${scanned ? Math.min(scanned, 3) + " scanned page(s) OCR processed locally" : "no OCR needed for printed text"}. All candidates require review. ${warnings.join(" ")}`,
      };
    } finally {
      await task.destroy();
    }
  }
  if (
    file.type.startsWith("image/") ||
    /^(png|jpe?g|webp|heic|heif)$/.test(extension)
  ) {
    const { imageCanvas, recognizeImage } = await import("./ocr.js");
    const canvas = await imageCanvas(file);
    try {
      const result = await recognizeImage(canvas, { signal, onProgress });
      return {
        players:
          result.players ??
          parseSpatialPlayers(result.words, { ...options, ocr: true }),
        message:
          result.diagnostics?.layout === "reference-roster-with-formation"
            ? `Printed reference roster and bottom formation detected separately. ${result.players.filter((p) => p.role === "starter").length} formation slots; ${result.players.filter((p) => p.role === "starter" && !p.name).length} names unresolved. Handwriting matches are provisional: review against the original. Remaining roster entries are panel candidates with blank jerseys, not confirmed substitutes. Complete or remove blank-name rows before confirming.`
            : "On-device printed-text OCR completed. Review every candidate: handwriting and flattened Starting checkboxes are not reliably recognised; uncertain jerseys stay blank. Formation positions are provisional and require verification.",
      };
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  throw new Error(
    "Supported: JPEG/PNG/WebP, PDF, CSV/TSV/TXT and XLSX. Export HEIC as JPEG/PNG; convert legacy .xls to .xlsx.",
  );
}
