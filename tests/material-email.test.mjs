import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const materialId='a8939179-3b60-4eba-a864-d40960759974';
const orderId='b8939179-3b60-4eba-a864-d40960759974';
const userId='c8939179-3b60-4eba-a864-d40960759974';
const stranger='d8939179-3b60-4eba-a864-d40960759974';
const now=()=>Math.floor(Date.now()/1000);
const iso=seconds=>new Date(seconds*1000).toISOString();
const idAt=i=>`a8939179-3b60-4eba-a864-${String(i).padStart(12,'0')}`;

function harness({provider,timeout=false,failSql,onSql}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE orders(id TEXT PRIMARY KEY,items TEXT NOT NULL,user_id TEXT,status TEXT NOT NULL,plan_contact_email TEXT); CREATE TABLE store_materials(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),user_id TEXT,title TEXT,state TEXT,published_at TEXT)');
  sqlite.exec(readFileSync(new URL('../drizzle/0010_material_emails.sql',import.meta.url),'utf8'));
  const calls=[];const sqlCalls=[];const delays=[];
  function statement(sql,values=[]) {
    function run(method) {
      sqlCalls.push({sql,values});if(failSql?.(sql,values))throw new Error('Private database failure');onSql?.(sql,values,sqlite);
      const result=sqlite.prepare(sql)[method](...values);return method==='run'?{meta:{changes:Number(result.changes)}}:result??null;
    }
    return {bind:(...args)=>statement(sql,args),run:async()=>run('run'),first:async()=>run('get'),all:async()=>({results:run('all')})};
  }
  const bindings={DB:{prepare:statement},MATERIAL_EMAIL_ENABLED:'true',MATERIAL_EMAIL_START_AT:iso(now()-200),RESEND_API_KEY:'re_offline_test_only'};
  let template={subject:'Tu material está listo',text:'Abre Mi plan.',html:'<p>Abre Mi plan.</p>'};
  function load(name) {
    const exports={};
    const source=ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,Date,crypto:webcrypto,AbortController,
      require:path=>path==='./material-email-template'?{buildMaterialEmail:(id,title)=>({...template,text:`${template.text} ${id} ${title}`})}:load(path.replace('./','')),
      setTimeout:(fn,delay)=>{delays.push(delay);if(delay===600||timeout){queueMicrotask(fn);return 0;}return setTimeout(fn,delay);},clearTimeout,
      fetch:async(url,options)=>{calls.push({url,options});return provider?provider({url,options,sqlite,calls}):Response.json({id:`provider-${calls.length}`});},
    });return exports;
  }
  const helpers=load('material-email');
  sqlite.prepare('INSERT INTO orders VALUES(?,?,?,?,?)').run(orderId,JSON.stringify([{id:'rutina-90',quantity:1}]),userId,'approved','google@example.invalid');
  const addMaterial=(update={})=>{
    const row={id:materialId,order_id:orderId,user_id:userId,title:'Rutina inicial',state:'published',published_at:iso(now()-100),access_published_at:iso(now()-99),...update};
    sqlite.prepare('INSERT INTO store_materials(id,order_id,user_id,title,state,published_at,access_published_at) VALUES(?,?,?,?,?,?,?)').run(row.id,row.order_id,row.user_id,row.title,row.state,row.published_at,row.access_published_at);return row.id;
  };addMaterial();
  return {sqlite,bindings,calls,sqlCalls,delays,helpers,addMaterial,
    row:(id=materialId)=>sqlite.prepare('SELECT * FROM material_emails WHERE material_id=?').get(id),
    update:(sql,...values)=>sqlite.prepare(`UPDATE store_materials SET ${sql} WHERE id=?`).run(...values,materialId),
    order:(sql,...values)=>sqlite.prepare(`UPDATE orders SET ${sql} WHERE id=?`).run(...values,orderId),
    enqueue:(id=materialId)=>helpers.enqueueMaterialEmail(bindings,id),deliver:(id=materialId)=>helpers.deliverMaterialEmail(bindings,id),
    status:(id=materialId)=>helpers.materialEmailStatus(bindings,id),process:()=>helpers.processMaterialEmailQueue(bindings),template:value=>{template=value;},
    due:()=>sqlite.exec('UPDATE material_emails SET next_attempt_at=unixepoch()-1,lease_until=0'),
  };
}

