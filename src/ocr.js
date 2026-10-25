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
    const { data } = await Promise.race([
      worker.recognize(input, { rotateAuto: true }, { tsv: true }),
      interruption,
    ]);
    const words = data.tsv
      .split("\n")
      .slice(1)
      .map((line) => line.split("\t"))
      .filter((row) => row[0] === "5" && row[11]?.trim())
      .map((row) => ({
        text: row.slice(11).join("\t").trim(),
        x: +row[6],
        y: +row[7],
        w: +row[8],
        h: +row[9],
        confidence: +row[10],
      }));
    return { text: data.text, words };
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
