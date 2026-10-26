// Programme structure, not an OCR sensitivity adjustment. No player vocabulary or
// expected team names are used here: candidates require a pair or a full grid.
export const isFooter = (text) =>
  /^(?:management|managers?|coaches?|coaching|flo|first\s*aid|sponsors?|selectors?|mentors?|physio(?:therapist)?|medical|backroom|officials?)\b/i.test(
    text.trim(),
  );
export const isSubs = (text) =>
  /^(?:subs(?:titutes)?|replacements?|fir\s+ionaid)\b\s*[:.\-]?/i.test(
    text.trim(),
  );
export const isStarting = (text) =>
  /^(?:starting\s*(?:xv|15|team)|starters)\s*:?$/i.test(text.trim());
export function isMetadata(text) {
  const value = text.trim();
  return (
    isFooter(value) ||
    isStarting(value) ||
    /^(?:lgfa|foireann|cumann\s+(?:peil|peile)|ladies\s+(?:gaelic|football)|gaelic\s+(?:football|athletic)|match\s*programme|programme|team\s*sheet|registered\s*panel|players?|jersey|position|home|away|page\s*\d+)\b/i.test(
      value,
    ) ||
    /\b(?:shield|championship|competition|final|semi[- ]?final|venue|throw[- ]?in|kick[- ]?off|county|under[- ]?\d+|u[- ]?\d{1,2}|sponsored|stadium|grounds?|versus)\b/i.test(
      value,
    ) ||
    /^(?:club|date|time|pitch|referee|naomh|st\.|saint)\b/i.test(value) ||
    /^(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|am|pm)$/i.test(
      value,
    ) ||
    /(?:https?:|www\.|@|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|\b\d{4,}\b)/.test(value)
  );
}
export function stripCaptain(text) {
  const markers = [];
  const name = String(text)
    .replace(/\s*[=~|]+\s*$/g, "")
    .replace(/\(\s*(VC|C)\s*\)/gi, (_, marker) => {
      markers.push(marker.toUpperCase());
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return {
    name,
    notes: [...new Set(markers)]
      .map((marker) => (marker === "VC" ? "Vice-captain (VC)" : "Captain (C)"))
      .join("; "),
  };
}
export function plausibleName(text, { uncertain = false } = {}) {
  const { name } = stripCaptain(text.replace(/\s*[=~|]+\s*$/g, ""));
  if (!name || isMetadata(name) || isSubs(name) || name.length > 100)
    return false;
  if (!/\p{L}{2}/u.test(name) || /[=:;\/\\]|\d{3,}/.test(name)) return false;
  // OCR damage such as R?gney is kept when a jersey anchors it, not corrected.
  if (!uncertain && /\d/.test(name)) return false;
  return true;
}
export function numberedEntries(text) {
  const value = text
    .replace(/\b(?:management|coaches?|flo|first\s*aid|sponsors?)\s*:.*/i, "")
    .trim();
  const matches = [
    ...value.matchAll(/(?:^|[\s,;])#?\(?(\d{1,2})[.)\-:]?\s+(?=\p{L}|\?)/gu),
  ];
  return matches
    .map((match, index) => ({
      number: match[1],
      name: value
        .slice(
          match.index + match[0].length,
          matches[index + 1]?.index ?? value.length,
        )
        .replace(/[,;\s]+$/, "")
        .trim(),
    }))
    .filter(
      (entry) =>
        +entry.number > 0 &&
        +entry.number <= 99 &&
        plausibleName(entry.name, { uncertain: true }),
    );
}
export function parseProgrammeSegments(
  raw,
  { layout = "auto", goal = "top", ocr = false, positions, candidate },
) {
  const segments = raw.map((segment, index) => ({ ...segment, index }));
  const subs = segments.filter((segment) => isSubs(segment.text));
  const subsY = Math.min(...subs.map((s) => s.y), Infinity);
  const startY = Math.min(
    ...segments.filter((s) => isStarting(s.text)).map((s) => s.y),
    Infinity,
  );
  const footY = Math.min(
    ...segments.filter((s) => isFooter(s.text)).map((s) => s.y),
    Infinity,
  );
  const inBody = (s) => s.y < subsY && s.y < footY;
  const inSubs = (s) => s.y >= subsY && s.y < footY;
  const confidence = (s) =>
    ocr
      ? `OCR word score ${Math.round(s.confidence)}/100 — verify player name`
      : "PDF text — verify player pairing";
  const usable = segments.filter(
    (s) => !isMetadata(s.text) && !isSubs(s.text) && s.y < footY,
  );
  const usedNames = new Set(),
    cards = [];
  function add(number, name, s, numberScore = s.confidence, anchor = null) {
    const uncertainNumber = ocr && numberScore < 85;
    const jersey = uncertainNumber ? "" : String(+number);
    const markers = segments
      .filter(
        (mark) =>
          /^\(\s*(?:C|VC)\s*\)$/i.test(mark.text.trim()) &&
          Math.abs(mark.y - s.y) < s.h &&
          Math.abs(mark.x - (s.x + s.w)) < s.h * 3,
      )
      .map((mark) => mark.text)
      .join(" ");
    const row = candidate(
      jersey,
      name + (markers ? " " + markers : ""),
      inSubs(s)
        ? "substitute"
        : +number <= 15 || s.y > startY
          ? "starter"
          : "substitute",
      "",
      confidence(s) +
        (uncertainNumber ? " · jersey uncertain; left blank" : ""),
    );
    cards.push({
      ...row,
      sourceNumber: String(+number),
      x: s.x + s.w / 2,
      y: s.y,
      h: s.h,
      w: s.w,
      source: s.index,
      anchor,
      paired: true,
    });
  }
  // Inline rows, including a complete substitutes list on the "Subs:" line.
  for (const s of segments.filter((s) => s.y < footY)) {
    const entries = numberedEntries(
      isSubs(s.text)
        ? s.text.replace(
            /^(?:subs(?:titutes)?|replacements?|fir\s+ionaid)\b\s*[:.\-]?\s*/i,
            "",
          )
        : s.text,
    );
    if (!entries.length) continue;
    for (const entry of entries) add(entry.number, entry.name, s);
    usedNames.add(s.index);
  }
  const anchors = usable
    .filter(
      (s) =>
        !segments.some(
          (label) =>
            isMetadata(label.text) &&
            Math.abs(label.y - s.y) < Math.max(s.h, label.h) * 0.7,
        ),
    )
    .filter((s) => /^#?\(?\d{1,2}[.)]*$/.test(s.text.trim()))
    .map((s) => ({ ...s, number: s.text.replace(/\D/g, "") }))
    .filter((s) => +s.number > 0 && +s.number <= 99);
  const names = usable.filter(
    (s) =>
      !usedNames.has(s.index) &&
      plausibleName(s.text, { uncertain: true }) &&
      !/^\d/.test(s.text),
  );
  const links = [];
  for (const anchor of anchors) {
    for (const name of names) {
      if (inBody(anchor) !== inBody(name) || inSubs(anchor) !== inSubs(name))
        continue;
      const h = Math.max(anchor.h, name.h, 8),
        dy = name.y - anchor.y;
      const dx = Math.abs(anchor.x + anchor.w / 2 - name.x - name.w / 2);
      const below =
        dy >= Math.max(anchor.h, 8) * 0.35 &&
        dy <= Math.max(anchor.h, 8) * 3.5 &&
        dx <= Math.max(name.w * 0.6, h * 1.5);
      const beside =
        Math.abs(dy) < h * 0.65 &&
        name.x >= anchor.x + anchor.w - h * 0.2 &&
        name.x - anchor.x - anchor.w < h * 4;
      if (below || beside)
        links.push({
          anchor,
          name,
          score: (beside ? 0.1 : dy / h) + dx / Math.max(name.w, 30),
        });
    }
  }
  const usedAnchors = new Set();
  for (const { anchor, name } of links.sort((a, b) => a.score - b.score)) {
    if (usedNames.has(name.index) || usedAnchors.has(anchor.index)) continue;
    // Attach a centred continuation line, but never jump to a different player.
    const next = names
      .filter(
        (n) =>
          !usedNames.has(n.index) &&
          n !== name &&
          n.y > name.y + name.h * 0.7 &&
          n.y < name.y + name.h * 2.1 &&
          Math.abs(n.x + n.w / 2 - name.x - name.w / 2) < name.h &&
          inBody(n) === inBody(name) &&
          inSubs(n) === inSubs(name) &&
          !links.some(
            (link) =>
              link.name.index === n.index && link.anchor.index !== anchor.index,
          ),
      )
      .sort((a, b) => a.y - b.y)[0];
    let fullName = name.text;
    if (next) {
      fullName += " " + next.text;
      usedNames.add(next.index);
    }
    add(anchor.number, fullName, name, anchor.confidence, anchor.index);
    usedAnchors.add(anchor.index);
    usedNames.add(name.index);
  }
  // A damaged name still gets a blank review row when enough of the numbered
  // starting grid is established. No placeholder name or jersey is invented.
  const strong = cards.filter(
    (node) => inBody(node) && +node.sourceNumber <= 15,
  );
  if (new Set(strong.map((node) => node.sourceNumber)).size >= 8) {
    const minY = Math.min(...strong.map((node) => node.y - node.h * 9)),
      maxY = Math.max(...strong.map((node) => node.y + node.h * 2));
    const minX = Math.min(...strong.map((n) => n.x)),
      maxX = Math.max(...strong.map((n) => n.x)),
      centerX = (minX + maxX) / 2;
    for (const anchor of anchors.filter(
      (a) =>
        !usedAnchors.has(a.index) &&
        inBody(a) &&
        +a.number <= 15 &&
        a.y >= minY &&
        a.y <= maxY &&
        a.x >= minX - a.h * 3 &&
        a.x <= maxX + a.h * 3 &&
        (+a.number !== 1 || Math.abs(a.x - centerX) < (maxX - minX) * 0.2) &&
        !strong.some((node) => node.sourceNumber === String(+a.number)),
    )) {
      add(
        anchor.number,
        "",
        { ...anchor, y: anchor.y + anchor.h * 1.7 },
        anchor.confidence,
        anchor.index,
      );
      cards.at(-1).confidence +=
        " · name unreadable: enter from programme before confirming";
    }
  }
  // Unnumbered names are admitted only if they form a full conventional six-row
  // grid (1–3–3–2–3–3), never merely because "Formation" was selected.
  const unpaired = names.filter((s) => !usedNames.has(s.index) && inBody(s)),
    combinedLoose = new Set(),
    loose = [];
  for (const s of unpaired) {
    if (combinedLoose.has(s)) continue;
    const continuation = !/\s/.test(s.text.trim())
      ? unpaired.find(
          (n) =>
            n !== s &&
            !combinedLoose.has(n) &&
            !/[\d\s]/.test(n.text.trim()) &&
            n.y > s.y + s.h * 0.6 &&
            n.y < s.y + s.h * 2.1 &&
            Math.abs(n.x + n.w / 2 - s.x - s.w / 2) < s.h,
        )
      : null;
    if (continuation) combinedLoose.add(continuation);
    const full = s.text + (continuation ? " " + continuation.text : "");
    if (
      stripCaptain(full)
        .name.split(/\s+/)
        .filter((token) => /\p{L}{2}/u.test(token)).length < 2
    )
      continue;
    loose.push({
      ...candidate(
        "",
        full,
        "starter",
        "",
        confidence(s) + " · no reliable jersey; left blank",
      ),
      x: s.x + s.w / 2,
      y: s.y,
      h: s.h,
      w: s.w,
      source: s.index,
      paired: false,
    });
  }
  const possible = [...cards.filter(inBody), ...loose];
  const groups = [];
  for (const node of possible.slice().sort((a, b) => a.y - b.y)) {
    let group = groups.find(
      (row) => Math.abs(row.y - node.y) < Math.max(node.h * 1.5, 14),
    );
    if (!group) {
      group = { y: node.y, nodes: [] };
      groups.push(group);
    }
    group.nodes.push(node);
  }
  const rows = goal === "bottom" ? groups.slice().reverse() : groups;
  const shape = [1, 3, 3, 2, 3, 3];
  let grid = null;
  for (let index = 0; index <= rows.length - 6; index++) {
    const selected = rows.slice(index, index + 6);
    if (selected.every((row, i) => row.nodes.length === shape[i])) {
      grid = selected;
      break;
    }
  }
  const placed = new Set();
  if (grid) {
    const gridNodes = grid.flatMap((row) => row.nodes);
    const conventional =
      gridNodes.every(
        (node) => node.sourceNumber && +node.sourceNumber <= 15,
      ) && new Set(gridNodes.map((node) => node.sourceNumber)).size === 15;
    let slot = 0;
    for (const row of grid) {
      for (const node of row.nodes
        .slice()
        .sort((a, b) => (goal === "bottom" ? b.x - a.x : a.x - b.x))) {
        placed.add(node);
        node.role = "starter";
        node.order = conventional ? +node.sourceNumber - 1 : slot;
        node.position = positions[node.order];
        slot++;
        node.confidence += conventional
          ? " · conventional 1–15 formation position; editable"
          : " · formation position inferred; verify sides";
      }
    }
  }
  const accepted = [...cards, ...loose.filter((node) => placed.has(node))];
  // A numbered pair remains evidence even if OCR loses another formation slot.
  for (const node of cards) {
    if (!placed.has(node) && inBody(node) && +node.sourceNumber <= 15) {
      node.role = "starter";
      node.position = positions[+node.sourceNumber - 1];
      node.confidence += " · jersey position suggestion; editable";
    }
  }
  return accepted
    .sort((a, b) =>
      a.role === "substitute" && b.role !== "substitute"
        ? 1
        : b.role === "substitute" && a.role !== "substitute"
          ? -1
          : (a.order ?? (a.sourceNumber ? +a.sourceNumber - 1 : 1000)) -
              (b.order ?? (b.sourceNumber ? +b.sourceNumber - 1 : 1000)) ||
            a.y - b.y ||
            a.x - b.x,
    )
    .map(
      ({
        sourceNumber,
        x,
        y,
        h,
        w,
        source,
        anchor,
        paired,
        order,
        ...player
      }) => player,
    );
}
