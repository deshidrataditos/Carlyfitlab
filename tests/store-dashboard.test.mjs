import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const fixedNow=new Date('2026-10-10T05:59:59.000Z');
const owner='a8939179-3b60-4eba-a864-d40960759974';
const plan=[{id:'rutina-90',quantity:1,unit_price:1490}];
const product=[{id:'galletas',quantity:1,unit_price:59}];
const rangeUrl='https://shop.example/api/store/admin/summary?from=2026-10-09&to=2026-10-09';

function harness({user={id:owner},allowed=true,permissionError=null,authError=null,configured=true}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,user_id TEXT,items TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,amount_cents INTEGER NOT NULL,delivery TEXT NOT NULL,fulfillment_status TEXT NOT NULL,intake_received_at TEXT,estimated_delivery_date TEXT,customer_name TEXT NOT NULL,plan_contact_email TEXT,dessert_selection TEXT);
    CREATE TABLE store_materials(id TEXT PRIMARY KEY,order_id TEXT,user_id TEXT,state TEXT);
    CREATE TABLE member_directory(user_id TEXT PRIMARY KEY,email TEXT);`);
  const calls=[];const permissions=[];
  const statement=(sql,values=[])=>({bind:(...args)=>statement(sql,args),first:async()=>{calls.push({sql,values});return sqlite.prepare(sql).get(...values)??null;},all:async()=>{calls.push({sql,values});return {results:sqlite.prepare(sql).all(...values)};}});
  const db={prepare:statement};
  const session={client:{auth:{getUser:async()=>({data:{user},error:authError})},rpc:async(name)=>{permissions.push(name);return {data:allowed,error:permissionError};}},finish:response=>{response.headers.set('X-Session-Finished','true');return response;}};
  const auth={memberSession:()=>configured?session:null,memberJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}}),memberFailure:error=>Response.json({error:error.status?error.message:'Unavailable'},{status:error.status??503})};
  const cache=new Map();
  function load(path) {
    if(path==='cloudflare:workers')return {env:{DB:db}};if(path.endsWith('supabase-server'))return auth;
    const name=path.replace(/^@\//,'').replace(/^\.\//,'lib/').replace(/\.ts$/,'');if(cache.has(name))return cache.get(name);
    const exports={};cache.set(name,exports);
    const source=ts.transpileModule(readFileSync(new URL(`../${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,require:load,Date,Intl,URL,Request,Response});return exports;
  }
  const helpers=load('lib/store-dashboard');const route=load('app/api/store/admin/summary/route');
  const seed=(update={})=>{
    const row={id:`order-${sqlite.prepare('SELECT count(*) AS n FROM orders').get().n}`,user_id:owner,items:JSON.stringify(plan),status:'approved',created_at:'2026-10-09T12:00:00.000Z',amount_cents:149000,delivery:'digital',fulfillment_status:'received',intake_received_at:null,estimated_delivery_date:null,customer_name:'Cliente',plan_contact_email:'buyer@example.invalid',dessert_selection:null,...update};
    sqlite.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.user_id,row.items,row.status,row.created_at,row.amount_cents,row.delivery,row.fulfillment_status,row.intake_received_at,row.estimated_delivery_date,row.customer_name,row.plan_contact_email,row.dessert_selection);return row.id;
  };
  return {sqlite,db,calls,permissions,helpers,seed,
    get:url=>route.GET(new Request(url??rangeUrl)),
    summary:(url=rangeUrl,date=fixedNow)=>helpers.dashboardSummary(db,url,date),
    find:(filter='all',q='')=>{const query=helpers.dashboardOrderQuery(`https://shop.example/api/store/admin?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`,fixedNow);return sqlite.prepare(`SELECT o.id FROM orders o LEFT JOIN member_directory m ON m.user_id=o.user_id WHERE ${query.sql} ORDER BY o.id`).all(...query.values).map(row=>row.id);},
    material:(order,state='published',userId=owner)=>sqlite.prepare('INSERT INTO store_materials VALUES(?,?,?,?)').run(`material-${sqlite.prepare('SELECT count(*) AS n FROM store_materials').get().n}`,order,userId,state),
  };
}

