# Sideline commercial foundation — Phases 2A–2B.1

This directory is independent of the V0.3.16 browser application. Apply the migrations only to an approved environment. Phases 2A through 2B.1 introduce database definitions and tests with synthetic data. They have no browser integration, cloud sync, localStorage or IndexedDB migration, email delivery, payment processing, or deployment.

## Schema

| Table | Purpose |
|---|---|
| `organisations`, `organisation_admins` | Club or county, GAA or LGFA, and explicit organisation administration grants linked to `auth.users`. |
| `teams` | Stable team under one organisation. Draft and archived teams use no active slots. Archival retains all references. |
| `subscription_terms` | Standard 12-calendar-month terms, administrator-issued pilot terms, and team and coach allowances. Grace is zero and expired access is read-only. |
| `subscription_reminders` | Internal per-term notification schedule with one record per recipient and milestone. |
| `team_coaches`, `coach_invitations` | Explicit team assignments keyed by login, revocation, and expiring invitations bound to the verified email of the recipient. |
| `team_seasons`, `players`, `squads`, `squad_players` | A team owns permanent players and seasons. A season owns its squads. A player keeps the same team-scoped ID when added to a subsequent season squad. Jersey number is a squad membership attribute. |
| `matches` | Team-scoped match identity with an optional season and timestamps for a successful initial recording claim and completion. This is the identity layer for future History and recovery. Match contents and match-day rosters are outside these migrations. |
| `recording_ownership` | At most one current match, coach, and device tuple per team. The last ownership generation is retained when the slot closes. |

Child references use composite keys where the referenced row is team-scoped. A player, squad, season, or match ID from another team cannot satisfy the relationship. There are no cascading player or match deletions. Offaly LGFA U16 and Minor are separate teams in the synthetic test fixture only.

## Permissions

- `anon` has no grants on the protected schema. All 17 tables have RLS enabled. Authenticated callers have only the approved read grants and named functions. Client roles have no direct table writes.
- Organisation administrators manage their own draft teams, activation and archival, invitations, and coach revocation. They can read administrative metadata in their organisation. Player, squad, season, and match access requires a separate team assignment.
- Coaches can read only assigned teams, subject to the term's read policy. They can create match identities and claim an initial recording only for active, entitled teams. One account can be assigned to multiple teams. Only the holder sees their recording ownership row. An invitation can be accepted only by the verified recipient and can be used once. New coach invitations expire after 14 days and pending invitations do not hold seats.
- `service_role` has execute grants for organisation provisioning, standard and pilot term operations, and reminder scheduling and retrieval. These migrations grant it no direct player-table access, even though the role bypasses RLS. Keep the secret server-side and authorise platform operators in the future administrative service. Project owners and database administrators retain infrastructure privileges. Platform staff and Supabase secret holders need separate operational access controls.
- Security-definer functions use an empty search path and explicit schema references. Policy helpers are in `sideline_private`. Keep it outside the Data API's exposed schemas. Organisation reads use explicit columns (`id,name,kind,association`) because the internal lock counter has no read grant.

## Registration and primary administration

