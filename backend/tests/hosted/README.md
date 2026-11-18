# Synthetic hosted acceptance harness

Prepared locally for a later authorised development trial. The approved 001–005 migrations do **not** create `sideline_api`. The runner uses actual Supabase Auth's user endpoint and PostgREST POST RPCs. It cannot deploy SQL, create Auth users, mint JWTs, seed tables or change database clocks. Do not aim the separate `foundation.test.mjs` PostgreSQL fixture at a managed database.

## Required fixture and secrets

Use a dedicated synthetic environment with no customer records. An operator must separately approve the exact development project reference, allowlisted API, accounts, setup and cleanup. Supply a private local JSON fixture (outside the repository) with the following top-level fields. Each ID field is a UUID. IDs describe previously provisioned synthetic records; names of teams administered in this case must start with `Sideline Synthetic `.

| Fixture keys | Meaning |
|---|---|
| projectRef, org | Approved project reference and the primary synthetic organisation |
| team, minor, otherTeam, expiredTeam | Two active teams in org; an active team in a second organisation; a team with an expired term. The first three use Standard, Advanced and Top Tier respectively for the workspace suite. |
| season, previousSeason, minorSeason, otherSeason | Current and previous seasons in team, a Minor season, and the current season in otherTeam. Supply two seasons with linked match evidence in the Top Tier team for comparisons. |
| player, priorPlayer, otherPlayer, match | Only player in team's current squad; an additional player only in its prior squad; only player in otherTeam's current squad; the only match identity in team's historical projection. Include actual synthetic appearance/stat facts for the later workspace tests. |
| expiredInvitation | Preverified, expired coach token issued to incoming for team; no acceptance or revocation, and currently no replacement. Establish expiry with an approved synthetic fixture, independently of wrong-recipient or revoked-token cases. Treat this file as confidential. |
| emails | Object keyed by purchaser, nominee, admin, coach, multi and incoming. Use distinct controlled test mailboxes with local parts starting with sideline-synth-. Each confirmed account has its own Auth-issued session. |

Admin initially has exactly the two administrative teams, no coach seat, and (workspace suite only) editor access for team but not Minor. Coach is assigned only to team. Multi is assigned to all four teams across organisations. Others have no coaching assignments. Leave at least one free coach seat in team. Purchaser does not hold office and incoming is eligible to accept the final transfer. Use a clean fixture for each foundation run; successful tests and interrupted runs can leave membership, nomination, audit and primary-seat changes. Archive a redacted result and retire the test tenant using the operator's separate cleanup procedure. No automatic deletion or reset is performed.

Provide `SIDELINE_APPROVED_DEV_REF`, `SIDELINE_TEST_FIXTURE` (path), `SIDELINE_TEST_PUBLIC_KEY` (publishable key), and one short-lived `SIDELINE_TEST_JWT_<ACTOR>` for each uppercase actor name. Obtain sessions through the approved Auth flow, independently of this runner. Inject them from an OS keychain/secret manager into the process; avoid shell history, debug tracing, dotenv files and CI output. No service secret is an input. Before the first mutation the runner checks the target reference against the fixture and explicit argument, calls Auth to verify the accounts, checks memberships and performs positive and negative reads. HTTP redirects are disabled. The operator remains responsible for verifying the environment and fixture: a naming convention cannot establish project ownership.

For a **future approved run only**, execute the runner explicitly:
```sh
node backend/tests/hosted/run.mjs --run-synthetic "$SIDELINE_APPROVED_DEV_REF" foundation
node backend/tests/hosted/run.mjs --run-synthetic "$SIDELINE_APPROVED_DEV_REF" workspace
```

The workspace mode needs the original membership fixture; run it independently with fresh fixtures or before the mutating foundation mode. Both suites fail if their required API contracts are unavailable. A run against just the five SQL files is premature. The local command `node --test backend/tests/preparation.test.mjs` verifies tooling without a hosted connection.

## Proposed API contracts exercised

All calls use the end user's JWT and the `sideline_api` profile. Successful table-like reads return JSON arrays; scalar/mutation results follow the underlying RPC unless indicated below. Caller-specific reads filter unrelated rows to an empty set. Explicit forbidden operations return PostgreSQL permission error 42501. A missing route, gateway error or expired fixture session must not count as an RLS pass.

- Both suites: `my_teams()` returns IDs, names and organisation IDs for assigned teams only (including retained expired-team data). `admin_teams(p_organisation)` returns scoped administrative IDs/names. `season_roster(p_team,p_season)` returns player IDs and display names only within the authorised team/season; validate the composite relationship. `match_history(p_team)` exposes approved match identities. Anonymous callers are denied. Queries for either implementation schema must fail at schema selection. No provisioning endpoint belongs to this user API.
- Foundation: one rejected start against an expired synthetic team; `register_organisation`, `accept_admin_nomination`, purchaser-only `registration_status` returning status and nominee_accepted. The test ends registration at pending status. The trusted provisioner is exercised separately under operator audit.
- Foundation: `invite_coach` returns token, issued_at and expires_at only on issuance. `accept_coach_invitation`, `revoke_coach`, narrow `admin_audit_events`, `request_admin_transfer` and `accept_admin_transfer` follow the underlying checks. The suite verifies the 14-day interval, expired/wrong-user/replayed token denial, audited self-assignment, same-JWT revocation and exactly one winner from two overlapping transfer requests. Local lock-observed races remain the stronger test of actual database contention.
- Workspace (future capabilities): scoped `editor_roster` returns exactly player_id and display_name. `team_features` returns stable feature IDs. `team_statistics` and `basic_player_review` return deterministic shared results for both coaches. `season_comparisons` enforces both membership and Top Tier at the operation itself. The runner verifies these contracts; no feature engine or analysis calculations are implemented here.

Before a pilot, add real delivery and login/refresh tests, downgrade and renewal transitions through the separately authorised operator path, historical linking approval/correction, offline account-switch and revocation tests, and denial checks on every additional RPC/export. Verify invitation and session secrecy in actual gateway logs. Record which hosted tests were exercised; offline transport tests cannot establish hosted security.

## Acceptance cases for future commercial squad operations

These cases require the future commercial implementation. The current preparation suite uses no importer, squad-write endpoint or premium analytics engine.

- Import a valid official Sideline Excel template with synthetic Irish names. Reject a workbook with unexpected headings and an official workbook with a synthetic contact value under the correct name heading. Reject CSV, pasted tables, generic workbooks and OCR/PDF inputs without processing their player data. Verify that rejected values and source documents are absent from records, logs and exports.
- Open a fresh season and verify it is empty. Exercise each population path separately: official template, deliberate previous-season copy and manual addition. Confirm a returning player keeps the selected ID and two unrelated same-name players keep distinct IDs.
- Add an unlisted own-team player offline on match day, synchronise and retry. A second assigned coach must see one current-season entry linked to the appearance. Edit the player's name, jersey and position, then test deactivation and removal. Compare historical squads, appearances and statistics before and after. Repeat the historical comparison after revoking the first coach.
- Verify an administrator with the roster-editor grant can edit only the authorised current-season list. Match history, Player Review and team statistics require coach assignment. Explicit cross-grade links must leave each team's read permissions intact.
- Exercise Advanced Squad Review on Advanced and Top Tier, and Historical Player Analysis and season comparisons on Top Tier. With one relevant season the comparison lacks evidence. With two relevant seasons the entitled coach can compare. After downgrade or expiry, verify current premium access and compare the retained sporting records with the pre-transition records.
