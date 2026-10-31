# Actual PDF-snapshot review facts

The two source PDFs are the exact uploaded ten-page reports. Their SHA-256 values are recorded in the corresponding `*-pdf-snapshot.json` display models. Models contain printed aggregates, the printed player matrix and the complete printed scoring sequence only. They are NOT saved matches, reconstructed full event logs or permanent player records; no event ID or shot coordinate has been invented.

Player cells were extracted by their actual PDF column positions and row boundaries. The percentage column was independently derived from the printed goals/points/two-pointers and attempts because the original narrow column wrapped digits across pages. Scoring totals and half totals reconcile to the source scoreboard. Player totals may be lower because unattributed events have not been distributed among players.

Unavailable in these PDFs: original shot coordinates and per-event team/half locations, corrected 40m buckets, source attempt denominators, per-half kickout outcomes and substitution events. These stay explicitly unavailable in the review PDFs. Names/jerseys remain as printed; old import errors are not silently corrected in a document snapshot.

Rules-based observations and scoring runs use the same report helpers as the application. The scoring sequence is complete and reconciles to 16–32 and 21–14 respectively. No tactical explanation is generated.

`tests/helpers/report-match.js` supplies separate, explicitly fictional balanced/uneven saved-match examples to exercise the complete production report path, corrected shot maps, source attempts, attributed player data, known keepers, offline History and print layout. They are never described as the two real field matches.
