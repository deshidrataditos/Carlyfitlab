import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const orderId='a8939179-3b60-4eba-a864-d40960759974';
const userId='b8939179-3b60-4eba-a864-d40960759974';
const now=()=>Math.floor(Date.now()/1000);
const iso=seconds=>new Date(seconds*1000).toISOString();
const idAt=i=>`a8939179-3b60-4eba-a864-${String(i).padStart(12,'0')}`;

function harness({provider,timeout=false,failSql,onSql}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE orders(id TEXT PRIMARY KEY,items TEXT NOT NULL,user_id TEXT,created_at TEXT NOT NULL,status TEXT NOT NULL)');
  sqlite.exec(readFileSync(new URL('../drizzle/0006_plan_email.sql',import.meta.url),'utf8'));
  const calls=[];const sqlCalls=[];const delays=[];
  function statement(sql,values=[]) {
    function run(method) {
      sqlCalls.push({sql,values});
      if(failSql?.(sql,values))throw new Error('Private database failure');
      onSql?.(sql,values,sqlite);
      const result=sqlite.prepare(sql)[method](...values);
      return method==='run'?{meta:{changes:Number(result.changes)}}:result??null;
    }
    return {bind:(...args)=>statement(sql,args),run:async()=>run('run'),first:async()=>run('get'),all:async()=>({results:run('all')})};
  }
  const bindings={DB:{prepare:statement},PLAN_EMAIL_ENABLED:'true',PLAN_EMAIL_START_AT:iso(now()-200),RESEND_API_KEY:'re_offline_test_only'};
  let template={subject:'Tu pago está confirmado',text:'Completa tu ficha inicial.',html:'<p>Completa tu ficha inicial.</p>'};
  function load(name) {
    const exports={};
    const source=ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,Date,crypto:webcrypto,AbortController,
      require:path=>path==='./plan-email-template'?{buildPlanEmail:id=>({...template,text:`${template.text} ${id}`})}:load(path.replace('./','')),
      setTimeout:(fn,delay)=>{delays.push(delay);if(delay===600||timeout){queueMicrotask(fn);return 0;}return setTimeout(fn,delay);},clearTimeout,
      fetch:async(url,options)=>{calls.push({url,options});return provider?provider({url,options,sqlite,calls}):Response.json({id:`provider-${calls.length}`});},
    });
    return exports;
  }
  const helpers=load('plan-email');
  const addOrder=(update={})=>{
    const order={id:orderId,items:JSON.stringify([{id:'rutina-90',quantity:1}]),user_id:userId,created_at:iso(now()-100),status:'approved',plan_contact_email:'google@example.invalid',...update};
    sqlite.prepare('INSERT INTO orders(id,items,user_id,created_at,status,plan_contact_email) VALUES(?,?,?,?,?,?)').run(order.id,order.items,order.user_id,order.created_at,order.status,order.plan_contact_email);
    return order.id;
  };
  addOrder();
  return {sqlite,bindings,calls,sqlCalls,delays,helpers,addOrder,
    row:(id=orderId)=>sqlite.prepare('SELECT * FROM plan_emails WHERE order_id=?').get(id),
    update:(sql,...values)=>sqlite.prepare(`UPDATE orders SET ${sql} WHERE id=?`).run(...values,orderId),
    enqueue:(id=orderId)=>helpers.enqueuePlanEmail(bindings,id),deliver:(id=orderId)=>helpers.deliverPlanEmail(bindings,id),
    process:()=>helpers.processPlanEmailQueue(bindings),template:value=>{template=value;},
    due:()=>sqlite.exec('UPDATE plan_emails SET next_attempt_at=unixepoch()-1,lease_until=0'),
  };
}

test('plan email fails closed unless enabled with a fixed UTC cutoff',async()=>{
  for(const change of [{PLAN_EMAIL_ENABLED:'false'},{PLAN_EMAIL_START_AT:''},{PLAN_EMAIL_START_AT:'yesterday'},{PLAN_EMAIL_START_AT:'2026-10-08'},{DB:undefined}]) {
    const h=harness();Object.assign(h.bindings,change);
    assert.equal(await h.enqueue(),false);await h.deliver();
    assert.equal(h.sqlCalls.length,0);assert.equal(h.calls.length,0);
  }
});