test('Mexico civil day switches at 06:00 UTC and one-day range uses inclusive local start/exclusive end',()=>{
  const {helpers}=harness();
  assert.equal(helpers.mexicoToday(new Date('2026-10-10T05:59:59Z')),'2026-10-09');
  assert.equal(helpers.mexicoToday(new Date('2026-10-10T06:00:00Z')),'2026-10-10');
  const range=helpers.dashboardRange(rangeUrl,fixedNow);
  assert.deepEqual(JSON.parse(JSON.stringify(range)),{from:'2026-10-09',to:'2026-10-09',start:'2026-10-09T06:00:00.000Z',end:'2026-10-10T06:00:00.000Z'});
  const defaults=helpers.dashboardRange('https://shop.example/summary',fixedNow);assert.equal(defaults.from,'2026-09-10');assert.equal(defaults.to,'2026-10-09');
});

test('dashboard date range rejects impossible, inverted, future and excessive periods',()=>{
  const {helpers}=harness();
  for(const range of ['from=2026-02-30&to=2026-03-01','from=2026-10-09&to=2026-10-08','from=2026-10-09&to=2026-10-10','from=2024-01-01&to=2026-10-09','from=2022-12-31&to=2023-01-01','from=bad&to=2026-10-09','from=2026-1-01&to=2026-10-09','to=invalid']) {
    assert.throws(()=>helpers.dashboardRange(`https://shop.example/?${range}`,fixedNow),error=>error.status===400,range);
  }
  assert.equal(helpers.dashboardRange('https://shop.example/?from=2024-02-29&to=2024-03-01',fixedNow).from,'2024-02-29');
});

test('admin search escapes SQL wildcards, backslashes and quotes while searching verified email sources',()=>{
  const h=harness();h.seed({id:'literal',customer_name:'Cliente 100%_\\ especial'});h.seed({id:'lookalike',customer_name:'Cliente 10000X especial'});
  h.seed({id:'quote',customer_name:"D'Angelo"});h.seed({id:'purchase',plan_contact_email:'purchase@example.invalid'});h.seed({id:'directory',user_id:'other',plan_contact_email:null});
  h.sqlite.prepare('INSERT INTO member_directory VALUES(?,?)').run('other','directory@example.invalid');
  assert.deepEqual(h.find('all','100%_\\'),['literal']);assert.deepEqual(h.find('all',"D'Angelo"),['quote']);
  assert.deepEqual(h.find('all',"' OR 1=1 --"),[]);assert.deepEqual(h.find('all','purchase@'),['purchase']);assert.deepEqual(h.find('all','directory@'),['directory']);
  assert.deepEqual(h.find('all','  literal  '),['literal']);
  const query=h.helpers.dashboardOrderQuery('https://shop.example/?filter=overdue&q=a%25_b',fixedNow);
  assert.equal(query.values[0],'2026-10-09');assert.deepEqual(Array.from(query.values.slice(1)),Array(4).fill('%a\\%\\_b%'));
});

test('unknown filters, overlong query and control characters cannot reach database search',()=>{
  const {helpers}=harness();
  for(const query of ['filter=unknown',`q=${'a'.repeat(101)}`,'q=client%00name','q=client%0Aname','q=client%7Fname'])assert.throws(()=>helpers.dashboardOrderQuery(`https://shop.example/?${query}`,fixedNow),error=>error.status===400);
});

