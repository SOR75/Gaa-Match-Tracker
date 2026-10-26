# Sideline V0.3.5-dev — development review

**Chrome manual verification passed:** a fresh GitHub download was verified for amber-B attacking blocked shots, independent purple-D Defensive Blocks, player/location attribution, separate analysis, and the existing Kickout/Mark workflow. The prior marker issue is closed on that manual evidence; its history remains in [KNOWN-ISSUES.md](KNOWN-ISSUES.md). Version remains V0.3.5-dev.

## V0.3.5-dev kickout workflow and LGFA Marks

Both kickout types now use **our team's perspective**: Won by us = `won`; Won/retained by opposition = `lost`; Unknown = `unknown`. Five result buttons cover ordinary wins/losses, Marks won by either side and unknown possession. One result tap records the event. A Mark won by us offers optional player credit inline on that same dialog; closing or skipping preserves the kickout, and choosing a player updates the original ID. Opposition Marks require no player identity. Length, notes and the original tap timestamp remain supported.

New/edited kickouts have `kickoutPerspective: "our"`, boolean `mark`, and optional `markPlayerNumber` (our squad). Mark credit is independent of the kicking team's generic `playerNumber`, so our player can receive credit on an opposition kickout. The editable result selector corrects outcome and Mark status together; player credit is cleared if the result is no longer a Mark won by us. No extra kickout event is created.

Older events without the perspective marker used the kicking team's convention. They load unchanged; selectors invert known opposition results on read. Editing an old kickout saves the translated result with the explicit marker, preventing repeated inversion. Unknown results remain unknown and missing Mark fields mean no Mark. Match schema/storage keys and version **0.3.5-dev** are unchanged.

Analysis shows won/lost from our perspective, Marks won by each side and per-player Kickout Marks across both kickout types. Retention retains its original kicking-team meaning: our wins on our kickouts, opposition wins on their kickouts, excluding unknown outcomes. Short/long retention follows the same rule; short/long won counts are labeled as our wins. A Mark is never an extra kickout.

Shot Source now offers only Open Play, Free, Penalty and 45. Open Play remains the new-shot default. Historical shot-source Mark values remain readable and are never converted into kickout Marks. Existing voice kickout wording/metadata uses the same our-team convention; no new voice grammar or OCR work is introduced.

## Standalone defensive blocks and attacking blocked attempts — V0.3.5-dev

The Live Match **Blocked** button records a `defensive-block` event for our team immediately, then offers the shared optional player picker. It creates no missed shot, turnover, possession, interception or kickout. A player tap updates that same record and returns to the match; Skip / Close leaves it valid without a player. Optional block location can be saved before selecting a player or added/changed/cleared later in Edit Event. Locations use `shotX`/`shotY` for compatibility, normalized toward the opposition attacking goal. Player credit uses this action's ordinary `playerNumber`.

Attacking Wide / Miss → Blocked remains a shot with the shooter in `playerNumber`; amber **B** squares identify it on pitch maps. It counts as an unsuccessful attempt and a blocked attempt, never as an explicit Wide. Purple **D** diamonds identify standalone Defensive Blocks on a separate defensive-location map, which never contributes to shooting totals. The timeline and event labels distinguish “Shot · Blocked” and “Defensive Block”. Only shots explicitly marked Wide (including legacy wide outcomes) count in the Wides metric; unspecified misses remain unspecified.

Existing opposition-shot blocker metadata remains readable and contributes to defensive statistics. Each recorded event counts once. Do not log a standalone block and a credited opposition blocked shot for the same incident unless intending two recorded actions: events are not automatically linked or deduplicated. No opposition shooting attempt is fabricated by the standalone defensive button. Changing shooter miss reasons or defensive player attribution recalculates analysis from the log. Match schema, version and storage keys are unchanged, and existing events load without rewriting them. The frozen V0.3.4 branch is untouched.

## Blocked shots — V0.3.5-dev

