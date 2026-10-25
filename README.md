# Sideline V2 — Gaelic football match tracker

An incremental extension of the live-tested V1: the same Vite/JavaScript app, event log, scoreboard, clock, autosave, timeline, detailed editor, undo, half transitions, added time, and offline PWA. No account, cloud storage, paid service or AI interpretation is required. Teams and squads start blank.

## Run V2 locally

Requires **Node.js 22.13+ or 24+** and npm (the PDF dependency requires at least Node 22.13).

```sh
cd Gaa-Match-Tracker
npm ci
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173` **on the machine running the server**. An address inside a Codex cloud container does not forward to your Mac; this onboarding environment has no public Web Preview facility. To test on your Mac, run the commands in a local copy of the project. The server binds to `0.0.0.0` for devices on the same LAN; Vite prints the LAN address.

V2 changes are deliberately uncommitted and unpushed pending review. A clone of GitHub `main` alone still contains V1 until the reviewed V2 files are committed.

For the production PWA/offline build:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open `http://localhost:4173`, let the initial load finish, and reload once before going offline. All built app files, fonts, icons, XLSX parser, PDF parser and PDF worker are precached. Updates wait for all app tabs to close, protecting a match in progress. Serve `dist/` at the root of an **HTTPS** static host to install on an actual iPhone/iPad: Safari → Share → Add to Home Screen. A plain HTTP LAN URL supports the interface/autosave but not service workers or secure-context speech APIs. Do not serve `/sw.js` with a long-lived immutable cache.

## What changed from V1

- **Shots:** Goal / Point / 2 Point / Wide-Miss → pitch tap → squad jersey tap → saved. Both location and player have explicit Skip options; an unlisted number can be entered. The timestamp is captured at the initial event tap, never at the end of the workflow. No detailed enrichment fields are required. New misses infer `missed`; existing V1 `wide`, `saved`, `blocked`, `short`, or `post` outcomes are preserved.
- **Pitch:** normalized `shotX`/`shotY` in `[0,1]`, with top-left `(0,0)` and bottom-right `(1,1)`. Always orient the **attacking goal at the top**, for both teams and both halves. The SVG scales with the screen. Keyboard users can use arrow keys then Enter on the pitch. Locations can also be corrected/added/cleared in the detailed editor (both coordinates must be present or empty).
- **Kickouts:** Our/Opposition Kickout → WON / LOST → saved. Outcomes mean the **kicking team** retained/lost the ball. Optional SHORT / LONG can be selected before the outcome; unset length is allowed. Legacy Medium length remains editable. Optional player attribution is available in Edit Event.
- **Other events:** interception infers won, turnover won/lost infer their outcomes. Turnovers, interception and possession use the selected team (Our Team by default); explicit Our/Opposition Kickout fixes its team. Historical V1 team assignments remain unchanged. Possession stays a neutral event unless enriched.
- **Notes:** a prominent live microphone/note button attaches a note to the last recorded event without opening the detailed editor. Quick-capture optional notes and Edit Event also support typed notes and a separate editable transcription. Browser speech recognition never interprets notes into events or scores.
- **Squads:** manually manage either team's players. Save a reusable squad with a name, load it into either team, or edit its separate library copy. Loading replaces the selected active team sheet after confirmation if it is nonempty. Library edits do not mutate any match snapshot. Jersey duplicates are rejected per team. Positions/notes are preserved when editing saved names or jersey numbers.
- **Imports:** CSV/TSV, numbered TXT, XLSX first worksheet, and simple numbered text-based PDFs are parsed locally. Every candidate goes to an editable Review & Confirm table with an uncertainty indication. Nothing is added before confirmation. Duplicate jerseys in the file or existing squad must be resolved. Example CSV: `Jersey Number,Player Name,Role`, followed by `7,Player Name,starter` or `8,Player Name,substitute`. CSV names containing commas must be quoted. Without headers, columns are number/name/optional role. TXT and PDF candidates use lines such as `7 Player Name`.
- **05 — Match analysis:** automatic match/half/team comparison, goals/points/2-pointers, attempts/misses/conversion, cumulative scoring timeline, per-player shooting and attributed event stats, kickout counts/retention/length success, turnovers/interceptions/possession-event counts, and a shot map filtered by team/half/player/score/miss. Nothing is stored as manual statistics.
- **Match Report:** within Match analysis, generates a printable report from the same records, including match details, score/halves, team/player stats, shot map, kickouts, turnovers/interceptions and notes/coach observations. Use Print / Save as PDF. It describes the recorded score; no unrecorded full-time state is assumed.

## Migration and data safety

The active match stays under **`sideline.match.v1`**, so V1 browsers retain their data. The object schema moves from version 1 to **2** in memory. Existing event IDs, scores, outcomes, timestamps, details, players, clock and ordering are preserved. Missing new fields become `shotX: null`, `shotY: null`, and `dictatedNote: ''`; an empty `oppositionPlayers` array is added. On the first successful save of a legacy match, its exact original serialized value is preserved at **`sideline.match.v1.backup`** before the active record is updated. The backup is not overwritten. Invalid or unsupported saved data is not silently replaced. Storage failures display a persistent warning.

Reusable squads live separately at **`sideline.squads.v1`**, with their own version and detached player copies. Events remain the only source of scoring and statistical truth. `scoreValue` is normalized when saved; scoreboard and analysis derive scoring from event definitions and recorded outcomes.

