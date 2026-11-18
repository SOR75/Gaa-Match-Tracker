import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ledger, preparePackage, verifyPackage } from '../preparation/package-migrations.mjs';
import { actors, apiClient, fixtureIds, forbidden, sameRows, validateRun } from './hosted/client.mjs';
import { run } from './hosted/run.mjs';

test('two independent CLI bundles preserve the approved mapping and exact source bytes', async t => {
  const parent = await mkdtemp(join(tmpdir(),'sideline-bundle-test-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const [a,b] = await Promise.all([preparePackage(parent),preparePackage(parent)]);
  assert.notEqual(a,b);
  assert.equal(ledger.length,5);
  assert.deepEqual(ledger.map(r=>r.version),ledger.map(r=>r.version).sort());
  for (const {source,target} of ledger) {
    const original = await readFile(new URL('../migrations/' + source,import.meta.url));
    for (const directory of [a,b]) assert.deepEqual(await readFile(join(directory,'supabase/migrations',target)),original);
  }
  await writeFile(join(a,'supabase/migrations',ledger[0].target),'altered');
  await assert.rejects(verifyPackage(a),/SHA-256/);
  await writeFile(join(b,'supabase/migrations','duplicate.sql'),'unexpected');
  await assert.rejects(verifyPackage(b),/inventory/);
});

test('hosted execution requires matching target, synthetic fixture and public key', () => {
  const ref = 'a'.repeat(20);
  const args = ['--run-synthetic',ref,'foundation'];
  const f = {...Object.fromEntries(fixtureIds.map(name=>[name,randomUUID()])),projectRef:ref,
    emails:Object.fromEntries(actors.map(a=>[a,'sideline-synth-'+a+'@example.invalid']))};
  const env = {SIDELINE_APPROVED_DEV_REF:ref,SIDELINE_TEST_PUBLIC_KEY:'sb_publishable_dummy'};
  assert.equal(validateRun(args,env,f),'https://'+ref+'.supabase.co');
  assert.throws(()=>validateRun([],env,f));
  assert.throws(()=>validateRun(args,{...env,SIDELINE_APPROVED_DEV_REF:'b'.repeat(20)},f));
  assert.throws(()=>validateRun(args,{...env,SIDELINE_TEST_PUBLIC_KEY:'sb_secret_dummy'},f));
  assert.throws(()=>validateRun(args,env,{...f,emails:{...f.emails,coach:'customer@example.invalid'}}));
});

test('hosted runner refuses implicit execution before reading credentials or using transport', async () => {
  await assert.rejects(run([],{},()=>assert.fail('Unexpected network call')), /disabled/);
});

test('HTTP client preserves the caller and schema and rejects unrelated failures as evidence of isolation',async () => {
  const calls = [];
  const client = apiClient('https://example.invalid','publishable','synthetic-token',async (url,options)=>{
    calls.push({url,...options});
    return new Response(JSON.stringify({code:'42501'}),{status:403});
  });
  forbidden(await client.rpc('season_roster',{p_team:'synthetic'}));
  assert.equal(calls[0].url,'https://example.invalid/rest/v1/rpc/season_roster');
  assert.equal(calls[0].headers.Authorization,'Bearer synthetic-token');
  assert.equal(calls[0].headers['Content-Profile'],'sideline_api');
  assert.equal(calls[0].redirect,'error');
  assert.throws(()=>forbidden({status:404,data:{code:'PGRST202'}}));
  assert.throws(()=>sameRows([],['required-positive-control']));
});

test('workspace contract runs through Auth and PostgREST using only an in-memory transport', async t => {
  const dir = await mkdtemp(join(tmpdir(),'sideline-hosted-contract-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const projectRef = 's'.repeat(20);
  const f = {projectRef,...Object.fromEntries(fixtureIds.map(k=>[k,randomUUID()])),
    emails:Object.fromEntries(actors.map(a=>[a,'sideline-synth-'+a+'@example.invalid']))};
  const fixturePath = join(dir,'fixture.json');
  await writeFile(fixturePath,JSON.stringify(f));
  const env = {SIDELINE_TEST_FIXTURE:fixturePath,SIDELINE_APPROVED_DEV_REF:projectRef,SIDELINE_TEST_PUBLIC_KEY:'sb_publishable_dummy'};
  for (const actor of actors) env['SIDELINE_TEST_JWT_'+actor.toUpperCase()] = 'dummy.'+actor+'.dummy';
  const otherOrg = randomUUID();
  const teamRows = ids => ids.map(id=>({id,name:'Sideline Synthetic '+id,organisation_id:id===f.team || id===f.minor ? f.org : otherOrg}));
  const players = ids => ids.map(player_id=>({player_id,display_name:'Synthetic player'}));
  const json = (data,status=200) => new Response(JSON.stringify(data),{status});
  const deny = () => json({code:'42501'},403);
  const basic = ['live_recording','match_reports','team_statistics','match_history','basic_player_review'];
  const advanced = [...basic,'advanced_squad_review'];
  const top = [...advanced,'historical_player_analysis','season_comparisons','multi_season_trends','squad_change_analysis'];
  let leakHistory = false;
  const transport = async (url,request) => {
    const actor = request.headers.Authorization?.split('.')[1];
    if (url.endsWith('/auth/v1/user')) return json({id:actor,email:f.emails[actor],email_confirmed_at:'2026-01-01T00:00:00Z'});
    if (request.headers['Content-Profile'] !== 'sideline_api') return json({code:'PGRST106'},406);
    const {p_team:team,p_season:season} = JSON.parse(request.body);
    switch (url.split('/').pop()) {
      case 'my_teams':
        if (!actor) return deny();
        return json(teamRows(actor==='multi' ? [f.team,f.minor,f.otherTeam,f.expiredTeam] : actor==='coach' ? [f.team] : []));
      case 'admin_teams': return json(teamRows([f.team,f.minor]));
      case 'provision_registration': return json({code:'PGRST202'},404);
      case 'season_roster':
        if (team===f.team && actor!=='admin') {
          if (season===f.season) return json(players([f.player]));
          if (season===f.previousSeason) return json(players([f.player,f.priorPlayer]));
        }
        return json(players(team===f.otherTeam && actor==='multi' ? [f.otherPlayer] : []));
      case 'match_history': return json(actor==='admin' && !leakHistory ? [] : [{id:f.match}]);
      case 'editor_roster': return team===f.team ? json(players([f.player])) : deny();
      case 'team_features':
        if (team===f.otherTeam && actor!=='multi') return deny();
        return json(team===f.otherTeam ? top : team===f.minor ? advanced : basic);
      case 'team_statistics':
      case 'basic_player_review': return actor==='admin' ? deny() : json([{matches:1}]);
      case 'season_comparisons': return actor==='multi' && team===f.otherTeam ? json([{seasons:2}]) : deny();
      default: throw Error('Unexpected operation in workspace suite.');
    }
  };
  const args = ['--run-synthetic',projectRef,'workspace'];
  await run(args,env,transport);
  leakHistory = true;
  await assert.rejects(run(args,env,transport), /Unexpected visible row set/);
});