test('pending filters count only approved applicable orders and validate material ownership',()=>{
  const h=harness();const waiting=h.seed({id:'waiting',estimated_delivery_date:'2026-10-08'});
  const ready=h.seed({id:'ready',intake_received_at:'2026-10-08T12:00:00Z'});h.material(ready);
  const wrongOwner=h.seed({id:'wrong-owner',intake_received_at:'2026-10-08T12:00:00Z'});h.material(wrongOwner,'published','stranger');
  const pendingUpload=h.seed({id:'pending-upload',intake_received_at:'2026-10-08T12:00:00Z'});h.material(pendingUpload,'pending');
  h.seed({id:'pickup',items:JSON.stringify(product),delivery:'pickup',estimated_delivery_date:'2026-10-08'});
  h.seed({id:'delivered',items:JSON.stringify(product),delivery:'pickup',fulfillment_status:'delivered',estimated_delivery_date:'2026-10-08'});
  h.seed({id:'unpaid',status:'pending',delivery:'pickup',estimated_delivery_date:'2026-10-08'});
  h.seed({id:'refunded',status:'refunded',delivery:'pickup',estimated_delivery_date:'2026-10-08'});
  h.seed({id:'guest',user_id:null});h.seed({id:'product',items:JSON.stringify(product)});
  assert.deepEqual(h.find('intake_pending'),[waiting]);assert.deepEqual(h.find('materials_pending'),[pendingUpload,waiting,wrongOwner]);
  assert.deepEqual(h.find('delivery_pending'),['pickup']);assert.deepEqual(h.find('overdue'),['pickup','waiting']);
  assert.equal(h.find('all').length,10);
});

test('overdue uses Mexico today, excludes today and fulfilled orders, and preserves filters when searching',()=>{
  const h=harness();h.seed({id:'old',delivery:'pickup',items:JSON.stringify(product),estimated_delivery_date:'2026-10-08',customer_name:'Busqueda'});
  h.seed({id:'today',delivery:'pickup',items:JSON.stringify(product),estimated_delivery_date:'2026-10-09',customer_name:'Busqueda'});
  h.seed({id:'future',delivery:'pickup',items:JSON.stringify(product),estimated_delivery_date:'2026-10-10'});
  h.seed({id:'none',delivery:'pickup',items:JSON.stringify(product)});h.seed({id:'done',delivery:'pickup',items:JSON.stringify(product),estimated_delivery_date:'2026-10-08',fulfillment_status:'delivered'});
  assert.deepEqual(h.find('overdue','Busqueda'),['old']);
});

test('approved sales respect Mexico date edges, exclude unpaid/reversed orders, and retain historical unit prices',async()=>{
  const h=harness();
  h.seed({id:'before',created_at:'2026-10-09T05:59:59.999Z',items:JSON.stringify(product),amount_cents:5900});
  h.seed({id:'start',created_at:'2026-10-09T06:00:00.000Z',items:JSON.stringify([{id:'galletas',quantity:2,unit_price:42.25}]),amount_cents:8450});
  h.seed({id:'last',created_at:'2026-10-10T05:59:59.999Z',items:JSON.stringify([{id:'rutina-90',quantity:2,unit_price:1200}]),amount_cents:240000});
  h.seed({id:'end',created_at:'2026-10-10T06:00:00.000Z',items:JSON.stringify(product),amount_cents:5900});
  for(const status of ['pending','rejected','cancelled','refunded','charged_back'])h.seed({id:status,status,items:JSON.stringify([{id:'galletas',quantity:20,unit_price:59}]),amount_cents:118000});
  const summary=await h.summary();assert.equal(summary.timeZone,'America/Mexico_City');assert.equal(summary.generatedAt,fixedNow.toISOString());
  assert.equal(summary.totals.approvedOrders,2);assert.equal(summary.totals.approvedAmountCents,248450);
  assert.equal(summary.products[0].quantity,2);assert.equal(summary.products[0].amountCents,8450);assert.equal(summary.products[0].name,'Psi Cookie');
  assert.equal(summary.plans[0].quantity,2);assert.equal(summary.plans[0].amountCents,240000);
  assert.equal(summary.statuses.find(row=>row.status==='approved').count,2);assert.equal(summary.statuses.find(row=>row.status==='refunded').count,1);
});