1. A purchaser with a verified Auth account calls `register_organisation` with the club or county name, association, billing contact, nominee's name and email, optional phones, and requested team count. Billing email defaults to the purchaser's confirmed address and can be supplied separately. The registration ID identifies a pending request. The purchaser can read their own submission. A billing address grants no account rights.
2. The future invitation flow presents the organisation and nomination to the intended recipient. Signing in with the confirmed nominated address and calling `accept_admin_nomination` records consent from that Auth UUID. An ordinary purchaser cannot impersonate a different nominee. A purchaser who is also the nominated administrator follows the same acceptance and approval steps.
3. An authorised operator verifies the commercial request, including the purchaser's authority to register the organisation. The server calls `provision_registration`. It locks the registration, rechecks the nominee's current verified address, creates exactly one primary seat, and records provisioning in the audit. Retries return the same organisation. The trusted server can read the registration queue. Only it can approve provisioning. Requested team counts confer no entitlement. The operator separately issues the approved standard or pilot term using Phase 2A operations. A future payment handler would map a verified, idempotent server event to these operations.
4. The primary administrator manages teams, allocations, coach invitations, the operational organisation contact, and subscription information. Changing a contact address does not change an Auth identity or historical billing submission. Player, squad and match access requires an explicit team assignment. Administrators who coach accept a verified invitation and use a normal seat. The membership change and audit event commit together.
5. A primary administrator initiates `request_admin_transfer` for the successor's email. A seven-day random token is returned for delivery. Only its digest is stored. The administrator can cancel or replace a pending request. The successor signs in with the confirmed target email and supplies their name and optional phone to `accept_admin_transfer`. In one transaction the seat changes owners, the token is consumed, the old administrator's pending coach invitations close, and the audit records both identities. A unique seat and a deferred foreign key require one administrator at commit. Existing team assignments survive a transfer and remain separately revocable.
6. Migration 005 issues single-use coach tokens bound to a verified email for 14 elapsed days (336 hours). Previously issued tokens keep their recorded deadlines. Revoking a coach removes that team's server access and releases their recorder slot. Other explicit teams, including teams in other organisations, remain available to the same login. Replacing a token, expiry and prior revocation are checked on acceptance. Admin writes and invitation acceptance recheck authority after waiting for the organisation lock. A transfer cannot leave a queued write authorised by the old seat.

The new tables are `organisation_registrations` (purchaser RLS, trusted server queue), `organisation_contacts` (current admin reads and updates via RPC), `admin_transfers` (private tokens and state), and `admin_audit` (current admin reads, database operations append). The existing `organisation_admins` table stores the primary user, full name and optional phone. Auth owns the verified email. Purchasers, coaches and administrators have separate permissions even when one person holds several roles. Service credentials belong only in the future trusted backend. An already downloaded device copy needs a separate offline reauthorisation policy.

### Lost primary administrator

TSC Ltd controls lost-administrator recovery. The primary seat stays assigned until a verified handover. Loss of access, a billing change or a request from a coach cannot automatically appoint a successor.

TSC must independently verify the requester's identity and authority to act for that specific club or county, for example by confirming the appointment with an organisation officer through an independently sourced contact channel. Record the organisation, case reference, evidence of authority, verifier, decision and timestamps in a restricted audit trail, including refused requests. An approved replacement must accept using the verified incoming account. Record the outgoing and incoming account IDs and the completed outcome.

Phase 2B.1 implements ordinary administrator-initiated transfers only. If the administrator is unavailable, recovery requires a separately approved operational procedure. The database provides no lost-administrator override.

### Coach onboarding on iPhone and iPad

1. Receive an invitation identifying the organisation, team and invited email.
2. Open Sideline's HTTPS website in Safari or another supported browser.
3. Create an account or sign in, and verify the invited address.
4. Review and accept the team invitation online. The server records the assignment under the account UUID.
5. Add Sideline to the Home Screen.
6. Launch the installed app and check its own session. Prompt for sign-in with the same account if necessary.
7. Fetch authorised memberships from the server and select a team. An already accepted invitation needs no second redemption.