test('material notice fails closed without fixed cutoff, explicit activation or database',async()=>{
  for(const change of [{MATERIAL_EMAIL_ENABLED:'false'},{MATERIAL_EMAIL_START_AT:''},{MATERIAL_EMAIL_START_AT:'yesterday'},{MATERIAL_EMAIL_START_AT:'2026-10-08'},{DB:undefined}]) {
    const h=harness();Object.assign(h.bindings,change);assert.equal(await h.enqueue(),false);await h.deliver();
    assert.equal(h.sqlCalls.length,0);assert.equal(h.calls.length,0);assert.equal(await h.status(),'disabled');
  }
});

test('only newly published accessible materials with approved canonical plan owner and verified purchase email qualify',async()=>{
  const changes=[
    ['update','state=?','pending'],['update','state=?','deleted'],['update','access_published_at=?',null],
    ['update','access_published_at=?','invalid'],['update','access_published_at=?',iso(now()-101)],
    ['update','published_at=?',iso(now()-1000)],['update','published_at=?','invalid'],['update','published_at=?',null],['update','published_at=?',iso(now()+3600)],
    ['update','user_id=?',stranger],['order','user_id=?',null],['order','status=?','pending'],['order','status=?','rejected'],['order','status=?','refunded'],
    ['order','plan_contact_email=?',null],['order','plan_contact_email=?','one@example.invalid,two@example.invalid'],['order','plan_contact_email=?','bad\r\nBcc: x@example.invalid'],
    ['order','items=?','bad'],['order','items=?',JSON.stringify([{id:'galletas',quantity:1}])],['order','items=?',JSON.stringify([{id:'presencial-mensual',quantity:1}])],
  ];
  for(const [target,...change] of changes){const h=harness();h[target](...change);assert.equal(await h.enqueue(),false,JSON.stringify([target,...change]));assert.equal(h.row(),undefined);}
  const h=harness();assert.equal(await h.enqueue(),true);assert.equal(await h.status(),'pending');
});

