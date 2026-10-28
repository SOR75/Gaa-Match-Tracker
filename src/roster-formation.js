import { candidate, POSITIONS } from "./import-parser.js";
import { cleanOcrToken } from "./programme-geometry.js";
import { isMetadata, isFooter } from "./programme-parser.js";

const letters = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const median = (values) =>
  values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const heading = (text) =>
  isMetadata(text) ||
  isFooter(text) ||
  /\b(?:older|younger|girls|boys|ref|changes|subs|players?|panel|competition|venue)\b|\d{3,}/i.test(
    text,
  );
export function rosterTokens(words) {
  return words
    .filter((w) =>
      /^(?:\p{Lu}[\p{L}'’.-]{2,}|[A-Z][.])[^\p{L}]*$/u.test(w.text),
    )
    .map((w) => ({ ...w, text: cleanOcrToken(w.text) }));
}
// A printed reference roster is distinct from a numbered programme: require
// repeated name columns AND a roster/age header ABOVE an independently fitted XV.
export function detectReferenceRoster(words, grid) {
  if (!grid) return null;
  const upper = words.filter((w) => w.y + w.h < grid.y0 - grid.sy * 0.55);
  const headers = upper.filter((w) =>
    /^(?:players?|older|younger|roster|panel)$/i.test(w.text),
  );
  if (!headers.length) return null;
  const height = median(
    upper.filter((w) => /^\p{Lu}\p{Ll}{2,}/u.test(w.text)).map((w) => w.h),
  );
  if (!height) return null;
  const tokens = rosterTokens(upper).filter(
    (w) => !heading(w.text) && w.confidence >= 65,
  );
  const clusters = [];
  for (const w of tokens.slice().sort((a, b) => a.x - b.x)) {
    let c = clusters.find((c) => Math.abs(c.x - w.x) < height * 1.25);
    if (!c) clusters.push((c = { x: w.x, words: [] }));
    c.words.push(w);
    c.x = median(c.words.map((v) => v.x));
  }
  const columns = [];
  for (const c of clusters
    .filter((c) => c.words.length >= 6)
    .sort((a, b) => a.x - b.x)) {
    if (!columns.some((prev) => c.x - prev.x < grid.sx * 0.65)) columns.push(c);
  }
  const rows = [];
  for (const [index, column] of columns.entries()) {
    const right = Math.min(
      columns[index + 1]?.x - height * 1.7 || Infinity,
      column.x + grid.sx * 0.92,
    );
    const inColumn = upper.filter(
      (w) => w.x >= column.x - height * 1.25 && w.x < right,
    );
    const footerY = Math.min(
      ...inColumn.filter((w) => isFooter(w.text)).map((w) => w.y),
      Infinity,
    );
    for (const first of rosterTokens(inColumn.filter((w) => w.y < footerY))
      .filter(
        (w) => Math.abs(w.x - column.x) < height * 1.25 && w.confidence >= 35,
      )
      .sort((a, b) => a.y - b.y)) {
      if (
        rows.some((r) =>
          r.words.some((w) => w.x === first.x && w.y === first.y),
        )
      )
        continue;
      const near = inColumn.filter(
        (w) =>
          w.x >= first.x - 2 &&
          Math.abs(w.y + w.h / 2 - first.y - first.h / 2) < height * 0.9,
      );
      const text = near.map((w) => w.text).join(" ");
      if (heading(text)) continue;
      const selected = rosterTokens(near)
        .filter((w) => w.h >= height * 0.65)
        .sort((a, b) => a.x - b.x);
      // Require a first name at the column start and a plausible surname; a tick
      // or a bare list index is never sufficient evidence for a player.
      if (
        selected[0]?.x !== first.x ||
        selected.length < 2 ||
        selected.length > 4
      )
        continue;
      if (
        selected.some(
          (w, i) =>
            i && w.x - selected[i - 1].x - selected[i - 1].w > height * 3.5,
        )
      )
        continue;
      rows.push({
        words: selected,
        text: selected.map((w) => w.text).join(" "),
        lineBox: [
          first.x - height * 0.2,
          first.y - height * 0.35,
          right - first.x + height * 0.2,
          height * 1.8,
        ],
        box: [
          first.x - height * 0.2,
          Math.min(...selected.map((w) => w.y)) - height * 0.25,
          Math.min(
            right,
            Math.max(...selected.map((w) => w.x + w.w)) + height * 0.3,
          ) -
            first.x +
            height * 0.2,
          Math.max(...selected.map((w) => w.y + w.h)) -
            Math.min(...selected.map((w) => w.y)) +
            height * 0.5,
        ],
      });
    }
  }
  return rows.length >= 8
    ? { rows, height, columns: columns.map((c) => c.x) }
    : null;
}
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] !== b[j - 1]),
      );
    prev = row;
  }
  return prev[b.length];
}
function adjacentSwap(a, b) {
  if (a.length !== b.length) return false;
  const changed = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]));
  return (
    changed.length === 2 &&
    changed[1] === changed[0] + 1 &&
    a[changed[0]] === b[changed[1]] &&
    a[changed[1]] === b[changed[0]]
  );
}
// Matching is constrained to names actually read on THIS sheet. No dictionary,
// positional names, expected surnames or visual-test answers enter production.
export function associateRosterClue(reads, roster) {
  const evidence = [];
  for (const read of reads) {
    const tokens = read.words
      .filter((w) => /\p{L}{2}/u.test(w.text) && w.confidence >= 25)
      .map((w) => letters(w.text))
      .filter((t) => t.length >= 3);
    for (const token of tokens) {
      // Consider ALL plausible candidates, even if one is an exact match. A
      // longer first name sharing a distinctive prefix must not be hidden by
      // a shorter exact candidate. Matching uses this photograph's roster only.
      const matches = roster.flatMap((r) => {
        const parts = r.name.split(/\s+/).map(letters);
        const exact = parts.includes(token);
        const first = parts[0] || "";
        const fuzzy = parts.some(
          (part) =>
            Math.min(part.length, token.length) >= 4 &&
            Math.max(part.length, token.length) >= 5 &&
            (distance(token, part) === 1 || adjacentSwap(token, part)),
        );
        const joinedInitial =
          parts.length >= 3 &&
          parts
            .slice(1, -1)
            .some((part) => part.length >= 3 && token === parts[0][0] + part);
        const boundedFragment = parts.some(
          (part) =>
            token.length >= 4 &&
            token.length < part.length &&
            token.length / part.length >= 0.65 &&
            (part.startsWith(token) || part.endsWith(token)),
        );
        // Joined cursive can lose vowels. A short clue is useful only when
        // its boundary letters and >=2 consonants survive in order, and the
        // only missing characters are vowels or joined repeated letters. This still requires the strict
        // partial-match acceptance score, never the weaker consensus shortcut.
        let cursor = 0;
        const missing = [];
        for (const c of first.replace(/(.)\1+/g, "$1")) {
          if (c === token[cursor]) cursor++;
          else missing.push(c);
        }
        const vowelOmission =
          token.length >= 3 &&
          token.length < first.length &&
          token.length / first.length >= 0.6 &&
          first[0] === token[0] &&
          first.at(-1) === token.at(-1) &&
          (token.match(/[^aeiou]/g) || []).length >= 2 &&
          cursor === token.length &&
          missing.length <= 2 &&
          missing.every((c) => /[aeiou]/.test(c));
        const partial = boundedFragment || vowelOmission;
        const kind =
          exact || joinedInitial
            ? "exact"
            : fuzzy
              ? "fuzzy"
              : partial
                ? token.length < 4
                  ? "fragment"
                  : "partial"
                : "";
        return kind ? [{ player: r, kind }] : [];
      });
      const score =
        read.words.find((w) => letters(w.text) === token)?.confidence || 0;
      if (
        matches.length &&
        (matches.some((m) => m.kind === "exact") || score >= 35)
      )
        evidence.push({
          token,
          possible: matches.map((m) => m.player),
          kind: matches[0].kind,
          score,
          readIndex: reads.indexOf(read),
        });
    }
  }
  let candidates = [...new Set(evidence.flatMap((e) => e.possible))];
  // Two independently strong words on the same spatial line can disambiguate
  // a shared first name/surname. Conflicting strong reads never get outvoted.
  const joint = [];
  for (let i = 0; i < reads.length; i++) {
    const strong = evidence.filter(
      (e) => e.readIndex === i && e.score >= 75 && e.kind === "exact",
    );
    if (new Set(strong.map((e) => e.token)).size < 2) continue;
    const intersection = strong[0].possible.filter((p) =>
      strong.every((e) => e.possible.includes(p)),
    );
    if (intersection.length === 1) joint.push(intersection[0]);
  }
  if (new Set(joint).size === 1) {
    const chosen = joint[0];
    if (
      evidence
        .filter((e) => e.score >= 75)
        .every((e) => e.possible.includes(chosen))
    )
      candidates = [chosen];
  }
  if (
    candidates.length === 1 &&
    evidence.some(
      (e) =>
        (e.kind === "fragment"
          ? false
          : e.kind === "fuzzy"
            ? e.score >= 65
            : e.score >= 75) ||
        (!["partial", "fragment"].includes(e.kind) &&
          e.score >= 50 &&
          evidence.filter((v) => v.token === e.token).length >= 2),
    )
  ) {
    if (candidates[0].uncertain)
      return {
        name: "",
        warning: `Possible roster match: ${candidates[0].name}; printed surname uncertain, no full-name assignment`,
        evidence,
      };
    return {
      name: candidates[0].name,
      matched: candidates[0],
      warning: "Roster-assisted name; verify handwriting and full-name pairing",
      evidence,
    };
  }
  if (candidates.length) {
    return {
      name: "",
      warning: `Handwriting unresolved / ambiguous; possible roster matches: ${candidates.map((r) => r.name).join(" / ")}. No surname assigned`,
      evidence,
    };
  }
  return {
    name: "",
    warning:
      "Handwriting blank or unreadable; enter name from original. No roster match assigned",
    evidence,
  };
}
export function referencePlayers(roster, formation) {
  const used = new Set();
  const associations = formation.map(({ reads }) =>
    associateRosterClue(reads, roster),
  );
  const players = formation.map(({ number, reads }, i) => {
    let result = associations[i];
    if (
      result.matched &&
      associations.filter((r) => r.matched === result.matched).length > 1
    ) {
      result = {
        name: "",
        warning: `One printed player (${result.matched.name}) matches multiple formation positions; verify the assignment`,
        evidence: result.evidence,
      };
    }
    if (result.matched) used.add(result.matched);
    const clue =
      reads
        .map((r) =>
          r.words
            .filter((w) => w.confidence >= 50 && letters(w.text).length >= 3)
            .map((w) => w.text)
            .join(" "),
        )
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0] || "";
    const warning = `${result.name ? "Printed reference: " + result.name : "Review name"} · ${result.warning}${clue ? " · Formation clue: " + clue : ""}`;
    const row = candidate(
      number,
      result.name,
      "starter",
      /^[1-9]$|^1[0-5]$/.test(String(number))
        ? POSITIONS[Number(number) - 1]
        : "",
      `Review required · ${warning}${!number ? " · jersey unreadable; left blank" : ""} · formation position suggestion; editable`,
    );
    row.notes = warning;
    return row;
  });
  for (const r of roster.filter((r) => !used.has(r)))
    players.push(
      candidate(
        "",
        r.name,
        "panel",
        "",
        `Review required · Printed reference roster only; NOT a jersey assignment or confirmed selection · OCR word score ${Math.round(r.wordScore ?? r.score)}/100${r.uncertain ? " · Name uncertain: verify damaged/crossed-out printed text" : ""} · verify name`,
      ),
    );
  return players;
}

