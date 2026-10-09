import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const userId = 'a8939179-3b60-4eba-a864-d40960759974';
const now = () => Math.floor(Date.now()/1000);
const iso = seconds => new Date(seconds*1000).toISOString();
const normalUser = () => ({id: userId, email: 'registered@example.invalid', created_at: iso(now()-100), email_confirmed_at: iso(now()-99), app_metadata: {provider: 'google'}, is_anonymous: false});

function harness({provider, timeout = false, template, failSql} = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0005_welcome_email.sql', import.meta.url), 'utf8'));
  const calls = [];
  const sqlCalls = [];
  function statement(sql, values=[]) {
    function run(method) {
      sqlCalls.push({sql, values});
      if (failSql?.(sql, values)) throw new Error('Private SQL failure');
      const result = sqlite.prepare(sql)[method](...values);
      return method === 'run' ? {meta: {changes: Number(result.changes)}} : result ?? null;
    }
    return {bind: (...args) => statement(sql,args), run: async () => run('run'), first: async () => run('get'), all: async () => ({results: run('all')})};
  }
  const bindings = {DB: {prepare: statement}, WELCOME_EMAIL_ENABLED: 'true', WELCOME_EMAIL_START_AT: iso(now()-200), RESEND_API_KEY: 're_server_only_test_key'};
  let currentTemplate = template ?? {subject: 'Bienvenido a Carlyfit Lab', text: 'Hola. Tu cuenta está lista.', html: '<p>Hola. Tu cuenta está lista.</p>'};
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../lib/welcome-email.ts', import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source, {exports, require: path => {assert.equal(path,'./welcome-email-template'); return {buildWelcomeEmail: () => currentTemplate};},
    Date, crypto: webcrypto, AbortController,
    setTimeout: (fn, delay) => {
      if (delay === 600 || timeout) {queueMicrotask(fn); return 0;}
      return setTimeout(fn,delay);
    }, clearTimeout,
    fetch: async (url,options) => {
      calls.push({url,options});
      return provider ? provider({url,options,sqlite,calls}) : Response.json({id: `provider-${calls.length}`});
    },
  });
  const row = (id=userId) => sqlite.prepare('SELECT * FROM welcome_emails WHERE user_id=?').get(id);
  return {sqlite, bindings, calls, sqlCalls, helpers: exports, row, template: value => {currentTemplate=value;},
    enqueue: user => exports.enqueueWelcomeEmail(bindings,user ?? normalUser()),
    deliver: id => exports.deliverWelcomeEmail(bindings,id ?? userId),
    process: () => exports.processWelcomeEmailQueue(bindings),
    due: () => sqlite.exec('UPDATE welcome_emails SET next_attempt_at=unixepoch()-1,lease_until=0'),
  };
}

test('welcome registration fails closed when feature or fixed cutoff is not configured', async () => {
  for (const update of [{WELCOME_EMAIL_ENABLED:'false'}, {WELCOME_EMAIL_START_AT:''}, {WELCOME_EMAIL_START_AT:'yesterday'}, {WELCOME_EMAIL_START_AT:'2026-10-08'}, {DB:undefined}]) {
    const h = harness(); Object.assign(h.bindings,update);
    assert.equal(await h.enqueue(),false);
    assert.equal(h.sqlCalls.length,0);
    assert.equal(h.calls.length,0);
  }
});

test('only newly created verified Google accounts are eligible, never historical or arbitrary identities', async () => {
  for (const change of [
    {created_at:iso(now()-1000)}, {created_at:'invalid'}, {created_at:iso(now()+3600)},
    {email_confirmed_at:undefined}, {email_confirmed_at:'invalid'}, {email_confirmed_at:iso(now()+3600)},
    {is_anonymous:true}, {app_metadata:{}}, {app_metadata:{provider:'email'}}, {id:'attacker'},
    {email:'recipient@example.invalid\r\nBcc: victim@example.invalid'}, {email:'one@example.invalid,two@example.invalid'}, {email:undefined},
  ]) {
    const h = harness();
    assert.equal(await h.enqueue({...normalUser(),...change}),false,JSON.stringify(change));
    assert.equal(h.sqlCalls.length,0);
  }
  const h=harness();
  assert.equal(await h.enqueue({...normalUser(),app_metadata:{provider:'email',providers:['email','google']}}),true);
});

