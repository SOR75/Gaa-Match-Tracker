// A future, explicitly authorised HTTP acceptance run against the proposed API.
// No SQL client, role substitution, clock override, administrative key or seed operation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { actors, apiClient, forbidden, sameRows, success, validateRun } from './client.mjs';

export async function run(args, env, transport = fetch) {
  if (args[0] !== '--run-synthetic') throw Error('Hosted tests disabled. See the Phase 2B.2A runbook.');
  const f = JSON.parse(await readFile(env.SIDELINE_TEST_FIXTURE, 'utf8'));
  const origin = validateRun(args, env, f);
  const publicKey = env.SIDELINE_TEST_PUBLIC_KEY;
  const clients = {};
  const ids = {};
  for (const actor of actors) {
    const jwt = env['SIDELINE_TEST_JWT_' + actor.toUpperCase()];
    if (!jwt || jwt.split('.').length !== 3) throw Error('Missing synthetic user session for ' + actor);
    clients[actor] = apiClient(origin, publicKey, jwt, transport);
    const user = success(await clients[actor].identity(), 'Auth identity');
    assert.ok(user.email_confirmed_at && user.id && !user.is_anonymous &&
      user.email?.toLowerCase() === f.emails[actor].toLowerCase(), 'Unexpected or unverified synthetic account.');
    ids[actor] = user.id;
  }
  assert.equal(new Set(Object.values(ids)).size, actors.length);
  const rpc = async (actor, name, params) => success(await clients[actor].rpc(name,params),name);
  const roster = (actor, team, season) => rpc(actor,'season_roster',{p_team:team,p_season:season});
  const history = actor => rpc(actor,'match_history',{p_team:f.team});
  const featureSet = async (actor, team) => {
    const features = await rpc(actor,'team_features',{p_team:team});
    assert.ok(Array.isArray(features),'Expected list of feature IDs.');
    return features.slice().sort();
  };
  const basic = ['basic_player_review','live_recording','match_history','match_reports','team_statistics'];
  const advanced = [...basic,'advanced_squad_review'];
  const top = [...advanced,'historical_player_analysis','season_comparisons','multi_season_trends','squad_change_analysis'];

  // Read-only fixture checks first. Names, team IDs, participant lists and initial seat
  // state are part of the run contract; never adopt a pre-existing customer team.
  const managed = await rpc('admin','admin_teams',{p_organisation:f.org});
  sameRows(managed,[f.team,f.minor]);
  assert.ok(managed.every(row=>row.name.startsWith('Sideline Synthetic ')), 'Dedicated synthetic teams required.');
  sameRows(await rpc('coach','my_teams'),[f.team]);
  const memberships = await rpc('multi','my_teams');
  sameRows(memberships,[f.team,f.minor,f.otherTeam,f.expiredTeam]);
  assert.ok(memberships.every(row=>row.name?.startsWith('Sideline Synthetic ')), 'Dedicated synthetic memberships required.');
  const orgFor = team => memberships.find(row=>row.id === team).organisation_id;
  assert.ok(orgFor(f.team) === f.org && orgFor(f.minor) === f.org && orgFor(f.otherTeam) && orgFor(f.otherTeam) !== f.org);
  for (const actor of ['admin','purchaser','nominee','incoming']) sameRows(await rpc(actor,'my_teams'),[]);
  const anon = apiClient(origin,publicKey,undefined,transport);
  forbidden(await anon.rpc('my_teams'));
  for (const schema of ['sideline','sideline_private']) {
    const hidden = await clients.coach.rpc('my_teams',{},schema);
    assert.ok(hidden.status === 406 && hidden.data?.code === 'PGRST106','Implementation schema must be unexposed.');
  }
  const privileged = await clients.purchaser.rpc('provision_registration',{p_registration:randomUUID()});
  assert.ok(privileged.status === 404 && privileged.data?.code === 'PGRST202','Provisioning route must be absent.');
  for (const actor of ['coach','multi']) {
    sameRows(await roster(actor,f.team,f.season),[f.player],'player_id');
    sameRows(await roster(actor,f.team,f.previousSeason),[f.player,f.priorPlayer],'player_id');
    sameRows(await history(actor),[f.match]);
  }
  sameRows(await roster('multi',f.otherTeam,f.otherSeason),[f.otherPlayer],'player_id');
  sameRows(await roster('coach',f.otherTeam,f.otherSeason),[],'player_id');
  sameRows(await roster('multi',f.team,f.otherSeason),[],'player_id');
  sameRows(await roster('admin',f.team,f.season),[],'player_id');
  sameRows(await history('admin'),[]);
  if (args[2] === 'workspace') {
    const editRows = await rpc('admin','editor_roster',{p_team:f.team,p_season:f.season});
    sameRows(editRows,[f.player],'player_id');
    assert.deepEqual(Object.keys(editRows[0]).sort(),['display_name','player_id']);
    forbidden(await clients.admin.rpc('editor_roster',{p_team:f.minor,p_season:f.minorSeason}));
    for (const actor of ['coach','multi'])
      assert.deepEqual(await featureSet(actor,f.team),basic.slice().sort());
    assert.deepEqual(await featureSet('multi',f.minor),advanced.slice().sort());
    assert.deepEqual(await featureSet('multi',f.otherTeam),top.slice().sort());
    forbidden(await clients.coach.rpc('team_features',{p_team:f.otherTeam}));
    for (const operation of ['team_statistics','basic_player_review']) {
      const first = await rpc('coach',operation,{p_team:f.team});
      assert.ok(Array.isArray(first) && first.length > 0,'Expected shared synthetic statistical evidence.');
      assert.deepEqual(await rpc('multi',operation,{p_team:f.team}),first);
      forbidden(await clients.admin.rpc(operation,{p_team:f.team}));
    }
    forbidden(await clients.multi.rpc('season_comparisons',{p_team:f.team}));
    forbidden(await clients.coach.rpc('season_comparisons',{p_team:f.otherTeam}));
    const comparisons = await rpc('multi','season_comparisons',{p_team:f.otherTeam});
    assert.ok(Array.isArray(comparisons) && comparisons.length > 0,'Expected two seasons of linked synthetic evidence.');
    console.log('Passed shared statistics, historical boundaries, roster editor and tier checks.');
    return;
  }
  const expired = await clients.multi.rpc('create_match',{p_team:f.expiredTeam,p_match:randomUUID()});
  assert.ok(expired.status >= 400 && expired.status < 500 && expired.data?.code === '23514','Expired team admitted a start or returned an unrelated error.');
  console.log('Passed synthetic team, history, expiry and permission checks.');

  const registration = await rpc('purchaser','register_organisation',{p_name:'Sideline Synthetic ' + randomUUID(),
    p_kind:'club',p_association:'lgfa',p_billing_name:'Synthetic purchaser',p_billing_phone:null,
    p_nominee_name:'Synthetic nominee',p_nominee_email:f.emails.nominee,p_nominee_phone:null,p_requested_teams:1});
  forbidden(await clients.purchaser.rpc('accept_admin_nomination',{p_registration:registration}));
  await rpc('nominee','accept_admin_nomination',{p_registration:registration});
  forbidden(await clients.nominee.rpc('accept_admin_nomination',{p_registration:registration}));
  const state = await rpc('purchaser','registration_status',{p_registration:registration});
  assert.ok(state.status === 'pending' && state.nominee_accepted === true,'Nomination must leave provisioning pending.');

  const acceptInvite = (actor,token) => clients[actor].rpc('accept_coach_invitation',{p_invitation:token});
  forbidden(await acceptInvite('incoming',f.expiredInvitation));
  const invitation = await rpc('admin','invite_coach',{p_team:f.team,p_email:f.emails.admin});
  // Proposed wrapper returns the underlying token on issuance only, plus server timestamps.
  assert.equal(Date.parse(invitation.expires_at) - Date.parse(invitation.issued_at),14*86400000);
  forbidden(await acceptInvite('incoming',invitation.token));
  success(await acceptInvite('admin',invitation.token),'Self-assignment');
  forbidden(await acceptInvite('admin',invitation.token));
  sameRows(await history('admin'),[f.match]);
  const audit = await rpc('admin','admin_audit_events',{p_organisation:f.org});
  assert.ok(audit.some(row=>row.action === 'admin_coach_assignment' && row.actor_id === ids.admin && row.team_id === f.team));

  await rpc('admin','revoke_coach',{p_team:f.team,p_user:ids.coach});
  sameRows(await history('coach'),[]);
  sameRows(await history('multi'),[f.match]);
  sameRows(await roster('coach',f.team,f.previousSeason),[],'player_id');
  const token = await rpc('admin','request_admin_transfer',{p_organisation:f.org,p_email:f.emails.incoming});
  const params = {p_token:token,p_full_name:'Synthetic successor',p_phone:null};
  forbidden(await clients.nominee.rpc('accept_admin_transfer',params));
  const attempts = await Promise.all([clients.incoming.rpc('accept_admin_transfer',params),
    clients.incoming.rpc('accept_admin_transfer',params)]);
  assert.equal(attempts.filter(result=>result.status === 200 && result.data === f.org).length,1);
  forbidden(attempts.find(result=>result.status !== 200) || {});
  forbidden(await clients.admin.rpc('request_admin_transfer',{p_organisation:f.org,p_email:f.emails.nominee}));
  sameRows(await rpc('incoming','admin_teams',{p_organisation:f.org}),[f.team,f.minor]);
  sameRows(await history('incoming'),[]);
  sameRows(await history('admin'),[f.match]); // Explicit coaching survives transfer.
  console.log('Passed synthetic registration, invitation, revocation and transfer checks.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  run(process.argv.slice(2),process.env).catch(error => {
    // Assertions and network failures may contain private inputs. Keep output to a location.
    const location = error.stack?.split('\n').find(line=>line.includes('at ') && line.includes('/hosted/'));
    console.error('Hosted suite stopped.', location?.trim() || 'Check the fixture and runbook.');
    process.exitCode = 1;
  });
