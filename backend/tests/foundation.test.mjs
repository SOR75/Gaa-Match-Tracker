import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';

const { SIDELINE_TEST_PG_SOCKET: host, SIDELINE_TEST_PG_DATABASE: database } = process.env;
if (!host || !isAbsolute(host) || !database) {
  throw Error('Set SIDELINE_TEST_PG_SOCKET and SIDELINE_TEST_PG_DATABASE for a disposable local PostgreSQL instance.');
}
const { Pool } = createRequire(import.meta.url)('pg');
const pool = new Pool({host, database, max: 6});
const people = Object.fromEntries(['offalyAdmin', 'otherAdmin', 'coach', 'second', 'third', 'outsider', 'unverified']
  .map(name => [name, {id: randomUUID(), email: name.toLowerCase() + '@example.invalid'}]));
const ids = {};

const rows = async (db, sql, values) => (await db.query(sql, values)).rows;
const value = async (db, sql, values) => Object.values((await rows(db, sql, values))[0])[0];

async function acting(client, role, user) {
  await client.query('begin');
  await client.query('set local role ' + role); // Only fixed role names from this test file.
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user?.id || '']);
  await client.query("set local statement_timeout = '10s'");
}

async function as(role, user, work) {
  const client = await pool.connect();
  try {
    await acting(client, role, user);
    const result = await work(client);
    await client.query('commit');
    return result;
  } finally {
    await client.query('rollback');
    client.release();
  }
}

const coach = (user, sql, values) => as('authenticated', people[user], db => value(db, sql, values));
const queryAs = (user, sql, values) => as('authenticated', people[user], db => rows(db, sql, values));
const service = (sql, values) => as('service_role', null, db => value(db, sql, values));
const denied = (work, code, message) => assert.rejects(work, {code, ...(message ? {message} : {})});
const activate = (admin, team, active = true) => coach(admin, 'select sideline.set_team_active($1,$2)', [team, active]);
const invite = (admin, team, user) => coach(admin, 'select sideline.invite_coach($1,$2)', [team, people[user].email]);
const accept = (user, invitation) => coach(user, 'select sideline.accept_coach_invitation($1)', [invitation]);
const term = (org, teams, coaches, starts = 0) => service(
  "select sideline.set_subscription_term($1, (current_timestamp at time zone 'UTC')::date + $2::integer, $3, $4)",
  [org, starts, teams, coaches],
);

