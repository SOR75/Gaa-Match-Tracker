# Sideline — Gaelic football match tracker

A mobile-first first iteration for a coach or analyst recording one live match. Starts with blank teams and an empty squad. No accounts, backend, seeded players, or external services.

## Run locally

Requires Node.js 22.12+ (Node 24 is also supported) and npm.

```sh
cd Gaa-Match-Tracker
npm ci
npm run dev
```

Open `http://localhost:5173` in your local browser. Vite also prints the LAN address for a phone or iPad on the same network. Development mode supports live code updates; offline installation is enabled only in the production build.

To test the production PWA locally:

```sh
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173`, allow the first load to finish, then reload once. The app shell, fonts and icons are precached. Turn off the network and reload to check offline operation. Updates wait for all existing app tabs to close, so an active match is not replaced mid-session.

On an actual iPhone/iPad, PWA installation and offline service workers require **HTTPS**; a plain HTTP LAN address supports the interface and autosave but does not qualify for PWA installation. Serve `dist/` from an HTTPS static host, open it in Safari, then use **Share → Add to Home Screen**. Production hosting must serve `/sw.js` without a long-lived immutable cache. This version assumes hosting at the domain root.

## Use and manually test

1. **Match setup:** enter both team names, competition, venue, date, half length (30 minutes by default), and tracker/coach. Fields autosave as you enter them. Both team names are required before recording events.
2. **Squad:** add jersey number (1–99), name, starter/substitute, position, and notes. Duplicate jersey numbers are rejected. Squad entry is optional; unlisted player numbers can still be recorded.
3. **Live match:** start/pause the clock; choose a team and tap an event. Goal, Point, 2 Point, and Wide/Miss offer an optional number or squad shortcut before saving. Match time is captured at the initial tap, not when the dialog closes. Other events save in one tap. Our/Opposition Kickout and Turnover Won/Lost have a fixed team perspective; Interception and Possession use the selected team. Edit afterwards for extra details.
4. Record a goal, point and 2-pointer for your team. The total should be **6** (3 + 1 + 2), with each scoring category displayed separately. A wide or kickout must not change it.
5. Use the permanent **Edit last event** or **Undo last event** controls. Change the team or event type and verify both scores recalculate. Undo removes the last _recorded_ event, even if you edited an older event's time. Timeline rows also open the editor.
6. **Timeline:** review by half and match time, newest first. Filter by team or scoring/non-scoring events. Edit a timestamp or details, and check that they persist.
7. Refresh or close and reopen the same browser/origin. Setup, squad and events should return. A running clock continues based on its saved timestamp; a paused clock stays paused. Switching halves resets the half clock to zero and pauses it, preserving all events and totals. Clock counts beyond the configured half length as added time; it does not stop automatically.
8. In the production preview, go offline after the initial load/reload. Continue tracking and refresh to confirm offline persistence.

The app stores one active match in `localStorage` under `sideline.match.v1`. Storage belongs to the browser and origin, so different ports, browsers, devices, or an installed home-screen app may have separate data. Keep browser data to retain the match; private browsing or clearing site data can remove it. A storage failure displays a persistent warning. Invalid saved data is preserved rather than overwritten. Use one tracking tab per match; another tab's update asks stale tabs to reload before continuing. There is no cloud sync or export in this iteration.

Notes/dictation accepts typed notes or the device keyboard's microphone; it does not implement voice commands or in-app speech recognition.

## Automated checks

```sh
npm test                   # domain rules and storage tests
npm run build             # production assets and versioned offline shell
npx playwright install chromium
npm run test:browser       # production-build end-to-end tests
```

If Chromium is already installed, skip the browser download:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

Browser tests cover blank state, squad entry, both teams' scores, corrections/undo, timeline filters, half transitions, clock restoration, local persistence, offline reload, and responsive widths. They use isolated browser contexts, so fixture team/player names are never seeded into the application. Actual iOS Safari installation and device ergonomics should also be checked on an iPhone/iPad.

## Architecture

- `src/domain.js`: match/event shapes, event definitions, score selectors, clock operations, edit/undo. `events` is the sole source of scoring truth. A goal is 3, a point is 1, and a 2-pointer is 2. No independent score totals are stored.
- `src/storage.js`: versioned browser persistence and load/save failure reporting.
- `src/main.js`: four screens, form/dialog interactions and rendering. User-entered content is escaped before HTML rendering.
- `src/style.css`: mobile-first touch layouts with tablet and desktop adaptations; bundled fonts work offline.
- `public/manifest.webmanifest`, `public/sw.js`, `vite.config.js`: install metadata and a build-versioned, fully precached app shell. No network APIs are needed during a match.
- `tests/`: domain/storage tests and Playwright workflows.

Each event has `id`, `half`, `timeMs` (elapsed within that half), `team` (`our`/`opposition`), `playerNumber`, `event`, `outcome`, `scoreValue`, `zone`, `side`, `kickoutLength`, `notes`, `scoreOrigin`, `possessionResult`, `attackPattern`, `coachObservation`, `directScoreLink` (another event's ID), and `createdAt`. Optional detail fields start empty. `scoreValue` is normalized from the event definition; scoreboard selectors also derive scoring from definitions and outcome, never a manually adjusted total. Links to scores are cleared if the target is undone or becomes a non-scoring event.

The local schema is versioned for future migrations. Dashboards, analysis, statistics, exports and voice commands are deliberately left for later iterations.