test('enqueue is durable without API key and preserves the original recipient and template across callbacks/deployments', async () => {
  const h = harness(); delete h.bindings.RESEND_API_KEY;
  await h.enqueue();
  const first=h.row();
  h.template({subject:'changed',text:'changed',html:'changed'});
  await h.enqueue({...normalUser(),email:'changed@example.invalid'});
  assert.equal(h.row().payload,first.payload);
  assert.equal(h.row().recipient,first.recipient);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM welcome_emails').get().n,1);
  await h.deliver(); assert.equal(h.calls.length,0);
});

test('delivery uses fixed sender, verified recipient, reply address, server key and stable idempotency', async () => {
  const h = harness(); await h.enqueue();
  await h.deliver();
  assert.equal(h.calls.length,1);
  const {url,options}=h.calls[0];
  assert.equal(url,'https://api.resend.com/emails');
  assert.equal(options.headers.Authorization,'Bearer re_server_only_test_key');
  assert.equal(options.headers['Idempotency-Key'],`carlyfit-welcome-v1:${userId}`);
  assert.deepEqual(JSON.parse(options.body),{from:'Carlyfit Lab <hola@correo.carlyfitlab.com>',to:['registered@example.invalid'],reply_to:'carlyfit.lab@gmail.com',subject:'Bienvenido a Carlyfit Lab',text:'Hola. Tu cuenta está lista.',html:'<p>Hola. Tu cuenta está lista.</p>'});
  assert.equal(h.row().status,'sent');
  assert.equal(h.row().payload,null);
  assert.equal(h.row().recipient,null);
  assert.equal(h.row().provider_id,'provider-1');
  await h.enqueue(); await h.deliver();
  assert.equal(h.calls.length,1,'successful user receipt must never resend');
});

test('concurrent delivery claims allow only one provider request for the same user', async () => {
  let resolve;
  const h = harness({provider:()=>new Promise(done=>{resolve=done;})});
  await Promise.all([h.enqueue(),h.enqueue(),h.enqueue()]);
  const delivery=h.deliver();
  for(let i=0;i<20 && !resolve;i++) await Promise.resolve();
  assert.equal(typeof resolve,'function');
  await Promise.all([h.deliver(),h.deliver(),h.process()]);
  assert.equal(h.calls.length,1);
  resolve(Response.json({id:'accepted'}));
  await delivery;
  assert.equal(h.row().attempts,1);
});