The shot still saves on the first tap, before optional details. On an opposition miss, choosing Blocked immediately shows “Who made the block? · optional” with our player buttons. One tap saves `blockedByNumber` on that same event, independently of the attacker's `playerNumber`. Source, pitch and shooter details remain available. Skip / Close never removes the saved shot; quick blocker credit can also be cleared without confirmation. Own-team blocked attempts need no opposition identity and never automatically generate defensive credit.

Mark and block credit share `player-credit.js`, reading the active our-team roster through `playersFor`. This includes numbered starters, substitutes and panel players rather than guessing who made a block from lineup state. Empty rosters explicitly show “No players loaded”; numberless rosters retain the existing guidance to assign jerseys. No separate squad store or new event schema is introduced. The event editor retains optional add/change/remove credit, including historical credit for a player no longer in the current roster. Changing the reason away from Blocked clears defensive credit. Analysis counts blocked attempts for the shooter and defensive blocks for the credited our-team player. Existing Mark, offline, scoring and legacy-data regressions continue to run.

## V0.3.5-dev shot workflow (unreleased)

Development branch: `sideline-v0.3.5`, based on frozen commit `49ce88bd26a911cd51a6abb7248522525a6998bb`. No release or merge is implied.

Goal, Point, 2 Point and Wide / Miss save on the first tap. The optional pitch/player/source screen then opens automatically. Location, player, source and miss-reason changes autosave against the same event ID; Skip / Close or Escape cannot discard the original shot. Existing Edit last event, Undo and later shot enrichment remain available.

Shot fields are additive: `shotOutcome` (derived from the legacy event/outcome), `shotSource` (`open-play`, `free`, `penalty`, `45`), optional `missReason`, and optional `blockedByNumber`. The block credit belongs to our defender on an opposition blocked miss; it does not create another event. New shots default to Open Play. Known legacy `scoreOrigin` values and miss outcomes are interpreted on read, while unrecorded sources remain unknown. Existing schema version 1/2 records and the local-storage key remain supported; loading a schema-2 record does not rewrite its events. Normalized saves mirror known sources into legacy `scoreOrigin`.

The primary scoreboard is goals–points, counting each two-pointer as two points in the right-hand value, with the calculated total underneath. The event log remains the only scoring source. The recording-team choice is saved on the match as optional `recordingTeam` and remains selected across reloads until deliberately changed. Analysis adds shot source counts, blocked attempts and player defensive-block credits without a new screen layout. Source counts are successful shot counts, not total point values.

OCR/import and voice modules are unchanged. Earlier build notes below describe the frozen V0.3.4 baseline.


An incremental extension of the live-tested V1: the same Vite/JavaScript app, event log, scoreboard, clock, autosave, timeline, detailed editor, undo, half transitions, added time, and offline PWA. No account, cloud storage, paid service or AI interpretation is required. Teams and squads start blank.

## Approved real-photo programme importer — V0.3.4

The importer normalizes uneven paper lighting, identifies a credible numbered GAA/LGFA formation, and re-reads bounded player regions. Nearby first-name and surname boxes can share a baseline despite different top coordinates. Jersey numbers are read from the image, never generated from formation slots; positions remain editable suggestions. Substitute sequences are parsed separately, even when the heading is missed, and wrapped surnames can continue onto the following line. Metadata and staff text are excluded. Captain markers are stored separately from names.

The exact supplied `Naomh_Ciaran_U14_Shield_Final.jpg` is included as a checksum-verified regression fixture, alongside the earlier synthetic tests. The approved real-photo result is all 15 full starter names and 12 substitute entries. Starter jerseys 5, 7 and 11 remain blank. The entry for 21 is blank-jersey / “arley Brazil”; 22 reads “Rose Dal”; 24 reads “Ceoladh Lidgane”. These uncertain fields require human correction in the universal editable review table. No player-name dictionary is used at runtime.

