# Regression Team Sheet #3

`Regression_Team_Sheet_3.jpeg` is the **unaltered original JPEG** supplied by the user in `WhatsApp Image 2026-10-26 at 13.39.48.jpeg.zip`, not a synthetic rendering, recompressed image, or screenshot.

- Dimensions: 1080 × 1920
- SHA-256: `2cedf658b54a994d81825ca597d667aa77143e1cddccd0455f1975675c998984`
- Printed age-group roster above a handwritten numbered formation. Roster list indices and ticks are not match jersey assignments.
- Blank right-hand substitute lines must not produce players. #9 formation name is blank. #1 has multiple unclear indications. Megan and Heidi have multiple roster candidates.
- The browser regression runs actual bundled OCR against the JPEG; it does not replay captured OCR or mock the recognizer. Synthetic unit cases supplement this test.
- Handwriting is not reliably read by this printed-English OCR engine. Tests must preserve uncertainty, not encode expected surnames as production data.

The exact Sheet #2 original is now also available as `Tullamore_U14_Shield_Final.jpg`; its provenance and measured pre-change baseline are documented alongside it.

V0.3.7 dedicated-formation refinement baseline (commit
`d4ffa6f4b48220ba8d0de562356797d7458f7720`): 139 unit tests, 85 browser tests and
production build pass. Exact-photo baseline recovers 15 visible position numbers,
27 printed reference rows, and one supported full-name assignment: #5 Riona Foley.
The other 14 positions remain unresolved; #2 has Megan Heavin/Megan Kelly
alternatives, #11 has Mella Casey/Mila Fralkova alternatives, and #9 is blank.

The isolated matcher now supports full surnames, bounded surname fragments,
adjacent-letter transpositions, joined initial+middle-name clues, and strong
multi-word disambiguation using only this photo's extracted reference roster.
It retains the existing confidence gates and rejects duplicate automatic player
assignments across positions. Position fields derive from the readable formation
number, never printed-list order or a missing anchor's array index. Unmatched
fields remain Review name; no missing first names/surnames are invented.

Experimental alternative OCR crop/segmentation and writing-rule cleanup did not
reliably improve this genuine photograph. Those experiments are NOT part of the
change. Final real-image output still has one resolved full name and 14 review
positions. Supplemental controlled tests verify matching rules when the clue
itself is actually recognised; they do not replace the real-photo regression.

Assisted-resolution follow-up: the real photo now opens a dedicated 15-position
review, with the same one automatic name and safe unresolved/ambiguous positions.
The coach chooses full names from this same extracted roster, with suggested
candidates first, used players disabled, editable automatic assignments, and
optional explicit correction of uncertain printed names. Nothing is added to a
match until all 15 positions are assigned and Confirm Team is tapped. Unassigned
roster names become available substitutes with BLANK jersey numbers. Printed
list indices are never assigned as substitute jerseys. Human choices in the E2E
(including position #9, which is blank in the photograph) are test interactions,
not claimed OCR recovery or hard-coded production assignments.
