# V0.3.7-dev — Half-Time Analysis review

Development branch: `sideline-v0.3.7`, originating from frozen V0.3.6
`9a60fb81f0ddb12e5fbafd8648dfc301629e4627`. The earlier review checkpoint
`01953851a848c2b1a10d966f4f231643514ddf92` is already on GitHub. The current
compact-dashboard revisions remain uncommitted; no commit/push is part of this review.

## Review locally

With Node.js 22.13 or later, run `npm ci`, then `npm run dev` and open the URL
printed by Vite on that same computer. For a production/offline review, run
`npm run build`, then `npm run preview`. Load once online and wait for the
service-worker cache to finish before testing offline. Use a separate browser
profile/origin for review rather than replacing a live-match installation.

1. Set up the actual teams and optionally enter squads.
2. Record H1 shots, kickouts and other events with the existing Live Match controls.
3. Choose **HALF-TIME ANALYSIS** above the scoreboard.
4. Check H1 score, conversion, our kickout retention, our wins on opposition
   kickouts, turnovers, shot map and recorded player contributions.
5. **View Full Stats** reuses Match Analysis with every section
   scoped to H1. The usual Match Analysis navigation still opens the normal view.
6. Return to Live Match/Timeline, edit or delete an H1 event, then reopen the
   summary. Every figure recalculates; there is no saved statistical snapshot.
7. **START SECOND HALF →** uses the existing reset-to-zero/paused H2 clock
   behaviour, preserving the same match ID and all events. Press Start clock as
   usual when play begins. Reopening H1 analysis after H2 does not reset the clock.
8. Record H2 events: H1 statistics must remain unchanged.

Opening analysis does not pause/reset a running clock, modify events or change
which team is selected for capture. The entry action is available before or after
the half ends so corrections/review remain accessible; there is no automatic
half-completion assumption.

## Calculation rules

- H1 means recorded `half === 1`; all figures derive from those events only.
- Scoring uses existing Goal=3, Point=1, 2 Point=2 rules. Gaelic points include
  both ordinary points and the value of two-pointers; each scoring event is one
  successful attempt. All unsuccessful shots are misses; blocked attempts remain
  separate from wides under the existing analysis semantics.
- Kickout Won/Lost is always interpreted from our-team perspective using the
  existing compatibility reader. Unknown outcomes remain in total kickouts but
  are excluded from percentage denominators. Both numerator/total and the
  denominator note are visible. Short/Long is shown only when recorded.
- Turnovers count existing our-team turnover events, without inferring additional
  turnovers from blocks/interceptions/possession events.
- Contributors reuse player analysis for H1 scores, defensive blocks, Kickout
  Marks, turnovers won and interceptions, listed by jersey without ratings or
  invented weights. Unattributed events remain in team totals.

## Pitch and 40m classification

`src/pitch.js` remains the only pitch/marker renderer. Its two arc paths are
byte-for-byte equal to V0.3.6. Their existing numeric geometry is factored into
`src/pitch-geometry.js`, shared by arc path generation and classification.
No new pitch geometry, coordinate transforms or stored event coordinates are
introduced. Existing display transforms handle either H1 attacking direction.

Canonical storage faces the attacking goal at the top. In the existing 600×900
viewBox the goal centre is (300,20), radius 240; the drawn arc joins y=145.
Inside means the goal-side full-width region through that join line, or the
circular segment beyond the line. A boundary point is inside, with 0.000001
viewBox-unit tolerance. Missing/non-numeric/out-of-field locations are unknown,
excluded from both zone denominators and counted visibly as unclassified.

## Deterministic observations

At most one observation of each kind, in this fixed priority order:

- Working: at least 5 known our kickouts and retention ≥75%; otherwise at least
  5 shots and conversion ≥60%.
- Watch: at least 5 known our kickouts and retention <50%; otherwise at least
  5 known opposition kickouts and our win rate ≤35%; otherwise at least 5 shots
  and conversion <40%.
- Opportunity: at least 3 located attempts in each 40m zone, with inside conversion
  at least 20 percentage points above outside conversion. Describes recorded
  conversion only, without asserting unrecorded tactical causes.

