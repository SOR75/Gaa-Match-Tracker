import assert from 'node:assert/strict';

export const actors = ['purchaser','admin','coach','multi','nominee','incoming'];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const fixtureIds = ['org','team','otherTeam','minor','season','previousSeason','minorSeason',
  'otherSeason','player','priorPlayer','otherPlayer','match','expiredTeam','expiredInvitation'];

export function validateRun(args, env, fixture) {
  if (args.length !== 3 || !['foundation','workspace'].includes(args[2]) ||
      args[0] !== '--run-synthetic' || !/^[a-z0-9]{20}$/.test(args[1]) ||
      args[1] !== fixture.projectRef || args[1] !== env.SIDELINE_APPROVED_DEV_REF)
    throw Error('Explicit synthetic run, fixture and approved development project must match.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SIDELINE_TEST_PUBLIC_KEY || ''))
    throw Error('A publishable key is required.');
  for (const id of fixtureIds) assert.ok(uuid.test(fixture[id]), 'Missing synthetic fixture ID: ' + id);
  assert.equal(new Set(['team','otherTeam','minor','expiredTeam'].map(k=>fixture[k])).size,4);
  assert.notEqual(fixture.player,fixture.priorPlayer);
  const addresses = actors.map(actor => fixture.emails?.[actor]);
  for (const address of addresses)
    assert.ok(typeof address === 'string' && /^sideline-synth-[a-z0-9+-]+@[a-z0-9.-]+$/i.test(address), 'Synthetic email required.');
  assert.equal(new Set(addresses.map(s=>s.toLowerCase())).size, actors.length);
  return 'https://' + fixture.projectRef + '.supabase.co';
}

// Never print response bodies, credentials, tokens or identity-bearing URLs on failure.
export function apiClient(origin, key, token, transport = fetch) {
  async function request(path, options) {
    const response = await transport(origin + path, {
      ...options, redirect:'error', cache:'no-store', signal:AbortSignal.timeout(15000),
      headers:{apikey:key, ...(token ? {Authorization:'Bearer ' + token} : {}), ...options.headers},
    });
    const body = await response.text();
    let data = null;
    if (body) {
      try { data = JSON.parse(body); }
      catch { throw Error('Non-JSON API response (HTTP ' + response.status + ')'); }
    }
    return {status:response.status, data};
  }
  return {
    identity: () => request('/auth/v1/user', {method:'GET'}),
    rpc: (name, args = {}, schema = 'sideline_api') => {
      if (!/^[a-z_]+$/.test(name)) throw Error('Invalid operation name.');
      return request('/rest/v1/rpc/' + name, {method:'POST', headers:{
        'Content-Type':'application/json','Content-Profile':schema,'Accept-Profile':schema,
      }, body:JSON.stringify(args)});
    },
  };
}

export function success(result, label) {
  assert.ok(result.status >= 200 && result.status < 300, label + ' expected success; HTTP ' + result.status);
  return result.data;
}
export function forbidden(result) {
  assert.ok([401,403].includes(result.status) && result.data?.code === '42501', 'Expected database permission denial.');
}
export function sameRows(rows, expected, field = 'id') {
  assert.ok(Array.isArray(rows) && rows.length === expected.length &&
    expected.every(id => rows.some(row => row[field] === id)), 'Unexpected visible row set.');
}
