# Known issues — Sideline V0.3.5-dev

## V035-BLOCKED-LIVE-MARKER — OPEN, manual-test failure

Reported in Chrome on the user's Mac. This issue remains unresolved at the real-match workflow checkpoint, regardless of automated test results. This is a development checkpoint, not a claim that the marker defect is fixed.

### Reproduction

1. Open real Live Match and select our team.
2. Tap Wide / Miss; the shot saves immediately.
3. Set Miss reason to Blocked, select #6 Isabel, and tap a pitch location.
4. Also test location first (default X), then change the reason to Blocked.

Expected: the visible attacking-shot marker in the open optional-details capture modal is the amber B, with no normal red Wide/Miss X. Location and player stay attached to the same single shot.

Actual manual report: the modal simultaneously displays Open Play, Blocked, #6 Isabel and a recorded location, but the pitch still displays the red X. Starting a newer Vite server and repeating the test did not resolve the report.

### Status and evidence limits

The current automated regressions inspect the real open capture modal, including SVG classes/content, computed amber fill, B text, absence of red/X paths, marker layers and hit-testing. They currently pass in the development environment. That does not invalidate or resolve the manual failure.

The exact root cause in the failing Mac Chrome instance has not been established. Earlier work addressed input/change timing and cached capture state, but manual testing still reported the defect afterward. Do not present that state fix as proof of resolution. The working environment renders B in the tested paths; comparison with the failing browser's actual SVG and served modules remains a follow-up diagnostic step.

### Functionality to preserve

Underlying blocked-shot event data and analysis are working and must remain intact: one shot event, shooter attribution, missReason Blocked, actual location, Attempt + Blocked Attempt, no Wide classification, and no inferred turnover or possession change. Preserve the separate Defensive Block action, all shot sources/defaults, Gaelic scoreboard and manually approved Kickout/Mark workflow.

### Follow-up

Retest from this GitHub checkpoint as one authoritative source. Inspect the actual failing open-modal SVG, computed styles, marker layers and served renderer modules, and compare them with the passing run. Keep the issue OPEN until the real manual capture screen is verified to replace X with B in both interaction orders. Do not relax tests or remove the Wide/Blocked distinction to obtain a pass.
