import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const materialId='a8939179-3b60-4eba-a864-d40960759974';
const orderId='b8939179-3b60-4eba-a864-d40960759974';
const owner='c8939179-3b60-4eba-a864-d40960759974';
const admin='d8939179-3b60-4eba-a864-d40960759974';
const now=()=>new Date().toISOString();

function harness({registrationFailures=0,mailInsertFailures=0,afterRegistration,providerFails=false}={}) {
  const db=new DatabaseSync(':memory:');
  for(const name of ['0000_abandoned_darwin.sql','0001_payment_update_timestamp.sql','0002_store_portal.sql','0006_plan_email.sql','0007_plan_intake.sql','0010_material_emails.sql'])db.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
  const events=[];const sends=[];const afterTasks=[];
  const statement=(sql,values=[])=>({bind:(...args)=>statement(sql,args),first:async()=>db.prepare(sql).get(...values)??null,
    all:async()=>({results:db.prepare(sql).all(...values)}),run:async()=>{
      if(sql.startsWith('INSERT INTO material_emails')){events.push('queue');if(mailInsertFailures-- >0)throw new Error('Private queue error');}
      if(sql.startsWith('UPDATE store_materials SET access_published_at'))events.push('accessible');
      const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};
    }});
  const d1={prepare:statement,batch:async statements=>{db.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
  const env={DB:d1,MATERIAL_EMAIL_ENABLED:'true',MATERIAL_EMAIL_START_AT:new Date(Date.now()-60000).toISOString(),RESEND_API_KEY:'re_offline_test_only'};
  const session={client:{auth:{getUser:async()=>({data:{user:{id:admin}},error:null})},rpc:async(name)=>{
    if(name==='can_manage_store')return {data:true,error:null};
    assert.equal(name,'publish_store_material');events.push('storage');
    if(registrationFailures-- >0)return {data:null,error:{message:'private registration failure'}};
    afterRegistration?.(db);return {data:true,error:null};
  },storage:{from:()=>({info:async()=>({data:{size:250,contentType:'application/pdf'},error:null})})}},finish:response=>response};
  const auth={memberSession:()=>session,memberJson:(data,status=200)=>Response.json(data,{status}),memberFailure:error=>Response.json({error:error.status?error.message:'Unavailable'},{status:error.status??503})};
  const cache=new Map();
  function load(path) {
    if(path==='cloudflare:workers')return {env};if(path==='next/server')return {after:fn=>afterTasks.push(fn)};if(path.endsWith('supabase-server'))return auth;
    const name=path.replace(/^@\//,'').replace(/^\.\//,'lib/').replace(/\.ts$/,'');if(cache.has(name))return cache.get(name);
    const exports={};cache.set(name,exports);
    const source=ts.transpileModule(readFileSync(new URL(`../${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,{exports,require:load,URL,Request,Response,TextDecoder,Uint8Array,Date,crypto:webcrypto,AbortController,
      setTimeout:(fn,delay)=>delay===600?(queueMicrotask(fn),0):setTimeout(fn,delay),clearTimeout,
      fetch:async(url,options)=>{sends.push({url,options});return providerFails?new Response('',{status:503}):Response.json({id:'provider-offline'});},
    });return exports;
  }
  db.prepare('INSERT INTO orders(id,items,amount_cents,delivery,customer_name,status,created_at,user_id,plan_contact_email) VALUES(?,?,?,?,?,?,?,?,?)').run(orderId,JSON.stringify([{id:'rutina-90',quantity:1}]),149000,'digital','Cliente','approved',now(),owner,'buyer@example.invalid');
  db.prepare('INSERT INTO store_materials(id,order_id,user_id,title,kind,object_path,content_type,byte_size,state,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(materialId,orderId,owner,'Rutina inicial','routine',`${owner}/${orderId}/${materialId}.pdf`,'application/pdf',250,'pending',admin,now(),new Date(Date.now()+3600000).toISOString());
  const route=load('app/api/store/material/route');const email=load('lib/material-email');
  return {db,env,events,sends,afterTasks,email,
    complete:()=>route.POST(new Request('https://shop.example/api/store/material',{method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json'},body:JSON.stringify({action:'complete',uploadId:materialId,email:'attacker@example.invalid',user_id:admin})})),
    cron:()=>email.processMaterialEmailQueue(env),
  };
}

test('successful publication queues only after Storage access, sends correct buyer notice, and is idempotent',async()=>{
  const h=harness();const response=await h.complete();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.material.id,materialId);assert.equal(body.emailNotification.status,'pending');
  assert.deepEqual(h.events,['storage','accessible','queue']);assert.equal(h.sends.length,0);assert.equal(h.afterTasks.length,1);
  await h.afterTasks.shift()();assert.equal(h.sends.length,1);
  const sent=JSON.parse(h.sends[0].options.body);assert.deepEqual(sent.to,['buyer@example.invalid']);assert.equal(sent.subject,'Tu material está listo');
  assert.doesNotMatch(sent.html,/storage\/v1|token=|\.pdf|attacker@example/);
  const again=await h.complete();assert.equal(again.status,200);assert.equal((await again.json()).emailNotification.status,'sent');
  await h.cron();assert.equal(h.sends.length,1);assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n,1);
});

test('Storage-registration failure cannot be announced and retry safely recovers already-published metadata',async()=>{
  const h=harness({registrationFailures:1});assert.equal((await h.complete()).status,503);
  const material=h.db.prepare('SELECT state,access_published_at FROM store_materials').get();assert.equal(material.state,'published');assert.equal(material.access_published_at,null);
  await h.cron();assert.equal(h.sends.length,0);assert.equal(h.db.prepare('SELECT count(*) AS n FROM material_emails').get().n,0);
  const retry=await h.complete();assert.equal(retry.status,200);assert.equal((await retry.json()).emailNotification.status,'pending');
  await h.cron();assert.equal(h.sends.length,1);assert.equal(h.db.prepare('SELECT count(*) AS n FROM store_audit').get().n,1);
});

test('queue failure leaves published material available and cron recovers its missed receipt',async()=>{
  const h=harness({mailInsertFailures:1});const response=await h.complete();assert.equal(response.status,200);
  assert.equal((await response.json()).emailNotification.status,'retry_pending');assert.ok(h.db.prepare('SELECT access_published_at FROM store_materials').get().access_published_at);
  assert.equal(h.sends.length,0);await h.cron();assert.equal(h.sends.length,1);
});

test('unavailable recipient and failed provider never turn successful publication into an upload failure',async()=>{
  const missing=harness();missing.db.prepare('UPDATE orders SET plan_contact_email=NULL').run();const response=await missing.complete();
  assert.equal(response.status,200);assert.equal((await response.json()).emailNotification.status,'unavailable');await missing.cron();assert.equal(missing.sends.length,0);
  const h=harness({providerFails:true});const completed=await h.complete();assert.equal(completed.status,200);await h.afterTasks.shift()();
  assert.equal(h.db.prepare('SELECT state FROM store_materials').get().state,'published');assert.equal(h.db.prepare('SELECT status FROM material_emails').get().status,'pending');
});

test('payment reversal after storage registration prevents access marker and notification',async()=>{
  const h=harness({afterRegistration:db=>db.prepare("UPDATE orders SET status='refunded'").run()});assert.equal((await h.complete()).status,409);
  assert.equal(h.db.prepare('SELECT access_published_at FROM store_materials').get().access_published_at,null);await h.cron();assert.equal(h.sends.length,0);
});

test('completing a historical publication again cannot backfill a material notification',async()=>{
  const h=harness();h.db.prepare("UPDATE store_materials SET state='published',published_at=?").run(new Date(Date.now()-86400000).toISOString());
  const response=await h.complete();assert.equal(response.status,200);assert.equal((await response.json()).emailNotification.status,'unavailable');await h.cron();assert.equal(h.sends.length,0);
});
