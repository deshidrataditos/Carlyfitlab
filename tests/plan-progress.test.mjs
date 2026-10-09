import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const owner = 'a8939179-3b60-4eba-a864-d40960759974';
const admin = 'b8939179-3b60-4eba-a864-d40960759974';
const orderId = 'c8939179-3b60-4eba-a864-d40960759974';
const otherOrder = 'd8939179-3b60-4eba-a864-d40960759974';
const sessionInput = (patch = {}) => ({action:'session', orderId, requestId:webcrypto.randomUUID(), expectedVersion:0, date:'2026-10-09', completed:true, ...patch});
const datesInput = (patch = {}) => ({action:'dates', orderId, requestId:webcrypto.randomUUID(), expectedVersion:0, estimatedDeliveryDate:'2026-10-12', planStartedOn:'2026-07-12', ...patch});
const reviewInput = (patch = {}) => ({action:'review', orderId, requestId:webcrypto.randomUUID(), expectedVersion:0, day:30, comment:'Estoy manteniendo la constancia.', ...patch});
const feedbackInput = (patch = {}) => ({action:'feedback', orderId, requestId:webcrypto.randomUUID(), expectedVersion:1, day:30, feedback:'Vamos a seguir con los horarios acordados.', ...patch});

function harness({user = {id:owner}, allowed = false, permissionError = null, configured = true, now = '2026-10-09T18:00:00.000Z', beforeWrite} = {}) {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0000_abandoned_darwin.sql', '0001_payment_update_timestamp.sql', '0002_store_portal.sql', '0007_plan_intake.sql', '0008_plan_progress.sql']) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const calls = [];
  const statement = (sql, values = []) => ({
    sql,
    bind: (...args) => statement(sql, args),
    first: async () => {calls.push({sql, values}); return db.prepare(sql).get(...values) ?? null;},
    execute: () => {
      calls.push({sql, values});
      if (/^SELECT/i.test(sql)) return {results:db.prepare(sql).all(...values), meta:{changes:0}};
      const result = db.prepare(sql).run(...values);
      return {results:[], meta:{changes:Number(result.changes)}};
    },
  });
  let queue = Promise.resolve();
  const d1 = {prepare:statement, batch: statements => {
    const batch = queue.then(() => {
      if (beforeWrite && /^UPDATE/i.test(statements[0].sql)) {const hook = beforeWrite; beforeWrite = null; hook(db);}
      db.exec('BEGIN');
      try {const rows = statements.map(stmt => stmt.execute()); db.exec('COMMIT'); return rows;}
      catch (error) {db.exec('ROLLBACK'); throw error;}
    });
    queue = batch.catch(() => {});
    return batch;
  }};
  const session = {
    client:{auth:{getUser:async () => ({data:{user}, error:null})}, rpc:async name => {calls.push({rpc:name}); return {data:allowed, error:permissionError};}},
    finish:response => {response.headers.set('X-Session-Finished', 'true'); return response;},
  };
  const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'private, no-store', Vary:'Cookie'}});
  const auth = {memberSession:() => configured ? session : null, memberJson:json, memberFailure:error => json({error:error.status ? error.message : 'Unavailable'}, error.status ?? 503)};
  class FixedDate extends Date {constructor(value) {super(arguments.length ? value : now);} static now() {return new Date(now).getTime();}}
  const cache = new Map();
  function load(path) {
    if (path === 'cloudflare:workers') return {env:{DB:d1}};
    if (path.endsWith('supabase-server')) return auth;
    const normalized = path.replace(/^@\//, '').replace(/^\.\//, 'lib/').replace(/\.ts$/, '');
    if (cache.has(normalized)) return cache.get(normalized);
    const exported = {}; cache.set(normalized, exported);
    const source = ts.transpileModule(readFileSync(new URL(`../${normalized}.ts`, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source, {exports:exported, require:load, URL, Response, Request, TextEncoder, TextDecoder, Uint8Array, crypto:webcrypto, Date:FixedDate, Intl});
    return exported;
  }
  const routes = {member:load('app/api/store/progress/route'), admin:load('app/api/store/admin/progress/route')};
  function seed({id = orderId, userId = owner, status = 'approved', items = [{id:'rutina-90', quantity:1}], start = '2026-07-12', version = 0, requested = '2026-07-15'} = {}) {
    db.prepare('INSERT INTO orders (id,user_id,items,amount_cents,delivery,customer_name,status,created_at,plan_started_on,plan_progress_version,requested_delivery_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, userId, JSON.stringify(items), 149000, 'digital', 'Cliente', status, '2026-07-10T18:00:00Z', start, version, requested);
  }
  return {db, calls, seed, calendar:load('lib/plan-progress'),
    setUser:next => {user = next;}, setAllowed:next => {allowed = next;},
    get:(route = 'member', query = `?orderId=${orderId}`) => routes[route].GET(new Request(`https://shop.example/api/store/progress${query}`)),
    post:(route, body, {origin = 'https://shop.example', contentType = 'application/json', raw} = {}) => routes[route].POST(new Request('https://shop.example/api/store/progress', {method:'POST', headers:{...(origin ? {Origin:origin} : {}), 'Content-Type':contentType}, body:raw ?? JSON.stringify(body)})),
  };
}

test('guests, anonymous sessions, and unavailable auth cannot read or mutate private progress', async () => {
  for (const [options, status] of [[{user:null}, 401], [{user:{id:owner, is_anonymous:true}, allowed:true}, 403], [{configured:false}, 503]]) {
    const h = harness(options); h.seed();
    for (const route of ['member', 'admin']) {assert.equal((await h.get(route)).status, status); assert.equal((await h.post(route, route === 'member' ? sessionInput() : datesInput())).status, status);}
    assert.equal(h.calls.length, 0);
  }
});

test('only the exact owner reads member records; store admin authorization is current and fails closed', async () => {
  const h = harness(); h.seed({userId:admin});
  assert.equal((await h.get()).status, 404); assert.equal((await h.post('member', sessionInput())).status, 404);
  assert.equal((await h.get('admin')).status, 403); assert.equal((await h.post('admin', datesInput())).status, 403);
  h.setAllowed(true); assert.equal((await h.get('admin')).status, 200);
  h.setAllowed(false); assert.equal((await h.get('admin')).status, 403);
  const broken = harness({allowed:true, permissionError:{message:'secret admin error'}}); broken.seed();
  const response = await broken.get('admin'); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret/);
  assert.ok(broken.calls.every(call => call.rpc === 'can_manage_store'));
});

test('reversed or unpaid orders cannot return or accept progress, and product orders have dates only', async () => {
  for (const status of ['pending', 'refunded', 'charged_back', 'rejected']) {
    const h = harness({allowed:true}); h.seed({status});
    for (const route of ['member', 'admin']) assert.equal((await h.get(route)).status, 404);
    assert.equal((await h.post('member', sessionInput())).status, 409);
    assert.equal((await h.post('admin', datesInput())).status, 409);
  }
  const h = harness({allowed:true}); h.seed({userId:null, items:[{id:'mermelada', quantity:1}], start:null});
  assert.equal((await h.get()).status, 404);
  const read = await (await h.get('admin')).json(); assert.equal(read.order.hasPlan, false); assert.deepEqual(read.sessions, []); assert.deepEqual(read.reviews, []);
  assert.equal((await h.post('admin', datesInput())).status, 400);
  assert.equal((await h.post('admin', datesInput({planStartedOn:null}))).status, 200);
});

test('same-origin, exact fields, JSON size, valid IDs and private role boundaries are enforced', async () => {
  const h = harness({allowed:true}); h.seed();
  for (const origin of [null, 'https://evil.example']) assert.equal((await h.post('member', sessionInput(), {origin})).status, 403);
  assert.equal(h.calls.length, 0);
  for (const patch of [{userId:admin}, {weight:80}, {photos:[]}, {answers:'clinical'}, {completed:'true'}, {expectedVersion:-1}, {expectedVersion:1.2}, {expectedVersion:'0'}, {date:'2026-02-30'}, {date:'2026-1-09'}, {requestId:'unsafe'}, {orderId:'unsafe'}]) assert.equal((await h.post('member', sessionInput(patch))).status, 400);
  assert.equal((await h.post('member', datesInput())).status, 400);
  assert.equal((await h.post('member', feedbackInput())).status, 400);
  assert.equal((await h.post('admin', sessionInput())).status, 400);
  assert.equal((await h.post('admin', reviewInput())).status, 400);
  assert.equal((await h.post('admin', datesInput({requestedDeliveryDate:'2027-01-01'}))).status, 400);
  assert.equal((await h.post('admin', datesInput({planStartedOn:'2100-12-31'}))).status, 400);
  assert.equal((await h.post('member', reviewInput({comment:'x'.repeat(1201)}))).status, 400);
  assert.equal((await h.post('member', reviewInput({comment:'<script>bad</script>'}))).status, 400);
  assert.equal((await h.post('member', sessionInput(), {contentType:'text/plain'})).status, 415);
  assert.equal((await h.post('member', {}, {raw:'x'.repeat(8193)})).status, 413);
  assert.equal((await h.post('member', {}, {raw:'{oops'})).status, 400);
  for (const query of ['', `?orderId=${orderId}&owner=${admin}`, `?orderId=${orderId}&orderId=${otherOrder}`]) assert.equal((await h.get('member', query)).status, 400);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM plan_progress_mutations').get().n, 0);
});

test('civil dates use Mexico City, preserve leap days, and count inclusive 90-day periods', async () => {
  const h = harness({now:'2026-10-10T02:00:00.000Z'}); h.seed();
  assert.equal(h.calendar.mexicoToday(), '2026-10-09');
  assert.equal(h.calendar.isPlanDate('2028-02-29'), true); assert.equal(h.calendar.isPlanDate('2026-02-29'), false);
  assert.equal(h.calendar.addPlanDays('2028-02-01', 29), '2028-03-01');
  const data = await (await h.get()).json(); assert.equal(data.today, '2026-10-09'); assert.equal(data.order.planEndsOn, '2026-10-09');
  assert.equal((await h.post('member', sessionInput({date:'2026-10-09'}))).status, 200);
});

test('start is explicitly set by Carly, requested date remains separate, and unstarted plans cannot log sessions', async () => {
  const h = harness({allowed:true}); h.seed({start:null});
  assert.equal((await h.post('member', sessionInput())).status, 409);
  const input = datesInput(); const response = await h.post('admin', input); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.order.planStartedOn, '2026-07-12'); assert.equal(data.order.requestedDeliveryDate, '2026-07-15'); assert.equal(data.order.estimatedDeliveryDate, '2026-10-12');
  assert.equal(data.order.progressVersion, 1); assert.equal(h.db.prepare('SELECT version FROM orders').get().version, 0, 'Progress CAS does not invalidate delivery editor version');
  assert.equal((await h.post('admin', input)).status, 200); assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
});

test('session dates are limited to elapsed dates within 90 days, with one entry per date and reversible completion', async () => {
  const h = harness(); h.seed();
  for (const date of ['2026-07-11', '2026-10-10']) assert.equal((await h.post('member', sessionInput({date}))).status, 400);
  const first = sessionInput({date:'2026-07-12'}); assert.equal((await h.post('member', first)).status, 200);
  assert.equal((await h.post('member', sessionInput({date:first.date, expectedVersion:1}))).status, 200);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM plan_progress_sessions').get().n, 1);
  const removed = await h.post('member', sessionInput({date:first.date, completed:false, expectedVersion:2})); assert.equal(removed.status, 200); assert.deepEqual((await removed.json()).sessions, []);
  const future = harness(); future.seed({start:'2026-10-01'});
  assert.equal((await future.post('member', sessionInput({date:'2026-10-10'}))).status, 400, 'Future day inside plan range is still forbidden');
});

test('a recorded session or review locks the start even after a session is removed; delivery estimates remain editable', async () => {
  for (const record of [sessionInput(), reviewInput()]) {
    const h = harness({allowed:true}); h.seed(); assert.equal((await h.post('member', record)).status, 200);
    assert.equal((await h.post('admin', datesInput({expectedVersion:1, planStartedOn:'2026-07-11'}))).status, 409);
    assert.equal((await h.post('admin', datesInput({expectedVersion:1, planStartedOn:null}))).status, 409);
    assert.equal((await h.post('admin', datesInput({expectedVersion:1}))).status, 200);
  }
  const h = harness({allowed:true}); h.seed();
  await h.post('member', sessionInput({completed:false}));
  assert.equal((await h.post('admin', datesInput({expectedVersion:1, planStartedOn:'2026-07-11'}))).status, 409);
});

test('only 30/60/90 reviews are accepted when due; feedback is private and follows a submitted review', async () => {
  const early = harness({allowed:true}); early.seed({start:'2026-10-01'});
  assert.equal((await early.post('member', reviewInput())).status, 400);
  const h = harness({allowed:true}); h.seed();
  for (const day of [0, 29, 31, 61, 91, '30']) assert.equal((await h.post('member', reviewInput({day}))).status, 400);
  assert.equal((await h.post('admin', feedbackInput({expectedVersion:0}))).status, 409);
  assert.equal((await h.post('member', reviewInput({day:90}))).status, 200);
  h.setUser({id:admin});
  const feedback = await h.post('admin', feedbackInput({day:90})); assert.equal(feedback.status, 200);
  assert.equal((await feedback.json()).reviews[0].feedback, 'Vamos a seguir con los horarios acordados.');
  assert.equal((await h.get()).status, 404);
  h.setUser({id:owner});
  const changed = await h.post('member', reviewInput({day:90, expectedVersion:2, comment:'Organicé mejor mis sesiones esta semana.'}));
  assert.equal(changed.status, 200); assert.equal((await changed.json()).reviews[0].feedback, null, 'Feedback is cleared when its reviewed comment changes');
  const audits = h.db.prepare('SELECT details FROM store_audit').all();
  assert.doesNotMatch(JSON.stringify(audits), /constancia|horarios|Organic|comment|feedback/);
});

test('idempotent retries reuse the original receipt; changed payloads and stale new requests conflict', async () => {
  const h = harness(); h.seed(); const input = sessionInput();
  const first = await h.post('member', input); assert.equal(first.status, 200);
  const repeat = await h.post('member', input); assert.equal(repeat.status, 200); assert.equal((await repeat.json()).replayed, true);
  assert.equal((await h.post('member', {...input, completed:false})).status, 409);
  assert.equal((await h.post('member', sessionInput())).status, 409);
  assert.equal(h.db.prepare('SELECT plan_progress_version FROM orders').get().plan_progress_version, 1);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM plan_progress_mutations').get().n, 1);
});

test('simultaneous duplicate writes are idempotent and simultaneous different writes use CAS', async () => {
  const h = harness(); h.seed(); const input = sessionInput();
  const duplicate = await Promise.all([h.post('member', input), h.post('member', input)]);
  assert.deepEqual(duplicate.map(response => response.status), [200, 200]);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
  const competing = await Promise.all([h.post('member', sessionInput({expectedVersion:1, date:'2026-10-08'})), h.post('member', sessionInput({expectedVersion:1, date:'2026-10-07'}))]);
  assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
  assert.equal(h.db.prepare('SELECT plan_progress_version FROM orders').get().plan_progress_version, 2);
});

test('concurrent payment reversal, owner change, plan item change or version change prevents every dependent write', async () => {
  for (const beforeWrite of [
    db => db.exec("UPDATE orders SET status='refunded'"),
    db => db.prepare('UPDATE orders SET user_id=?').run(admin),
    db => db.exec("UPDATE orders SET items='[{\"id\":\"mermelada\"}]'"),
    db => db.exec('UPDATE orders SET plan_progress_version=plan_progress_version+1'),
  ]) {
    const h = harness({beforeWrite}); h.seed(); assert.equal((await h.post('member', sessionInput())).status, 409);
    for (const table of ['plan_progress_sessions', 'plan_progress_mutations', 'store_audit']) assert.equal(h.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  }
});

test('audit failure rolls back version, private records and idempotency receipt as one transaction', async () => {
  const h = harness({beforeWrite:db => db.exec("CREATE TRIGGER reject_progress_audit BEFORE INSERT ON store_audit BEGIN SELECT RAISE(ABORT, 'private audit failure'); END")}); h.seed();
  const response = await h.post('member', sessionInput()); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private audit/);
  assert.equal(h.db.prepare('SELECT plan_progress_version FROM orders').get().plan_progress_version, 0);
  for (const table of ['plan_progress_sessions', 'plan_progress_mutations', 'store_audit']) assert.equal(h.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
});

test('private read projection is bounded, no-store, and never exposes identifiers, receipt hashes or another order', async () => {
  const h = harness(); h.seed(); h.seed({id:otherOrder, userId:admin});
  await h.post('member', reviewInput());
  const response = await h.get(); assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.equal(response.headers.get('X-Session-Finished'), 'true');
  const data = await response.json(); assert.equal(data.reviews.length, 1); assert.equal(data.sessions.length, 0);
  assert.deepEqual(Object.keys(data).sort(), ['order', 'reviews', 'sessions', 'today']);
  assert.doesNotMatch(JSON.stringify(data), /actor_id|user_id|payload_hash|attempt_id|customer_name/);
  assert.ok(h.calls.filter(call => call.sql?.includes('JOIN orders')).every(call => call.sql.includes("status='approved'") && call.sql.includes('o.user_id=?')));
  h.db.exec("UPDATE orders SET status='charged_back'");
  assert.equal((await h.get()).status, 404);
});