test('transient failure retries identical immutable payload and idempotency key after backoff', async () => {
  const h = harness({provider:({calls})=>calls.length===1 ? new Response('',{status:503}) : Response.json({id:'recovered'})});
  await h.enqueue(); await h.deliver();
  assert.equal(h.row().status,'pending');
  assert.ok(h.row().next_attempt_at >= now()+58);
  await h.deliver(); assert.equal(h.calls.length,1);
  h.template({subject:'new',text:'new',html:'new'}); await h.enqueue();
  h.due(); await h.process();
  assert.equal(h.row().status,'sent');
  assert.equal(h.calls[0].options.body,h.calls[1].options.body);
  assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('rate limits honor Retry-After and permanent recipient/payload failures remove personal data', async () => {
  const h=harness({provider:()=>new Response('',{status:429,headers:{'Retry-After':'1800'}})});
  await h.enqueue(); await h.deliver();
  assert.ok(h.row().next_attempt_at>=now()+1798);
  for (const status of [400,404,422]) {
    const other=harness({provider:()=>new Response('private_provider_error',{status})});
    await other.enqueue(); await other.deliver();
    assert.equal(other.row().status,'failed');
    assert.equal(other.row().payload,null);
    assert.equal(other.row().recipient,null);
    await other.enqueue(); await other.deliver(); assert.equal(other.calls.length,1);
  }
});

test('ambiguous provider timeout remains pending and retries with same idempotency key', async () => {
  const h=harness({timeout:true,provider:({options})=>new Promise((resolve,reject)=>{
    if(options.signal.aborted) reject(new Error('aborted'));
    else options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  })});
  await h.enqueue(); await h.deliver();
  assert.equal(h.row().status,'pending');
  assert.equal(h.row().attempts,1);
  assert.ok(h.calls[0].options.signal.aborted);
  h.due(); await h.deliver();
  assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('ambiguous accepted response is safely retryable and a lost completion write keeps the lease', async () => {
  const ambiguous=harness({provider:()=>new Response('not-json',{status:200})});
  await ambiguous.enqueue(); await ambiguous.deliver();
  assert.equal(ambiguous.row().status,'pending');
  let fail=true;
  const h=harness({failSql:sql=>fail && /provider_id=/.test(sql)});
  await h.enqueue();
  await assert.rejects(h.deliver());
  assert.equal(h.row().status,'pending');
  assert.ok(h.row().lease_until>now());
  await h.deliver(); assert.equal(h.calls.length,1);
  fail=false; h.due(); await h.deliver();
  assert.equal(h.row().status,'sent');
  assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('retry cutoff is measured from first attempt, never from latest retry, and prevents sends after 23 hours', async () => {
  const h=harness({provider:()=>new Response('',{status:503})});
  await h.enqueue(); await h.deliver();
  const first=h.row().first_attempt_at;
  h.due(); await h.deliver();
  assert.equal(h.row().first_attempt_at,first);
  h.sqlite.prepare('UPDATE welcome_emails SET first_attempt_at=unixepoch()-?,lease_until=0,next_attempt_at=0').run(23*3600);
  await h.process(); await h.enqueue(); await h.deliver();
  assert.equal(h.calls.length,2);
  assert.equal(h.row().status,'expired');
  assert.equal(h.row().payload,null);
  assert.equal(h.row().recipient,null);
});

test('maximum attempts and abandoned pre-attempt queues terminate with no retained email', async () => {
  const h=harness({provider:()=>new Response('',{status:500})}); await h.enqueue();
  for(let i=0;i<8;i++){h.due();await h.deliver();}
  assert.equal(h.calls.length,8); assert.equal(h.row().status,'failed'); assert.equal(h.row().recipient,null);
  h.due();await h.deliver();assert.equal(h.calls.length,8);
  const old=harness();await old.enqueue();
  old.sqlite.exec('UPDATE welcome_emails SET created_at=unixepoch()-604801');
  await old.process(); assert.equal(old.calls.length,0);assert.equal(old.row().status,'expired');
});

test('scheduled retries process at most five pending users and keep individual failures isolated', async () => {
  const h=harness();
  for(let i=0;i<7;i++) await h.enqueue({...normalUser(),id:`a8939179-3b60-4eba-a864-d4096075997${i}`});
  await h.process();
  assert.equal(h.calls.length,5);
  assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM welcome_emails WHERE status='pending'").get().n,2);
  await h.process(); assert.equal(h.calls.length,7);
});

test('disabled or misconfigured sending still removes expired pending personal data without sending', async () => {
  for (const config of [{WELCOME_EMAIL_ENABLED:'false'}, {WELCOME_EMAIL_START_AT:''}, {RESEND_API_KEY:''}]) {
    const h=harness();
    await h.enqueue();
    await h.enqueue({...normalUser(),id:'b8939179-3b60-4eba-a864-d40960759974'});
    await h.enqueue({...normalUser(),id:'c8939179-3b60-4eba-a864-d40960759974'});
    h.sqlite.prepare('UPDATE welcome_emails SET created_at=unixepoch()-604801 WHERE user_id=?').run(userId);
    h.sqlite.prepare('UPDATE welcome_emails SET first_attempt_at=unixepoch()-82801,attempts=1 WHERE user_id=?').run('b8939179-3b60-4eba-a864-d40960759974');
    Object.assign(h.bindings,config);
    await h.process();
    assert.equal(h.calls.length,0);
    for (const id of [userId,'b8939179-3b60-4eba-a864-d40960759974']) {
      assert.equal(h.row(id).status,'expired');
      assert.equal(h.row(id).recipient,null);
      assert.equal(h.row(id).payload,null);
    }
    assert.equal(h.row('c8939179-3b60-4eba-a864-d40960759974').status,'pending');
  }
});

test('custom Worker delegates fetch and awaits the scheduled queue runner', async () => {
  const exported={};
  let finishRunner;
  const runner=new Promise(resolve=>{finishRunner=resolve;});
  const received=[];
  const fetch=()=>new Response('site');
  const source=ts.transpileModule(readFileSync(new URL('../workers/store-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports:exported,setTimeout:fn=>{queueMicrotask(fn);return 0;},require:name=>{
    if(name==='vinext/server/fetch-handler')return {default:{fetch}};
    if(name==='../lib/welcome-email')return {processWelcomeEmailQueue:env=>{received.push(env);return runner;}};
    if(name==='../lib/plan-email')return {processPlanEmailQueue:async()=>{}};
    throw new Error(name);
  }});
  assert.equal(exported.default.fetch,fetch);
  const env={DB:{},WELCOME_EMAIL_ENABLED:'false'};
  let finished=false;
  const scheduled=exported.default.scheduled({},env).then(()=>{finished=true;});
  await Promise.resolve();
  assert.equal(received.length,1);
  assert.equal(received[0],env);
  assert.equal(finished,false,'scheduled must not return before cleanup/delivery finishes');
  finishRunner();await scheduled;
  assert.equal(finished,true);
});

function authHarness({user=normalUser(),enqueueError=false,deliveryError=false,getUserError=null}={}) {
  const afterTasks=[]; const queued=[];const delivered=[];
  const session={config:{enabled:true},finish:response=>response,client:{auth:{exchangeCodeForSession:async()=>({error:null}),getUser:async()=>({data:{user},error:getUserError})},
    from:()=>({select:()=>({eq:()=>({single:async()=>({data:{display_name:'Cliente'},error:null}),order:()=>({limit:async()=>({data:[],error:null})})}),order:()=>({limit:async()=>({data:[],error:null})})})}),rpc:async()=>({data:false,error:null})}};
  function load(path) {
    const exports={};
    const source=ts.transpileModule(readFileSync(new URL(`../${path}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,URL,Response,require:name=>{
      if(name==='cloudflare:workers')return {env:{}};
      if(name==='next/server')return {after:fn=>afterTasks.push(fn)};
      if(name.endsWith('welcome-email'))return {enqueueWelcomeEmail:async(_env,value)=>{queued.push(value);if(enqueueError)throw new Error('private enqueue failure');return true;},deliverWelcomeEmail:async(_env,id)=>{delivered.push(id);if(deliveryError)throw new Error('private provider failure');}};
      if(name.endsWith('supabase-server'))return {memberSession:()=>session,memberJson:(data,status=200)=>Response.json(data,{status}),memberFailure:()=>Response.json({error:'Unavailable'},{status:503})};
      if(name.endsWith('member-input'))return {};
      throw new Error(name);
    }});
    return exports;
  }
  return {queued,delivered,afterTasks,callback:()=>load('app/auth/callback/route').GET(new Request('https://carlyfitlab.com/auth/callback?code=google-code&email=attacker@example.invalid')),account:()=>load('app/api/account/route').GET(new Request('https://carlyfitlab.com/api/account?user_id=attacker'))};
}

test('auth callback and account recovery use only verified user and email failures never block account access', async () => {
  for(const endpoint of ['callback','account']) {
    for(const error of [{enqueueError:true},{deliveryError:true},{}]) {
      const h=authHarness(error); const response=await h[endpoint]();
      assert.equal(response.status,endpoint==='callback'?303:200);
      if(endpoint==='callback')assert.match(response.headers.get('Location'),/auth=success/);
      assert.equal(h.queued[0].id,userId);
      assert.equal(h.queued[0].email,'registered@example.invalid');
      for(const run of h.afterTasks) await run();
    }
  }
});

test('anonymous or missing sessions cannot trigger welcome delivery', async()=>{
  for(const user of [null,{...normalUser(),is_anonymous:true}]) {
    for(const endpoint of ['callback','account']) {
      const h=authHarness({user});await h[endpoint]();
      assert.equal(h.queued.length,0);assert.equal(h.afterTasks.length,0);
    }
  }
  for(const endpoint of ['callback','account']) {
    const h=authHarness({getUserError:{status:503}});await h[endpoint]();
    assert.equal(h.queued.length,0);assert.equal(h.afterTasks.length,0);
  }
});