V0.3.4 freezes these approved import changes and existing V3 real-match functionality on `sideline-v3-real-match`. Version 0.3.4 is visible in the browser title, app top bar and Live Match toolbar. No change is made to `main` or `sideline-v2-test`.

## Import fix — build 0.3.1

Confirm **V3 REAL MATCH TEST · IMPORT FIX** on Live Match or **Sideline V3.1 · Import Fix** in the browser title after deploying. The earlier V3 ZIP still had the V2 photo fallback; use the updated build, close old Sideline tabs/apps to activate its service worker, reopen and cache it online before testing offline. Do not clear existing match data to update.

Actual extraction now implemented, without an external OCR API:

| Source                               | What genuinely extracts                                                                   | Remaining review / limitations                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JPEG / PNG photograph                | Bundled Tesseract.js runs locally and proposes printed names and readable printed numbers | Printed text only; blur, glare, perspective, Irish names/accents and handwriting can be wrong. Doubtful OCR jersey numbers are blank. Your particular programme photo has not been available in this workspace for validation.                                  |
| Formation image                      | Local OCR extracts names; a clear 1–3–3–2–3–3 layout proposes positions from placement    | Select Formation layout and goalkeeper end. Missing/ambiguous rows leave positions unresolved rather than shifting assignments. Jersey numbers remain blank when absent. A printed 22 in the centre half-back slot stays 22 and is a starter.                   |
| Machine-readable PDF                 | PDF.js reads text and geometry directly; readable PDF checkbox form fields supplement it  | No OCR is run for printed text pages. Select Foireann/LGFA layout for registered panels (auto-detection also handles recognisable headers). First Starting column only; flattened handwritten marks may be absent from the text/form layer and need correction. |
| Scanned PDF                          | Raster pages render locally and run the same on-device OCR                                | Up to 3 scanned pages per import; split longer scans. Handwritten numbers/ticks are not reliably interpreted. The warning/review screen remains mandatory.                                                                                                      |
| CSV / TSV / XLSX / pasted text / TXT | Structured columns or numbered text are parsed directly; XLSX first worksheet             | Pasted registered-panel names can retain blank jerseys. For table semantics use Jersey, Player Name, Position, Starting (or Starter/Sub / Role) headers. The first Starting column is used; alphabetical row order / serial No. is not turned into a jersey.    |
| HEIC / HEIF                          | **Not supported as input**                                                                | Export/convert to JPEG or PNG before choosing the file. Native Safari HEIC support is not assumed. Camera → Formats → Most Compatible can produce JPEG for future photos; check the actual file type.                                                           |

**Handwritten match-day numbers and photograph checkbox ticks are not reliably automatic in this build.** Clear printed/text/PDF-form markers can be interpreted, but pen marks, erased ticks, ambiguous columns, and poor photos require manual correction. Do not rely on an OCR confidence score to verify handwriting. No names/numbers are invented to fill gaps.

Use Squad → select Import layout (programme, Foireann/LGFA, or formation) and formation goalkeeper end → Import / Scan / Paste text → wait for extraction → **Review & Confirm**. Every automatic source uses the same **Jersey | Player | Position | Starter/Sub | Confidence** table. You can edit all player fields, remove rows, and add missing rows. Confidence is an uncalibrated OCR word score or a source/uncertainty note, not a guarantee of accuracy. Default jersey-position suggestions for ordinary lists are explicitly provisional; formation placement takes precedence. A jersey never permanently defines position.

Registered-panel selection is jersey + first Starting tick → starter, jersey without that tick → substitute, no jersey → panel/not selected. Unreadable handwritten jerseys stay blank with a warning; review status as well. Multiple blank jerseys are supported and persist as `null`, including in saved squads. Unselected panel members and unnumbered players do not appear as numbered live jersey buttons or fabricated player-stat rows. Duplicate **numbered** jerseys remain blocked.

