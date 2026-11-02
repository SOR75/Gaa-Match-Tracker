# Exact uploaded St Manchans ordered photograph

`Pic.jpg` is the unmodified JPEG from the user's `Pic.jpg.zip` upload on
2026-11-02. SHA-256:
`3c5dde7e069406490707cbdc14cb6d32efc3740bed9d0c7cb5d43b968c873d79`.

The photograph itself, rather than a recreation or player dictionary, is used
by `tests/browser/ordered-photo03103.spec.js` through the real production UI
photo input, imageCanvas, recognizeImage, and editable review table.

Important source discrepancy: the actual uploaded photograph has #16 blank,
#17 Daithi Shirley, #18 Cian Bracken, #19 Ronan Kelly, #20 Oran Hanniffy,
#21 Domhnall Molloy, #22 Tommy Doherty, #23 Mattie McHale, #24 Senan Dunne,
and #25 Sean Moran. It does not contain 25 named entries or two Sean Morans.
Never shift the printed numbers to fit the earlier typed expectations.

The three JSON files are actual Tesseract word boxes/confidence values captured
before the fix from the original sparse, lighting-normalized sparse and original
block scans at the existing 1288 × 2200 OCR canvas size. They are diagnostic
fixtures, not replacement images or hand-labelled ideal OCR output.

Before the fix, the exact photo production-UI regression fails: the original
sparse scan parses 14 candidates, normalized sparse 16, block 15. Choosing the
largest pass returns 16 rows with missing and mispaired lower entries. This
locally reproduces the failure class, not the Mac's exact 14-row transcript.
The block scan already contains the real isolated #16 and #17–19. The normalized
scan contains #20–23; the final page-level digit prefixes are misread as 54/55.
Their positions can trigger a bounded reread; their values must not be accepted
without an independent confident read of the actual pixels.

After recovery: 25 numbered review rows, 15 starters + 10 substitute rows;
#16 remains blank with Review name. Name uncertainty is retained. OCR may read
#14 as Cian Duffy rather than Dufty; this is not silently dictionary-corrected.