test('only approved canonical plans with verified checkout snapshot and linked user are eligible',async()=>{
  const variations=[
    ["status=?",'pending'],["status=?",'rejected'],["status=?",'refunded'],["status=?",'cancelled'],["status=?",'charged_back'],
    ['created_at=?',iso(now()-1000)],['created_at=?','invalid'],['created_at=?',iso(now()+3600)],
    ['user_id=?',null],['user_id=?','arbitrary'],['plan_contact_email=?',null],['plan_contact_email=?','a@example.invalid\r\nBcc: other@example.invalid'],
    ['plan_contact_email=?','one@example.invalid,two@example.invalid'],
    ['items=?','malformed'],['items=?','{}'],['items=?',JSON.stringify([{id:'presencial-mensual',quantity:1}])],
    ['items=?',JSON.stringify([{id:'galletas',quantity:1}])],['items=?',JSON.stringify([{id:'rutina-90',quantity:0}])],
    ['items=?',JSON.stringify([{id:'unknown-plan',title:'Rutina 90 días',quantity:1}])],
  ];
  for(const variation of variations) {
    const h=harness();h.update(...variation);
    assert.equal(await h.enqueue(),false,JSON.stringify(variation));assert.equal(h.row(),undefined);
  }
  for(const id of ['rutina-90','integral-90','dulce-90']) {
    const h=harness();h.update('items=?',JSON.stringify([{id,quantity:1},{id:'galletas',quantity:2}]));
    assert.equal(await h.enqueue(),true);assert.equal(h.row().status,'pending');
  }
});

test('queue persists without provider key and duplicates preserve recipient and complete payload across deployments',async()=>{
  const h=harness();delete h.bindings.RESEND_API_KEY;
  await h.enqueue();const initial=h.row();
  h.template({subject:'changed',html:'changed',text:'changed'});h.update('plan_contact_email=?','new@example.invalid');
  await h.enqueue();await h.deliver();
  assert.equal(h.calls.length,0);assert.equal(h.row().recipient,initial.recipient);assert.equal(h.row().payload,initial.payload);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM plan_emails').get().n,1);
});

test('delivery uses the order email snapshot, fixed sender and stable per-order idempotency, then erases queue PII',async()=>{
  const h=harness();await h.enqueue();await h.deliver();
  assert.equal(h.calls.length,1);
  const {url,options}=h.calls[0];const payload=JSON.parse(options.body);
  assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers.Authorization,'Bearer re_offline_test_only');
  assert.equal(options.headers['Idempotency-Key'],`carlyfit-plan-v1:${orderId}`);
  assert.equal(payload.from,'Carlyfit Lab <hola@correo.carlyfitlab.com>');assert.equal(payload.reply_to,'carlyfit.lab@gmail.com');
  assert.deepEqual(payload.to,['google@example.invalid']);assert.ok(payload.text.includes(orderId));
  assert.equal(h.row().status,'sent');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);
  await h.enqueue();await h.deliver();await h.process();assert.equal(h.calls.length,1);
  const second=h.addOrder({id:idAt(2)});await h.enqueue(second);await h.deliver(second);
  assert.equal(h.calls.length,2,'a new purchase by the same member gets its own email');
  assert.notEqual(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('atomic enqueue and delivery fences handle simultaneous webhooks and scheduler',async()=>{
  let resolve;
  const h=harness({provider:()=>new Promise(done=>{resolve=done;})});
  await Promise.all([h.enqueue(),h.enqueue(),h.enqueue()]);
  const delivery=h.deliver();for(let i=0;i<30&&!resolve;i++)await Promise.resolve();
  assert.equal(typeof resolve,'function');
  await Promise.all([h.deliver(),h.deliver(),h.process()]);assert.equal(h.calls.length,1);
  resolve(Response.json({id:'accepted'}));await delivery;assert.equal(h.row().attempts,1);
});

test('approval is checked again atomically during enqueue',async()=>{
  const h=harness({onSql:(sql,_values,db)=>{if(sql.startsWith('INSERT INTO plan_emails'))db.prepare('UPDATE orders SET status=? WHERE id=?').run('refunded',orderId);}});
  await h.enqueue();assert.equal(h.row(),undefined);await h.deliver();assert.equal(h.calls.length,0);
});

test('refunded, cancelled or charged-back orders cannot send an already queued email',async()=>{
  for(const status of ['refunded','cancelled','charged_back']) {
    const h=harness();await h.enqueue();h.update('status=?',status);await h.deliver();await h.process();
    assert.equal(h.calls.length,0);assert.equal(h.row().status,'cancelled');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);
  }
});

