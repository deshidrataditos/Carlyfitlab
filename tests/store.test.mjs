import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const owner = 'a8939179-3b60-4eba-a864-d40960759974';
const stranger = 'b8939179-3b60-4eba-a864-d40960759974';
const orderId = 'c8939179-3b60-4eba-a864-d40960759974';
const otherOrderId = 'd8939179-3b60-4eba-a864-d40960759974';
const materialId = 'e8939179-3b60-4eba-a864-d40960759974';
const productFields = {ingredients: '', allergens: '', storage: '', preparation: '', servings: '', shipping: ''};
const intake = {goal: 'Mejorar mi fuerza', experience: 'beginner', place: 'home', days: 3, minutes: 30, equipment: 'Mancuernas'};
const fulfillment = {action: 'fulfillment', orderId, expectedVersion: 0, fulfillmentStatus: 'preparing', fulfillmentNote: 'Comenzamos pronto'};
const upload = {action: 'prepare', orderId, title: 'Mi rutina', kind: 'routine', fileName: 'rutina.pdf', contentType: 'application/pdf', size: 250};

function harness({user = {id: owner, email: 'member@example.invalid'}, allowed = false, permissionError = null, configured = true, missingObject = false, objectSize = 250, objectType = 'application/pdf', signingError = false, publicationFailures = 0, beforeBatch} = {}) {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0000_abandoned_darwin.sql', '0001_payment_update_timestamp.sql', '0002_store_portal.sql', '0006_plan_email.sql', '0007_plan_intake.sql', '0008_plan_progress.sql', '0009_product_availability.sql', '0010_material_emails.sql']) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const calls = [];
  const statement = (sql, values = []) => ({
    bind: (...args) => statement(sql, args),
    first: async () => { calls.push({sql, values}); return db.prepare(sql).get(...values) ?? null; },
    all: async () => { calls.push({sql, values}); return {results: db.prepare(sql).all(...values)}; },
    run: async () => { calls.push({sql, values}); const result = db.prepare(sql).run(...values); return {meta: {changes: Number(result.changes)}}; },
  });
  const d1 = {prepare: statement, batch: async statements => {
    if (beforeBatch) { const fn = beforeBatch; beforeBatch = null; fn(db); }
    db.exec('BEGIN');
    try { const results = []; for (const stmt of statements) results.push(await stmt.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }};
  const storage = {
    createSignedUrl: async (path, expires, options) => { calls.push({signDownload: path, expires, options}); return {data: {signedUrl: 'https://storage.example/private-file?token=short'}, error: null}; },
    createSignedUploadUrl: async (path, options) => { calls.push({signUpload: path, options}); return signingError ? {data: null, error: {message: 'private storage error'}} : {data: {signedUrl: 'https://storage.example/upload?token=short', token: 'short', path}, error: null}; },
    info: async path => { calls.push({objectInfo: path}); return missingObject ? {data: null, error: {message: 'private missing path'}} : {data: {size: objectSize, contentType: objectType}, error: null}; },
  };
  const session = {
    client: {
      auth: {getUser: async () => ({data: {user}, error: null})},
      rpc: async (name, args) => {
        calls.push({rpc: name, args});
        if (name === 'publish_store_material') {
          assert.equal(db.prepare('SELECT state FROM store_materials WHERE id=?').get(args.p_material_id)?.state, 'published', 'Storage owner access may only follow verified D1 publication');
          if (publicationFailures-- > 0) return {data: null, error: {message: 'internal registration error'}};
          return {data: true, error: null};
        }
        return {data: allowed, error: permissionError};
      },
      from: () => ({select: () => ({eq: () => ({single: async () => ({data: {display_name: 'Cliente'}, error: null})})})}),
      storage: {from: bucket => { assert.equal(bucket, 'carlyfit-plans'); return storage; }},
    },
    finish: response => { response.headers.set('X-Session-Finished', 'true'); return response; },
  };
  const cache = new Map();
  const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie'}});
  const auth = {memberSession: () => configured ? session : null, memberJson: json, memberFailure: error => json({error: error.status ? error.message : 'Unavailable'}, error.status ?? 503)};
  function load(path) {
    if (path === 'cloudflare:workers') return {env: {DB: d1}};
    if (path === 'next/server') return {after: () => {}};
    if (path.endsWith('supabase-server')) return auth;
    const normalized = path.replace(/^@\//, '').replace(/^\.\//, 'lib/').replace(/\.ts$/, '');
    if (cache.has(normalized)) return cache.get(normalized);
    const exported = {};
    cache.set(normalized, exported);
    const source = ts.transpileModule(readFileSync(new URL(`../${normalized}.ts`, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source, {exports: exported, require: load, URL, Response, Request, TextDecoder, Uint8Array, crypto: webcrypto, Date});
    return exported;
  }
  const routes = Object.fromEntries(['me', 'intake', 'admin', 'admin/intake', 'material', 'content'].map(route => [route, load(`app/api/store/${route}/route`)]));
  function seedOrder({id = orderId, userId = owner, status = 'approved', items = [{id: 'rutina-90', title: 'Activa tu fuerza', quantity: 1, unit_price: 1490}], delivery = 'digital', state = 'received', version = 0} = {}) {
    db.prepare('INSERT INTO orders (id,user_id,items,amount_cents,delivery,customer_name,status,created_at,fulfillment_status,version) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, userId, JSON.stringify(items), 149000, delivery, 'Compradora', status, '2026-10-08T12:00:00Z', state, version);
  }
  function seedMaterial({id = materialId, state = 'published', userId = owner, order = orderId} = {}) {
    db.prepare('INSERT INTO store_materials (id,order_id,user_id,title,kind,object_path,content_type,byte_size,state,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, order, userId, 'Rutina', 'routine', `${userId}/${order}/${id}.pdf`, 'application/pdf', 250, state, owner, new Date().toISOString(), new Date(Date.now() + 3600000).toISOString());
  }
  return {db, calls, seedOrder, seedMaterial, input: load('lib/store-input'), get: (route, query = '') => routes[route].GET(new Request(`https://shop.example/api/store/${route}${query}`)), post: (route, body, origin = 'https://shop.example') => routes[route].POST(new Request(`https://shop.example/api/store/${route}`, {method: 'POST', headers: {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {})}, body: JSON.stringify(body)}))};
}

test('all private routes reject guests and anonymous users before accessing orders', async () => {
  for (const [user, status] of [[null, 401], [{id: owner, is_anonymous: true}, 403]]) {
    const h = harness({user});
    for (const route of ['me', 'admin', 'material']) assert.equal((await h.get(route)).status, status);
    for (const [route, body] of [['intake', intake], ['admin', fulfillment], ['material', upload], ['content', {products: {}}]]) assert.equal((await h.post(route, body)).status, status);
    assert.equal(h.calls.length, 0);
  }
});

test('regular customers cannot grant themselves store access by identity or metadata', async () => {
  const h = harness({user: {id: owner, email: 'carlyfit.lab@gmail.com', user_metadata: {role: 'admin', canManageStore: true}}});
  for (const [route, body] of [['admin', {...fulfillment, role: 'admin'}], ['material', upload], ['content', {products: {}}]]) assert.equal((await h.post(route, body)).status, 403);
  assert.equal((await h.get('admin')).status, 403);
  assert.ok(h.calls.every(call => call.rpc === 'can_manage_store'));
});

test('permission service and auth configuration failures deny access without data reads', async () => {
  for (const options of [{permissionError: {message: 'internal allowlist failure'}}, {configured: false}]) {
    const h = harness(options);
    assert.equal((await h.get('admin')).status, 503);
    const response = await h.post('material', upload);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /internal allowlist/);
    assert.ok(h.calls.every(call => call.rpc === 'can_manage_store'));
  }
});

test('cross-site changes are rejected before authorization and data access', async () => {
  for (const origin of [null, 'https://evil.example']) {
    const h = harness({allowed: true});
    for (const [route, body] of [['intake', intake], ['admin', fulfillment], ['material', upload], ['content', {products: {}}]]) assert.equal((await h.post(route, body, origin)).status, 403);
    assert.equal(h.calls.length, 0);
  }
});

test('member history includes only authenticated owner orders, including approved material metadata', async () => {
  const h = harness();
  h.seedOrder(); h.seedOrder({id: otherOrderId, userId: stranger}); h.seedOrder({id: 'f8939179-3b60-4eba-a864-d40960759974', userId: null}); h.seedMaterial();
  const response = await h.get('me', `?user_id=${stranger}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.orders.length, 1); assert.equal(data.orders[0].id, orderId); assert.equal(data.hasApprovedPlan, true); assert.equal(data.orders[0].planReady, true);
  assert.deepEqual(data.orders[0].materials, [{id: materialId, title: 'Rutina', kind: 'routine'}]);
  assert.ok(!('email' in data.orders[0])); assert.ok(!('object_path' in data.orders[0].materials[0]));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.equal(response.headers.get('X-Session-Finished'), 'true');
});

test('intake requires an approved plan and ignores injected owner, email, and medical fields', async () => {
  for (const order of [{status: 'pending'}, {status: 'refunded'}, {userId: stranger}, {items: [{id: 'mermelada'}]}]) {
    const h = harness(); h.seedOrder(order);
    assert.equal((await h.post('intake', intake)).status, 403);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_intake').get().n, 0);
  }
  const h = harness(); h.seedOrder();
  assert.equal((await h.post('intake', {...intake, user_id: stranger, email: 'fake@example.invalid', medicalHistory: 'not collected'})).status, 200);
  const row = h.db.prepare('SELECT * FROM store_intake').get();
  assert.equal(row.user_id, owner); assert.ok(!('medicalHistory' in row));
});

test('intake, query and upload validation reject malformed or unbounded data', async () => {
  const h = harness({allowed: true}); h.seedOrder();
  for (const patch of [{days: 0}, {days: 8}, {minutes: 181}, {minutes: '30'}, {experience: 'expert'}, {experience: ['beginner']}, {place: ['home']}, {place: 'anywhere'}, {goal: '<script>bad</script>'}, {equipment: 'x'.repeat(1001)}]) assert.equal((await h.post('intake', {...intake, ...patch})).status, 400);
  for (const query of ['?offset=-1', '?offset=100001', '?offset=1.5', '?status=unknown']) assert.equal((await h.get('admin', query)).status, 400);
  for (const patch of [{size: 45 * 1024 * 1024 + 1}, {size: 0}, {kind: 'html'}, {contentType: 'text/html'}, {fileName: '../rutina.pdf'}, {fileName: 'rutina.exe'}, {orderId: "' OR 1=1"}]) assert.equal((await h.post('material', {...upload, ...patch})).status, 400);
});

test('guessed material IDs and refunded or pending orders never produce download links', async () => {
  for (const options of [{user: {id: stranger}}, {status: 'pending'}, {status: 'refunded'}, {state: 'pending'}]) {
    const h = harness(options); h.seedOrder({status: options.status ?? 'approved'}); h.seedMaterial({state: options.state ?? 'published'});
    assert.equal((await h.get('material', `?id=${materialId}&user_id=${owner}`)).status, 404);
    assert.ok(h.calls.every(call => !call.signDownload));
  }
  const h = harness(); h.seedOrder(); h.seedMaterial();
  const response = await h.get('material', `?id=${materialId}`);
  assert.equal(response.status, 200); assert.match((await response.json()).url, /^https:/);
  assert.equal(h.calls.find(call => call.signDownload).expires, 60);
});

test('fulfillment enforces paid workflow, optimistic versions, and atomic audit', async () => {
  for (const order of [{status: 'pending'}, {status: 'refunded'}, {version: 1}, {state: 'delivered'}]) {
    const h = harness({allowed: true}); h.seedOrder(order);
    assert.equal((await h.post('admin', fulfillment)).status, 409);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
  }
  const h = harness({allowed: true}); h.seedOrder();
  assert.equal((await h.post('admin', {...fulfillment, user_id: stranger, status: 'approved'})).status, 200);
  const order = h.db.prepare('SELECT * FROM orders').get(); assert.equal(order.version, 1); assert.equal(order.fulfillment_status, 'preparing'); assert.equal(order.user_id, owner);
  const audit = h.db.prepare('SELECT * FROM store_audit').get(); assert.equal(audit.actor_id, owner); assert.equal(audit.action, 'fulfillment');
  assert.equal((await h.post('admin', fulfillment)).status, 409);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
});

test('a concurrent refund prevents fulfillment and does not create a misleading audit', async () => {
  const h = harness({allowed: true, beforeBatch: db => db.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(orderId)}); h.seedOrder();
  assert.equal((await h.post('admin', fulfillment)).status, 409);
  assert.equal(h.db.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status, 'received');
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
});

test('availability conflicts block fulfillment before validation and atomically if capacity changes concurrently', async () => {
  const blocked=harness({allowed:true});blocked.seedOrder();blocked.db.prepare("UPDATE orders SET availability_status='conflict' WHERE id=?").run(orderId);
  assert.equal((await blocked.post('admin',fulfillment)).status,409);
  assert.equal(blocked.db.prepare('SELECT fulfillment_status FROM orders').get().fulfillment_status,'received');
  assert.equal(blocked.db.prepare('SELECT count(*) AS n FROM store_audit').get().n,0);
  const raced=harness({allowed:true,beforeBatch:db=>db.prepare("UPDATE orders SET availability_status='conflict' WHERE id=?").run(orderId)});raced.seedOrder();
  assert.equal((await raced.post('admin',fulfillment)).status,409);
  assert.equal(raced.db.prepare('SELECT fulfillment_status,version FROM orders').get().fulfillment_status,'received');
  assert.equal(raced.db.prepare('SELECT version FROM orders').get().version,0);
  assert.equal(raced.db.prepare('SELECT count(*) AS n FROM store_audit').get().n,0);
});

test('digital and pickup orders cannot be shipped and fulfilled orders cannot regress', () => {
  const h = harness();
  for (const args of [['approved', 'ready', 'shipped', 'digital'], ['approved', 'ready', 'shipped', 'pickup'], ['approved', 'delivered', 'ready', 'shipping'], ['approved', 'received', 'delivered', 'digital']]) assert.throws(() => h.input.checkFulfillmentTransition(...args));
  assert.doesNotThrow(() => h.input.checkFulfillmentTransition('approved', 'ready', 'delivered', 'digital'));
  assert.doesNotThrow(() => h.input.checkFulfillmentTransition('approved', 'ready', 'shipped', 'shipping'));
});

test('material prepare uses verified order owner and complete verifies the uploaded object before publication', async () => {
  const h = harness({allowed: true}); h.seedOrder();
  const prepared = await (await h.post('material', {...upload, user_id: stranger, object_path: 'evil/path'})).json();
  assert.match(prepared.path, new RegExp(`^${owner}/${orderId}/`));
  assert.equal(h.db.prepare('SELECT state FROM store_materials').get().state, 'pending');
  assert.equal(h.calls.find(call => call.signUpload).options.upsert, false);
  assert.ok(!h.calls.some(call => call.rpc === 'publish_store_material'));
  const complete = await h.post('material', {action: 'complete', uploadId: prepared.uploadId});
  assert.equal(complete.status, 200); assert.equal(h.db.prepare('SELECT state FROM store_materials').get().state, 'published');
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
  assert.equal((await h.post('material', {action: 'complete', uploadId: prepared.uploadId})).status, 200);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
});

test('failed, mismatched, expired uploads and concurrent refunds never publish metadata', async () => {
  for (const options of [{missingObject: true}, {objectSize: 251}, {objectType: 'video/mp4'}, {expired: true}, {beforeBatch: db => db.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(orderId)}]) {
    const h = harness({allowed: true, ...options}); h.seedOrder(); h.seedMaterial({state: 'pending'});
    if (options.expired) h.db.prepare("UPDATE store_materials SET expires_at='2000-01-01'").run();
    assert.equal((await h.post('material', {action: 'complete', uploadId: materialId})).status, 409);
    assert.equal(h.db.prepare('SELECT state FROM store_materials').get().state, 'pending');
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
    assert.ok(!h.calls.some(call => call.rpc === 'publish_store_material'));
  }
});

test('Storage publication retries idempotently after failure, but rechecks payment first', async () => {
  const h = harness({allowed: true, publicationFailures: 1}); h.seedOrder(); h.seedMaterial({state: 'pending'});
  const first = await h.post('material', {action: 'complete', uploadId: materialId});
  assert.equal(first.status, 503); assert.doesNotMatch(await first.text(), /internal registration/);
  assert.equal(h.db.prepare('SELECT state FROM store_materials').get().state, 'published');
  assert.equal((await h.post('material', {action: 'complete', uploadId: materialId})).status, 200);
  assert.equal(h.calls.filter(call => call.rpc === 'publish_store_material').length, 2);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 1);
  h.db.prepare("UPDATE orders SET status='refunded'").run();
  assert.equal((await h.post('material', {action: 'complete', uploadId: materialId})).status, 409);
  assert.equal(h.calls.filter(call => call.rpc === 'publish_store_material').length, 2);
});

test('upload signing failure releases the pending slot and exposes no provider error', async () => {
  const h = harness({allowed: true, signingError: true}); h.seedOrder();
  const response = await h.post('material', upload);
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private storage/);
  assert.equal(h.db.prepare('SELECT state FROM store_materials').get().state, 'deleted');
});

test('public content starts empty, stores only allowed text and HTTPS links, and audits admin changes', async () => {
  const h = harness({allowed: true});
  assert.deepEqual(await (await h.get('content')).json(), {products: {}, presentationVideoUrl: '', secondaryVideoUrl: '', googleMapsUrl: '', instagramUrl: '', businessHours: ''});
  for (const body of [{products: {unknown: productFields}}, {products: {mermelada: {...productFields, ingredients: '<b>HTML</b>'}}}, {products: {}, presentationVideoUrl: 'javascript:alert(1)'}, {products: {}, presentationVideoUrl: 'https://youtube.com.evil.example/watch?v=x'}, {products: {}, googleMapsUrl: 'https://google.com/search?q=address'}, {products: {}, googleMapsUrl: 'https://user:pass@maps.google.com/'}, {products: {}, instagramUrl: 'https://www.instagram.com.evil.example/carlyfit.lab/'}, {products: {}, instagramUrl: 'http://instagram.com/carlyfit.lab/'}, {products: {}, instagramUrl: 'https://instagram.com/accounts/login/'}, {products: {}, instagramUrl: 'https://evil.example/reel/video/'}]) assert.equal((await h.post('content', body)).status, 400);
  const body = {products: {mermelada: {...productFields, storage: 'Refrigerar'}}, presentationVideoUrl: 'https://youtu.be/abc', secondaryVideoUrl: '', googleMapsUrl: 'https://www.google.com/maps/place/example', instagramUrl: 'https://www.instagram.com/carlyfit.lab/', businessHours: 'Por confirmar'};
  assert.equal((await h.post('content', body)).status, 200);
  const response = await h.get('content'); assert.deepEqual(await response.json(), body); assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
  assert.equal(h.db.prepare('SELECT action FROM store_audit').get().action, 'content_updated');
  const stripped = await h.post('content', {...body, instagramUrl: 'https://www.instagram.com/carlyfit.lab/?igsh=tracking#fragment'});
  assert.equal((await stripped.json()).instagramUrl, body.instagramUrl);
  assert.equal((await h.post('content', {...body, instagramUrl: 'https://www.instagram.com/reel/example-video/'})).status, 200);
  for (const presentationVideoUrl of ['https://www.facebook.com/reel/2470379943438648', 'https://www.facebook.com/share/r/1FrJVFmqwX/']) assert.equal((await h.post('content', {...body, presentationVideoUrl})).status, 200);
  for (const presentationVideoUrl of ['https://www.facebook.com/l.php?u=https://evil.example', 'https://www.facebook.com/reel/not-a-number', 'https://www.facebook.com.evil.example/reel/1234', 'https://www.facebook.com/share/r/abc/extra', 'https://www.facebook.com/login']) assert.equal((await h.post('content', {...body, presentationVideoUrl})).status, 400);
  const secondary = await h.post('content', {...body, secondaryVideoUrl: 'https://www.facebook.com/share/r/1Kbk2gAd5o/'});
  assert.equal(secondary.status, 200); assert.equal((await secondary.json()).secondaryVideoUrl, 'https://www.facebook.com/share/r/1Kbk2gAd5o/');
  assert.equal((await h.post('content', {...body, secondaryVideoUrl: 'https://www.facebook.com/l.php?u=https://evil.example'})).status, 400);
});

test('admin list is paginated and exposes verified directory email with customer intake', async () => {
  const h = harness({allowed: true}); h.seedOrder(); h.seedMaterial();
  h.db.prepare('INSERT INTO member_directory (user_id,email,display_name,updated_at) VALUES (?,?,?,?)').run(owner, 'verified@example.invalid', 'Cliente', 'now');
  await h.post('intake', intake);
  for (let i = 0; i < 20; i++) h.seedOrder({id: webcrypto.randomUUID(), userId: stranger});
  const response = await h.get('admin'); const data = await response.json();
  assert.equal(data.orders.length, 20); assert.equal(data.hasMore, true);
  const all = [...data.orders, ...(await (await h.get('admin', '?offset=20')).json()).orders];
  const found = all.find(order => order.id === orderId); assert.equal(found.email, 'verified@example.invalid'); assert.equal(found.intake.goal, intake.goal); assert.equal(found.materials.length, 1);
});

test('migration keeps roles separate, bucket private, and denies file overwrite and anonymous access', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610080002_store_portal.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table carlyfit_private\.store_admins/);
  assert.doesNotMatch(sql, /insert into carlyfit_private\.store_admins\s*\(/i);
  assert.doesNotMatch(sql, /from carlyfit_private\.testimonial_moderators/);
  assert.match(sql, /'carlyfit-plans', 'carlyfit-plans', false, 47185920/);
  assert.match(sql, /as restrictive for update to public/);
  assert.match(sql, /as restrictive for delete to public/);
  assert.match(sql, /auth\.uid\(\)::text/);
  assert.match(sql, /create table carlyfit_private\.store_material_access/);
  assert.match(sql, /a\.object_path = p_object_path and a\.user_id = auth\.uid\(\)/);
  assert.match(sql, /and carlyfit_private\.can_read_store_material\(name\)/, 'Permissive SELECT requires a published allowlist entry for members');
  assert.match(sql, /and carlyfit_private\.can_read_store_material\(p_object_path\)/, 'Restrictive SELECT guard requires a published allowlist entry for members');
  assert.match(sql, /store_storage_read_allowed\(bucket_id, name\)/);
  assert.match(sql, /store_storage_insert_allowed\(bucket_id\)/);
  assert.match(sql, /if not carlyfit_private\.can_manage_store\(\) then/);
  const repair = readFileSync(new URL('../supabase/migrations/202610080003_store_storage_guard_permissions.sql', import.meta.url), 'utf8');
  assert.match(repair, /alter policy carlyfit_plans_read_guard/);
  assert.match(repair, /alter policy carlyfit_plans_insert_guard/);
  assert.doesNotMatch(repair, /grant execute on function (?:public|carlyfit_private)\.can_manage_store\(\).*to anon/);
  assert.doesNotMatch(repair, /drop policy|insert into|update storage|delete from/i);
});

const receipt = {orderId, expectedVersion: 0, status: 'received'};

test('only a store administrator can confirm or undo clinical intake receipt', async () => {
  for (const [options, expectedStatus] of [
    [{user: null}, 401],
    [{user: {id: owner, is_anonymous: true}, allowed: true}, 403],
    [{user: {id: owner, user_metadata: {canManageStore: true}}}, 403],
    [{permissionError: {message: 'private authorization error'}}, 503],
    [{configured: false}, 503],
  ]) {
    const h = harness(options); h.seedOrder();
    for (const status of ['received', 'pending']) assert.equal((await h.post('admin/intake', {...receipt, status})).status, expectedStatus);
    assert.ok(h.calls.every(call => call.rpc === 'can_manage_store'));
    assert.equal(h.db.prepare('SELECT intake_received_at FROM orders').get().intake_received_at, null);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
  }
});

test('clinical intake receipt requires same-origin bounded input and rejects answer or actor fields', async () => {
  const h = harness({allowed: true}); h.seedOrder();
  for (const origin of [null, 'https://evil.example']) assert.equal((await h.post('admin/intake', receipt, origin)).status, 403);
  assert.equal(h.calls.length, 0);
  for (const patch of [
    {status: 'submitted'}, {status: ['received']}, {status: true}, {expectedVersion: -1}, {expectedVersion: 0.5},
    {expectedVersion: '0'}, {expectedVersion: 2147483647}, {orderId: "' OR 1=1"}, {orderId: null},
    {answers: 'Private health answers'}, {intake_received_by: owner}, {intakeReceivedAt: 'now'}, {user_id: owner},
  ]) assert.equal((await h.post('admin/intake', {...receipt, ...patch})).status, 400);
  assert.equal((await h.post('admin/intake', {...receipt, answers: 'x'.repeat(9000)})).status, 413);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
  assert.equal(h.db.prepare('SELECT version FROM orders').get().version, 0);
});

test('clinical intake receipt requires an approved, linked, canonical plan order', async () => {
  for (const order of [
    {status: 'pending'}, {status: 'rejected'}, {status: 'refunded'}, {status: 'charged_back'}, {userId: null},
    {items: [{id: 'mermelada', kind: 'plan'}]}, {items: [{id: 'not-a-plan', title: 'Plan personalizado'}]},
  ]) {
    const h = harness({allowed: true}); h.seedOrder(order);
    assert.equal((await h.post('admin/intake', receipt)).status, 409);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
  }
  const missing = harness({allowed: true});
  assert.equal((await missing.post('admin/intake', receipt)).status, 404);
});

test('Carly can confirm and correct receipt, with audit history and no clinical answers or exposed actor', async () => {
  const h = harness({allowed: true, user: {id: stranger}}); h.seedOrder();
  const response = await h.post('admin/intake', receipt);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const {order} = await response.json();
  assert.deepEqual(Object.keys(order).sort(), ['id', 'intakeReceivedAt', 'version']);
  assert.equal(order.id, orderId); assert.equal(order.version, 1); assert.ok(Number.isFinite(Date.parse(order.intakeReceivedAt)));
  const stored = h.db.prepare('SELECT intake_received_at,intake_received_by,version FROM orders').get();
  assert.equal(stored.intake_received_at, order.intakeReceivedAt); assert.equal(stored.intake_received_by, stranger); assert.equal(stored.version, 1);
  const adminOrder = (await (await h.get('admin')).json()).orders[0];
  assert.equal(adminOrder.intakeReceivedAt, order.intakeReceivedAt);
  assert.ok(!('intake_received_by' in adminOrder)); assert.ok(!('intakeReceivedBy' in adminOrder));
  const audit = h.db.prepare('SELECT * FROM store_audit').get();
  assert.equal(audit.actor_id, stranger); assert.equal(audit.action, 'plan_intake_receipt');
  assert.deepEqual(JSON.parse(audit.details), {from: 'pending', to: 'received', version: 1});
  assert.equal((await h.post('admin/intake', receipt)).status, 409, 'Stale confirmation must not create another audit record');
  const reset = await h.post('admin/intake', {...receipt, status: 'pending', expectedVersion: 1});
  assert.equal(reset.status, 200); assert.equal((await reset.json()).order.intakeReceivedAt, null);
  const reverted = h.db.prepare('SELECT intake_received_at,intake_received_by,version FROM orders').get();
  assert.equal(reverted.intake_received_at, null); assert.equal(reverted.intake_received_by, null); assert.equal(reverted.version, 2);
  const audits = h.db.prepare('SELECT details FROM store_audit ORDER BY rowid').all().map(row => JSON.parse(row.details));
  assert.deepEqual(audits, [{from: 'pending', to: 'received', version: 1}, {from: 'received', to: 'pending', version: 2}]);
});

test('member order presentation includes only receipt timestamp and never the confirming actor', async () => {
  const h = harness(); h.seedOrder();
  const timestamp = '2026-10-09T15:00:00.000Z';
  h.db.prepare('UPDATE orders SET intake_received_at=?,intake_received_by=?').run(timestamp, stranger);
  const data = await (await h.get('me')).json();
  assert.equal(data.orders[0].intakeReceivedAt, timestamp);
  assert.ok(!('intake_received_by' in data.orders[0])); assert.ok(!('intakeReceivedBy' in data.orders[0]));
  assert.doesNotMatch(JSON.stringify(data), new RegExp(stranger));
});

test('purchase email is shown only to store admins for plan orders, independent of current account email', async () => {
  const h = harness({allowed: true}); h.seedOrder(); h.seedOrder({id: otherOrderId, items: [{id: 'mermelada'}]});
  h.db.prepare('UPDATE orders SET plan_contact_email=?').run('purchase@example.invalid');
  h.db.prepare('INSERT INTO member_directory (user_id,email,display_name,updated_at) VALUES (?,?,?,?)').run(owner, 'current@example.invalid', 'Cliente', 'now');
  const adminOrders = (await (await h.get('admin')).json()).orders;
  assert.equal(adminOrders.find(order => order.id === orderId).purchaseEmail, 'purchase@example.invalid');
  assert.equal(adminOrders.find(order => order.id === orderId).email, 'current@example.invalid');
  assert.equal(adminOrders.find(order => order.id === otherOrderId).purchaseEmail, null);
  const memberOrders = (await (await h.get('me')).json()).orders;
  assert.ok(memberOrders.every(order => !('purchaseEmail' in order) && !('plan_contact_email' in order)));
  assert.doesNotMatch(JSON.stringify(memberOrders), /purchase@example\.invalid/);
});

test('concurrent refund, owner, items or version changes prevent receipt and its audit insert', async () => {
  for (const change of [
    db => db.exec("UPDATE orders SET status='refunded'"),
    db => db.prepare('UPDATE orders SET user_id=?').run(stranger),
    db => db.exec("UPDATE orders SET items='[{\"id\":\"mermelada\"}]'"),
    db => db.exec('UPDATE orders SET version=version+1'),
  ]) {
    const h = harness({allowed: true, beforeBatch: change}); h.seedOrder();
    assert.equal((await h.post('admin/intake', receipt)).status, 409);
    assert.equal(h.db.prepare('SELECT intake_received_at FROM orders').get().intake_received_at, null);
    assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
  }
});

test('receipt mutation rolls back if the audit write fails', async () => {
  const h = harness({allowed: true, beforeBatch: db => db.exec("CREATE TRIGGER reject_receipt_audit BEFORE INSERT ON store_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END")});
  h.seedOrder();
  const response = await h.post('admin/intake', receipt);
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /audit unavailable/);
  const order = h.db.prepare('SELECT intake_received_at,intake_received_by,version FROM orders').get();
  assert.equal(order.intake_received_at, null); assert.equal(order.intake_received_by, null); assert.equal(order.version, 0);
  assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n, 0);
});