The worker, three compatible LSTM WebAssembly builds and English fast language model are included in the build and service-worker precache under `/ocr/` (about 15 MB of additional uncompressed static assets). The browser does not send your photo to a cloud OCR service. Initial caching needs Wi-Fi/time; after Offline app ready + reload the OCR itself can run offline. Static module cache matching accounts for `Vary: Origin` so first-use dynamic OCR chunks work offline. OCR asset bytes also contribute to cache versioning. Import Cancel terminates recognition; there is a 90-second OCR timeout. Files are limited to 15 MB, image canvases to a 2,200-pixel longest edge, PDF files to 20 pages and raster OCR to 3 pages per import.

**Safari/iPad:** this uses Web Workers, WebAssembly, image decoding and PDF canvas rendering. It has been tested in Chromium with actual OCR fixtures (JPEG, PNG, a 15-name formation and an image-only PDF), including first-use OCR offline; it has not been tested on a physical iPad Safari. Large camera photos / memory pressure can fail or cause Safari to reload. Crop to one upright team sheet, use a clear JPEG/PNG with readable text, keep the app foreground and prefer a text PDF or pasted text for tomorrow if recognition is poor. The universal editable review/photo reference/manual entry remains the fallback, not the primary image path. No arbitrary handwritten programme/team-sheet accuracy is claimed.

## V3 match-day changes

Work is restricted to `sideline-v3-real-match`. `main` (V1) and `sideline-v2-test` are unchanged. This is a focused extension of V2, not a new app. The branch now includes the OCR implementation and structured programme parser; use the current branch source. Other branches remain unchanged.

- **Landscape iPad Live Match:** compact navigation, sticky scoreboard/clock, large score buttons, seven build-up/substitution controls, permanent Edit/Undo, visible V3 build label, and Saved on this device indicator. The normal 1024×768 landscape tap panel fits without scrolling; voice review or enrichment can scroll while the scoreboard and footer remain accessible.
- **One-tap scores:** Goal/Point/2 Point/Wide-Miss are saved immediately with the original tap time. Nothing optional blocks the score. Use Add player / location to last shot afterwards to enrich the same record, or use Edit Last Event. Closing/cancelling enrichment keeps the basic event. The rapid-repeat guard ignores a second identical event/team tap within 650 ms; another deliberate same-event tap is allowed after that interval.
- **Voice Match Mode:** turn it on in Live Match; tap Start voice capture and speak **one event**. Review the interpreted event/team/player/outcome, correct if needed, and tap Confirm & record event. No recognition result changes the log or score before confirmation. Uncertain, negated, multi-event, or unsupported commentary is rejected for correction/Tap Mode. The implementation is a conservative local grammar, not general AI interpretation. Supported examples: “Our kickout long won by number 8”, “Number 8 runs through and scores a point”, “Their kickout won by number 9”, “22 for 6”, “Number 15 wide”, “Goal number 11”, “Two point score by number eight”. Where the team is not named, the selected team is used and shown for confirmation. Opponent kickout WON means the opponent retained it. Voice timing is captured at the start of capture, not confirmation. Proposals are temporary and are not saved across refresh until confirmed.
- **Substitutions:** selected team → Substitution → choose ON/OFF jerseys (or enter numbers) → Record substitution. Stores `playerOn`, `playerOff`, half, time and team in the same event log. Same on/off jerseys are rejected. Undo/edit recalculates on-field players from the log. An incomplete squad is allowed; unknown jerseys are not invented as named players.
- **Starting lineup:** on Squad, tap Starter/Substitute to adjust the actual initial lineup without deleting players or changing saved-squad templates. Current on-field status replays substitution events over this baseline. During play use Substitution for an actual replacement; baseline adjustments correct the starting sheet.
- **Pitch orientation:** set Our first-half attacking goal in Match Setup. The other team attacks the opposite goal; both reverse after half time. Live Match and the optional pitch clearly label the selected team's attacking goal. Canonical stored X/Y still means attacking goal at top, exactly as V2 did. A bottom-facing live display rotates 180° and applies the inverse on capture. Changing orientation never rewrites old shots. The analysis/report map remains labelled attack-normalized at top so both halves can be compared.
- **Speech notes:** separate from Voice Match Mode. Final dictated transcriptions autosave directly to the existing event being worked on, even when closing its editor/note panel without Save. Typed corrections still use Save. For a kickout draft not yet recorded, transcription stays with the draft and is saved when its outcome is recorded; cancelling an unsaved draft discards it. No note creates a score or another event.
- **Blank reuse:** Start a new blank match in Match Setup confirms before clearing the active fixture. Teams, squads and events start empty; reusable squad templates remain. A recovery snapshot of the previous match is saved locally at `sideline.match.archive.<match-id>` before reset; reset is refused if that fails. There is no archive browser in this test build. Existing V1/V2 active data is retained under the same storage key/schema; V3 adds optional fields/events without rewriting old records.

