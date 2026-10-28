Exact original screenshot supplied in Screenshot 2026-10-27 at 21.31.13.png.zip.
No image modification. Two Foireann player columns with red jerseys, registered
names, DOB/member-ID detail lines followed by English names. 26 players, including
three unnumbered entries and two distinct entries both visibly numbered 22.
Regression expectations belong in tests, never in parser vocabulary.

SHA256: cd1493219c7d43c19a09e9958bd0184ead013eca1a8c2d216694b0557dbe06bd

Physical V0.3.7 retest upload (2026-10-28), ZIP file
`Screenshot 2026-10-27 at 21.31.13.png.zip`, was extracted and SHA-256 compared.
It is byte-for-byte identical to this fixture, so no replacement/recreated image
is used. `Foireann_Physical_Test_OCR.json` records actual whole-image OCR words,
coordinates and confidence for diagnostic replay. The physical regression runs
real OCR of this PNG with whole-page DOB tokens deliberately suppressed at the
worker-message boundary; no player names, numbers or crop OCR are mocked. This
checks routing resilience separately from the unchanged original-image test.
