import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {loadProductModule} from './load-product-module.mjs';

const orderId='12345678-1234-1234-1234-123456789abc';
const otherId='22345678-1234-1234-1234-123456789abc';
const actor='32345678-1234-1234-1234-123456789abc';
const now=()=>Math.floor(Date.now()/1000);
function harness({user={id:actor},admin=true,provider,sellerMatches=true,beforeBatch}={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const migration of ['0000_abandoned_darwin.sql','0001_payment_update_timestamp.sql','0002_store_portal.sql','0009_product_availability.sql'])sqlite.exec(readFileSync(new URL(`../drizzle/${migration}`,import.meta.url),'utf8'));
  const sql=[],calls=[];const cache=new Map();
  const statement=(query,values=[])=>{
    const run=()=>{sql.push(query);return sqlite.prepare(query).run(...values);};
    return {bind:(...args)=>statement(query,args),execute:run,run:async()=>({meta:{changes:Number(run().changes)}}),first:async()=>{sql.push(query);return sqlite.prepare(query).get(...values)??null;},all:async()=>{sql.push(query);return {results:sqlite.prepare(query).all(...values)};}};
  };
  const DB={prepare:statement,batch:async statements=>{
    beforeBatch?.(sqlite);sqlite.exec('BEGIN');try{const result=statements.map(value=>({meta:{changes:Number(value.execute().changes)}}));sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  const payment={webhookConfig:()=>({token:'test',collectorId:'9001',live:false}),sellerEnvironmentMatches:async()=>sellerMatches,mpRequest:async(_config,path)=>{
    calls.push(path);if(provider)return provider(path);
    return path.startsWith('/checkout/preferences/')?{id:'preference',collector_id:9001,external_reference:orderId,expires:true,expiration_date_to:new Date((now()-86401)*1000).toISOString()}:{paging:{total:0},results:[]};
  }};
  function load(name){
    const normalized=name.replace(/^\.\//,'');if(['catalog','product-options','dessert-pack'].includes(normalized))return loadProductModule(normalized);
    if(normalized==='payment')return payment;
    if(cache.has(normalized))return cache.get(normalized);
    const exports={};cache.set(normalized,exports);
    const source=ts.transpileModule(readFileSync(new URL(`../lib/${normalized}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,require:load,Date,Intl,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,Error});return exports;
  }
  const helpers=load('product-availability'),input=load('member-input');
  const session={finish:response=>response};
  const exports={};const dependencies={
    'cloudflare:workers':{env:{DB}},'@/lib/member-input':input,'@/lib/product-availability':helpers,
    '@/lib/supabase-server':{memberSession:()=>session,memberJson:body=>Response.json(body)},
    '@/lib/store-input':{storeId:value=>{if(typeof value!=='string'||!/^[-a-f0-9]{36}$/.test(value))throw new input.MemberInputError('Invalid ID');return value;}},
    '@/lib/store-server':{requireStoreUser:async()=>{if(!user||user.is_anonymous)throw new input.MemberInputError('Denied',401);return {user};},requireStoreAdmin:async()=>{if(!admin)throw new input.MemberInputError('Denied',403);},storeDatabase:()=>DB,storeFailure:(_session,error)=>Response.json({error:error.message},{status:error.status??503})},
  };
  const source=ts.transpileModule(readFileSync(new URL('../app/api/store/availability/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,require:name=>dependencies[name],URL,Response,Error});
  const seed=(id=orderId)=>sqlite.prepare("INSERT INTO orders(id,items,amount_cents,delivery,customer_name,status,created_at) VALUES (?,'[]',100,'pickup','Test','pending',?)").run(id,new Date().toISOString());seed();
  const reserve=(items=[{id:'galletas',quantity:1}],id=orderId)=>helpers.reserveProductAvailability(DB,id,items);
  const row=(id='galletas')=>sqlite.prepare('SELECT * FROM product_availability WHERE product_id=?').get(id);
  const reservation=(id=orderId)=>sqlite.prepare('SELECT * FROM product_reservations WHERE order_id=?').get(id);
  const approve=async(id=orderId)=>{sqlite.prepare("UPDATE orders SET status='approved' WHERE id=?").run(id);await helpers.reconcileProductReservation(DB,id);};
  const expired=()=>{sqlite.prepare("UPDATE product_reservations SET created_at=?,expires_at=?,state='expired' WHERE order_id=?").run(now()-172802,now()-86402,orderId);sqlite.prepare("UPDATE orders SET preference_id='preference' WHERE id=?").run(orderId);};
  const get=(query='')=>exports.GET(new Request(`https://site.example/api/store/availability${query}`));
  const post=(body,origin='https://site.example')=>exports.POST(new Request('https://site.example/api/store/availability',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {sqlite,DB,helpers,input,sql,calls,seed,reserve,row,reservation,approve,expired,get,post};
}

test('defaults never invent stock, cakes are made to order, and public availability omits internal counts',async()=>{
  const h=harness();const response=await h.get();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=await response.json();assert.equal(data.timeZone,'America/Mexico_City');
  for(const row of data.products){assert.equal(row.remaining,null);assert.equal(row.maxPerOrder,null);assert.equal(row.capacity,undefined);assert.equal(row.reserved,undefined);assert.equal(row.committed,undefined);}
  for(const id of ['pastel-zanahoria','pastel-zanahoria-grande','cheesecake-carlyfit','cheesecake-carlyfit-grande']){const row=data.products.find(row=>row.id===id);assert.equal(row.status,'made_to_order');assert.equal(row.leadDays,3);}
  assert.equal(data.products.find(row=>row.id==='presencial-mensual').status,'sold_out');
});

test('real pack pieces plus paid units reserve the same SKU; presentations stay independent',async()=>{
  const h=harness();const items=h.helpers.reservationItems([{id:'dulce-90',quantity:1},{id:'galletas',quantity:2}],[{id:'galletas',quantity:4},{id:'pastel-zanahoria',quantity:1}]);
  assert.equal(items.find(item=>item.id==='galletas').quantity,6);await h.reserve(items);
  assert.equal(h.row().held,6);assert.equal(h.row('pastel-zanahoria').held,1);assert.equal(h.row('pastel-zanahoria-grande').held,0);assert.equal(h.row('dulce-90').held,1);
});

test('multi-product reservations roll back entirely when any SKU is sold out or over its per-order maximum',async()=>{
  for(const setting of ["status='sold_out'",'max_per_order=1']){
    const h=harness();h.sqlite.exec(`UPDATE product_availability SET ${setting} WHERE product_id='mermelada'`);
    await assert.rejects(h.reserve([{id:'galletas',quantity:2},{id:'mermelada',quantity:2}]),error=>error.status===409);
    assert.equal(h.reservation(),undefined);assert.equal(h.row().held,0);assert.equal(h.row('mermelada').held,0);
  }
});

test('two concurrent checkouts cannot reserve the last unit twice; repeated order IDs cannot double reserve',async()=>{
  const h=harness();h.seed(otherId);h.sqlite.exec("UPDATE product_availability SET capacity=1 WHERE product_id='galletas'");
  const results=await Promise.allSettled([h.reserve(),h.reserve(undefined,otherId)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(h.row().held,1);
  const id=h.sqlite.prepare('SELECT order_id FROM product_reservations').get().order_id;
  await assert.rejects(h.reserve(undefined,id));assert.equal(h.row().held,1);
});

test('only stored approval commits capacity; replays and refunds never double consume or restock',async()=>{
  const h=harness();await h.reserve();await h.helpers.reconcileProductReservation(h.DB,orderId);assert.equal(h.row().committed,0);
  await h.approve();await h.approve();assert.equal(h.row().held,0);assert.equal(h.row().committed,1);
  h.sqlite.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(orderId);await h.helpers.reconcileProductReservation(h.DB,orderId);
  assert.equal(h.row().committed,1);assert.equal(h.reservation().state,'committed');
});

test('local expiry never frees stock; verified expired preference and complete terminal payment search do',async()=>{
  const h=harness();await h.reserve();h.expired();await h.helpers.expireProductReservations(h.DB);assert.equal(h.row().held,1);
  await h.helpers.reviewProductReservation(h.DB,orderId);assert.equal(h.reservation().state,'released');assert.equal(h.row().held,0);
  assert.ok(h.calls[1].includes(`external_reference=${orderId}`));
});

test('late approval of a held reservation preserves capacity; after safe release it flags conflict without overselling',async()=>{
  const held=harness();await held.reserve();held.expired();await held.approve();assert.equal(held.row().committed,1);assert.equal(held.row().held,0);
  const h=harness();h.sqlite.exec("UPDATE product_availability SET capacity=1 WHERE product_id='galletas'");await h.reserve();h.expired();await h.helpers.reviewProductReservation(h.DB,orderId);
  h.seed(otherId);await h.reserve(undefined,otherId);await h.approve();
  assert.equal(h.reservation().state,'conflict');assert.equal(h.sqlite.prepare('SELECT availability_status FROM orders WHERE id=?').get(orderId).availability_status,'conflict');assert.equal(h.row().held,1);assert.equal(h.row().committed,0);
});

test('late payment sets conflict in the same SQL update before any webhook follow-up can run',async()=>{
  const h=harness();await h.reserve();h.expired();await h.helpers.reviewProductReservation(h.DB,orderId);
  h.sqlite.prepare("UPDATE orders SET status='approved' WHERE id=?").run(orderId);
  assert.equal(h.sqlite.prepare('SELECT availability_status FROM orders WHERE id=?').get(orderId).availability_status,'conflict');assert.equal(h.reservation().state,'conflict');assert.equal(h.row().held,0);assert.equal(h.row().committed,0);
});

test('pending/approved/unknown payments, incomplete search and mismatched preferences never release capacity',async()=>{
  const variants=[...['pending','in_process','authorized','approved','refunded','charged_back','unknown'].map(status=>({paging:{total:1},results:[{external_reference:orderId,collector_id:9001,status}]})),{paging:{total:2},results:[]},{results:[]}];
  for(const search of variants){
    const h=harness({provider:path=>path.startsWith('/checkout/preferences/')?{id:'preference',collector_id:9001,external_reference:orderId,expires:true,expiration_date_to:new Date((now()-86401)*1000).toISOString()}:search});await h.reserve();h.expired();await h.helpers.reviewProductReservation(h.DB,orderId);assert.equal(h.row().held,1);
  }
  const h=harness({provider:()=>({id:'other',expires:true})});await h.reserve();h.expired();await h.helpers.reviewProductReservation(h.DB,orderId);assert.equal(h.row().held,1);
});

test('ambiguous preference creation and recent expiry are held; definitive rejection can release once',async()=>{
  const h=harness();await h.reserve();await h.helpers.reviewProductReservation(h.DB,orderId);assert.equal(h.calls.length,0);assert.equal(h.row().held,1);
  await h.helpers.releaseRejectedPreference(h.DB,orderId);await h.helpers.releaseRejectedPreference(h.DB,orderId);assert.equal(h.row().held,0);assert.equal(h.reservation().state,'released');
});

test('admin authorization, same-origin and strict input prevent arbitrary capacity writes',async()=>{
  const input={productId:'galletas',status:'available',capacity:10,maxPerOrder:2,expectedVersion:0};
  for(const options of [{user:null},{user:{id:actor,is_anonymous:true}},{admin:false}]){const h=harness(options);assert.ok([401,403].includes((await h.get('?admin=1')).status));assert.ok([401,403].includes((await h.post(input)).status));assert.equal(h.row().capacity,null);}
  const h=harness();assert.equal((await h.post(input,'https://attacker.example')).status,403);
  for(const body of [{...input,actorId:'forged'},{...input,capacity:-1},{...input,maxPerOrder:0},{...input,productId:'unknown'},{...input,expectedVersion:'0'},{...input,status:'unlimited'},{...input,productId:'presencial-mensual'}])assert.equal((await h.post(body)).status,400);
  assert.equal((await h.get('?order=private')).status,400);assert.equal(h.row().capacity,null);
});

test('admin edits use current version and cannot erase allocations; audit is atomic',async()=>{
  const h=harness();const body={productId:'galletas',status:'available',capacity:3,maxPerOrder:2,expectedVersion:0};assert.equal((await h.post(body)).status,200);
  assert.equal(h.sqlite.prepare('SELECT count(*) n FROM store_audit').get().n,1);await h.reserve();
  assert.equal((await h.post({...body,capacity:0,expectedVersion:h.row().version})).status,409);
  assert.equal((await h.post({...body,capacity:10,expectedVersion:0})).status,409);assert.equal(h.row().capacity,3);
  h.sqlite.exec("CREATE TRIGGER fail_availability_audit BEFORE INSERT ON store_audit BEGIN SELECT RAISE(ABORT,'audit failure'); END;");
  assert.equal((await h.post({...body,capacity:10,expectedVersion:h.row().version})).status,503);assert.equal(h.row().capacity,3);
});

test('checkout rate limits are atomic and persist only a hash of the network identity',async()=>{
  const h=harness();const request=new Request('https://site.example/api/checkout',{headers:{'cf-connecting-ip':'203.0.113.10'}});
  for(let i=0;i<5;i++)await h.helpers.limitCheckoutAttempts(h.DB,request,null);
  await assert.rejects(h.helpers.limitCheckoutAttempts(h.DB,request,null),error=>error.status===429);
  assert.equal(h.sqlite.prepare('SELECT count(*) n FROM checkout_attempts').get().n,4);
  for(const {attempts} of h.sqlite.prepare('SELECT attempts FROM checkout_attempts').all())assert.equal(attempts,5,'denied requests cannot drain other quotas');
  for(const {bucket} of h.sqlite.prepare('SELECT bucket FROM checkout_attempts').all())assert.ok(!bucket.includes('203.0.113.10'));
  await assert.rejects(h.helpers.limitCheckoutAttempts(h.DB,new Request('https://site.example'),null),error=>error.status===503);
});

test('global checkout allowance is checked atomically without consuming a new IP allowance',async()=>{
  const h=harness();const start=now()-now()%86400;
  h.sqlite.prepare('INSERT INTO checkout_attempts(bucket,attempts,expires_at) VALUES (?,?,?)').run(`global:86400:${start}`,h.helpers.CHECKOUT_GLOBAL_DAILY_LIMIT,start+86400);
  await assert.rejects(h.helpers.limitCheckoutAttempts(h.DB,new Request('https://site.example',{headers:{'cf-connecting-ip':'203.0.113.90'}}),null),error=>error.status===429);
  assert.equal(h.sqlite.prepare('SELECT count(*) n FROM checkout_attempts').get().n,1);
});

test('the global pending-reservation ceiling cannot be bypassed by a different checkout identity',async()=>{
  const h=harness();h.sqlite.exec("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<1000) INSERT INTO orders(id,items,amount_cents,delivery,customer_name,status,created_at) SELECT 'budget-'||n,'[]',100,'pickup','Test','pending','2026-10-09T00:00:00Z' FROM seq");
  h.sqlite.exec("INSERT INTO product_reservations(order_id,state,created_at,expires_at) SELECT id,'held',unixepoch(),unixepoch()+86400 FROM orders WHERE id LIKE 'budget-%'");
  await assert.rejects(h.reserve(),error=>error.status===409);assert.equal(h.reservation(),undefined);assert.equal(h.row().held,0);
});

test('admin can resolve a late paid conflict only with capacity for every SKU, once and with audit',async()=>{
  const h=harness();h.sqlite.exec("UPDATE product_availability SET capacity=1 WHERE product_id IN ('galletas','mermelada')");
  await h.reserve([{id:'galletas',quantity:1},{id:'mermelada',quantity:1}]);h.expired();await h.helpers.reviewProductReservation(h.DB,orderId);
  h.seed(otherId);await h.reserve([{id:'mermelada',quantity:1}],otherId);await h.approve();
  assert.equal((await h.post({action:'allocate',orderId})).status,409);assert.equal(h.row().committed,0);assert.equal(h.row('mermelada').committed,0);assert.equal(h.reservation().state,'conflict');
  h.sqlite.exec("UPDATE product_availability SET capacity=2 WHERE product_id='mermelada'");
  assert.equal((await h.post({action:'allocate',orderId})).status,200);assert.equal(h.row().committed,1);assert.equal(h.row('mermelada').held,1);assert.equal(h.row('mermelada').committed,1);assert.equal(h.reservation().state,'committed');
  assert.equal((await h.post({action:'allocate',orderId})).status,409);assert.equal(h.row().committed,1);assert.equal(h.sqlite.prepare("SELECT count(*) n FROM store_audit WHERE action='late_payment_capacity'").get().n,1);
});

test('late allocation cannot bypass refunded payment or an audit failure',async()=>{
  const h=harness();await h.reserve();h.expired();await h.helpers.reviewProductReservation(h.DB,orderId);await h.approve();
  h.sqlite.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(orderId);assert.equal((await h.post({action:'allocate',orderId})).status,409);assert.equal(h.row().committed,0);
  h.sqlite.prepare("UPDATE orders SET status='approved' WHERE id=?").run(orderId);
  h.sqlite.exec("CREATE TRIGGER fail_availability_audit BEFORE INSERT ON store_audit BEGIN SELECT RAISE(ABORT,'audit failure'); END;");
  assert.equal((await h.post({action:'allocate',orderId})).status,409);assert.equal(h.reservation().state,'conflict');assert.equal(h.row().committed,0);
});

test('requested dates are optional preferences, use Mexico dates, and validate cake and pack lead times',()=>{
  const {helpers}=harness();const now=new Date('2026-10-10T03:00:00Z');assert.equal(helpers.mexicoToday(now),'2026-10-09');
  const cookie=[{id:'galletas'}],cake=[{id:'pastel-zanahoria-grande'}];
  assert.equal(helpers.requestedDeliveryDate(undefined,cake,now),null);assert.equal(helpers.requestedDeliveryDate('2026-10-09',cookie,now),'2026-10-09');assert.equal(helpers.requestedDeliveryDate('2026-10-12',cake,now),'2026-10-12');
  for(const value of ['2026-10-11','2026-02-30','2026-10-12T00:00:00Z','2028-01-01',4])assert.throws(()=>helpers.requestedDeliveryDate(value,cake,now));
  assert.throws(()=>helpers.requestedDeliveryDate('2026-10-12',[{id:'rutina-90'}],now));
  assert.throws(()=>helpers.requestedDeliveryDate('2026-10-10',helpers.reservationItems([{id:'dulce-90',quantity:1}],[{id:'galletas',quantity:4},{id:'cheesecake-carlyfit',quantity:1}]),now));
});

test('scheduler performs bounded provider checks and keeps unrelated reservations safe on failure',async()=>{
  const h=harness({provider:()=>{throw new Error('provider unavailable');}});await h.reserve();h.expired();await h.helpers.processProductReservations({DB:h.DB});
  assert.equal(h.reservation().state,'expired');assert.ok(h.reservation().next_check_at>now());assert.equal(h.calls.length,1);
  await h.helpers.processProductReservations({DB:h.DB});assert.equal(h.calls.length,1);
});

test('availability presentation fails closed for malformed limits and preserves cake preparation bounds',()=>{
  const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/availability-view.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>loadProductModule('catalog'),Date,Intl});
  const base={id:'galletas',status:'available',remaining:null,maxPerOrder:null,leadDays:0,version:0};assert.equal(exports.availableLimit(base),Infinity);
  for(const update of [{remaining:NaN},{remaining:-1},{remaining:undefined},{maxPerOrder:0},{maxPerOrder:'10'},{status:'invented'}])assert.equal(exports.availableLimit({...base,...update}),0);
  assert.ok(exports.cartAvailabilityError([{id:'galletas',quantity:-1}],[],{galletas:base}));
  assert.doesNotThrow(()=>exports.deliveryDateBounds('invalid',[],null));
  assert.equal(exports.deliveryDateBounds('2026-10-09',[{id:'cheesecake-carlyfit'}],{'cheesecake-carlyfit':{...base,leadDays:0}}).min,'2026-10-12');
});