## Exact iPad deployment and match-day check

For Monday **26 October 2026**, complete this rehearsal before going pitch-side:

1. Use the generated **Sideline-V3-iPad-Site.zip** for direct deployment, or extract **Sideline-V3-Source.zip** on your Mac and run `npm ci` then `npm run build` using Node 24. The deployable site is the contents of `dist/`, not the source folder. No runtime secrets or backend are needed.
2. On an HTTPS static host you control, deploy a separate V3 site without updating your V1/V2 sites or their Git branches. For Netlify manual deployment: sign in → Add new project/site → Deploy manually → drag the extracted `Sideline-V3-Site` folder (containing `index.html` and `assets/`) or your local `dist` folder into the upload area. The exact labels may differ by Netlify UI version. Use the resulting stable site HTTPS URL. Hosting is a user action; this build has not been published automatically.
3. On the iPad, open that HTTPS URL directly in **Safari**, not an in-app browser. Confirm **V3 REAL MATCH TEST** is visible. If updating an existing origin, close all old Sideline tabs and the old Home Screen app, then reopen; the service worker waits for old tabs to close. Do not clear site data to update: it holds the match. A new hostname/origin has separate local data.
4. Wait for the app cache message, reload once, then check **Offline app ready** and **Saved on this device**. Choose Share → Add to Home Screen. Open the Home Screen app, load/reload it online too, and repeat the offline check there; Safari and an installed app may not share storage on every iOS version. Configure the real match in the actual app you will use.
5. Use a blank rehearsal match. Enter teams/squads, adjust the lineup, set the first-half attacking goal, and test a goal (+3), point (+1), 2-pointer (+2), miss (+0), kickout, substitution, Edit and Undo. Test a rapid double tap creates only one event. Confirm no keyboard opens on the ordinary score/substitution jersey buttons.
6. Turn Airplane Mode on (and Wi-Fi off) after caching. Add events, refresh, fully close and reopen the Home Screen app. Verify score, events, half/clock and Saved indicator. Tap tracking must work offline. Then restore connectivity and microphone permissions for the optional voice rehearsal; test a phrase, a correction, confirmation, and microphone denial. Leave Tap Mode as the fallback.
7. Start a new blank match, enter the real fixture and squads, confirm lineup/direction, and leave the clock paused until throw-in. Use a charged iPad and one app/tab per match. Do not change URL or clear browser data during the match.

**Specifically unverified on physical iPad Safari:** speech accuracy in wind/crowd noise, intermittent Apple/browser speech services, microphone permission prompts, Safari/Home Screen storage isolation and eviction, camera/file pickers, and real-device print UI. Voice may require internet/Siri settings and can stop after one phrase or when the screen locks/backgrounds. It is deliberately not an always-listening/background service. Unsupported/denied/network-failed voice capture leaves Tap Mode available. Keep the app foreground for microphone use; elapsed clock recovery uses saved timestamps when returning. Automated browser tests use Chromium viewports and speech stubs, not a physical iPad. No deployment or real-device readiness is claimed until the above rehearsal succeeds.

## Run locally