test('material key deduplicates retries but each new material of the same order receives its own notice',async()=>{
  const h=harness();await h.enqueue();const first=h.row();h.template({subject:'changed',html:'changed',text:'changed'});
  h.order('plan_contact_email=?','updated@example.invalid');h.update('title=?','Changed title');await h.enqueue();
  assert.equal(h.row().payload,first.payload);assert.equal(h.row().recipient,first.recipient);
  await h.deliver();await h.enqueue();await h.deliver();await h.process();assert.equal(h.calls.length,1);assert.equal(await h.status(),'sent');
  const second=h.addMaterial({id:idAt(2)});await h.enqueue(second);await h.deliver(second);assert.equal(h.calls.length,2);
  assert.equal(h.calls[0].options.headers['Idempotency-Key'],`carlyfit-material-v1:${materialId}`);
  assert.notEqual(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('email recipient is the verified checkout snapshot and terminal receipt removes queue PII',async()=>{
  const h=harness();await h.enqueue();await h.deliver();const {url,options}=h.calls[0];const payload=JSON.parse(options.body);
  assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers.Authorization,'Bearer re_offline_test_only');
  assert.equal(payload.from,'Carlyfit Lab <hola@correo.carlyfitlab.com>');assert.equal(payload.reply_to,'carlyfit.lab@gmail.com');
  assert.deepEqual(payload.to,['google@example.invalid']);assert.ok(payload.text.includes(orderId));assert.ok(payload.text.includes('Rutina inicial'));
  assert.equal(h.row().status,'sent');assert.equal(h.row().recipient,null);assert.equal(h.row().payload,null);assert.equal(h.row().user_id,userId);
});

test('queue is durable without provider configuration and duplicate concurrent claims cannot send twice',async()=>{
  const noKey=harness();delete noKey.bindings.RESEND_API_KEY;await noKey.enqueue();await noKey.deliver();assert.equal(noKey.row().status,'pending');assert.equal(noKey.calls.length,0);
  let finish;
  const h=harness({provider:()=>new Promise(resolve=>{finish=resolve;})});await Promise.all([h.enqueue(),h.enqueue(),h.enqueue()]);
  const send=h.deliver();for(let i=0;i<40&&!finish;i++)await Promise.resolve();assert.equal(typeof finish,'function');
  await Promise.all([h.deliver(),h.deliver(),h.process()]);assert.equal(h.calls.length,1);finish(Response.json({id:'accepted'}));await send;assert.equal(h.row().attempts,1);
});

test('atomic enqueue checks current material availability and payment again',async()=>{
  for(const mutation of [db=>db.prepare('UPDATE orders SET status=?').run('refunded'),db=>db.prepare('UPDATE store_materials SET state=?').run('deleted')]) {
    const h=harness({onSql:(sql,_values,db)=>{if(sql.startsWith('INSERT INTO material_emails'))mutation(db);}});
    await h.enqueue();assert.equal(h.row(),undefined);await h.deliver();assert.equal(h.calls.length,0);
  }
});

test('deleted/unregistered/reassigned material and reversed orders cancel pending notices before delivery',async()=>{
  const changes=[['update','state=?','deleted'],['update','access_published_at=?',null],['update','user_id=?',stranger],['order','user_id=?',stranger],
    ['order','status=?','refunded'],['order','status=?','cancelled'],['order','status=?','charged_back']];
  for(const [target,...change] of changes){const h=harness();await h.enqueue();h[target](...change);await h.deliver();await h.process();
    assert.equal(h.calls.length,0);assert.equal(h.row().status,'cancelled');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);}
});

test('temporarily unapproved orders stay parked and second check catches a reversal between claim and request',async()=>{
  const held=harness();await held.enqueue();held.order('status=?','rejected');await held.deliver();assert.equal(held.row().attempts,0);assert.equal(held.calls.length,0);
  held.order('status=?','approved');await held.deliver();assert.equal(held.row().status,'sent');
  for(const mutation of [db=>db.prepare('UPDATE orders SET status=?').run('refunded'),db=>db.prepare('UPDATE store_materials SET user_id=?').run(stranger)]) {
    const h=harness({onSql:(sql,_values,db)=>{if(sql.includes('SELECT e.material_id,e.payload'))mutation(db);}});
    await h.enqueue();await h.deliver();assert.equal(h.calls.length,0);assert.equal(h.row().status,'cancelled');
  }
});

test('transient and rate-limited errors retry immutable payload with backoff and stable key',async()=>{
  const h=harness({provider:({calls})=>calls.length===1?new Response('',{status:429,headers:{'Retry-After':'1800'}}):Response.json({id:'recovered'})});
  await h.enqueue();await h.deliver();assert.equal(h.row().status,'pending');assert.ok(h.row().next_attempt_at>=now()+1798);
  await h.deliver();assert.equal(h.calls.length,1);h.template({subject:'changed',html:'changed',text:'changed'});await h.enqueue();h.due();await h.process();
  assert.equal(h.row().status,'sent');assert.equal(h.calls[0].options.body,h.calls[1].options.body);assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('ambiguous timeout, invalid successful response and lost completion write remain safely retryable',async()=>{
  const timed=harness({timeout:true,provider:({options})=>new Promise((resolve,reject)=>{
    if(options.signal.aborted)reject(new Error('aborted'));else options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  })});await timed.enqueue();await timed.deliver();assert.equal(timed.row().status,'pending');assert.ok(timed.calls[0].options.signal.aborted);
  const invalid=harness({provider:()=>new Response('private provider response',{status:200})});await invalid.enqueue();await invalid.deliver();assert.equal(invalid.row().status,'pending');
  let fail=true;const h=harness({failSql:sql=>fail&&/provider_id=/.test(sql)});await h.enqueue();await assert.rejects(h.deliver());
  assert.ok(h.row().lease_until>now());await h.deliver();assert.equal(h.calls.length,1);fail=false;h.due();await h.deliver();
  assert.equal(h.row().status,'sent');assert.equal(h.calls[0].options.body,h.calls[1].options.body);assert.equal(h.calls[0].options.headers['Idempotency-Key'],h.calls[1].options.headers['Idempotency-Key']);
});

test('permanent provider errors and maximum attempts retain receipts while erasing queue payload',async()=>{
  for(const status of [400,404,422]){const h=harness({provider:()=>new Response('private error',{status})});await h.enqueue();await h.deliver();
    assert.equal(h.row().status,'failed');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);await h.enqueue();await h.deliver();assert.equal(h.calls.length,1);}
  const h=harness({provider:()=>new Response('',{status:503})});await h.enqueue();for(let i=0;i<8;i++){h.due();await h.deliver();}
  assert.equal(h.calls.length,8);assert.equal(h.row().status,'failed');await h.process();assert.equal(h.calls.length,8);
});

test('23-hour retry window starts at the first request and expired records never send again',async()=>{
  const h=harness({provider:()=>new Response('',{status:503})});await h.enqueue();await h.deliver();const first=h.row().first_attempt_at;
  h.due();await h.deliver();assert.equal(h.row().first_attempt_at,first);h.sqlite.exec('UPDATE material_emails SET first_attempt_at=unixepoch()-82800,lease_until=0,next_attempt_at=0');
  await h.process();await h.enqueue();await h.deliver();assert.equal(h.calls.length,2);assert.equal(h.row().status,'expired');assert.equal(h.row().payload,null);
});

test('cron recovers missed publication enqueues and processes at most five messages with provider spacing',async()=>{
  const h=harness();for(let i=0;i<7;i++)h.addMaterial({id:idAt(i)});
  await h.process();assert.equal(h.calls.length,5);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM material_emails').get().n,8);assert.equal(h.delays.filter(v=>v===600).length,4);
  await h.process();assert.equal(h.calls.length,8);
});

test('historical materials and storage-registration failures are never recovered into notices',async()=>{
  const h=harness();h.update('state=?','pending');
  const variants=[{state:'pending'},{state:'deleted'},{published_at:iso(now()-1000)},{access_published_at:null},{user_id:stranger}];
  for(let i=0;i<variants.length;i++)h.addMaterial({id:idAt(i),...variants[i]});
  await h.process();assert.equal(h.calls.length,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM material_emails').get().n,0);
});

test('bounded recovery cursor advances past bad dates and wraps to catch newly accessible files',async()=>{
  const h=harness();h.update('access_published_at=?',null);delete h.bindings.RESEND_API_KEY;
  for(let i=0;i<26;i++)h.addMaterial({id:idAt(i),access_published_at:i<25?'invalid':iso(now()-99)});
  await h.process();assert.equal(h.row(idAt(25)),undefined);await h.process();assert.equal(h.row(idAt(25)).status,'pending');
  h.update('access_published_at=?',iso(now()-99));await h.process();await h.process();assert.equal(h.row().status,'pending');
});

test('cleanup removes stale PII even when sending disabled or unconfigured',async()=>{
  for(const config of [{MATERIAL_EMAIL_ENABLED:'false'},{MATERIAL_EMAIL_START_AT:''},{RESEND_API_KEY:''}]) {
    const h=harness();await h.enqueue();h.sqlite.exec('UPDATE material_emails SET created_at=unixepoch()-604801');Object.assign(h.bindings,config);await h.process();
    assert.equal(h.calls.length,0);assert.equal(h.row().status,'expired');assert.equal(h.row().payload,null);assert.equal(h.row().recipient,null);
  }
});
