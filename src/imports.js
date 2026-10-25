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
export function candidatesFromRows(rows) {
  rows = rows.filter((row) => row.some((value) => String(value ?? "").trim()));
  const header = (rows[0] || []).map((value) =>
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
  const numberIndex = header.findIndex((value) =>
    ["number", "jersey", "jersey number", "no", "no."].includes(value),
  );
  const nameIndex = header.findIndex((value) =>
    ["name", "player", "player name"].includes(value),
  );
  const hasHeader = numberIndex >= 0 && nameIndex >= 0;
  const roleIndex = header.findIndex((value) =>
    ["role", "starter/substitute", "match role"].includes(value),
  );
  const data = hasHeader ? rows.slice(1) : rows;
  if (data.length > 1000)
    throw new Error(
      "More than 1,000 rows. Choose a file containing only the team sheet.",
    );
  return data.map((row) => ({
    number: String(row[hasHeader ? numberIndex : 0] ?? ""),
    name: String(row[hasHeader ? nameIndex : 1] ?? "").trim(),
    role:
      String(row[hasHeader ? roleIndex : 2] ?? "").toLowerCase() ===
      "substitute"
        ? "substitute"
        : "starter",
    confidence: "Review required",
    position: "",
    notes: "",
  }));
}
export function candidatesFromText(text) {
  const players = text
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^(\d{1,2})[\s.)\-:]+(.+)$/u))
    .filter(Boolean)
    .map(([, number, name]) => ({
      number,
      name: name.trim(),
      role: "starter",
      position: "",
      notes: "",
      confidence: "Uncertain — verify text extraction",
    }));
  if (players.length > 1000)
    throw new Error(
      "More than 1,000 candidates. Choose the team-sheet pages only.",
    );
  return players;
}
export async function extractCandidates(file) {
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose a file smaller than 15 MB.");
  const extension = file.name.split(".").at(-1).toLowerCase();
  if (["csv", "tsv", "txt"].includes(extension)) {
    const text = await file.text();
    return {
      players:
        extension === "txt"
          ? candidatesFromText(text)
          : candidatesFromRows(parseDelimited(text)),
      message:
        "Local text extraction. Verify every number and name before confirming.",
    };
  }
  if (extension === "xlsx") {
    const { readSheet } = await import("read-excel-file/browser");
    return {
      players: candidatesFromRows(await readSheet(file)),
      message:
        "First worksheet imported locally. Verify every number and name.",
    };
  }
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    const { default: workerUrl } =
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const document = await task.promise;
      if (document.numPages > 20)
        throw new Error(
          "PDF has more than 20 pages. Choose the team-sheet pages only.",
        );
      const lines = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const { items } = await page.getTextContent();
        let line = "",
          lastY = null;
        for (const item of items) {
          if (!("str" in item)) continue;
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 4) {
            lines.push(line);
            line = "";
          }
          line += (line ? " " : "") + item.str;
          lastY = item.transform[5];
          if (item.hasEOL) {
            lines.push(line);
            line = "";
            lastY = null;
          }
        }
        if (line) lines.push(line);
      }
      const players = candidatesFromText(lines.join("\n"));
      return {
        players,
        message: players.length
          ? "PDF text candidates only — layout can mix columns. Verify all rows."
          : "No usable text found. Scanned PDF OCR is not available; enter the players in the review table.",
      };
    } finally {
      await task.destroy();
    }
  }
  if (file.type.startsWith("image/"))
    return {
      players: [],
      message:
        "Photo OCR is not available in this build. Use the photo below as a reference and transcribe players into the review table. Nothing is guessed or imported automatically.",
    };
  throw new Error(
    "Supported: CSV, TSV, TXT, XLSX, PDF, and images. Convert legacy .xls files to .xlsx or CSV first.",
  );
}