before(async () => {
  const schemas = await rows(pool, "select nspname from pg_namespace where nspname not in ('public', 'information_schema') and nspname not like 'pg_%'");
  const tables = await rows(pool, "select tablename from pg_tables where schemaname = 'public'");
  const roles = await rows(pool, "select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')");
  assert.deepEqual([schemas, tables, roles], [[], [], []], 'Use a fresh isolated PostgreSQL cluster and database');
  await pool.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique not null, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
  `);
  await pool.query(await readFile(new URL('../migrations/001_commercial_foundation.sql', import.meta.url), 'utf8'));
  for (const [name, user] of Object.entries(people)) {
    await pool.query('insert into auth.users values ($1,$2,case when $3 then now() end)', [user.id, user.email, name !== 'unverified']);
  }
  ids.offaly = await service("select sideline.provision_organisation('Offaly LGFA','county','lgfa',$1)", [people.offalyAdmin.id]);
  ids.other = await service("select sideline.provision_organisation('Synthetic GAA Club','club','gaa',$1)", [people.otherAdmin.id]);
  await term(ids.offaly, 2, 2);
  await term(ids.other, 1, 1);

  for (const [key, admin, org, name] of [
    ['u16', 'offalyAdmin', ids.offaly, 'U16'],
    ['minor', 'offalyAdmin', ids.offaly, 'Minor'],
    ['reserve', 'offalyAdmin', ids.offaly, 'Synthetic reserve'],
    ['otherA', 'otherAdmin', ids.other, 'Synthetic A'],
    ['otherB', 'otherAdmin', ids.other, 'Synthetic B'],
  ]) ids[key] = await coach(admin, 'select sideline.create_team($1,$2)', [org, name]);

  await activate('offalyAdmin', ids.u16);
  await activate('offalyAdmin', ids.minor);
  for (const [key, team, label] of [
    ['u16Season', ids.u16, 'Synthetic season 1'],
    ['u16Next', ids.u16, 'Synthetic season 2'],
    ['minorSeason', ids.minor, 'Synthetic season 1'],
    ['otherSeason', ids.otherA, 'Synthetic season 1'],
  ]) ids[key] = await value(pool, 'insert into sideline.team_seasons (team_id,label) values ($1,$2) returning id', [team, label]);
  for (const [key, team] of [['u16Player', ids.u16], ['minorPlayer', ids.minor], ['otherPlayer', ids.otherA]]) {
    ids[key] = await value(pool, "insert into sideline.players (team_id,display_name) values ($1,'Synthetic Player') returning id", [team]);
  }
  for (const [key, season] of [['squad', ids.u16Season], ['nextSquad', ids.u16Next]]) {
    ids[key] = await value(pool, "insert into sideline.squads (team_id,season_id,name) values ($1,$2,'Synthetic Squad') returning id", [ids.u16, season]);
    await pool.query('insert into sideline.squad_players values ($1,$2,$3,11)', [ids.u16, ids[key], ids.u16Player]);
  }
  ids.u16Invite = await invite('offalyAdmin', ids.u16, 'coach');
});

after(() => pool.end());

test('anonymous access, API table writes, and privileged licence operations are denied', async () => {
  await denied(as('anon', null, db => db.query('select * from sideline.players')), '42501');
  await denied(as('anon', null, db => db.query('select sideline.accept_coach_invitation($1)', [ids.u16Invite])), '42501');
  await denied(queryAs('offalyAdmin', 'update sideline.teams set state = $1 where id = $2', ['active', ids.reserve]), '42501');
  await denied(coach('offalyAdmin', 'select sideline.set_subscription_term($1,current_date,10,5)', [ids.offaly]), '42501');
  await denied(as('service_role', null, db => db.query('select * from sideline.players')), '42501');
  await denied(as('authenticated', null, db => db.query('select sideline_private.lock_organisation($1)', [ids.offaly])), '42501');
  await denied(coach('offalyAdmin', 'select sideline.create_team($1,$2)', [ids.other, 'Forged team']), '42501');
  assert.deepEqual(await queryAs('offalyAdmin', 'select id from sideline.organisations order by id'), [{id:ids.offaly}]);
  assert.deepEqual(await queryAs('offalyAdmin', 'select id from sideline.players'), []);
  assert.deepEqual(await queryAs('offalyAdmin', 'select id from sideline.squads'), []);
});

test('invite acceptance requires the verified recipient and one login can join both teams', async () => {
  await denied(accept('outsider', ids.u16Invite), '42501', 'Invitation unavailable');
  const unverifiedInvite = await invite('offalyAdmin', ids.u16, 'unverified');
  await denied(accept('unverified', unverifiedInvite), '42501', 'Invitation unavailable');
  assert.equal(await accept('coach', ids.u16Invite), ids.u16);
  await denied(accept('coach', ids.u16Invite), '42501', 'Invitation unavailable');
  assert.deepEqual(await queryAs('coach', 'select id from sideline.teams'), [{id:ids.u16}]);
  assert.deepEqual(await queryAs('coach', 'select id from sideline.players where id = any($1::uuid[])',
    [[ids.minorPlayer, ids.otherPlayer]]), []);
  await denied(coach('coach', 'select sideline.create_match($1,$2)', [ids.minor, randomUUID()]), '42501');
  const minorInvite = await invite('offalyAdmin', ids.minor, 'coach');
  assert.equal(await accept('coach', minorInvite), ids.minor);
  assert.deepEqual((await queryAs('coach', 'select id from sideline.players')).map(r => r.id).sort(),
    [ids.u16Player, ids.minorPlayer].sort());
  assert.deepEqual(await queryAs('coach', 'select id from sideline.organisations'), [{id:ids.offaly}]);
  assert.equal((await queryAs('coach', 'select * from sideline.squad_players where player_id = $1', [ids.u16Player])).length, 2);
});

test('terms last twelve calendar months and enforce coach bounds, overlap, and downgrade constraints', async () => {
  assert.equal(await value(pool, "select ends_on = (starts_on + interval '12 months')::date from sideline.subscription_terms where organisation_id = $1", [ids.offaly]), true);
  await denied(term(ids.offaly, 2, 6), '23514');
  await denied(term(ids.offaly, 2, 2, 1), '23514', 'Subscription terms overlap');
  await denied(term(ids.offaly, 1, 2), '23514', 'Active teams exceed proposed allowance');
  await denied(activate('offalyAdmin', ids.reserve), '23514', 'Team allowance exhausted');
});

test('archiving frees a slot, preserves records, and reactivation checks capacity', async () => {
  ids.minorMatch = randomUUID();
  await coach('coach', 'select sideline.create_match($1,$2,$3)', [ids.minor, ids.minorMatch, ids.minorSeason]);
  await activate('offalyAdmin', ids.minor, false);
  await denied(coach('coach', 'select sideline.create_match($1,$2)', [ids.minor, randomUUID()]), '23514', 'Active team required');
  assert.deepEqual(await queryAs('coach', 'select id from sideline.matches where team_id = $1', [ids.minor]), [{id:ids.minorMatch}]);
  assert.deepEqual(await queryAs('coach', 'select id from sideline.players where team_id = $1', [ids.minor]), [{id:ids.minorPlayer}]);
  await activate('offalyAdmin', ids.reserve);
  await denied(activate('offalyAdmin', ids.minor), '23514', 'Team allowance exhausted');
  await activate('offalyAdmin', ids.reserve, false);
  await activate('offalyAdmin', ids.minor);
});

test('coach seats are per team and revoking an invitation prevents acceptance', async () => {
  const invitation = await invite('offalyAdmin', ids.u16, 'second');
  assert.equal(await accept('second', invitation), ids.u16);
  const thirdInvitation = await invite('offalyAdmin', ids.u16, 'third');
  await denied(accept('third', thirdInvitation), '23514', 'Coach allowance exhausted');
  await denied(term(ids.offaly, 2, 1), '23514', 'Assigned coaches exceed proposed allowance');
  await denied(coach('otherAdmin', 'select sideline.revoke_coach_invitation($1)', [thirdInvitation]), '42501');
  await coach('offalyAdmin', 'select sideline.revoke_coach_invitation($1)', [thirdInvitation]);
  await denied(accept('third', thirdInvitation), '42501', 'Invitation unavailable');
});

test('composite foreign keys reject cross-team season, player, and match references', async () => {
  await denied(pool.query("insert into sideline.squads (team_id,season_id,name) values ($1,$2,'Forged squad')",
    [ids.u16, ids.minorSeason]), '23503');
  await denied(pool.query('insert into sideline.squad_players values ($1,$2,$3,11)', [ids.u16, ids.squad, ids.minorPlayer]), '23503');
  await denied(pool.query('insert into sideline.squad_players values ($1,$2,$3,11)', [ids.otherA, ids.squad, ids.otherPlayer]), '23503');
  await denied(coach('coach', 'select sideline.create_match($1,$2,$3)', [ids.u16, randomUUID(), ids.minorSeason]), '23503');
  await denied(coach('coach', 'select sideline.claim_recording($1,$2,$3)', [ids.u16, ids.minorMatch, randomUUID()]), '23503');
});

async function race(firstUser, secondUser, sql, firstArgs, secondArgs, expectedError) {
  const first = await pool.connect();
  const second = await pool.connect();
  let pending;
  try {
    await acting(first, 'authenticated', people[firstUser]);
    await acting(second, 'authenticated', people[secondUser]);
    const secondPid = await value(second, 'select pg_backend_pid()');
    const winner = await value(first, sql, firstArgs);
    pending = value(second, sql, secondArgs).then(result => ({result}), error => ({error}));
    await waitForLock(secondPid);
    await first.query('commit');
    assert.equal((await pending).error?.code, '23514');
    assert.equal((await pending).error?.message, expectedError);
    return winner;
  } finally {
    await first.query('rollback');
    await pending;
    await second.query('rollback');
    first.release();
    second.release();
  }
}

async function waitForLock(pid) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await value(pool, "select coalesce((select wait_event_type = 'Lock' from pg_stat_activity where pid = $1), false)", [pid])) return;
    await delay(20);
  }
  assert.fail('second request must actually contend with the open transaction');
}

test('concurrent requests for the final team licence permit only one activation', async () => {
  await race('otherAdmin', 'otherAdmin', 'select sideline.set_team_active($1,true)', [ids.otherA], [ids.otherB], 'Team allowance exhausted');
  assert.deepEqual(await rows(pool, "select id from sideline.teams where organisation_id = $1 and state = 'active'", [ids.other]), [{id:ids.otherA}]);
});

test('concurrent claims for different matches on one team admit one recorder', async () => {
  ids.match = randomUUID();
  const rivalMatch = randomUUID();
  ids.device = randomUUID();
  const rivalDevice = randomUUID();
  for (const match of [ids.match, rivalMatch]) {
    await coach('coach', 'select sideline.create_match($1,$2,$3)', [ids.u16, match, ids.u16Season]);
  }
  const sql = 'select sideline.claim_recording($1,$2,$3)';
  const winner = await race('coach', 'second', sql, [ids.u16, ids.match, ids.device], [ids.u16, rivalMatch, rivalDevice], 'Team already has an active recorder');
  assert.equal(winner, '1');
  assert.equal(await coach('coach', sql, [ids.u16, ids.match, ids.device]), winner);
  assert.equal(await coach('coach', 'select sideline.recording_is_current($1,$2,$3,$4)', [ids.u16, ids.match, ids.device, 1]), true);
  assert.equal(await coach('second', 'select sideline.recording_is_current($1,$2,$3,$4)', [ids.u16, ids.match, ids.device, 1]), false);
  assert.deepEqual(await queryAs('second', 'select * from sideline.recording_ownership'), []);
  await denied(activate('offalyAdmin', ids.u16, false), '23514', 'Team has an active recording');
});

test('revoking a coach removes team data access and invalidates the old recording generation', async () => {
  await coach('offalyAdmin', 'select sideline.revoke_coach($1,$2)', [ids.u16, people.coach.id]);
  assert.deepEqual(await queryAs('coach', 'select id from sideline.players'), [{id:ids.minorPlayer}]);
  const current = 'select sideline.recording_is_current($1,$2,$3,$4)';
  assert.equal(await coach('coach', current, [ids.u16, ids.match, ids.device, 1]), false);
  const device = randomUUID();
  const claim = 'select sideline.claim_recording($1,$2,$3)';
  await denied(coach('second', claim, [ids.u16, ids.match, device]), '23514', 'Previously recorded match requires recovery');
  const nextMatch = randomUUID();
  await coach('second', 'select sideline.create_match($1,$2)', [ids.u16, nextMatch]);
  const generation = await coach('second', claim, [ids.u16, nextMatch, device]);
  assert.equal(generation, '2');
  assert.equal(await coach('second', current, [ids.u16, nextMatch, device, 1]), false);
  assert.equal(await coach('second', current, [ids.u16, nextMatch, device, generation]), true);
});

test('a scheduled renewal reserves the lower team and coach allowances', async () => {
  await activate('otherAdmin', ids.otherA, false);
  const renewal = "select sideline.set_subscription_term($1, (((current_timestamp at time zone 'UTC')::date) + interval '12 months')::date, $2, $3)";
  await service(renewal, [ids.other, 0, 1]);
  await denied(activate('otherAdmin', ids.otherA), '23514', 'Team allowance exhausted');

  await service(renewal, [ids.offaly, 2, 1]);
  const pending = await invite('offalyAdmin', ids.minor, 'third');
  await denied(accept('third', pending), '23514', 'Coach allowance exhausted');
});

test('grace permits activity and expiry follows the configured read policy', async () => {
  const org = await service("select sideline.provision_organisation('Synthetic Expiry Club','club','gaa',$1)", [people.otherAdmin.id]);
  const team = await coach('otherAdmin', 'select sideline.create_team($1,$2)', [org, 'Synthetic expiry team']);
  // Historical term is a controlled fixture. The entitlement RPC rejects backfilling ended terms.
  await pool.query(`
    insert into sideline.subscription_terms (organisation_id, starts_on, team_allowance, coach_allowance, grace_days)
    values ($1, ((sideline_private.utc_today() - 3) - interval '12 months')::date, 1, 1, 7)
  `, [org]);
  assert.equal(await value(pool, 'select ends_on < sideline_private.utc_today() from sideline.subscription_terms where organisation_id = $1', [org]), true);
  await activate('otherAdmin', team);
  await accept('outsider', await invite('otherAdmin', team, 'outsider'));
  const match = randomUUID();
  assert.equal(await coach('outsider', 'select sideline.create_match($1,$2)', [team, match]), match);

  await pool.query('update sideline.subscription_terms set grace_days = 0 where organisation_id = $1', [org]);
  await denied(coach('outsider', 'select sideline.create_match($1,$2)', [team, randomUUID()]), '23514', 'No current subscription entitlement');
  assert.deepEqual(await queryAs('outsider', 'select id from sideline.matches'), [{id:match}]);
  await pool.query("update sideline.subscription_terms set post_expiry_mode = 'suspend' where organisation_id = $1", [org]);
  assert.deepEqual(await queryAs('outsider', 'select id from sideline.matches'), []);
  assert.deepEqual(await queryAs('otherAdmin', 'select id from sideline.teams where id = $1', [team]), [{id:team}]);
});

// Freeze both clocks only in this disposable database. Production uses the
// statement clock for reads and the wall clock after locking for starts.
async function onDate(date) {
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  await pool.query(`
    create or replace function sideline_private.utc_today()
    returns date language sql stable set search_path = '' as $$ select date '${date}' $$;
    create or replace function sideline_private.utc_write_date()
    returns date language sql volatile set search_path = '' as $$ select date '${date}' $$;
  `);
}

test('Phase 2A.1 subscription lifecycle', async t => {
  await pool.query(await readFile(new URL('../migrations/002_subscription_lifecycle.sql', import.meta.url), 'utf8'));

  const termSql = 'select sideline.set_subscription_term($1,$2,$3,$4)';
  const schedule = org => service('select sideline.schedule_subscription_reminders($1)', [org]);
  const due = org => as('service_role', null, db => rows(db,
    'select recipient_id, days_before from sideline.due_subscription_reminders($1) order by recipient_id', [org]));
  const status = (user, org) => queryAs(user, 'select * from sideline.subscription_status($1)', [org]);
  const matchSql = 'select sideline.create_match($1,$2)';
  const claimSql = 'select sideline.claim_recording($1,$2,$3)';
  const currentSql = 'select sideline.recording_is_current($1,$2,$3,$4)';
  const finishSql = 'select sideline.finish_recording($1,$2,$3,$4)';

  await onDate('2030-01-01');
  const org = await service("select sideline.provision_organisation('Synthetic Renewal Club','club','lgfa',$1)", [people.otherAdmin.id]);
  await service(termSql, [org, '2030-01-01', 2, 2]);
  const team = await coach('otherAdmin', 'select sideline.create_team($1,$2)', [org, 'Synthetic first team']);
  const secondTeam = await coach('otherAdmin', 'select sideline.create_team($1,$2)', [org, 'Synthetic second team']);
  for (const id of [team, secondTeam]) {
    await activate('otherAdmin', id);
    await accept('otherAdmin', await invite('otherAdmin', id, 'otherAdmin'));
  }
  await accept('outsider', await invite('otherAdmin', secondTeam, 'outsider'));

  await t.test('approved expiry policy replaces provisional settings and blocks forbidden configuration', async () => {
    assert.equal(await value(pool, "select count(*)::int from sideline.subscription_terms where grace_days <> 0 or post_expiry_mode <> 'read_only'"), 0);
    const sql = 'select sideline.set_subscription_term($1,$2,2,2,$3,$4)';
    await denied(service(sql, [org, '2030-01-01', 1, 'read_only']), '23514');
    await denied(service(sql, [org, '2030-01-01', 0, 'suspend']), '23514');
    await denied(queryAs('otherAdmin', 'select * from sideline.subscription_reminders'), '42501');
    await denied(coach('otherAdmin', 'select sideline.schedule_subscription_reminders($1)', [org]), '42501');
    await denied(as('anon', null, db => db.query('select sideline.subscription_status($1)', [org])), '42501');
    assert.deepEqual(await status('offalyAdmin', org), []);
  });

  await t.test('concurrent scheduling deduplicates dual roles and team contacts across all five dates', async () => {
    assert.deepEqual((await Promise.all([schedule(org), schedule(org)])).sort((a,b) => a-b), [0, 10]);
    assert.equal(await schedule(org), 0);
    assert.deepEqual(await rows(pool,
      'select distinct days_before, due_on::text from sideline.subscription_reminders where organisation_id = $1 order by days_before desc', [org]), [
      {days_before:30, due_on:'2030-12-02'}, {days_before:14, due_on:'2030-12-18'},
      {days_before:7, due_on:'2030-12-25'}, {days_before:1, due_on:'2030-12-31'},
      {days_before:0, due_on:'2031-01-01'},
    ]);
    for (const [offset, date] of [[30, '2030-12-02'], [14, '2030-12-18'], [7, '2030-12-25'], [1, '2030-12-31']]) {
      await onDate(date);
      assert.deepEqual((await due(org)).map(row => row.days_before), [offset, offset]);
    }
    // An archived team's former alert recipient can still read team records,
    // but is no longer in the active-team reminder audience.
    await activate('otherAdmin', secondTeam, false);
    assert.deepEqual(await due(org), [{recipient_id:people.otherAdmin.id, days_before:1}]);
  });

  const oldMatch = randomUUID();
  const draftMatch = randomUUID();
  const device = randomUUID();
  const season = await value(pool, "insert into sideline.team_seasons (team_id,label) values ($1,'Synthetic retained season') returning id", [team]);
  const squad = await value(pool, "insert into sideline.squads (team_id,season_id,name) values ($1,$2,'Synthetic retained squad') returning id", [team, season]);
  await coach('otherAdmin', matchSql, [team, oldMatch]);
  await coach('otherAdmin', matchSql, [team, draftMatch]);
  const generation = await coach('otherAdmin', claimSql, [team, oldMatch, device]);

  await t.test('expiry stops new matches but the existing owner can finish and history stays readable', async () => {
    await onDate('2031-01-01');
    const [expired] = await status('otherAdmin', org);
    assert.equal(expired.expires_at.toISOString(), '2031-01-01T00:00:00.000Z');
    assert.equal(expired.can_start_matches, false);
    assert.equal(expired.final_warning_today, true);
    assert.deepEqual(await due(org), [{recipient_id:people.otherAdmin.id, days_before:0}]);
    await denied(coach('otherAdmin', matchSql, [team, randomUUID()]), '23514', 'No current subscription entitlement');
    const ownership = [team, oldMatch, device, generation];
    assert.equal(await coach('otherAdmin', currentSql, ownership), true);
    assert.equal(await coach('otherAdmin', claimSql, ownership.slice(0, 3)), generation);
    await denied(coach('otherAdmin', finishSql, [team, oldMatch, randomUUID(), generation]), '42501', 'Current recorder required');
    await denied(coach('otherAdmin', finishSql, [team, oldMatch, device, 0]), '42501', 'Current recorder required');
    await coach('otherAdmin', finishSql, ownership);
    assert.equal(await coach('otherAdmin', currentSql, ownership), false);
    await denied(coach('otherAdmin', claimSql, [team, draftMatch, randomUUID()]), '23514', 'No current subscription entitlement');
    assert.deepEqual(await queryAs('otherAdmin', 'select id from sideline.squads where id = $1', [squad]), [{id:squad}]);
    assert.equal(await coach('otherAdmin', 'select recording_finished_at is not null from sideline.matches where team_id=$1 and id=$2', [team, oldMatch]), true);
    assert.deepEqual(await queryAs('offalyAdmin', 'select id from sideline.matches where team_id=$1', [team]), []);
  });

  await t.test('late renewal restores new-match access while retaining IDs and completed history', async () => {
    await onDate('2031-01-03');
    assert.equal((await status('otherAdmin', org))[0].final_warning_today, false);
    assert.deepEqual(await due(org), []);
    await service(termSql, [org, '2031-01-03', 2, 2]);
    assert.equal((await status('otherAdmin', org))[0].can_start_matches, true);
    assert.equal(await coach('otherAdmin', claimSql, [team, draftMatch, randomUUID()]), '2');
    assert.deepEqual(await queryAs('otherAdmin', 'select id from sideline.squads where id = $1', [squad]), [{id:squad}]);
    assert.equal(await coach('otherAdmin', 'select recording_finished_at is not null from sideline.matches where team_id=$1 and id=$2', [team, oldMatch]), true);
  });

  await t.test('contiguous renewal suppresses previously scheduled reminders and the expiry-day warning', async () => {
    await onDate('2032-01-01');
    const renewed = await service("select sideline.provision_organisation('Synthetic Early Renewal','club','gaa',$1)", [people.otherAdmin.id]);
    await service(termSql, [renewed, '2032-01-01', 1, 1]);
    assert.equal(await schedule(renewed), 5);
    await onDate('2032-12-31');
    assert.deepEqual(await due(renewed), [{recipient_id:people.otherAdmin.id, days_before:1}]);
    await service(termSql, [renewed, '2033-01-01', 1, 1]);
    assert.deepEqual(await due(renewed), []);
    assert.equal(await schedule(renewed), 0);
    await onDate('2033-01-01');
    const [active] = await status('otherAdmin', renewed);
    assert.equal(active.can_start_matches, true);
    assert.equal(active.final_warning_today, false);
    assert.equal(active.expires_at.toISOString(), '2034-01-01T00:00:00.000Z');
    assert.deepEqual(await due(renewed), []);
    assert.equal(await schedule(renewed), 5);
  });
});

test('Phase 2A.2 pilot licensing and security', async t => {
  const existing = await rows(pool, 'select organisation_id, starts_on::text, ends_on::text from sideline.subscription_terms order by organisation_id, starts_on');
  await pool.query(await readFile(new URL('../migrations/003_pilot_licensing_and_security.sql', import.meta.url), 'utf8'));
  const standard = 'select sideline.set_subscription_term($1,$2,$3,$4)';
  const pilot = 'select sideline.issue_pilot_term($1,$2,$3,$4)';
  const extend = 'select sideline.extend_pilot_term($1,$2,$3,$4)';
  const start = '2037-04-30';
  const initialExpiry = '2037-10-30';
  const extendedExpiry = '2037-12-30';
  await onDate(start);
  const org = await service("select sideline.provision_organisation('Synthetic Offaly LGFA Pilot','county','lgfa',$1)", [people.offalyAdmin.id]);
  const status = user => queryAs(user, 'select * from sideline.subscription_status($1)', [org]);
  const schedule = () => service('select sideline.schedule_subscription_reminders($1)', [org]);
  const due = () => as('service_role', null, db => rows(db, 'select days_before from sideline.due_subscription_reminders($1)', [org]));

  await t.test('upgrades existing standard terms in place and protects all privileged operations', async () => {
    assert.deepEqual(await rows(pool, 'select organisation_id, starts_on::text, ends_on::text from sideline.subscription_terms order by organisation_id, starts_on'), existing);
    assert.equal(await value(pool, "select bool_and(term_kind = 'standard' and duration_months = 12) from sideline.subscription_terms"), true);
    await denied(coach('offalyAdmin', pilot, [org, start, 2, 5]), '42501');
    await denied(coach('coach', extend, [org, start, initialExpiry, 2]), '42501');
    await denied(coach('offalyAdmin', extend, [org, start, initialExpiry, 2]), '42501');
    await denied(queryAs('offalyAdmin', 'update sideline.subscription_terms set duration_months = 18 where organisation_id = $1', [org]), '42501');
    assert.deepEqual(await rows(pool, `
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('sideline','sideline_private') and p.prosecdef
      and (p.proconfig is null or not (p.proconfig @> array['search_path=""'])
           or has_function_privilege('anon',p.oid,'execute'))
    `), []);
  });

  const u16 = await coach('offalyAdmin', 'select sideline.create_team($1,$2)', [org, 'U16']);
  const minor = await coach('offalyAdmin', 'select sideline.create_team($1,$2)', [org, 'Minor']);
  const reserve = await coach('offalyAdmin', 'select sideline.create_team($1,$2)', [org, 'Synthetic reserve']);

  await t.test('six calendar months covers exactly two active teams and a custom duration is available', async () => {
    assert.equal(await service('select sideline.issue_pilot_term($1,$2,2,2)::text', [org, start]), initialExpiry);
    await denied(service(standard, [org, start, 2, 2]), '23514', 'Pilot term requires a pilot operation');
    await activate('offalyAdmin', u16);
    await activate('offalyAdmin', minor);
    await denied(activate('offalyAdmin', reserve), '23514', 'Team allowance exhausted');
    await accept('coach', await invite('offalyAdmin', u16, 'coach'));
    await accept('coach', await invite('offalyAdmin', minor, 'coach'));
    const custom = await service("select sideline.provision_organisation('Synthetic Custom Pilot','club','gaa',$1)", [people.otherAdmin.id]);
    await denied(service('select sideline.issue_pilot_term($1,$2,1,1,0)', [custom, start]), '23514');
    assert.equal(await service('select sideline.issue_pilot_term($1,$2,1,1,3)::text', [custom, start]), '2037-07-30');
  });

  await t.test('two concurrent invitees cannot consume the same final coach seat', async () => {
    const first = await invite('offalyAdmin', u16, 'second');
    const second = await invite('offalyAdmin', u16, 'third');
    await race('second', 'third', 'select sideline.accept_coach_invitation($1)', [first], [second], 'Coach allowance exhausted');
    assert.equal(await value(pool, 'select count(*)::int from sideline.team_coaches where team_id=$1 and revoked_at is null', [u16]), 2);
    assert.equal(await value(pool, 'select accepted_at is null from sideline.coach_invitations where id=$1', [second]), true);
  });

  await t.test('revocation bars invitations issued before revocation even after verified address changes', async () => {
    const stale = await invite('offalyAdmin', u16, 'second');
    await pool.query("update auth.users set email = 'changed@example.invalid' where id = $1", [people.second.id]);
    await coach('offalyAdmin', 'select sideline.revoke_coach($1,$2)', [u16, people.second.id]);
    await pool.query('update auth.users set email = $2 where id = $1', [people.second.id, people.second.email]);
    assert.equal(await value(pool, 'select revoked_at is null from sideline.coach_invitations where id=$1', [stale]), true);
    await denied(accept('second', stale), '42501', 'Invitation unavailable');
    assert.equal(await accept('second', await invite('offalyAdmin', u16, 'second')), u16);
  });

  const historicalMatch = randomUUID();
  await coach('coach', 'select sideline.create_match($1,$2)', [u16, historicalMatch]);

  await t.test('extension preserves matches, rejects stale requests and replaces obsolete reminders', async () => {
    assert.equal(await schedule(), 15);
    await onDate('2037-09-30');
    assert.deepEqual(await due(), [{days_before:30}, {days_before:30}, {days_before:30}]);
    await denied(service(extend, [org, start, initialExpiry, 0]), '23514', 'Pilot extension must add calendar months');
    assert.equal(await service('select sideline.extend_pilot_term($1,$2,$3,$4)::text', [org, start, initialExpiry, 2]), extendedExpiry);
    await denied(service(extend, [org, start, initialExpiry, 2]), '23514', 'Pilot expiry changed; refresh before extending');
    assert.deepEqual(await due(), []);
    assert.equal(await schedule(), 15);
    assert.equal(await schedule(), 0);
    await onDate('2037-11-30');
    assert.deepEqual(await due(), [{days_before:30}, {days_before:30}, {days_before:30}]);
    assert.deepEqual(await queryAs('coach', 'select id from sideline.matches where team_id=$1', [u16]), [{id:historicalMatch}]);
    assert.equal((await status('coach'))[0].expires_at.toISOString(), '2037-12-30T00:00:00.000Z');
    await onDate(extendedExpiry);
    await denied(service(extend, [org, start, extendedExpiry, 1]), '23514', 'Unexpired pilot term required');
    assert.equal((await status('coach'))[0].final_warning_today, true);
    assert.equal((await status('coach'))[0].can_start_matches, false);
    await denied(coach('coach', 'select sideline.create_match($1,$2)', [u16, randomUUID()]), '23514', 'No current subscription entitlement');
  });

  await t.test('a start waiting behind a committed renewal observes the renewed standard term', async () => {
    const renewal = await pool.connect();
    const recorder = await pool.connect();
    const match = randomUUID();
    let pending;
    try {
      await acting(renewal, 'service_role', null);
      await acting(recorder, 'authenticated', people.coach);
      const pid = await value(recorder, 'select pg_backend_pid()');
      await renewal.query(standard, [org, extendedExpiry, 2, 2]);
      pending = value(recorder, 'select sideline.create_match($1,$2)', [u16, match]).then(result => ({result}), error => ({error}));
      await waitForLock(pid);
      await renewal.query('commit');
      assert.deepEqual(await pending, {result:match});
      await recorder.query('commit');
    } finally {
      await renewal.query('rollback');
      await pending;
      await recorder.query('rollback');
      renewal.release();
      recorder.release();
    }
    assert.equal((await status('coach'))[0].expires_at.toISOString(), '2038-12-30T00:00:00.000Z');
    assert.equal((await status('coach'))[0].final_warning_today, false);
    assert.deepEqual(await queryAs('coach', 'select id from sideline.matches where team_id=$1 order by id', [u16]),
      [historicalMatch, match].sort().map(id => ({id})));
  });
});

test('Phase 2A.3 stored Irish expiry instants and final security verification', async t => {
  const provision = () => service("select sideline.provision_organisation('Synthetic boundary club','club','lgfa',$1)", [people.otherAdmin.id]);
  const standard = 'select sideline.set_subscription_term($1,$2,$3,$4)';
  const pilot = 'select sideline.issue_pilot_term($1,$2,1,5)';
  const extend = 'select sideline.extend_pilot_term($1,$2,$3,$4)';
  const create = 'select sideline.create_match($1,$2)';
  const claim = 'select sideline.claim_recording($1,$2,$3)';
  const status = (org, user = 'otherAdmin') => queryAs(user, 'select * from sideline.subscription_status($1)', [org]);
  const schedule = org => service('select sideline.schedule_subscription_reminders($1)', [org]);
  const due = org => as('service_role', null, db => rows(db,
    'select recipient_id, days_before from sideline.due_subscription_reminders($1) order by recipient_id', [org]));

  await onDate('2040-01-01');
  const legacy = await provision();
  const legacyPilot = await provision();
  for (const [org, sql, args] of [
    [legacy, standard, ['2040-07-01', 1, 5]], [legacyPilot, pilot, ['2041-01-01']],
  ]) await service(sql, [org, ...args]);
  await onDate('2040-07-01');
  assert.equal(await schedule(legacy), 5);
  const promised = await rows(pool, `
    select organisation_id, starts_on::text, ends_on::timestamp at time zone 'UTC' as expires_at
    from sideline.subscription_terms order by organisation_id, starts_on
  `);
  await pool.query(await readFile(new URL('../migrations/004_irish_subscription_boundaries.sql', import.meta.url), 'utf8'));
  assert.deepEqual(await rows(pool, `
    select organisation_id, starts_on::text, expires_at from sideline.subscription_terms order by organisation_id, starts_on
  `), promised);
  assert.equal(await value(pool, 'select sideline_private.read_time() = statement_timestamp()'), true);
  assert.equal(await value(pool, 'select sideline_private.write_time() between statement_timestamp() and clock_timestamp()'), true);

  // A committed clock row allows an independent connection to advance time
  // while a recorder is blocked on the organisation lock.
  await pool.query(`
    create table public.synthetic_clock (instant timestamptz not null);
    insert into public.synthetic_clock values ('2040-01-01T00:00:00Z');
    create or replace function sideline_private.read_time() returns timestamptz language sql stable
      set search_path = '' as $$ select instant from public.synthetic_clock $$;
    create or replace function sideline_private.write_time() returns timestamptz language sql volatile
      set search_path = '' as $$ select instant from public.synthetic_clock $$;
  `);
  const at = instant => pool.query('update public.synthetic_clock set instant = $1', [instant]);
  const beforeCutoff = cutoff => new Date(Date.parse(cutoff) - 1);

  await t.test('legacy reminders keep audit history and use the corrected due dates', async () => {
    await at('2041-05-30T23:00:00Z');
    assert.equal(await schedule(legacy), 5);
    assert.equal(await schedule(legacy), 0);
    assert.equal(await value(pool, 'select count(*)::int from sideline.subscription_reminders where organisation_id=$1',[legacy]), 10);
    assert.deepEqual(await due(legacy), [{recipient_id:people.otherAdmin.id, days_before:30}]);
    await at('2041-06-01T00:00:00Z');
    assert.deepEqual(await due(legacy), []);
    await at('2041-06-29T23:00:00Z');
    assert.deepEqual(await due(legacy), [{recipient_id:people.otherAdmin.id, days_before:0}]);
  });

  await t.test('inserting before a scheduled UTC term cannot silently create a one-hour gap', async () => {
    await at('2039-01-01T00:00:00Z');
    await denied(service(standard, [legacy,'2039-07-01',1,5]), '23514', 'Terms overlap or have incompatible adjacent cutoffs');
    assert.equal(await value(pool, 'select count(*)::int from sideline.subscription_terms where organisation_id=$1',[legacy]), 1);
  });

  await t.test('legacy summer promises survive edits, extensions and contiguous renewals', async () => {
    await at('2041-06-30T23:30:00Z'); // July 1 in Dublin, June 30 under the old UTC contract.
    await service(standard, [legacy, '2040-07-01', 1, 5]);
    const [old] = await status(legacy);
    assert.equal(old.expires_at.toISOString(), '2041-07-01T00:00:00.000Z');
    assert.equal(old.can_start_matches, true);
    await service(standard, [legacy, '2041-07-01', 1, 5]);
    assert.equal((await status(legacy))[0].expires_at.getTime(), old.expires_at.getTime());
    const extended = await service(extend, [legacyPilot, '2041-01-01', '2041-07-01', 2]);
    assert.ok(extended);
    assert.equal((await status(legacyPilot))[0].expires_at.toISOString(), '2041-08-31T23:00:00.000Z');
    await at('2041-07-01T00:00:00Z');
    const [renewed] = await status(legacy);
    assert.equal(renewed.can_start_matches, true);
    assert.equal(renewed.expires_at.toISOString(), '2042-06-30T23:00:00.000Z');
  });

  // Independently specified UTC instants, including each side of the 2029
  // transition Sundays. Each displayed final day is fully covered.
  for (const [label, start, cutoff, kind] of [
    ['winter', '2028-01-01', '2029-01-01T00:00:00Z', 'standard'],
    ['summer', '2029-01-01', '2029-06-30T23:00:00Z', 'pilot'],
    ['March clock change eve', '2028-03-25', '2029-03-25T00:00:00Z', 'standard'],
    ['March 23-hour final day', '2028-09-26', '2029-03-25T23:00:00Z', 'pilot'],
    ['October clock change eve', '2028-10-28', '2029-10-27T23:00:00Z', 'standard'],
    ['October 25-hour final day', '2029-04-29', '2029-10-29T00:00:00Z', 'pilot'],
  ]) await t.test(label + ' closes exactly at the next Dublin midnight', async () => {
    await at('2027-01-01T00:00:00Z');
    const org = await provision();
    if (kind === 'pilot') await service(pilot, [org, start]);
    else await service(standard, [org, start, 1, 5]);
    assert.deepEqual(await status(org), []);
    await at(beforeCutoff(cutoff));
    const [active] = await status(org);
    assert.equal(active.expires_at.toISOString(), new Date(cutoff).toISOString());
    assert.equal(active.can_start_matches, true);
    assert.equal(active.final_warning_today, true);
    await at(cutoff);
    const [expired] = await status(org);
    assert.equal(expired.can_start_matches, false);
    assert.equal(expired.final_warning_today, false);
  });

  await t.test('final grants and policies limit authenticated, anonymous and service roles', async () => {
    const serviceFunctions = ['due_subscription_reminders','extend_pilot_term','issue_pilot_term','provision_organisation',
      'schedule_subscription_reminders','set_subscription_term'];
    const teamFunctions = ['accept_coach_invitation','claim_recording','create_match','create_team','finish_recording',
      'invite_coach','recording_is_current','revoke_coach','revoke_coach_invitation','set_team_active','subscription_status'];
    for (const [role, allowed] of [['anon', []], ['service_role', serviceFunctions], ['authenticated', teamFunctions]]) {
      assert.deepEqual((await rows(pool, `
        select proname from pg_proc where pronamespace = 'sideline'::regnamespace
        and has_function_privilege($1, oid, 'execute') order by proname
      `, [role])).map(r => r.proname), allowed);
      assert.equal(await value(pool, `select has_schema_privilege($1,'sideline_private','usage')`, [role]), false);
      assert.deepEqual(await rows(pool, `
        select relname from pg_class where relnamespace = 'sideline'::regnamespace and relkind = 'r'
        and (not relrowsecurity or has_any_column_privilege($1,oid,'insert,update')
             or has_table_privilege($1,oid,'delete,truncate'))
      `, [role]), []);
    }
    assert.deepEqual(await rows(pool, `select proname from pg_proc where prosecdef
      and pronamespace in ('sideline'::regnamespace, 'sideline_private'::regnamespace)
      and (not coalesce(proconfig @> array['search_path=""'],false) or has_function_privilege('anon',oid,'execute'))`), []);
    assert.deepEqual(await queryAs('otherAdmin', 'select * from sideline.players where team_id=$1', [ids.u16]), []);
    await denied(coach('otherAdmin', extend, [legacyPilot, '2041-01-01', '2041-09-01', 1]), '42501');
  });

  await at('2028-06-30T23:00:00Z');
  const org = await provision();
  await denied(service(standard, [org, '2028-06-30', 1, 5]), '23514', 'New terms cannot be backdated');
  await denied(service(standard, [org, '2028-07-01', 1, 6]), '23514');
  await service(standard, [org, '2028-07-01', 1, 5]);
  const team = await coach('otherAdmin', 'select sideline.create_team($1,$2)', [org, 'Synthetic boundary team']);
  const reserve = await coach('otherAdmin', 'select sideline.create_team($1,$2)', [org, 'Synthetic reserve']);
  await activate('otherAdmin', team);
  await denied(activate('otherAdmin', reserve), '23514', 'Team allowance exhausted');
  const coaches = ['coach','second','third','outsider','offalyAdmin'];
  for (const user of coaches) await accept(user, await invite('otherAdmin', team, user));
  await denied(accept('otherAdmin', await invite('otherAdmin', team, 'otherAdmin')), '23514', 'Coach allowance exhausted');

  await t.test('every assigned coach and the administrator qualify on five Irish dates', async () => {
    assert.deepEqual((await Promise.all([schedule(org), schedule(org)])).sort((a,b) => a-b), [0, 30]);
    const recipients = ['otherAdmin', ...coaches].map(user => people[user].id).sort();
    for (const [days, instant] of [[30,'2029-05-30T23:00:00Z'], [14,'2029-06-15T23:00:00Z'],
      [7,'2029-06-22T23:00:00Z'], [1,'2029-06-28T23:00:00Z'], [0,'2029-06-29T23:00:00Z']]) {
      await at(instant);
      assert.deepEqual(await due(org), recipients.map(recipient_id => ({recipient_id, days_before:days})));
    }
    const stale = await invite('otherAdmin', team, 'second');
    await coach('otherAdmin','select sideline.revoke_coach($1,$2)', [team, people.second.id]);
    await denied(accept('second', stale), '42501', 'Invitation unavailable');
    assert.equal((await due(org)).length, 5);
  });

  await t.test('simultaneous overlapping renewals leave exactly one successor', async () => {
    const tenant = await provision();
    await service(standard, [tenant,'2029-07-01',1,5]);
    const first = await pool.connect();
    const second = await pool.connect();
    let pending;
    try {
      await acting(first, 'service_role', null);
      await acting(second, 'service_role', null);
      const pid = await value(second, 'select pg_backend_pid()');
      await first.query(standard, [tenant,'2030-07-01',1,5]);
      pending = denied(second.query(standard, [tenant,'2030-07-02',1,5]), '23514', 'Terms overlap or have incompatible adjacent cutoffs');
      await waitForLock(pid);
      await first.query('commit');
      await pending;
    } finally {
      await first.query('rollback');
      await pending;
      await second.query('rollback');
      first.release();
      second.release();
    }
    assert.equal(await value(pool, 'select count(*)::int from sideline.subscription_terms where organisation_id=$1',[tenant]), 2);
  });

  await t.test('queued match start checks time after locking and the entitled recorder finishes after expiry', async () => {
    const match = randomUUID();
    const draft = randomUUID();
    const device = randomUUID();
    const cutoff = '2029-06-30T23:00:00Z';
    await at(beforeCutoff(cutoff));
    for (const id of [match, draft]) await coach('coach', create, [team, id]);
    const generation = await coach('coach', claim, [team, match, device]);
    const holder = await pool.connect();
    const waiting = await pool.connect();
    let pending;
    try {
      await holder.query('begin');
      await holder.query('select sideline_private.lock_organisation($1)', [org]);
      await acting(waiting, 'authenticated', people.coach);
      const pid = await value(waiting,'select pg_backend_pid()');
      pending = denied(waiting.query(create, [team, randomUUID()]), '23514', 'No current subscription entitlement');
      await waitForLock(pid);
      await at(cutoff);
      await holder.query('commit');
      await pending;
    } finally {
      await holder.query('rollback');
      await pending;
      await waiting.query('rollback');
      holder.release();
      waiting.release();
    }
    const tuple = [team, match, device, generation];
    assert.equal(await coach('coach', claim, tuple.slice(0,3)), generation);
    await denied(coach('third', 'select sideline.finish_recording($1,$2,$3,$4)', tuple), '42501');
    await coach('coach', 'select sideline.finish_recording($1,$2,$3,$4)', tuple);
    await denied(coach('coach', claim, [team,draft,device]), '23514', 'No current subscription entitlement');
    assert.deepEqual(await queryAs('second', 'select id from sideline.matches where team_id=$1', [team]), []);
    await denied(queryAs('coach', 'delete from sideline.matches where id=$1', [match]), '42501');
    assert.equal(await coach('coach', 'select recording_finished_at - recording_started_at = interval \'1 millisecond\' from sideline.matches where team_id=$1 and id=$2', [team, match]), true);
    await Promise.all([service(standard, [org,'2029-07-01',1,5]), service(standard, [org,'2029-07-01',1,5])]);
    assert.equal(await value(pool, 'select count(*)::int from sideline.subscription_terms where organisation_id=$1', [org]), 2);
    assert.equal(await coach('coach', claim, [team,draft,device]), '2');
    assert.equal(await coach('coach', 'select recording_finished_at is not null from sideline.matches where team_id=$1 and id=$2', [team,match]), true);
  });
});

test('Phase 2B.1 commercial accounts and administration', async t => {
  await pool.query(await readFile(new URL('../migrations/005_accounts_and_administration.sql', import.meta.url), 'utf8'));
  const register = 'select sideline.register_organisation($1,$2,$3,$4,$5,$6,$7,$8,$9)';
  const form = ['Synthetic county','county','lgfa','Synthetic purchaser',null,'Synthetic administrator',
    people.third.email.toUpperCase(),null,2];
  const nominate = 'select sideline.accept_admin_nomination($1)';
  const provision = 'select sideline.provision_registration($1)';
  const request = 'select sideline.request_admin_transfer($1,$2)';
  const transfer = 'select sideline.accept_admin_transfer($1,$2,$3)';
  const updateContact = 'select sideline.update_organisation_contact($1,$2,$3,$4)';
  const getContact = user => queryAs(user, 'select email from sideline.organisation_contacts where organisation_id=$1', [org]);
  const seat = user => queryAs(user, 'select user_id, full_name from sideline.organisation_admins where organisation_id=$1', [org]);
  const visible = (user, team) => queryAs(user, 'select id from sideline.players where team_id=$1', [team]);
  let org, registration, team, player;

  await t.test('pending registration separates the purchaser, verified nominee and trusted provisioning', async () => {
    await denied(coach('unverified', register, form), '42501');
    await denied(as('anon', null, db => db.query(register, form)), '42501');
    registration = await coach('outsider', register, form);
    const details = 'select status,billing_email,nominee_email,requested_teams from sideline.organisation_registrations where id=$1';
    assert.deepEqual(await queryAs('outsider', details, [registration]), [{
      status:'pending',billing_email:people.outsider.email,nominee_email:people.third.email,requested_teams:2,
    }]);
    const billingOnly = await coach('outsider',
      'select sideline.register_organisation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [...form,people.coach.email]);
    assert.equal((await queryAs('outsider', details, [billingOnly]))[0].billing_email, people.coach.email);
    assert.deepEqual(await queryAs('coach', details, [billingOnly]), []);
    assert.deepEqual(await queryAs('coach', details, [registration]), []);
    await denied(service(provision,[registration]), '23514');
    await denied(coach('outsider',nominate,[registration]), '42501');
    await coach('third',nominate,[registration]);
    await denied(coach('third',nominate,[registration]), '42501');
    await denied(coach('third',provision,[registration]), '42501');
    await pool.query('update auth.users set email_confirmed_at=null where id=$1',[people.third.id]);
    await denied(service(provision,[registration]), '23514');
    await pool.query('update auth.users set email_confirmed_at=now() where id=$1',[people.third.id]);
    const [one,two] = await Promise.all([service(provision,[registration]),service(provision,[registration])]);
    assert.equal(one,two);
    org = one;
    assert.deepEqual(await seat('third'), [{user_id:people.third.id,full_name:'Synthetic administrator'}]);
    assert.deepEqual(await seat('outsider'), []);
    assert.deepEqual(await queryAs('outsider','select id from sideline.organisations where id=$1',[org]), []);
    assert.deepEqual(await queryAs('third','select * from sideline.subscription_terms where organisation_id=$1',[org]), []);
    assert.equal((await queryAs('outsider', details, [registration]))[0].status, 'provisioned');
  });

  await t.test('database requires exactly one administrator and protects contact and licence changes', async () => {
    await denied(pool.query('insert into sideline.organisation_admins (organisation_id,user_id) values ($1,$2)',[org,people.coach.id]), '23505');
    await denied(pool.query('delete from sideline.organisation_admins where organisation_id=$1',[org]), '23503');
    await denied(coach('third',updateContact,[ids.other,'Forged','synthetic@example.invalid',null]), '42501');
    await coach('third',updateContact,[org,'Synthetic contact','synthetic@example.invalid',null]);
    assert.deepEqual(await getContact('outsider'), []);
    assert.deepEqual(await getContact('third'), [{email:'synthetic@example.invalid'}]);
    team = await coach('third','select sideline.create_team($1,$2)',[org,'Synthetic U16']);
    await denied(activate('third',team),'23514');
    await denied(coach('third','select sideline.set_subscription_term($1,$2,2,2)',[org,'2029-07-01']), '42501');
    await service('select sideline.set_subscription_term($1,$2,1,2)',[org,'2029-07-01']);
    await activate('third',team);
    const reserve = await coach('third','select sideline.create_team($1,$2)',[org,'Synthetic Minor']);
    await denied(activate('third',reserve),'23514','Team allowance exhausted');
    player = await value(pool,"insert into sideline.players (team_id,display_name) values ($1,'Synthetic athlete') returning id",[team]);
    assert.deepEqual(await visible('third',team), []);
    assert.deepEqual(await visible('outsider',team), []);
  });

  await t.test('self-assignment uses a coach seat and records the membership change exactly once', async () => {
    const token = await invite('third',team,'third');
    await denied(accept('outsider',token), '42501');
    assert.equal(await accept('third',token),team);
    await denied(accept('third',token), '42501');
    assert.deepEqual(await visible('third',team), [{id:player}]);
    const audit = "select actor_id,team_id from sideline.admin_audit where organisation_id=$1 and action='admin_coach_assignment'";
    assert.deepEqual(await queryAs('third',audit,[org]), [{actor_id:people.third.id,team_id:team}]);
    assert.deepEqual(await queryAs('outsider',audit,[org]), []);
    await denied(queryAs('third','delete from sideline.admin_audit where organisation_id=$1',[org]), '42501');
  });

  await t.test('expiring single-use coach tokens preserve separate multi-organisation memberships', async () => {
    const expired = await invite('third',team,'coach');
    assert.equal(await value(pool,
      "select expires_at - issued_at = interval '14 days' from sideline.coach_invitations where id=$1", [expired]), true);
    await pool.query("update sideline.coach_invitations set expires_at=clock_timestamp() - interval '1 second' where id=$1",[expired]);
    await denied(accept('coach',expired), '42501');
    const token = await invite('third',team,'coach');
    // Simulate eight elapsed days. Acceptance should still use the stored deadline.
    await pool.query(`update sideline.coach_invitations set issued_at = issued_at - interval '192 hours',
      expires_at = expires_at - interval '192 hours' where id=$1`, [token]);
    const accepts = await Promise.allSettled([accept('coach',token),accept('coach',token)]);
    assert.equal(accepts.filter(r=>r.status==='fulfilled' && r.value===team).length,1);
    assert.equal(accepts.find(r=>r.status==='rejected').reason.code,'42501');
    assert.deepEqual(await visible('coach',team), [{id:player}]);
    assert.deepEqual(await visible('coach',ids.minor), [{id:ids.minorPlayer}]);
    assert.deepEqual(await visible('coach',ids.otherA), []);
    const extra = await invite('third',team,'second');
    await denied(accept('second',extra),'23514','Coach allowance exhausted');
    await denied(coach('third','select sideline.revoke_coach($1,$2)',[ids.minor,people.coach.id]), '42501');
    const stale = await invite('third',team,'coach');
    await coach('third','select sideline.revoke_coach($1,$2)',[team,people.coach.id]);
    await denied(accept('coach',stale),'42501');
    assert.deepEqual(await visible('coach',team), []);
    assert.deepEqual(await visible('coach',ids.minor), [{id:ids.minorPlayer}]);
  });

  await t.test('transfer requires a live token and the intended verified account', async () => {
    await denied(coach('outsider',request,[org,people.outsider.email]), '42501');
    const earliestExpiry = await value(pool, "select clock_timestamp() + interval '7 days'");
    const unverified = await coach('third',request,[org,people.unverified.email]);
    assert.equal(await value(pool, `select expires_at between $2 and clock_timestamp() + interval '7 days'
      from sideline.admin_transfers where organisation_id=$1 and revoked_at is null`, [org,earliestExpiry]), true);
    await denied(coach('unverified',transfer,[unverified,'Synthetic incoming',null]), '42501');
    const expired = await coach('third',request,[org,people.second.email]);
    await pool.query("update sideline.admin_transfers set expires_at=clock_timestamp() where organisation_id=$1 and revoked_at is null",[org]);
    await denied(coach('second',transfer,[expired,'Synthetic incoming',null]), '42501');
    const replaced = await coach('third',request,[org,people.second.email]);
    const cancelled = await coach('third',request,[org,people.second.email]);
    await denied(coach('second',transfer,[replaced,'Synthetic incoming',null]), '42501');
    await coach('third','select sideline.cancel_admin_transfer($1)',[org]);
    await denied(coach('second',transfer,[cancelled,'Synthetic incoming',null]), '42501');
    assert.deepEqual(await seat('third'), [{user_id:people.third.id,full_name:'Synthetic administrator'}]);
  });

  await t.test('transfer fences concurrent accepts and outgoing administrator writes', async () => {
    const token = await coach('third',request,[org,people.second.email]);
    const args = [token,'Synthetic successor',null];
    const oldInvite = await invite('third',team,'coach');
    await denied(coach('outsider',transfer,args),'42501');
    const winner = await pool.connect();
    const outgoing = await pool.connect();
    const replay = await pool.connect();
    let stale, duplicate;
    try {
      await acting(winner,'authenticated',people.second);
      await acting(outgoing,'authenticated',people.third);
      await acting(replay,'authenticated',people.second);
      assert.equal(await value(winner,transfer,args),org);
      const pid1 = await value(outgoing,'select pg_backend_pid()');
      const pid2 = await value(replay,'select pg_backend_pid()');
      stale = denied(outgoing.query('select sideline.invite_coach($1,$2)',[team,people.coach.email]),'42501');
      duplicate = denied(replay.query(transfer,args),'42501');
      await Promise.all([waitForLock(pid1),waitForLock(pid2)]);
      await winner.query('commit');
      // An aborted request releases its transaction locks when it fails.
      await Promise.all([stale,duplicate]);
    } finally {
      await winner.query('rollback');
      await Promise.allSettled([stale,duplicate]);
      await outgoing.query('rollback');
      await replay.query('rollback');
      winner.release(); outgoing.release(); replay.release();
    }
    assert.deepEqual(await seat('second'), [{user_id:people.second.id,full_name:'Synthetic successor'}]);
    assert.deepEqual(await seat('third'), []);
    assert.deepEqual(await getContact('third'), []);
    assert.deepEqual(await visible('second',team), []);
    assert.deepEqual(await visible('third',team), [{id:player}]);
    await denied(accept('coach',oldInvite),'42501');
    assert.deepEqual(await queryAs('second',
      "select previous_admin_id,admin_id from sideline.admin_audit where organisation_id=$1 and action='transfer_accepted'",[org]),
      [{previous_admin_id:people.third.id,admin_id:people.second.id}]);
    await coach('second','select sideline.revoke_coach($1,$2)',[team,people.third.id]);
    assert.deepEqual(await visible('third',team), []);
  });

  await t.test('new accounts retain Irish expiry and restricted function and table privileges', async () => {
    await accept('coach',await invite('second',team,'coach'));
    await pool.query("update public.synthetic_clock set instant='2030-06-30T22:59:59.999Z'");
    await coach('coach','select sideline.create_match($1,$2)',[team,randomUUID()]);
    await pool.query("update public.synthetic_clock set instant='2030-06-30T23:00:00Z'");
    await denied(coach('coach','select sideline.create_match($1,$2)',[team,randomUUID()]), '23514');
    assert.deepEqual(await visible('coach',team), [{id:player}]);
    assert.deepEqual(await visible('second',team), []);
    assert.deepEqual(await rows(pool,`select proname from pg_proc where pronamespace in
      ('sideline'::regnamespace,'sideline_private'::regnamespace) and prosecdef and
      (has_function_privilege('anon',oid,'execute') or not coalesce(proconfig @> array['search_path=""'],false))`), []);
    for (const role of ['anon','authenticated','service_role']) {
      assert.deepEqual(await rows(pool,`select relname from pg_class where relnamespace='sideline'::regnamespace and relkind='r'
        and (not relrowsecurity or has_any_column_privilege($1,oid,'insert,update') or has_table_privilege($1,oid,'delete,truncate'))`,[role]), []);
    }
    await denied(queryAs('second','select * from sideline.admin_transfers'),'42501');
    await denied(as('service_role',null,db=>db.query('select * from sideline.players')),'42501');
  });
});
