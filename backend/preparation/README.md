# Phase 2B.2A — Local deployment preparation

Baseline `152683bf01c179a9ea3f8e23c9b53f064e392ccf` on `sideline-commercial-dev`. Only the five approved SQL files belong in the first deployment package. This directory describes a proposed API and future data changes. None of those proposals are migrations in the package.

## Package and ledger

From the repository root, use Node (already required by Sideline).

```sh
bundle="$(node backend/preparation/package-migrations.mjs)"
node backend/preparation/package-migrations.mjs --check "$bundle"
node --test backend/tests/preparation.test.mjs
```

The first command creates a fresh, unlinked temporary CLI work directory. It copies bytes from `backend/migrations`, writes `supabase/config.toml` and `supabase/migrations/<version>_<description>.sql`, and verifies the copies. Local Data API and seed execution are disabled. This config file neither inspects nor changes remote settings. Use a new bundle if verification fails. No Supabase CLI, network, environment keys or database are involved in packaging.

| CLI ledger version | Authoritative file | Dependency |
|---|---|---|
| 20261118000001 | 001_commercial_foundation.sql | Managed API roles, Auth UUID function and users table |
| 20261118000002 | 002_subscription_lifecycle.sql | Foundation tables, functions and ACLs |
| 20261118000003 | 003_pilot_licensing_and_security.sql | Term and reminder structures from 001–002 |
| 20261118000004 | 004_irish_subscription_boundaries.sql | Pilot durations, existing term dates and reminder keys |
| 20261118000005 | 005_accounts_and_administration.sql | Existing organisations, primary seats, Auth references and verified-email checks |

The fixed versions and full SHA-256 digests are in [package-migrations.mjs](package-migrations.mjs). Rebuilding always yields the same migration names and bytes. Supabase's remote migration ledger tracks versions. The local checksum list provides independent content verification. Keep the approved mapping and deployment evidence together; the presence of a version alone does not establish which SQL ran.

**Before any hosted write.** Obtain separate permission for inspection of the named development project. Record reference, region, server version, migration history, object inventory and owners, schema exposures, role memberships, effective and default grants, and backup/restore capability. Inspect metadata only. Check for existing Sideline objects even when the migration ledger is empty. Require a supported server version (003 uses PostgreSQL 13+ DROP EXPRESSION); rehearse on the actual target major with an approved CLI version. Check CLI parsing of the generated layout and the interaction of the source files' BEGIN/COMMIT with ledger recording. The CLI was unavailable in this local preparation.

**Subsequent deployment proposal.** Use one authorised operator and this verified work directory. Compare the full remote ledger against the approved manifest. Previously proven matching versions are already applied. A valid partial deployment must be a verified prefix of the five in order. Preserve unrelated managed objects; investigate unexpected versions, gaps or independently created Sideline objects. With separate write approval, confirm the CLI dry run lists exactly the missing suffix, then apply through the same CLI ledger. Keep seed execution off. Verify versions, intended objects, grants and checksums against the release record afterwards. Do not combine this with manual SQL application. A second deployment preview should list no pending versions.

**Failure recovery.** Stop on the first discrepancy. Capture the last committed file, ledger state, catalog state and a redacted error. An application transaction and the tool's history entry can disagree after an interruption. Do not replay a non-idempotent migration or mark it applied based on its filename. Reconcile against a disposable rehearsal and a pre-deployment backup. Resume only after the operator verifies the actual prefix. Use a separately reviewed forward repair or an approved restore if the states diverge. Never reset a hosted project or modify managed Auth objects as a shortcut.

## Restricted API proposal

Keep `sideline`, `sideline_private` and `auth` outside the Data API's exposed schemas. After a separate API migration and review, expose only the approved Sideline interface in `sideline_api` for this product. Inventory any other exposed schemas independently. Start with default-deny schema usage, table/column access and function EXECUTE (including PUBLIC and defaults for each object-creating role). Grant individual signatures to the intended roles in the same transaction that creates them. Keep underlying RLS effective with security-invoker reads and wrappers, explicit columns and qualified names. Never expose full composite rows by default. Existing implementation RPCs execute as their owners with an empty search path, so they require explicit checks of the signed-in user even behind an invoker wrapper.