Local data belongs to the browser **and origin**. Different ports, browsers, devices, or installed home-screen apps may have separate stores. Private browsing, clearing site data, or device storage eviction can remove local data. Keep browser data and use one tracking tab per match. Another tab changing the active match requires stale tabs to reload. This iteration retains one active match, as V1 did; it does not add match archives, cloud sync, or exports beyond browser printing. Loading a different squad into a match intentionally changes that active match's jersey/name labels; library edits alone never do.

## Analysis conventions and limitations

- Attempts include every recorded Goal, Point, 2 Point and Wide/Miss. Conversion is scoring attempts ÷ all attempts, **not** points per attempt. Unattributed events stay in team totals but cannot be assigned to a player.
- Kickout retention = won ÷ (won + lost); legacy records with no outcome are shown as **unknown** and excluded from that denominator. Short/long success uses the same known-outcome rule for that length. Legacy Medium/unrecorded length counts in total, not short/long.
- `—` means no denominator exists. No possession percentage, unrecorded location, receiver, or event is invented. Kickout player involvement reports the recorded attribution only. Events without shot coordinates stay in all summary statistics and are counted as unplotted on the map. Map filters affect the map only; overlapping marks can hide co-located shots.
- **Photos/scanned PDFs:** upload/camera selection, photo reference preview, editable manual transcription and confirmation are implemented. **Automatic OCR is not implemented.** No external extraction service is connected. Text PDF layouts with columns/complex formatting can yield incomplete/mixed candidates; all are marked uncertain. Open the original PDF alongside the review table when transcribing. Password-protected, unreadable, or unsupported files fall back to explicit manual review. Convert legacy `.xls` files to `.xlsx` or CSV. Files are limited to 15 MB, PDFs to 20 pages, candidates to 1,000 rows.
- **Speech:** uses the device/browser Web Speech API where available. It may require internet and use the browser provider's speech service; this is explained next to the microphone. Final transcriptions are appended and remain editable. Save controls wait for recognition to stop. If recognition is unsupported, denied, interrupted, or unavailable, existing text is kept and typed notes / device keyboard dictation remain available. No audio is stored and no AI commentary interpretation runs. Actual recognition accuracy and microphone permissions need testing on the target iPad/iPhone; automated tests use deterministic speech stubs and verify fallback handling.
- PDF/XLSX adapters are local and dynamically loaded; no runtime extraction API, authentication, paid service, or cloud storage was introduced. Initial production install includes their precached bundles (the PDF worker is approximately 1.3 MB).

## Tests and manual review

```sh
npm test
npm run build
npx playwright install chromium   # once, if no suitable browser installed
npm run test:browser
```

If using an existing Linux Chromium:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

Browser tests build and manage a production preview on port **4173**, which must be free. They use isolated browser contexts, never permanently seed fixture names, and create a printable PDF under ignored `test-results/`.

Review V2 in this order:

1. Use your existing V1 browser origin to check migration; **do not clear its site data**. Confirm old events, score, current half, added time and paused/running clock. A separate fresh browser profile is suitable for blank-state testing.
2. Add one player to Our Team and another to Opposition. Save a named squad, edit it in Saved squads, and confirm the active match still has the original name. Load the library copy into the other team.
3. Start the clock. Record Goal → pitch → player, Point → Skip location → Skip player, 2 Point → pitch → player, and Wide/Miss → pitch → Skip player. Our total should be 6 (3+1+2); the miss should not add points. Switch team and verify opposition scoring separately.
4. Record Our Kickout → WON and Opposition Kickout → LOST. Optionally choose SHORT/LONG before the outcome. Confirm captured times come from the initial tap. Record other events and verify inferred outcomes in the timeline.
5. Edit a V2 event's player, team, time, coordinates, length or notes; verify score and analysis recalculate. Undo it. Switch halves: clock resets/pauses, existing events/totals remain. Refresh: data and clock recover.
6. Import a CSV or XLSX; verify no players are added before confirmation. Deliberately duplicate a jersey to check rejection, then fix it. Try a simple numbered PDF and a photo; verify uncertain/manual review remains explicit.
7. Add a live dictated note; stop, review and save. Test microphone denial/unsupported browser and typed fallback. Confirm the note never creates extra scores/events.
8. Open Match analysis and try all shot-map filters. Compare team and half totals to the timeline. Open Match Report → Print / Save as PDF and inspect the pages.
9. In production preview, load/reload online, then go offline. Record shots/kickouts, inspect analysis and refresh. Test touch targets, camera selection, speech and printing on the actual iPad/iPhone (HTTPS needed for PWA/speech).

## Modules

V1 modules remain: `domain.js`, `storage.js`, `main.js`, `style.css`. V2 adds focused modules: `capture.js` (quick workflows), `pitch.js` (shared pitch/map), `speech.js` (transcription only), `squads.js` / `squad-ui.js` (library and reviewed team sheets), `imports.js` (local adapters), `analysis.js` (pure selectors), `analysis-ui.js` (analysis/report), and `ui.js` (escaped markup helpers). Tests cover V1 regression plus migration of an 85-event fixture, outcome inference, kickouts, coordinates, edit/undo, half transitions, library isolation/load, imports/review, speech fallback, analysis/filtering, printing and offline use.
