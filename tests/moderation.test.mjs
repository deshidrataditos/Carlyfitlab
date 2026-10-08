import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as input from '../lib/member-input.ts';

const source = ts.transpileModule(readFileSync(new URL('../app/api/admin/testimonials/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const id = 'a8939179-3b60-4eba-a864-d40960759974';
const body = {id, status: 'approved', expectedStatus: 'pending'};

function harness({user = {id: 'moderator'}, allowed = true, permissionError = null, rpcError = null, list = [], configured = true} = {}) {
  const calls = [];
  const exported = {};
  const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie'}});
  const session = {
    client: {
      auth: {getUser: async () => ({data: {user}, error: null})},
      rpc: async (name, args) => {
        calls.push({name, args});
        if (name === 'can_moderate_testimonials') return {data: allowed, error: permissionError};
        if (rpcError) return {data: null, error: rpcError};
        return {data: name === 'list_moderation_testimonials' ? list : [{id, status: args.p_status, moderated_at: '2026-10-08T12:00:00Z'}], error: null};
      },
    },
    finish: response => {response.headers.set('X-Session-Finished', 'true'); return response;},
  };
  const dependencies = {
    '@/lib/member-input': input,
    '@/lib/supabase-server': {
      memberSession: () => configured ? session : null,
      memberJson: json,
      unavailable: () => json({error: 'Unavailable'}, 503),
      memberFailure: error => json({error: error instanceof input.MemberInputError ? error.message : 'Unavailable'}, error instanceof input.MemberInputError ? error.status : 503),
    },
  };
  runInNewContext(source, {exports: exported, require: name => {assert.ok(name in dependencies); return dependencies[name];}, URL, Response});
  return {
    calls,
    get: (query = '') => exported.GET(new Request(`https://shop.example/api/admin/testimonials${query}`)),
    post: (data = body, origin = 'https://shop.example') => exported.POST(new Request('https://shop.example/api/admin/testimonials', {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {})}, body: JSON.stringify(data),
    })),
  };
}

test('guests, anonymous users and regular members cannot list or moderate testimonials', async () => {
  for (const options of [{user: null}, {user: {id: 'anon', is_anonymous: true}}, {allowed: false, user: {id: 'member', email: 'carlyfit.lab@gmail.com', user_metadata: {role: 'admin'}}}]) {
    const fixture = harness(options);
    const expected = options.user === null ? 401 : 403;
    assert.equal((await fixture.get()).status, expected);
    assert.equal((await fixture.post()).status, expected);
    assert.ok(fixture.calls.every(call => call.name === 'can_moderate_testimonials'));
  }
});

test('permission failures fail closed without fetching or changing comments', async () => {
  for (const options of [{permissionError: {code: 'XX000'}}, {configured: false}]) {
    const fixture = harness(options);
    assert.equal((await fixture.get()).status, 503);
    assert.equal((await fixture.post()).status, 503);
    assert.ok(fixture.calls.every(call => call.name === 'can_moderate_testimonials'));
  }
});

test('moderation rejects cross-site writes before checking permission', async () => {
  for (const origin of [null, 'https://untrusted.example']) {
    const fixture = harness();
    assert.equal((await fixture.post(body, origin)).status, 403);
    assert.equal(fixture.calls.length, 0);
  }
});

test('moderation validates IDs and transitions and drops content and role injection', async () => {
  const fixture = harness();
  for (const data of [{...body, id: 'invalid'}, {...body, status: 'pending'}, {...body, status: 'deleted'}, {...body, expectedStatus: 'anything'}]) {
    assert.equal((await fixture.post(data)).status, 400);
  }
  assert.ok(fixture.calls.every(call => call.name === 'can_moderate_testimonials'));
  const response = await fixture.post({...body, body: 'replace review', user_id: 'another', role: 'admin'});
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls.at(-1))), {name: 'moderate_testimonial', args: {p_id: id, p_status: 'approved', p_expected_status: 'pending'}});
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Vary'), 'Cookie');
  assert.equal(response.headers.get('X-Session-Finished'), 'true');
});

test('database revocation, missing reviews and stale actions remain distinct safe errors', async () => {
  for (const [code, status] of [['42501', 403], ['P0002', 404], ['40001', 409], ['22023', 400], ['XX000', 503]]) {
    const fixture = harness({rpcError: {code, message: 'private internal details'}});
    const response = await fixture.post();
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /private internal details/);
  }
});

test('list filters are bounded and pagination exposes only one page', async () => {
  const fixture = harness({list: Array.from({length: 21}, (_, i) => ({id: String(i), status: 'pending'}))});
  for (const query of ['?status=all', '?offset=-1', '?offset=1.5', '?offset=100001']) assert.equal((await fixture.get(query)).status, 400);
  assert.ok(fixture.calls.every(call => call.name === 'can_moderate_testimonials'));
  const response = await fixture.get('?status=rejected&offset=20');
  const data = await response.json();
  assert.equal(data.testimonials.length, 20);
  assert.equal(data.hasMore, true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls.at(-1))), {name: 'list_moderation_testimonials', args: {p_status: 'rejected', p_limit: 21, p_offset: 20}});
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