test('pending and rejected orders are held without attempts until a later valid approval',async()=>{
  for(const status of ['pending','rejected','in_process','in_mediation']) {
    const h=harness();await h.enqueue();h.update('status=?',status);await h.deliver();await h.process();
    assert.equal(h.calls.length,0);assert.equal(h.row().attempts,0);assert.equal(h.row().status,'pending');
    h.update('status=?','approved');await h.deliver();assert.equal(h.calls.length,1);assert.equal(h.row().status,'sent');
  }
});

test('a reversal after claim is caught before provider request',async()=>{
  const h=harness({onSql:(sql,_values,db)=>{if(sql.includes('SELECT e.order_id,e.payload'))db.prepare('UPDATE orders SET status=? WHERE id=?').run('refunded',orderId);}});
  await h.enqueue();await h.deliver();assert.equal(h.calls.length,0);assert.equal(h.row().status,'cancelled');assert.equal(h.row().payload,null);
});

test('transient provider failure retries immutable payload after backoff and honors rate limiting',async()=>{
  const h=harness({provider:({calls})=>calls.length===1?new Response('',{status:429,headers:{'Retry-After':'1800'}}):Response.json({id:'recovered'})});
  await h.enqueue();await h.deliver();assert.equal(h.row().status,'pending');assert.ok(h.row().next_attempt_at>=now()+1798);
  await h.deliver();assert.equal(h.calls.length,1);
  h.template({subject:'changed',html:'changed',text:'changed'});await h.enqueue();h.due();await h.process();
  assert.equal(h.row().status,'sent');assert.equal(h.calls[0].options.body,h.calls[1].options.body);
  assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('ambiguous timeout and unreadable success retry safely; permanent provider errors erase PII',async()=>{
  const timed=harness({timeout:true,provider:({options})=>new Promise((resolve,reject)=>{
    if(options.signal.aborted)reject(new Error('aborted'));else options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  })});
  await timed.enqueue();await timed.deliver();assert.equal(timed.row().status,'pending');assert.ok(timed.calls[0].options.signal.aborted);
  for(const provider of [()=>new Response('private invalid json',{status:200}),()=>new Response('',{status:503})]) {
    const h=harness({provider});await h.enqueue();await h.deliver();assert.equal(h.row().status,'pending');
  }
  for(const status of [400,404,422]) {
    const h=harness({provider:()=>new Response('private failure',{status})});await h.enqueue();await h.deliver();
    assert.equal(h.row().status,'failed');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);
    await h.enqueue();await h.deliver();assert.equal(h.calls.length,1);
  }
});

test('lost completion write retains lease and retries identical request within provider idempotency window',async()=>{
  let fail=true;
  const h=harness({failSql:sql=>fail&&/provider_id=/.test(sql)});await h.enqueue();await assert.rejects(h.deliver());
  assert.equal(h.row().status,'pending');assert.ok(h.row().lease_until>now());await h.deliver();assert.equal(h.calls.length,1);
  fail=false;h.due();await h.deliver();assert.equal(h.row().status,'sent');
  assert.equal(h.calls[0].options.body,h.calls[1].options.body);assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('retry window begins at first attempt and ends before idempotency retention expires',async()=>{
  const h=harness({provider:()=>new Response('',{status:503})});await h.enqueue();await h.deliver();const first=h.row().first_attempt_at;
  h.due();await h.deliver();assert.equal(h.row().first_attempt_at,first);
  h.sqlite.exec('UPDATE plan_emails SET first_attempt_at=unixepoch()-82800,lease_until=0,next_attempt_at=0');
  await h.process();await h.enqueue();await h.deliver();assert.equal(h.calls.length,2);assert.equal(h.row().status,'expired');assert.equal(h.row().payload,null);
});

test('maximum attempts and never-attempted stale queues terminate and preserve receipts',async()=>{
  const h=harness({provider:()=>new Response('',{status:500})});await h.enqueue();
  for(let i=0;i<8;i++){h.due();await h.deliver();}
  assert.equal(h.calls.length,8);assert.equal(h.row().status,'failed');assert.equal(h.row().recipient,null);
  await h.enqueue();await h.process();assert.equal(h.calls.length,8);
  const stale=harness();await stale.enqueue();stale.sqlite.exec('UPDATE plan_emails SET created_at=unixepoch()-604801');
  await stale.process();assert.equal(stale.calls.length,0);assert.equal(stale.row().status,'expired');
});

test('scheduler recovers approved orders even if webhook enqueue was lost and sends bounded batches',async()=>{
  const h=harness();for(let i=0;i<7;i++)h.addOrder({id:idAt(i)});
  await h.process();assert.equal(h.calls.length,5);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM plan_emails').get().n,8);
  assert.equal(h.delays.filter(value=>value===600).length,4);
  await h.process();assert.equal(h.calls.length,8);
});

test('recovery skips guest, historical, malformed and non-plan orders without receiving clinical answers',async()=>{
  const h=harness();h.update('status=?','pending');
  const variations=[{items:'invalid'},{items:'["text",null,1,true]'}, {items:'{}'},{items:JSON.stringify([{id:'galletas',quantity:1}])},
    {user_id:null},{plan_contact_email:null},{plan_contact_email:'bad'},{created_at:iso(now()-1000)},{status:'refunded'},
    {items:JSON.stringify([{id:'presencial-mensual',quantity:1}])}];
  for(let i=0;i<variations.length;i++)h.addOrder({id:idAt(i),...variations[i]});
  await h.process();assert.equal(h.calls.length,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM plan_emails').get().n,0);
});

test('bounded recovery cursor advances past invalid candidates and wraps to revisit newly approved orders',async()=>{
  const h=harness();h.update('status=?','pending');delete h.bindings.RESEND_API_KEY;
  for(let i=0;i<26;i++)h.addOrder({id:idAt(i),plan_contact_email:i<25?'invalid':'valid@example.invalid'});
  await h.process();assert.equal(h.row(idAt(25)),undefined);
  await h.process();assert.equal(h.row(idAt(25)).status,'pending');
  h.update('status=?','approved');await h.process();await h.process();assert.equal(h.row().status,'pending');assert.equal(h.calls.length,0);
});

test('cleanup still removes expired or reversed queue PII when feature disabled or provider key unavailable',async()=>{
  for(const change of [{PLAN_EMAIL_ENABLED:'false'},{PLAN_EMAIL_START_AT:''},{RESEND_API_KEY:''}]) {
    const h=harness();await h.enqueue();h.sqlite.exec('UPDATE plan_emails SET created_at=unixepoch()-604801');Object.assign(h.bindings,change);
    await h.process();assert.equal(h.calls.length,0);assert.equal(h.row().status,'expired');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);
  }
});

test('scheduler shares provider capacity sequentially and isolates welcome queue failure',async()=>{
  const source=ts.transpileModule(readFileSync(new URL('../workers/store-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const failWelcome of [false,true]) {
    const exported={};const events=[];const fetch=()=>new Response('site');
    runInNewContext(source,{exports:exported,setTimeout:(fn,delay)=>{events.push(`wait:${delay}`);queueMicrotask(fn);return 0;},require:name=>{
      if(name==='vinext/server/fetch-handler')return {default:{fetch}};
      if(name==='../lib/welcome-email')return {processWelcomeEmailQueue:async()=>{events.push('welcome');if(failWelcome)throw new Error('private SQL failure');}};
      if(name==='../lib/plan-email')return {processPlanEmailQueue:async()=>{events.push('plan');}};
      if(name==='../lib/material-email')return {processMaterialEmailQueue:async()=>{events.push('material');}};
      if(name==='../lib/product-availability')return {processProductReservations:async()=>{events.push('reservations');}};
      throw new Error(name);
    }});
    await exported.default.scheduled({},{});assert.equal(exported.default.fetch,fetch);assert.deepEqual(events,['welcome','wait:600','plan','wait:600','material','reservations']);
  }
});