Unknowns do not help meet sample minimums. Insufficient evidence suppresses the
individual observation; if none qualify a neutral message is shown. No external
AI, network service, ratings or inferred possession percentages are used.

## Persistence and limits

No schema, storage key, event field or migration changes. Existing V0.3.6 schema-2
matches remain readable. Analysis state is transient, regenerated on entry/render.
Production assets are included by the existing PWA precache mechanism. The usual
browser reload returns to Live Match; analysis can be reopened without losing data.

Screenshots use review-only teams and player names entered through the UI; the
application itself starts blank. Tests cover 1024×768 landscape interaction and
1366×1024 landscape review screenshots, plus desktop and offline reopening.
Physical iPad Safari/Home Screen testing remains a manual-review step.

## Compact-dashboard revision

The primary review image is a real 1024×768 Chromium viewport screenshot, not a
full-page stitch or concept drawing. Layout tests inspect actual bounds: the
four KPI cards share a row, the shot-map card occupies 55–60% of the two-column
main area, contributors follow that area, and all three bottom actions fit above
the existing Undo/Edit history controls. A fifteen-contributor case also checks
that the strip stays compact and scrolls horizontally. Phone layouts may stack.

`src/coaching-dashboard.js` is a presentation-only component. Its caller supplies
analysis data, labels, attack direction and actions. `src/half-time-ui.js` alone
selects H1 data and half-time actions. The existing deterministic rules, their
thresholds and their evidence text are unchanged. This allows later reuse with a
whole-match data provider. The Full-Time refinement below now uses that same presentation.

The four headline cards omit secondary breakdowns; those remain available through
View Full Stats. Genuine scoring, block and Mark contributions appear in the
horizontal strip without ratings. The pitch renderer and geometry files are
unchanged by this UI revision.

## Enlarged pitch and Full-Time refinement

- The physical pitch drawing is 30% larger: 312px high instead of 240px at
  1024×768 landscape (338px instead of 260px on taller/wider views). Only the
  dashboard display size changes. `src/pitch.js` and `src/pitch-geometry.js` are
  unchanged by this refinement. Browser tests measure the drawn SVG background,
  check equal X/Y scale, unchanged 2:3 ratio, clipping bounds, and visible H1 actions.
- `analysisForScope(match, scope)` accepts H1, H2 and FULL_MATCH. The existing
  `halfTimeAnalysis` wrapper remains H1-only. Each scope uses existing event,
  kickout, scoring and contributor readers and identical observation rules.
- In H2, Live Match offers **END MATCH / FULL TIME**. This pauses the existing
  clock and opens the Full-Time dashboard without adding an event, a duplicate
  match, or a persisted analytics snapshot. It does not lock later corrections.
- Full-Time uses all recorded match events. Our H1 and H2 shot locations are
  plotted in their canonical attacking-top orientation, preserving all stored
  coordinates and using the shared pitch renderer. H1 display orientation is
  unchanged and still follows the configured first-half direction.
- Full-Time adds a compact H1/H2/Match comparison. Score cells show our score /
  opposition score. Shooting uses successful attempts / attempts; our KO retained
  and their KO won by us use known outcomes. Turnovers means our won minus lost,
  with its sign explained. Match rates use combined counts, not averaged rates.
  Missing denominators display an em dash.
- **VIEW DETAILED MATCH REPORT** opens the existing whole-match report unchanged.
  Return to Match / Return to Timeline preserve editing. Reopening the dashboard
  recomputes all scopes and comparisons after corrections.
- No schema, storage-key, saved-match migration, ended-status field or extra
  event-entry requirement is introduced. After reopening the browser, the app
  resumes its normal Live Match view with the H2 clock paused; Full-Time can be
  reopened from the same End Match action. Both dashboards work offline through
  the existing production PWA cache.

Full-Time is allowed to scroll down to the comparison/actions on 1024×768. The
main coaching area keeps the approved hierarchy. Full-Time and H1 share one
`coachingDashboard` presentation; the comparison is optional and Full-Time-only.
