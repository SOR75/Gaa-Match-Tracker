# Issue history — Sideline V0.3.5-dev

## V035-BLOCKED-LIVE-MARKER — CLOSED, manually verified in Chrome

The user has manually verified the current V0.3.5 implementation in Chrome from a fresh GitHub download. The attacking blocked-shot marker displays amber B, and the separate Defensive Block marker displays purple D. This closure is based on that manual confirmation as well as automated checks; it is not a claim of verification on other browsers or a released V0.3.5 version.

### Manual verification confirmed

- An attacking blocked shot remains one shot attempt, counts as a Blocked Attempt and not a Wide, and preserves shooter/location attribution with the amber B marker.
- Standalone Defensive Block is independent of a shot, permits optional our-player credit and location, and creates no shooting attempt, turnover or possession change.
- Defensive Block locations use the separate purple D map treatment.
- Analysis separates Blocked Attempts from Defensive Blocks.
- Existing Kickout/Mark functionality remains working.

### Historical failure and regression coverage

Previously, the user reported Open Play, Blocked, #6 Isabel and a recorded location in the live capture modal while the pitch still showed the red X. The report was kept OPEN even though automation passed, and was explicitly recorded in the real-match workflow checkpoint.

Regression tests inspect the actual open capture modal for both location-before-reason and reason-before-location orders. They check SVG classes/content, computed amber fill, visible B text, absence of red/X paths, marker layers and hit-testing. They also exercise input/change timing and shooter/location taps while control values are pending. No renderer is mocked and the tests do not rely solely on saved event data.

The exact cause in the original failing Mac runtime was not conclusively established. The current fresh-download manual success closes the observed issue; it does not retrospectively prove a particular cache or event-timing explanation. If the symptom returns, reopen this issue with the actual failing SVG, computed styles and served module evidence.

### Functionality to preserve

Keep one attacking shot event, the shooter, miss reason Blocked, actual location, Attempt + Blocked Attempt and no Wide classification. Preserve the separate Defensive Block action, no inferred possession/turnover changes, all shot sources/defaults, Gaelic scoreboard and the approved Kickout/Mark workflow. Do not relax tests or remove the Wide/Blocked distinction.