test('dessert pack counts the paid plan once and only separately purchased products in sales ranking',async()=>{
  const h=harness();h.seed({id:'pack',items:JSON.stringify([{id:'dulce-90',quantity:2,unit_price:2990},{id:'galletas',quantity:3,unit_price:59}]),amount_cents:615700,
    dessert_selection:JSON.stringify([{id:'galletas',quantity:8},{id:'cheesecake-carlyfit',quantity:2}])});
  const summary=await h.summary();assert.equal(summary.totals.approvedOrders,1);assert.equal(summary.totals.approvedAmountCents,615700);
  assert.equal(summary.plans.length,1);assert.equal(summary.plans[0].id,'dulce-90');assert.equal(summary.plans[0].quantity,2);assert.equal(summary.plans[0].amountCents,598000);
  assert.equal(summary.products.length,1);assert.equal(summary.products[0].id,'galletas');assert.equal(summary.products[0].quantity,3);assert.equal(summary.products[0].amountCents,17700);
  assert.equal(summary.products.some(row=>row.id==='cheesecake-carlyfit'),false);
});

test('malformed and scalar stored JSON never break dashboard or invent plan quantities',async()=>{
  const h=harness();
  const invalid=['bad','"text"','1','null','{}','["text",true,null,4]',JSON.stringify([{id:'rutina-90',quantity:0,unit_price:1490}]),JSON.stringify([{id:'rutina-90',quantity:'1',unit_price:1490}]),JSON.stringify([{id:'rutina-90',quantity:-1,unit_price:1490}])];
  for(const [index,items] of invalid.entries())h.seed({id:`invalid-${index}`,items,amount_cents:0});
  assert.deepEqual(h.find('intake_pending'),[]);assert.deepEqual(h.find('materials_pending'),[]);
  const result=await h.summary();assert.equal(result.plans.length,0);assert.equal(result.products.length,0);assert.equal(result.totals.approvedAmountCents,0);
});

test('summary separates global pending work from sales period and exposes no private customer records',async()=>{
  const h=harness();h.seed({id:'old-private-order',created_at:'2026-09-01T12:00:00.000Z',plan_contact_email:'private-buyer@example.invalid',customer_name:'Private person'});
  const summary=await h.summary();assert.equal(summary.pending.intakePending,1);assert.equal(summary.pending.materialsPending,1);assert.equal(summary.totals.approvedOrders,0);
  const serialized=JSON.stringify(summary);assert.doesNotMatch(serialized,/private-buyer|Private person|old-private-order|customer_name|plan_contact_email/);
});

test('summary route authorizes server-verified session and admin permission before any aggregate queries',async()=>{
  for(const [options,status] of [[{user:null},401],[{user:{id:owner,is_anonymous:true}},403],[{allowed:false},403],[{permissionError:{message:'private permission failure'}},503],[{configured:false},503],[{authError:{status:401}},401]]) {
    const h=harness(options);const response=await h.get(`${rangeUrl}&user_id=${owner}&admin=true`);assert.equal(response.status,status);assert.equal(h.calls.length,0);
    assert.doesNotMatch(await response.text(),/private permission failure/);
  }
  const h=harness();h.seed();const response=await h.get();assert.equal(response.status,200);assert.equal(h.calls.length,4);
  assert.deepEqual(h.permissions,['can_manage_store']);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Vary'),'Cookie');assert.equal(response.headers.get('X-Session-Finished'),'true');
});

test('invalid summary ranges fail after authorization but before database reads',async()=>{
  const h=harness();const response=await h.get('https://shop.example/api/store/admin/summary?from=2026-02-30&to=2026-03-01');
  assert.equal(response.status,400);assert.deepEqual(h.permissions,['can_manage_store']);assert.equal(h.calls.length,0);
});
