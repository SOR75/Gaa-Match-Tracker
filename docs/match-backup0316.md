# V0.3.16 backup and recovery

Local development only. No automatic cloud upload or deployment.

## Coach workflow

1. Open **Match History → Backup & restore → Download Sideline backup**.
2. Save the JSON file in Files/iCloud Drive or Google Drive, or copy it to another
   device. Keep readable PDF reports separately: JSON is restore data, not a PDF.
3. Select the file under **Restore Sideline backup**. Review teams, dates, match
   event counts, Saved Squads, Saved Team Setups, additions and skip reasons.
4. Close other Sideline tabs. Confirm restore and keep this page open until done.
   Cancel writes nothing. Existing IDs are never overwritten.
5. Matches appear in History. Deliberate Resume on eligible unfinished matches
   opens a paused clock, after the existing current-match archive safeguard.
6. Saved Squads/Team Setups can be loaded through their existing screens into a
   deliberately created new match. Permanent player UUIDs remain the same, while
   jersey, role and match-player row IDs remain match-specific.

## Contents and compatibility

New version-2 JSON files contain the current match, readable/non-deleted native and
legacy History matches, the Saved Squad v2 library and Saved Team Setup v1 library.
No browser storage format or database version is changed. The previous version-1
match-only backup remains readable and never touches Squad or Setup libraries.
Player Review reloads when opened; restore does not invoke a background legacy
Squad upgrade.

Match snapshots preserve original schema versions, events/IDs, stable player IDs,
coordinates, period flags, recorded clocks and unknown metadata. Library records
preserve original IDs, club/season metadata, player identities, setup memberships,
jerseys and Starter/Substitute/Panel roles. No matching by name, jersey or row order;
no IDs are manufactured. Legacy/unlinked historical players remain unlinked.

Export reads libraries directly without calling their migration/save functions.
A legacy-only Saved Squad v1 library requires the coach to complete Sideline's
existing Saved Squad upgrade separately; backup does not generate identities.
Malformed/unsupported libraries block full backup or full restore without replacing
original storage. Match-only backups can still restore independently of libraries.

Preferences, emergency recovery keys, deletion markers and the cached app shell are
not exported. This is not a whole-browser image or cloud synchronization. Files
are unencrypted and contain personal information: keep them somewhere you control.
Validation checks format/structure, not cryptographic authenticity.

## Duplicate and dependency rules

- Existing active-match IDs, archived IDs and destination match tombstones are
  skipped. Different contents do not authorize overwrite or revision merging.
- Existing Squad/Setup IDs are skipped, preserving original records exactly.
- Same names with distinct IDs remain separate; the review explicitly flags same
  display names. UUIDs, never names or shirt numbers, determine identity.
- A new Setup needs its original Squad ID and every original player UUID in the
  resulting library. Otherwise it is listed as skipped, with the reason. Missing
  players/Squads are not invented or added to an existing Squad to force a match.
- Squad deletion currently has no tombstone mechanism. Explicitly confirming an
  old backup may therefore restore a missing Squad; it never revives deleted
  matches on a device with their existing tombstone.
- All original snapshots and library records survive an additive restore. No
  unrelated historical match is rewritten to link it to an imported library.

## Storage errors and interruption

Validate the whole file before writing. Limits are 25 MiB / 2,000 matches, including
library bytes in the size limit. Invalid/future records or duplicate IDs reject
rather than partially salvage a file or export an apparently complete backup.

IndexedDB keeps the match batch atomic and serializes concurrent restores. Library
additions use the existing two localStorage keys. They cannot share a browser
transaction with IndexedDB. Normal library-write or IDB failures abort new match
writes and attempt exact library rollback. Rollback only removes our own appended
payload; it never overwrites a later external edit. A blocked rollback is reported
as incomplete and may leave only new library entries, alongside intact originals.

A browser/device crash between stores can similarly leave newly added library
records with no new matches. There is no claim of crash-atomicity across stores.
Retrying the same backup skips already-present IDs and completes remaining valid
additions. Do not clear browser data to recover from an interrupted operation.
Close other tabs before restoring to avoid racing unrelated library edits.

Running match snapshots retain a capture timestamp. Existing History readers freeze
clocks at that timestamp, not at restore time. Unknown old timing is not invented;
paused-zero legacy matches retain V0.3.15's explicit Start requirement.

## Build identification

Tap the version badge in the top bar. The panel reads the source SHA embedded in
the actual running bundle and shows whether local changes were included. An
uncommitted local build names its base commit and explicitly says it is modified.
No reload, update activation or storage mutation occurs. Existing
`window.__SIDELINE_BUILD__` and generated `build-info.json` remain available.

## Physical acceptance

Use synthetic records first. Test iPad Safari and installed-PWA Save to Files,
selection of that same JSON on a separate test device/origin, review/Cancel/Confirm,
duplicate skipping, offline use, Squad/Setup loading into a new match and UUID
continuity. Do not delete real matches or clear the only device's browser data.
Branch previews have separate origins and storage. No service-worker strategy,
match-day capture, analysis, OCR, pitch or print layout change is included here.
Voice Match Mode remains Coming Soon with zero microphone execution.