| Actor | Proposed interface and limits |
|---|---|
| Signed-out / anonymous Auth user | No commercial records or operations. Keep anonymous sign-in disabled. A publishable key identifies the app. Auth supplies the verified user UUID. |
| Verified purchaser / nominee | Register; view only own registration status; accept nomination bound to current confirmed address. Provisioning and licensed capacity require an operator. |
| Assigned coach | Read the assigned team's shared squad, matches, statistics and Player Review under its current entitlement. Add and edit its current-season players, including on match day. Verify team membership and write entitlement on each update. Match creation, claim and finish use the existing membership, term and generation checks. Only the recording holder can publish live checkpoints. |
| Organisation primary administrator | List own administrative team metadata, allocate slots, invite/revoke coaches, update contacts, read subscription status and restricted audit, request/cancel transfer. Verified incoming account accepts transfer. Membership limits and an audit still apply to administrator self-assignment. No implicit sports-data read. |
| Administrator acting as roster editor (proposed) | Give the primary administrator an explicit team-scoped roster-edit capability. Check primary seat **and** capability, team, current season and writable entitlement on every call. A narrow projection returns only the names and team-local IDs needed for that list; edit/add/remove operates on current-season entries with an expected revision. No generic player-table SELECT/UPDATE, historical roster browsing, career search, match/history/statistics reads, or silent modification of past snapshots. Transfer must invalidate the outgoing editor's authority. Decide who grants this capability before implementing it. |
| TSC operator | Independently verify organisational authority and approve a pending registration, term issue/extension or recovery case. An authenticated operator control plane records actor, decision and case ID. Lost-admin recovery remains a documented, verified human process. |
| Trusted backend only | Call the restricted provisioning/licence and reminder functions, handle Auth-admin invitations/delivery and future signed payment events. Keep operator and service credentials server-side. A user request for team data uses the user's JWT; never substitute a service credential. |

**Managed Auth permission gate.** Migration 005's invoker helper `sideline_private.verified_email` runs inside a security-definer operation and performs `SELECT ... FOR SHARE` on `auth.users`. Inspect the effective owner of those operations (including the intended owner before migration), schema USAGE, EXECUTE on `auth.uid()`, SELECT on id/email/email_confirmed_at, REFERENCES on id, and an effective UPDATE privilege on at least one column for the row lock. A local database owner passing this test does not establish hosted permission. In the authorised read-only inspection use catalogue functions such as `has_column_privilege` and `has_any_column_privilege`; do not lock real user rows. Inspect inherited roles, BYPASSRLS, object ownership, default ACLs, PUBLIC grants and Data API exposed schemas under real authenticator roles. Ordinary clients must have no schema CREATE or direct data writes. A missing privilege is a stop condition. Report it; review an additive verification design preserving email-change race protection, without granting clients or migration roles broader Auth write rights.

**Hosted evidence gates.** Catalogue checks precede HTTP testing. Restrict projection of invitation secrets (issue response only), billing data and audit fields. Verify signed issuer, audience, expiry and subject through Supabase Auth and the gateway. Never use editable user metadata, email strings, coach-provided team IDs or feature flags as proof of membership. Test with real user sessions after approval. Neither a missing API route nor SQL tests with substituted claims prove RLS isolation.

## Shared workspace, fresh seasons and identity

| Concept | Source of truth and proposed change |
|---|---|
| Permanent player within a team | Keep `players(team_id,id,display_name)`. Keep the existing player ID when a coach explicitly selects the returning player. Stable IDs, including same-name players, survive spelling corrections. A coach login is unrelated to player identity. |
| Team membership and cross-grade progression | The existing team/player row is sufficient as a team-local identity. When progression is approved, add a private organisation-scoped link between two explicitly chosen team/player keys, with same-organisation composite references, pair uniqueness and an audit of who confirmed or corrected it. A link conveys no team membership or ability to query the other player's data. Require delegated authority over both ends or approvals from both teams. Normal roster editing alone cannot make a historical linkage. No automatic age progression, inferred dates or cross-organisation global player directory. |
| Season squad | Start each season with an empty squad by default. Coaches can import the official Sideline Excel template, deliberately copy the previous season's squad and edit it, or add players manually. Copying creates new season entries for the explicitly selected team-player IDs. Confirm returning players before reusing an ID. Keep unrelated players with the same name distinct. |
| Match appearance | Future appearance rows belong to team, match and match-local appearance ID. Optionally link a permanent team player with a composite FK. Freeze the name, jersey and role used that day. Opposition and blank-match participants can remain match-local. Preserve events and substitutions against the appearance ID; never rewrite past matches when a squad changes. |
| Statistics | Both coaches read the same team dataset and revision. Calculate results, history and Player Review from authorised matches and appearances. An explicit cross-grade link can combine evidence only from teams the viewer may read, with the applicable feature entitlement. A player with no approved link has separate histories. |

**Manual changes during the season.** An assigned coach can add a player at any time, correct a name, change a jersey number or sporting position, and mark a player inactive or remove them from the current squad. Keep jersey, position and active status on the season entry. Preserve the team-player ID on a name correction. Prior squad lists retain the names and sporting details recorded for that season. Match snapshots, event links and historical statistics survive edits, deactivation and removal.