// Read digits, never manufacture them from a formation slot. Non-standard
// jerseys are allowed; only a duplicate established anchor is rejected.
export function referenceNumber(reads, anchors) {
  const actual = reads.find(
    (r) =>
      /^[1-9]\d?[.),]*$/.test(r.text.trim()) &&
      r.words.length &&
      r.words.every((w) => w.confidence >= 65),
  );
  const digits = actual?.text.replace(/\D/g, "");
  return digits && !anchors.some((a) => a.n === +digits) ? digits : "";
}

export async function readReferenceFormation({
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
}) {
  const roster = [],
    regions = [];
  for (const [index, row] of reference.rows.entries()) {
    onProgress(
      `Reading printed reference player ${index + 1}/${reference.rows.length}`,
    );
    const alternatives = [
      row,
      await read(crop(source, ...row.box), "7"),
      await read(crop(normalized, ...row.box), "7"),
      // A handwritten tick can inflate a surname's OCR box across two table
      // rows. Also read a band based on the printed first-name line height.
      await read(crop(source, ...row.lineBox), "7"),
      await read(crop(normalized, ...row.lineBox), "7"),
    ];
    const scored = alternatives
      .map((r) => {
        const words = rosterTokens(r.words);
        const name = words.map((w) => w.text).join(" ");
        const first = letters(words[0]?.text || "");
        const expected = letters(row.words[0].text);
        const score =
          words.reduce((s, w) => s + w.confidence * w.text.length, 0) /
          Math.max(
            1,
            words.reduce((s, w) => s + w.text.length, 0),
          );
        const wordScore = Math.min(...words.map((w) => w.confidence));
        return {
          name,
          score,
          wordScore,
          uncertain: wordScore < 85,
          valid:
            words.length >= 2 &&
            words.length <= 4 &&
            distance(first, expected) <= 1 &&
            !heading(name),
        };
      })
      .filter((r) => r.valid)
      .sort((a, b) => b.score - a.score);
    if (scored[0]) {
      const chosen = scored[0];
      // Disagreement between credible regional reads is itself uncertainty,
      // even when a damaged word happens to get a high OCR score.
      chosen.uncertain ||= scored.some(
        (r) =>
          r.score >= chosen.score - 15 &&
          letters(r.name) !== letters(chosen.name),
      );
      roster.push(chosen);
    }
    regions.push({
      roster: index + 1,
      box: row.box,
      lineBox: row.lineBox,
      alternatives,
    });
  }
  const formation = [];
  for (let i = 0; i < slots.length; i++) {
    onProgress(`Reading handwritten formation ${i + 1}/15`);
    const [tx, ty] = slots[i],
      x = grid.x0 + tx * grid.sx,
      y = grid.y0 + ty * grid.sy + tx * (grid.tilt || 0);
    // Handwriting is beside the anchor in this class of sheet. Bound the region
    // to its own column/row, never to the next formation row or the sidebar.
    const box = [
      x + grid.sx * 0.08,
      y - grid.sy * 0.45,
      grid.sx * 0.8,
      grid.sy * 0.92,
    ];
    const local = scan.words.filter(
      (w) =>
        w.x >= box[0] &&
        w.x + w.w / 2 < box[0] + box[2] &&
        w.y + w.h / 2 >= box[1] &&
        w.y + w.h / 2 < box[1] + box[3],
    );
    const reads = [
      { text: local.map((w) => w.text).join(" "), words: local },
      await read(crop(source, ...box), "7"),
      await read(crop(normalized, ...box), "7"),
    ];
    const anchor = grid.anchors.find((a) => a.n === i + 1);
    let number = anchor ? String(anchor.n) : "";
    if (!anchor) {
      await worker.setParameters({ tessedit_char_whitelist: "0123456789.)," });
      const numberBox = [
        x - grid.sx * 0.065,
        y - grid.sy * 0.1,
        grid.sx * 0.13,
        grid.sy * 0.38,
      ];
      const numbers = [
        await read(crop(source, ...numberBox), "10"),
        await read(crop(normalized, ...numberBox), "10"),
      ];
      await worker.setParameters({ tessedit_char_whitelist: "" });
      number = referenceNumber(numbers, grid.anchors);
      regions.push({ slot: i + 1, numberBox, numbers });
    }
    formation.push({ number, reads });
    regions.push({ slot: i + 1, box, reads });
  }
  return {
    ...scan,
    players: referencePlayers(roster, formation),
    diagnostics: {
      layout: "reference-roster-with-formation",
      grid,
      roster,
      formation,
      regions,
    },
  };
}
