import { fitFormation } from "./programme-geometry.js";
import { detectReferenceRoster } from "./roster-formation.js";

// Narrow classification preflight, not a new OCR/matching heuristic. The existing
// detectors must establish BOTH a lower formation and >=2 upper roster columns.
// Preserve normalised-pass preference; use the source pass if its anchors survive
// better. Roster text can still come from the normalised pass in that case.
export function referenceFormationRoute(normalizedScan, sourceScan) {
  const scans = [normalizedScan, sourceScan];
  for (const anchorScan of scans) {
    const grid = fitFormation(anchorScan.words);
    if (!grid) continue;
    for (const rosterScan of scans) {
      const reference = detectReferenceRoster(rosterScan.words, grid);
      if (reference && reference.columns.length >= 2)
        return { grid, reference, scan: rosterScan };
    }
  }
  return null;
}