Requires **Node.js 22.13+ or 24+** and npm (the PDF dependency requires at least Node 22.13).

```sh
cd Gaa-Match-Tracker
npm ci
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173` **on the machine running the server**. An address inside a Codex cloud container does not forward to your Mac; this onboarding environment has no public Web Preview facility. To test on your Mac, run the commands in a local copy of the project. The server binds to `0.0.0.0` for devices on the same LAN; Vite prints the LAN address.

V3 changes are on `sideline-v3-real-match`. `main` contains V1 and `sideline-v2-test` contains V2. Download or check out the V3 branch for this build.

For the production PWA/offline build:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open `http://localhost:4173`, let the initial load finish, and reload once before going offline. All built app files, fonts, icons, XLSX parser, PDF parser and PDF worker are precached. Updates wait for all app tabs to close, protecting a match in progress. Serve `dist/` at the root of an **HTTPS** static host to install on an actual iPhone/iPad: Safari → Share → Add to Home Screen. A plain HTTP LAN URL supports the interface/autosave but not service workers or secure-context speech APIs. Do not serve `/sw.js` with a long-lived immutable cache.

## V2 capabilities retained in V3

- **Shots (V2 optional enrichment retained):** V3 first saves on the initial score tap. Add player / location to last shot → pitch tap → squad jersey tap enriches that same record. Both location and player have explicit Skip options; an unlisted number can be entered. The timestamp is captured at the initial event tap, never at the end of the workflow. No detailed enrichment fields are required. New misses infer `missed`; existing V1 `wide`, `saved`, `blocked`, `short`, or `post` outcomes are preserved.
- **Pitch:** normalized `shotX`/`shotY` in `[0,1]`, with top-left `(0,0)` and bottom-right `(1,1)`. Always orient the **attacking goal at the top**, for both teams and both halves. The SVG scales with the screen. Keyboard users can use arrow keys then Enter on the pitch. Locations can also be corrected/added/cleared in the detailed editor (both coordinates must be present or empty).
- **Kickouts:** Our/Opposition Kickout → WON / LOST → saved. Outcomes mean the **kicking team** retained/lost the ball. Optional SHORT / LONG can be selected before the outcome; unset length is allowed. Legacy Medium length remains editable. Optional player attribution is available in Edit Event.
- **Other events:** interception infers won, turnover won/lost infer their outcomes. Turnovers, interception and possession use the selected team (Our Team by default); explicit Our/Opposition Kickout fixes its team. Historical V1 team assignments remain unchanged. Possession stays a neutral event unless enriched.
- **Notes:** a prominent live microphone/note button attaches a note to the last recorded event without opening the detailed editor. Quick-capture optional notes and Edit Event also support typed notes and a separate editable transcription. Browser speech recognition never interprets notes into events or scores.
- **Squads:** manually manage either team's players. Save a reusable squad with a name, load it into either team, or edit its separate library copy. Loading replaces the selected active team sheet after confirmation if it is nonempty. Library edits do not mutate any match snapshot. Jersey duplicates are rejected per team. Positions/notes are preserved when editing saved names or jersey numbers.
- **Imports:** see the 0.3.1 import-fix matrix above for genuine image/scanned-PDF OCR, direct PDF/text/CSV/XLSX parsing, formation positions, selection semantics and mandatory review. Every candidate goes to an editable Review & Confirm table with an uncertainty indication. Nothing is added before confirmation. Duplicate jerseys in the file or existing squad must be resolved. Example CSV: `Jersey Number,Player Name,Role`, followed by `7,Player Name,starter` or `8,Player Name,substitute`. CSV names containing commas must be quoted. Without headers, columns are number/name/optional role. TXT and PDF candidates use lines such as `7 Player Name`.
- **05 — Match analysis:** automatic match/half/team comparison, goals/points/2-pointers, attempts/misses/conversion, cumulative scoring timeline, per-player shooting and attributed event stats, kickout counts/retention/length success, turnovers/interceptions/possession-event counts, and a shot map filtered by team/half/player/score/miss. Nothing is stored as manual statistics.
- **Match Report:** within Match analysis, generates a printable report from the same records, including match details, score/halves, team/player stats, shot map, kickouts, turnovers/interceptions and notes/coach observations. Use Print / Save as PDF. It describes the recorded score; no unrecorded full-time state is assumed.