**Match-day additions.** Adding an unlisted player to the coach's team creates or explicitly reuses a team-player ID and adds that player to the shared current-season squad. The match appearance references the same ID. An offline addition queues both changes together. On sync, verify membership and recording authority for the respective writes, then apply them atomically with stable IDs so retrying cannot create a duplicate or leave a match-only player. Every assigned coach sees the resulting squad revision. Revoking a coach removes their access and preserves the team's sporting records.

**Commercial bulk import.** Accept only the official Sideline Excel squad template. Generic spreadsheets, CSV, pasted tables, Foireann OCR, photos, scanned PDFs and other unrestricted inputs are outside this workflow, including redacted versions. Copying an existing season and manual entry are separate operations. The existing local PWA import routes are outside this change.

Validate workbook structure, expected headings and player field values before accepting any rows. A filename or a valid heading alone is insufficient. The template's player field is the display name. Allow legitimate names, including Irish diacritics, apostrophes and hyphens. Flag invalid values by row and field without retaining or logging the submitted value. Revalidate the allowed sporting fields on the server. Player DOB, email, phone, home address, guardian contacts, medical information, emergency contacts and Foireann membership identifiers must never be requested, collected or stored. Purchaser and coach account contacts are separate. Keep source files and raw import, backup and OCR payloads out of the commercial workspace.

## Provisional feature tiers

Terms currently specify dates, kind, team capacity and coach capacity. None can identify the feature package of a particular team. A pilot remains a duration/issuance choice independent of its feature package.

Smallest proposed extension: a table keyed by `(organisation_id, term_starts_on, team_id)` with a constrained tier code. Reference the term and the organisation/team pair with composite FKs (add a referenced unique organisation/team pair to teams). Keep one reviewed version of the tier-to-feature mapping server-side. Reserve changes to a trusted operation under the existing organisation lock; append an audit of tier transitions. A term's active-team limit still applies independently of tier. For migrated licensed teams, propose Standard as the explicit backfill; a missing assignment must never imply premium access. Carry forward the approved team package explicitly on renewal and apply changes atomically. If mid-term scheduled pricing is introduced later, extend this model only after the effective-date rules are approved.

| Team tier | Included capabilities |
|---|---|
| Standard | Live recording, match reports, team/match statistics, match history, Basic Player Review |
| Advanced | Standard plus Advanced Squad Review |
| Top Tier | Advanced plus Historical Player Analysis, season comparisons, multi-season trends and squad-wide improvement/decline analysis |

Evaluate team membership, current feature entitlement and data sufficiency independently. Apply the same checks to analytical endpoints and exports for every assigned coach. Top Tier season comparisons require two relevant seasons of evidence, with explicitly confirmed identity for player comparisons. Expiry or downgrade preserves historical sporting records under the retention policy. Recheck the current entitlement before serving premium features or cached results and invalidate access to features the team has lost. Existing exports may already be on a device. Under the existing expiry rules authorised historical reads remain available and an underway match may finish.

## Offline PWA boundary

Netlify continues to serve the existing application. The local test client is independent. Future Safari onboarding accepts an invitation online, then prompts for the same account in the installed Home Screen app if its separate session needs authentication. Reload authorised team choices there. Avoid tokens in installation URLs. Before personal API traffic is introduced, exclude authenticated API, callback and proxy responses from the service worker cache (the present worker caches successful same-origin GETs). Keep the shell offline-capable. Partition offline caches, credentials and pending work by account and team, while the authoritative database remains team-owned.

Only one active recording device per team can publish checkpoints. Check membership, team, match, device proof, generation, expected revision and entitlement together on writes; other authorised coaches see the last synchronised revision. Preserve inaccessible/conflicting offline work for controlled recovery. On reconnect revalidate membership before exposing or uploading data. On logout or account/team switch cancel previous reads and subscriptions; clear or lock the prior account's private caches, keep unsynced work isolated and prevent the next user from seeing it. Revocation applies to the next server request, even with an unexpired JWT; remotely erasing a disconnected copy requires a separate policy. Offline-start authority, stale-device fencing and cache lifetime require approval before sync implementation.

## Operational decisions and next stage

Confirm the development reference/region and inspection operator independently; agree the metadata-only scope and redacted results, credential handling, and separate approvals for writing or exposing a schema. Keep database credentials and elevated API keys out of fixtures, shell history and the PWA. Use an authorised private server connection/role for trusted SQL, or a separately reviewed operator-only interface. A service key does not make a hidden schema routable through PostgREST.

The next proposed stage is read-only hosted inspection of the catalogue, owner privileges, migration history, version and API configuration. Then review the rehearsal and API migration proposal separately. Before feature implementation, approve per-team tier assignment on renewal/expiry, editor grant authority, approvals and corrections for cross-team links, historical retention, and offline access lifetimes. None is needed to generate the five-file package locally.
