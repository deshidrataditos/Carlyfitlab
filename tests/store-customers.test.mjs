import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const admin='a8939179-3b60-4eba-a864-d40960759974';
const customerId=index=>`b8939179-3b60-4eba-a864-${String(index).padStart(12,'0')}`;
const registration=(index,extra={})=>({id:customerId(index),display_name:`Cliente ${index}`,email:`customer${index}@example.invalid`,created_at:'2026-10-09T10:00:00Z',...extra});
const restriction=(userId,extra={})=>({user_id:userId,is_suspended:false,reason:null,updated_at:null,version:0,can_suspend:true,...extra});
const activeRestriction={suspended:false,reason:null,updatedAt:null,version:0,canSuspend:true};
const suspendInput={userId:customerId(1),suspended:true,reason:'Uso indebido del asistente',expectedVersion:0};

function harness({user={id:admin},allowed=true,permissionError=null,authError=null,configured=true,rows=[registration(1)],directoryError=null,restrictionError=null,restrictions,setError=null,setRows}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE orders(id TEXT PRIMARY KEY,user_id TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,amount_cents INTEGER NOT NULL,customer_name TEXT,plan_contact_email TEXT,items TEXT,fulfillment_note TEXT);');
  const calls=[];const rpcs=[];
  const statement=(sql,values=[])=>({bind:(...args)=>statement(sql,args),all:async()=>{calls.push({sql,values});return {results:sqlite.prepare(sql).all(...values)};}});
  const db={prepare:statement};
  const session={client:{auth:{getUser:async()=>({data:{user},error:authError})},rpc:async(name,args)=>{
    rpcs.push({name,args});
    if(name==='can_manage_store')return {data:allowed,error:permissionError};
    if(name==='list_store_customer_restrictions')return {data:restrictions===undefined?args.p_user_ids.map(id=>restriction(id)):restrictions,error:restrictionError};
    if(name==='set_store_customer_restriction')return {data:setRows===undefined?[restriction(args.p_user_id,{is_suspended:args.p_suspended,reason:args.p_reason,updated_at:'2026-10-09T14:00:00Z',version:args.p_expected_version+1})]:setRows,error:setError};
    assert.equal(name,'list_store_customers');return {data:rows,error:directoryError};
  }},finish:response=>{response.headers.set('X-Session-Finished','true');return response;}};
  const auth={memberSession:()=>configured?session:null,memberJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}}),memberFailure:error=>{const known=error instanceof load('lib/member-input').MemberInputError;return Response.json({error:known?error.message:'Unavailable'},{status:known?error.status:503,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});}};
  const cache=new Map();
  function load(path) {
    if(path==='cloudflare:workers')return {env:{DB:db}};if(path.endsWith('supabase-server'))return auth;
    const name=path.replace(/^@\//,'').replace(/^\.\//,'lib/').replace(/\.ts$/,'');if(cache.has(name))return cache.get(name);
    const exports={};cache.set(name,exports);
    const source=ts.transpileModule(readFileSync(new URL(`../${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,require:load,Date,URL,Request,Response,Set,Map,TextDecoder,Uint8Array});return exports;
  }
  const helpers=load('lib/store-customers');const route=load('app/api/store/admin/customers/route');
  const seed=(extra={})=>{
    const row={id:`order-${sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n}`,user_id:customerId(1),status:'approved',created_at:'2026-10-09T12:00:00Z',amount_cents:149000,customer_name:'Private order customer',plan_contact_email:'private@example.invalid',items:'[{"id":"secret-plan"}]',fulfillment_note:'Private delivery note',...extra};
    sqlite.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.user_id,row.status,row.created_at,row.amount_cents,row.customer_name,row.plan_contact_email,row.items,row.fulfillment_note);
  };
  return {sqlite,helpers,calls,rpcs,seed,get:(query='')=>route.GET(new Request(`https://carlyfitlab.com/api/store/admin/customers${query}`)),post:(input=suspendInput,{origin='https://carlyfitlab.com',contentType='application/json',raw=false}={})=>route.POST(new Request('https://carlyfitlab.com/api/store/admin/customers',{method:'POST',headers:{...(origin!==null?{Origin:origin}:{}),'Content-Type':contentType},body:raw?input:JSON.stringify(input)}))};
}

test('registered customer without any order remains listed with zero totals',async()=>{
  const h=harness();const response=await h.get();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{customers:[{id:customerId(1),displayName:'Cliente 1',email:'customer1@example.invalid',registeredAt:'2026-10-09T10:00:00Z',orderCount:0,approvedOrderCount:0,approvedAmountCents:0,lastOrderAt:null,restriction:activeRestriction}],hasMore:false});
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Vary'),'Cookie');assert.equal(response.headers.get('X-Session-Finished'),'true');
});

test('directory requires verified nonanonymous session and store-admin role before RPC or orders',async()=>{
  for(const [options,status] of [[{user:null},401],[{user:{id:admin,is_anonymous:true}},403],[{allowed:false},403],[{allowed:false,user:{id:admin,user_metadata:{role:'admin',canManageStore:true}}},403],[{permissionError:{message:'Private permission detail'}},503],[{configured:false},503],[{authError:{status:401}},401]]) {
    const h=harness(options);const response=await h.get('?admin=true&user_id='+admin+'&q='+('x'.repeat(101)));
    assert.equal(response.status,status);assert.equal(h.calls.length,0);assert.equal(h.rpcs.some(call=>call.name==='list_store_customers'),false);
    assert.doesNotMatch(await response.text(),/Private permission detail/);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  }
});

test('permission revoked at protected RPC fails closed without querying D1 or leaking errors',async()=>{
  const h=harness({directoryError:{code:'42501',message:'Private directory forbidden'}});const response=await h.get();
  assert.equal(response.status,403);assert.deepEqual(h.rpcs.map(call=>call.name),['can_manage_store','list_store_customers']);assert.equal(h.calls.length,0);
  assert.doesNotMatch(await response.text(),/Private directory forbidden|customer1/);
});

test('only exact registered user IDs associate orders, never guest or another account email matches',async()=>{
  const h=harness({rows:[registration(1),registration(2)]});
  h.seed({user_id:null,plan_contact_email:'customer1@example.invalid',amount_cents:75000});
  h.seed({user_id:customerId(9),plan_contact_email:'customer1@example.invalid',amount_cents:75000});
  h.seed({user_id:customerId(1),plan_contact_email:'changed-email@example.invalid',amount_cents:5900});
  const data=await (await h.get()).json();assert.equal(data.customers[0].orderCount,1);assert.equal(data.customers[0].approvedAmountCents,5900);assert.equal(data.customers[1].orderCount,0);
  assert.deepEqual(Array.from(h.calls[0].values),[customerId(1),customerId(2)]);assert.doesNotMatch(h.calls[0].sql,/email|customer_name|items|fulfillment_note/);
});

test('order totals count every status, sum only approved historical amounts, and expose only aggregates',async()=>{
  const h=harness();h.seed({amount_cents:5900});h.seed({amount_cents:5500});
  for(const status of ['pending','rejected','cancelled','refunded','charged_back'])h.seed({status,amount_cents:999999,created_at:'2026-10-10T01:00:00Z'});
  const data=await (await h.get()).json();const customer=data.customers[0];
  assert.equal(customer.orderCount,7);assert.equal(customer.approvedOrderCount,2);assert.equal(customer.approvedAmountCents,11400);assert.equal(customer.lastOrderAt,'2026-10-10T01:00:00Z');
  assert.doesNotMatch(JSON.stringify(data),/Private order|Private delivery|secret-plan|private@example|fulfillment_note|plan_contact_email/);
});

test('page uses 21-row sentinel, returns only 20 and queries totals for only visible accounts',async()=>{
  const h=harness({rows:Array.from({length:21},(_,i)=>registration(i+1))});
  const response=await h.get('?offset=40&q=  Ana%25_%5C  ');const data=await response.json();
  assert.equal(data.customers.length,20);assert.equal(data.hasMore,true);assert.equal(data.customers.at(-1).id,customerId(20));
  assert.deepEqual(JSON.parse(JSON.stringify(h.rpcs[1])),{name:'list_store_customers',args:{p_search:'Ana%_\\',p_limit:21,p_offset:40}});
  assert.equal(h.calls[0].values.length,20);assert.equal(h.calls[0].values.includes(customerId(21)),false);
});

test('empty directory does not query orders and nullable email remains null',async()=>{
  const empty=harness({rows:[]});assert.deepEqual(await (await empty.get()).json(),{customers:[],hasMore:false});assert.equal(empty.calls.length,0);
  const nullable=harness({rows:[registration(1,{email:null,display_name:'Cliente Carlyfit'})]});const data=await (await nullable.get()).json();assert.equal(data.customers[0].email,null);
});

test('search and pagination are bounded before directory RPC, with literal search passed as data',async()=>{
  for(const query of [`?q=${'x'.repeat(101)}`,'?q=a%00b','?q=a%0Ab','?q=a%7Fb','?offset=-1','?offset=1.2','?offset=1e2','?offset=001','?offset=100001','?offset=999999999999','?offset=Infinity']) {
    const h=harness();const response=await h.get(query);assert.equal(response.status,400,query);assert.deepEqual(h.rpcs.map(call=>call.name),['can_manage_store']);assert.equal(h.calls.length,0);
  }
  const h=harness();const needle="' OR 1=1 --";assert.equal((await h.get('?q='+encodeURIComponent(needle)+'&offset=100000')).status,200);
  assert.equal(h.rpcs[1].args.p_search,needle);assert.equal(h.rpcs[1].args.p_offset,100000);
});

test('unexpected RPC fields cannot leak and malformed directory results fail closed',async()=>{
  const h=harness({rows:[registration(1,{encrypted_password:'do-not-leak',raw_user_meta_data:{private:true},provider_token:'do-not-leak'})]});
  assert.doesNotMatch(await (await h.get()).text(),/encrypted_password|do-not-leak|raw_user_meta_data|provider_token/);
  for(const rows of [null,{},Array.from({length:22},(_,i)=>registration(i+1)),[registration(1),registration(1)],[registration(1,{id:"' OR 1=1 --"})],[registration(1,{created_at:'invalid'})],[registration(1,{email:{secret:true}})]]) {
    const invalid=harness({rows});assert.equal((await invalid.get()).status,503);assert.equal(invalid.calls.length,0);
  }
});

test('valid profile names use Unicode codepoints rather than UTF-16 units',async()=>{
  const name='👩'.repeat(80);const h=harness({rows:[registration(1,{display_name:name})]});
  const response=await h.get();assert.equal(response.status,200);assert.equal((await response.json()).customers[0].displayName,name);
  const invalid=harness({rows:[registration(1,{display_name:name+'A'})]});assert.equal((await invalid.get()).status,503);assert.equal(invalid.calls.length,0);
});

test('directory includes bounded admin-only restriction details but never audit internals',async()=>{
  const h=harness({restrictions:[restriction(customerId(1),{is_suspended:true,reason:'Mensajes ofensivos reiterados',updated_at:'2026-10-09T15:00:00Z',version:2,can_suspend:false,actor_email:'private@example.invalid',audit:'PRIVATE_AUDIT'})]});
  const response=await h.get();assert.equal(response.status,200);const data=await response.json();
  assert.deepEqual(data.customers[0].restriction,{suspended:true,reason:'Mensajes ofensivos reiterados',updatedAt:'2026-10-09T15:00:00Z',version:2,canSuspend:false});
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE_AUDIT|actor_email|private@example/);
  assert.deepEqual(Array.from(h.rpcs[2].args.p_user_ids),[customerId(1)]);
});

test('restriction directory failures or missing, duplicate, unrelated rows fail closed before order reads',async()=>{
  for(const [options,status] of [
    [{restrictionError:{code:'42501',message:'PRIVATE_REASON'}},403],
    [{restrictionError:{message:'PRIVATE_REASON'}},503],
    ...[null,[],[restriction(customerId(2))],[restriction(customerId(1)),restriction(customerId(1))],[restriction(customerId(1),{version:0,is_suspended:true})],[restriction(customerId(1),{can_suspend:'true'})],[restriction(customerId(1),{version:1,reason:'Motivo válido',updated_at:'bad'})]].map(restrictions=>[{restrictions},503]),
  ]) {
    const h=harness(options);const response=await h.get();assert.equal(response.status,status);assert.equal(h.calls.length,0);assert.doesNotMatch(await response.text(),/PRIVATE_REASON|customer1/);
  }
});

test('suspending and reactivating use protected RPC and current version; orders are not mutated',async()=>{
  for(const suspended of [true,false]) {
    const h=harness();h.seed();const before=h.sqlite.prepare('SELECT * FROM orders').all();
    const response=await h.post({...suspendInput,suspended,reason:'  Motivo de la revisión  ',expectedVersion:3,actorId:'attacker',email:'ignored@example.invalid'});
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Vary'),'Cookie');
    assert.equal(response.headers.get('X-Session-Finished'),'true');
    assert.deepEqual(await response.json(),{userId:customerId(1),restriction:{suspended,reason:'Motivo de la revisión',updatedAt:'2026-10-09T14:00:00Z',version:4,canSuspend:true}});
    assert.deepEqual(JSON.parse(JSON.stringify(h.rpcs)),[{name:'can_manage_store'},{name:'set_store_customer_restriction',args:{p_user_id:customerId(1),p_suspended:suspended,p_reason:'Motivo de la revisión',p_expected_version:3}}]);
    assert.deepEqual(h.sqlite.prepare('SELECT * FROM orders').all(),before);assert.equal(h.calls.length,0);
  }
});

test('restriction writes require origin, verified session, and admin before mutation',async()=>{
  for(const [options,status] of [[{user:null},401],[{user:{id:admin,is_anonymous:true}},403],[{allowed:false},403],[{permissionError:{message:'PRIVATE_ERROR'}},503],[{authError:{status:500}},503],[{configured:false},503]]) {
    const h=harness(options);const response=await h.post();assert.equal(response.status,status);assert.equal(h.rpcs.some(c=>c.name==='set_store_customer_restriction'),false);assert.equal(h.calls.length,0);
  }
  for(const origin of [null,'https://attacker.invalid','null']) {
    const h=harness();assert.equal((await h.post(suspendInput,{origin})).status,403);assert.equal(h.rpcs.length,0);
  }
});

test('restriction writes bound inputs and cannot choose audit identity or use stale versions',async()=>{
  for(const input of [
    {...suspendInput,userId:'invalid'}, {...suspendInput,suspended:'true'},
    ...['','abcd','x'.repeat(501),'motivo\nprivado'].map(reason=>({...suspendInput,reason})),
    ...[-1,0.5,'0',2147483647,null].map(expectedVersion=>({...suspendInput,expectedVersion})),
  ]) {
    const h=harness();assert.equal((await h.post(input)).status,400);assert.equal(h.rpcs.some(c=>c.name==='set_store_customer_restriction'),false);
  }
  const unicode=harness();assert.equal((await unicode.post({...suspendInput,reason:'📝'.repeat(500)})).status,200);
  for(const [code,status] of [['42501',403],['40001',409],['22023',400],['P0002',404],['XX000',503]]) {
    const h=harness({setError:{code,message:'PRIVATE_DATABASE_ERROR'}});const response=await h.post();assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/PRIVATE_DATABASE_ERROR/);
  }
  for(const setRows of [[],null,[restriction(customerId(2))],[restriction(customerId(1))],[restriction(customerId(1),{is_suspended:true,reason:'Motivo válido',updated_at:'2026-10-09T15:00:00Z',version:0})]]) {
    const h=harness({setRows});assert.equal((await h.post()).status,503);
  }
});

test('restriction writes reject invalid request formats before mutation',async()=>{
  for(const [input,options,status] of [[suspendInput,{contentType:'text/plain'},415],['{',{raw:true},400],[[],{},400],[{...suspendInput,reason:'x'.repeat(9000)},{},413]]) {
    const h=harness();assert.equal((await h.post(input,options)).status,status);assert.equal(h.rpcs.some(c=>c.name==='set_store_customer_restriction'),false);
  }
});