## Migration and data safety

The active match stays under **`sideline.match.v1`**, so V1 browsers retain their data. The object schema moves from version 1 to **2** in memory. Existing event IDs, scores, outcomes, timestamps, details, players, clock and ordering are preserved. Missing new fields become `shotX: null`, `shotY: null`, and `dictatedNote: ''`; an empty `oppositionPlayers` array is added. On the first successful save of a legacy match, its exact original serialized value is preserved at **`sideline.match.v1.backup`** before the active record is updated. The backup is not overwritten. Invalid or unsupported saved data is not silently replaced. Storage failures display a persistent warning.

Reusable squads live separately at **`sideline.squads.v1`**, with their own version and detached player copies. Events remain the only source of scoring and statistical truth. `scoreValue` is normalized when saved; scoreboard and analysis derive scoring from event definitions and recorded outcomes.

Local data belongs to the browser **and origin**. Different ports, browsers, devices, or installed home-screen apps may have separate stores. Private browsing, clearing site data, or device storage eviction can remove local data. Keep browser data and use one tracking tab per match. Another tab changing the active match requires stale tabs to reload. This iteration retains one active match and local recovery snapshots when starting another fixture; it does not add an archive browsing UI, cloud sync, or exports beyond browser printing. Loading a different squad into a match intentionally changes that active match's jersey/name labels; library edits alone never do.

## Analysis conventions and limitations

- Attempts include every recorded Goal, Point, 2 Point and Wide/Miss. Conversion is scoring attempts ÷ all attempts, **not** points per attempt. Unattributed events stay in team totals but cannot be assigned to a player.
- Kickout retention = won ÷ (won + lost); legacy records with no outcome are shown as **unknown** and excluded from that denominator. Short/long success uses the same known-outcome rule for that length. Legacy Medium/unrecorded length counts in total, not short/long.
- `—` means no denominator exists. No possession percentage, unrecorded location, receiver, or event is invented. Kickout player involvement reports the recorded attribution only. Events without shot coordinates stay in all summary statistics and are counted as unplotted on the map. Map filters affect the map only; overlapping marks can hide co-located shots.
- **Photos/scanned PDFs:** local OCR is implemented in 0.3.1; see the import matrix and limits above. HEIC is explicitly unsupported; handwriting and flattened Starting ticks need review/manual correction.
- **Speech:** uses the device/browser Web Speech API where available. It may require internet and use the browser provider's speech service; this is explained next to the microphone. Final transcriptions are appended and remain editable. Save controls wait for recognition to stop. If recognition is unsupported, denied, interrupted, or unavailable, existing text is kept and typed notes / device keyboard dictation remain available. No audio is stored and no AI commentary interpretation runs. V3 Voice Match Mode is a separate deterministic, confirmed-event grammar. Actual recognition accuracy and microphone permissions need testing on the target iPad/iPhone; automated tests use deterministic speech stubs and verify fallback handling.
- OCR/PDF/XLSX adapters are local and dynamically loaded; no runtime extraction API, authentication, paid service, or cloud storage was introduced. Initial production install includes their precached bundles (the PDF worker is approximately 1.3 MB).

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
3. Start the clock. Tap Goal, Point, 2 Point, and Wide/Miss. Each saves immediately. Use Add player / location to last shot after any shot to test optional enrichment. Our total should be 6 (3+1+2); the miss should not add points. Switch team and verify opposition scoring separately.
4. Record Our Kickout → WON and Opposition Kickout → LOST. Optionally choose SHORT/LONG before the outcome. Confirm captured times come from the initial tap. Record other events and verify inferred outcomes in the timeline.
5. Edit a V2 event's player, team, time, coordinates, length or notes; verify score and analysis recalculate. Undo it. Switch halves: clock resets/pauses, existing events/totals remain. Refresh: data and clock recover.
6. Import a CSV or XLSX; verify no players are added before confirmation. Deliberately duplicate a jersey to check rejection, then fix it. Try a simple numbered PDF and a photo; verify uncertain/manual review remains explicit.
7. Add a live dictated note; stop, review and save. Test microphone denial/unsupported browser and typed fallback. Confirm the note never creates extra scores/events.
8. Open Match analysis and try all shot-map filters. Compare team and half totals to the timeline. Open Match Report → Print / Save as PDF and inspect the pages.
9. In production preview, load/reload online, then go offline. Record shots/kickouts, inspect analysis and refresh. Test touch targets, camera selection, speech and printing on the actual iPad/iPhone (HTTPS needed for PWA/speech).