On iOS and iPadOS 17.2, WebKit documented copying cookies when creating a Home Screen web app. Browser local storage and IndexedDB are outside that copy, and subsequent website data is separate. A browser login therefore cannot be assumed to establish a standalone session. Test both launch contexts on supported devices. Keep login tokens out of installation URLs. [WebKit's Home Screen login-cookie notes](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)

### Hosted integration and sport scope

Before hosting, approve purchaser signup and anti-abuse controls, operator checks for duplicate or unauthorised registrations, delivery and redirect allowlists for invitations, and the operational procedure for TSC-controlled recovery. Set retention for pending submissions, contact data and audit entries. Validate confirmed-email changes, session refresh and revocation, any anonymous-account configuration, and actual JWT-to-Auth-UUID mapping. Exercise every role via PostgREST and verify the migration owner can lock the required Auth row, private functions are inaccessible, and cross-team requests remain isolated. Test Safari and standalone sign-in on devices with synthetic accounts. Current integration tests exercise database roles and policies with a local Auth fixture.

Memberships, procurement, subscriptions and recording ownership use organisation, team and account IDs. The present GAA/LGFA association constraints in organisations and registrations would need a coordinated migration to support other associations. A future club with teams in several sports can add sport metadata at team level and retain existing IDs and licences. This phase adds no sport-specific metadata or capture logic. The proposed TSC Ltd business name is not used as a legal billing entity.

## Licences and recording ownership

A new term starts on its Irish activation date. Its exclusive calendar anniversary is stored in `ends_on`. The displayed final date is `ends_on - 1`. The term covers the whole final date and closes at the following midnight in `Europe/Dublin`. PostgreSQL stores both absolute boundaries in `starts_at` and `expires_at` (`timestamptz`). Standard terms last 12 calendar months. Pilot terms default to six calendar months and accept a positive whole-month duration from the trusted administrator. There is no grace period. The latest term whose stored activation instant has passed controls the organisation's entitlement. At expiry, new match creation and initial recording claims are denied. The server checks its wall clock after acquiring the organisation lock. Authorised users retain read access to existing data. A renewal beginning at the old term's exclusive cutoff gives continuous coverage. A renewal starting later restores start rights on its activation date and preserves the same teams, squads, and match history. Future lower limits reserve capacity when the scheduled term is added. The trusted term operations reject overlaps and reductions below current usage.

An authorised server operator explicitly issues a standard term with `set_subscription_term` or a pilot with `issue_pilot_term`. For the Offaly LGFA pilot, the proposed provisioning values are six months and two slots, with U16 and Minor created and activated individually. The general SQL has no Offaly-specific rules. Extend an unexpired pilot through `extend_pilot_term` with the original start date, expected exclusive anniversary (`ends_on`), and additional whole months. Both pilot operations return the exclusive anniversary. The revised expiry is calculated from the original activation date plus the new total duration. This keeps month-end handling consistent. The expected expiry prevents retries from applying an extension twice. Extension preserves the term key and existing data. Issue a new term after expiry, starting no earlier than the current date. There is no automatic renewal or extension.

One active team occupies one slot. Seasons, match count, and device count have no licence charge. Each team has a package allowance between one and five coaches. Publishing an invite does not consume a seat. Acceptance rechecks availability under the organisation's write lock. Archiving releases a team slot, keeps the team's data, and is blocked while a recording is active. Reactivation requires an available slot.

Capacity changes, revocations, match creation, and recording claims share a transactional write lock on the organisation row. A contender at PostgreSQL's default READ COMMITTED isolation waits, then checks current data. An older transaction at stronger isolation can receive a serialization failure and must retry the whole operation. Contention is scoped to an organisation. Direct table writes by application callers are denied so capacity-changing calls go through the same rules.

The initial claim takes a team, match, and device UUID. A different coach, device, or match cannot take an active team slot. The active holder may retry the identical tuple, continue recording, and call `finish_recording` after expiry. Finishing checks the exact holder and generation under lock, records completion, and releases the slot. A match created before expiry without an initial claim counts as unstarted. Revocation remains effective and closes the revoked coach's slot. A later initial claim on a fresh match advances the generation. A previously claimed match needs the future recovery workflow. The current-recorder predicate is a preflight check. A later upload must verify authenticated membership, device proof, exact ownership tuple, revision, and an authorised start in the **same transaction** as its write. Device proof, authorised takeover, and checkpoint resume belong to later work.

Future clients must preserve rejected local checkpoints under their original IDs and surface them for review or export. This migration stores no event payloads and has no endpoint that could accept or discard such work.

### Reminders and expiry status

Run the trusted `schedule_subscription_reminders(organisation_id)` operation daily once scheduling is wired up. Its records cover 30, 14, 7, and 1 days before expiry and the displayed final date. Day 1 means urgent and day 0 means the final warning while the term is still valid. The audience is verified organisation administrators and all verified assigned coaches of active teams affected by the term. The key of organisation, term start, exclusive anniversary, recipient account, milestone, and Irish due date deduplicates overlapping roles, multiple team assignments, and concurrent scheduling runs.

`due_subscription_reminders` selects candidates for the current Irish calendar date, rechecks recipient eligibility, and suppresses obsolete schedules after a contiguous renewal or extension. Existing schedule records remain as internal planning history. A missed day is currently skipped. Before delivery, decide whether to send a single catch-up warning, omit expired milestones, or require a different policy. Future delivery must recheck eligibility and use the composite key as a durable delivery idempotency key. Distinct Auth accounts sharing a destination address may need address-level deduplication at delivery. This phase sends no messages. `subscription_status` supplies the expiry timestamp, organisation-level start entitlement, and expiry-day warning to authorised callers.

### Irish dates and existing UTC promises

A standard term starting 1 July 2028 covers 30 June 2029 in full. Its exclusive cutoff is 1 July 2029 at 00:00 in Dublin, or 30 June at 23:00 UTC. For a 1 January anniversary the cutoff is 00:00 UTC. PostgreSQL calculates each boundary from the named time zone and calendar date, including 23-hour March days and 25-hour October days. The API uses the stored instant for entitlement. Future clients displaying the final date should use the term's inclusive date, and use the absolute cutoff to enforce it.

Migration 004 preserves both activation and expiry instants for every existing term, including scheduled terms. An existing summer term therefore keeps its originally promised last hour. Changing only its allowances preserves both instants. A contiguous renewal starts at that exact cutoff. An approved pilot extension keeps the original activation and sets a later Dublin cutoff. A proposed term placed before a scheduled legacy term is rejected if their adjacent midnights differ. An operator must resolve the schedule explicitly before reissuing the request.

Legacy reminder rows stay available for audit. After upgrading, run the idempotent scheduler for each affected organisation to populate outstanding corrected milestones. The due query filters by current term, actual Irish due date, and current recipients. Previously missed dates follow the existing missed-day policy.

### Offline behaviour for a future client

Cache a server-verified entitlement for the provisioned account and team, with the exclusive UTC expiry. At or after that time, block starting new matches offline. If the device cannot reliably establish the time or has no valid entitlement, require an online refresh before a new start. An offline device learns about renewal when it can refresh. Keep existing downloaded records readable by the provisioned authorised user. A match already started under verified entitlement may finish locally even after expiry. Preserve its original start evidence, ownership, and checkpoints for later sync. A future offline-start policy must specify device and clock proof for starts the server has not yet acknowledged. The current browser storage and match behaviour are untouched.

## Migration and Supabase configuration

1. Apply migrations 001 through 005 in numeric order, once each, using a migration ledger. Each file is transactional. Replay from an empty disposable database for verification. The foundation expects Supabase's Auth schema, user table, `auth.uid()`, and API roles. Use the trusted migration owner, typically `postgres`, with access to Auth references and ownership of the security-definer functions. Migration 002 enforces no grace and read-only expiry. Migration 003 keeps existing expiry dates and keys, marks existing terms standard, upgrades reminder identities, and backfills issuance times from the Phase 2A seven-day invitation lifetime. Migration 004 backfills stored UTC promises before enabling Irish-local issuance, renewals, and reminder dates. Apply the full transaction before running the scheduler. Migration 005 requires exactly one existing administrator row per organisation. Its constraints abort the transaction on ambiguous legacy data. An operator must establish the authorised owner before retrying. Existing users keep their UUIDs, assignments and entitlements. Legacy administrator names and phones can be absent. No contact information is inferred.
2. Before hosted integration, verify the chosen platform version, EU residency and processor terms. On an approved **synthetic** staging project, expose only `sideline` for this foundation if direct Data API access is needed. Review existing exposed schemas independently. Keep `sideline_private` out of the Data API. Preserve these explicit grants and avoid adding broad table or function grants. Keep public enrolment and anonymous sign-in disabled for the invite-only pilot. Auth account creation and sending invitations need a separate trusted integration.
3. Run permission tests through hosted Auth and PostgREST with anon, coach, admin, revoked coach, and server-role credentials before sending real records. Verify generated API metadata, JWT handling, the organisation column grant, security-definer ownership, and service-role separation. Configure backups, a recovery drill, audit logging, retention, and least-privilege support access before the pilot.
4. A later, separately approved migration should inventory local snapshots and backups, ask an authorised owner to map them to teams, stage copies with stable player and match IDs, and verify derived results before cutover. Keep original device stores available for rollback. Historical player links or cross-team identities must never be inferred from names or jersey numbers. No existing app data is imported in this phase.

## Repeatable database tests

Use a disposable PostgreSQL cluster as your OS user. The runner requires a Unix socket, a fresh cluster without existing Supabase roles, and an empty test database. It creates a minimal local Auth fixture so the **real PostgreSQL engine** exercises policies with each SQL role. Use an externally installed `pg` test client. There are no changes to the application's dependency manifests.

```sh
test_root="$(mktemp -d /tmp/sideline-db.XXXXXX)"
mkdir -m 700 "$test_root/socket"
npm install --prefix "$test_root/client" --no-save --no-package-lock pg@8
initdb -D "$test_root/db" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject
pg_ctl -D "$test_root/db" -l "$test_root/postgres.log" \
  -o "-h '' -k $test_root/socket -p 55432" -w start

PGUSER="$(id -un)" PGPORT=55432 \
SIDELINE_TEST_PG_SOCKET="$test_root/socket" SIDELINE_TEST_PG_DATABASE=postgres \
NODE_PATH="$test_root/client/node_modules" node --test backend/tests/foundation.test.mjs

pg_ctl -D "$test_root/db" -m fast -w stop
```

Each concurrency case holds open the first transaction, observes the second waiting on a database lock, then commits the winner and checks the loser's exact rejection. The suite exercises two separate organisations, Offaly's two teams, explicit multi-team access with one login, cross-team foreign keys, denied direct writes and privilege escalation, invitation and coach revocation, limits and renewal, archival, and recording generations.

## Results and outstanding decisions

Phase 2B.1 passed all 46 reported commercial tests on disposable PostgreSQL 18.6 and all 979 application Node tests. The account tests cover separate billing and purchaser identities, nominee verification, repeat provisioning, the single administrator seat, audited self-assignment, expiring tokens, overlapping memberships, contested transfer, stale administrator writes and the Irish cutoff. Both suites used local fixtures.

The SQL review covered role grants, RLS, composite keys, forged scopes, invited identities and revocation, capacity serialisation, recorder ownership, expiry and renewal, and the search path and execution ACLs of security-definer functions. An old pending invitation could previously reinstate a revoked assignment if the login restored a previous verified email. Acceptance now rejects invites issued on or before that login's team revocation. A new invitation can explicitly reinstate the user. The extension API also rejects stale expiry values and the standard RPC cannot alter a pilot term.

The Auth boundary still depends on validated JWTs and on keeping API roles without direct login. Hosted Supabase Auth and PostgREST policy tests are required before using real data. Organisation admins can explicitly assign themselves via invitations under their existing team-management authority. Acceptance records administrator self-assignment in the organisation audit log. Database ownership and service credentials remain privileged and require operational controls. The current recorder check does not prove possession of a physical device. Reports and Player Review remain browser-side; future synced data must use the same team read policy.

- Phase 2A.3 passed all 38 reported tests on disposable PostgreSQL 18.6 and all 979 existing application Node tests. The suite includes database tests for winter and summer cutoffs, both clock changes, committed UTC promises, reminder cutover, overlapping renewals, and a match request waiting across expiry. Recording claims now use one instant for the entitlement decision and the stored start. Future capacity reservations use the actual current term. The team read policy checks that a started term really exists. Final database tests also check the public RPC allowlists, restricted table writes, RLS and security-definer search paths.
- Phase 2A.2 passed all 24 reported integration tests on disposable PostgreSQL 18.6 and all 979 existing application Node tests. Each migration is applied in order to the same populated synthetic database. The suite exercises the earlier lifecycle, a six-month two-team pilot, custom duration, extension replay protection and reminder suppression, concurrent invitation acceptance and renewal, and function privileges. The local Auth fixture supplies UUIDs and verified email state. Managed Supabase Auth, JWT handling, email delivery, and PostgREST behaviour remain untested.
- Decide retention for reminder history, whether missed reminder days need catch-up, and how delivery and audit receipts will be recorded. Renewal downgrade behaviour, invitation delivery and recorder takeover authority remain policy decisions.
- Approve the device proof, offline-start and conflict-preservation policies before implementation of recording uploads or recovery. The generation check cannot revoke an already-downloaded offline device or authenticate a caller-supplied device ID on its own.