## Modules

V1 modules remain: `domain.js`, `storage.js`, `main.js`, `style.css`. V2 adds focused modules: `capture.js` (quick workflows), `pitch.js` (shared pitch/map), `speech.js` (transcription only), `squads.js` / `squad-ui.js` (library and reviewed team sheets), `imports.js` (local adapters), `analysis.js` (pure selectors), `analysis-ui.js` (analysis/report), and `ui.js` (escaped markup helpers). Tests cover V1 regression plus migration of an 85-event fixture, outcome inference, kickouts, coordinates, edit/undo, half transitions, library isolation/load, imports/review, speech fallback, analysis/filtering, printing and offline use.

V3 adds `matchday.js` (tap guard, direction and on-field selectors), `substitution.js`, `voice-parser.js`, `voice-match.js`, and V3 unit/browser regressions. V1/V2 tests remain, with shot-capture helpers updated to use optional enrichment after the immediate save.

Import-fix modules: `import-parser.js` (table/text/spatial semantics), `ocr.js` (on-device engine/cancellation), updated `imports.js` / `squad-ui.js`, nullable-jersey/panel-safe squad selectors, and `/ocr/` packaging in `vite.config.js`. Real OCR fixture tests are deliberately not replaced with recognizer stubs.

## Frozen real-match test build — V0.3.4

Use branch **sideline-v3-real-match**. The browser title, top bar and Live Match toolbar show **V0.3.4**. `/build-info.json` reports both version and buildId as `0.3.4`.

Download this branch using GitHub → Code → Download ZIP, extract it, and open Terminal in the extracted folder. Use Node.js 22.13 or newer:

```sh
npm ci
npm run dev -- --port 5176 --strictPort
```

Open `http://localhost:5176` on that Mac. Verify the terminal project root and the visible **V0.3.4** label. Older downloaded source/site ZIPs are separate historical builds.

For the iPad match test, build with `npm run build` and upload the complete contents of `dist/` to an HTTPS static host, including `ocr/`, `sw.js` and the manifest. Open the hosted HTTPS URL in iPad Safari while online. Confirm **V0.3.4**, allow offline caching to finish, then reload and check airplane-mode tap tracking before match day. Optionally use Share → Add to Home Screen. An iPad's localhost points to the iPad, not your Mac. HTTPS is required for service-worker/offline functionality away from localhost.

Keep the same hosted origin to retain that browser's saved match. Local storage does not transfer between Mac and iPad or between different origins. Do not clear website data to update. For an existing installed build, close its tabs/app and reopen online; confirm the version before starting the match.

The original programme JPEG is included as a checksum-verified regression fixture. The reviewed extraction recovers all 15 starter names and 12 substitute entries; uncertain jerseys and imperfect substitute names remain explicitly editable and flagged. Safari/iPad OCR performance still requires device testing.

Validation: `npm test` (36 unit tests), `npm run test:browser` (28 browser tests), and `npm run build`. `SOURCE-PACKAGE.json` records source-file SHA-256 hashes.
