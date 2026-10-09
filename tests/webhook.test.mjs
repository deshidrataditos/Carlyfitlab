import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const paymentModule=compile('../lib/payment.ts');
const webhookRoute=compile('../app/api/payments/webhook/route.ts');
const testEnvironment={
 MERCADOPAGO_ACCESS_TOKEN:'test-only-token',
 MERCADOPAGO_WEBHOOK_SECRET:'test-only-webhook-secret',
 MERCADOPAGO_COLLECTOR_ID:'9001',
 MERCADOPAGO_MODE:'test',
 SITE_URL:'https://shop.example',
 PAYMENTS_ENABLED:'false',
 CATALOG_CONFIRMED:'false',
};
const authoritativePayment={
 id:123456,external_reference:'order-1',currency_id:'MXN',
 transaction_amount:149,collector_id:9001,status:'approved',live_mode:false,
 date_last_updated:'2026-10-01T12:00:00.000-06:00',
};
const approvedAt=Date.parse(authoritativePayment.date_last_updated);

function paymentHarness({variables={},missing=[],payment=authoritativePayment,upstreamStatus=200,seller={id:9001,site_id:'MLM',tags:['test_user']},sellerStatus=200}={}){
 const variablesForTest={...testEnvironment,...variables};
 for(const key of missing)delete variablesForTest[key];
 const exported={};const calls=[];let currentPayment=payment;
 runInNewContext(paymentModule,{
  exports:exported,process:{env:variablesForTest},URL,Response,AbortSignal,crypto,TextEncoder,Uint8Array,
  fetch:async(url,options)=>{
   calls.push({url,method:options.method});
   if(url==='https://api.mercadopago.com/users/me')return new Response(JSON.stringify(seller),{status:sellerStatus});
   return new Response(JSON.stringify(upstreamStatus===200?currentPayment:{message:'upstream-body-must-not-be-logged'}),{status:upstreamStatus});
  },
 });
 return {payment:exported,calls,setPayment:next=>{currentPayment=next;}};
}

function webhookHarness(t,{dbAvailable=true,beforeWrite=async()=>{},emailEnqueueFails=false,...options}={}){
 const fixture=paymentHarness(options);const exported={};const writes=[];const reads=[];const logs=[];const queued=[];const delivered=[];const background=[];
 const database=new DatabaseSync(':memory:');t.after(()=>database.close());
 for(const path of ['../drizzle/0000_abandoned_darwin.sql','../drizzle/0001_payment_update_timestamp.sql']){
  database.exec(readFileSync(new URL(path,import.meta.url),'utf8'));
 }
 database.exec("INSERT INTO orders (id,items,amount_cents,delivery,customer_name,created_at) VALUES ('order-1','[]',14900,'pickup','Test buyer','2026-10-01T00:00:00Z')");
 const DB={prepare:sql=>({bind:(...args)=>({
  first:async()=>{reads.push({sql,args});return database.prepare(sql).get(...args)??null;},
  run:async()=>{await beforeWrite(sql,args);const result=database.prepare(sql).run(...args);writes.push({sql,args,changes:result.changes});return result;},
 })})};
 const dependencies={
  'cloudflare:workers':{env:dbAvailable?{DB}:{}},
  '@/lib/payment':fixture.payment,
  '@/lib/plan-email':{enqueuePlanEmail:async(_bindings,id)=>{queued.push({id,status:database.prepare('SELECT status FROM orders WHERE id=?').get(id)?.status});if(emailEnqueueFails)throw new Error('email unavailable');return true;},deliverPlanEmail:async(_bindings,id)=>{delivered.push(id);}},
  'next/server':{after:fn=>background.push(fn)},
 };
 runInNewContext(webhookRoute,{
  exports:exported,require:name=>{assert.ok(name in dependencies);return dependencies[name];},
  URL,Response,console:{error:(...args)=>logs.push(args)},
 });
 return {...fixture,writes,reads,logs,queued,delivered,flush:async()=>{for(const fn of background.splice(0))await fn();},run:request=>exported.POST(request),
  order:()=>({...database.prepare("SELECT status,payment_id FROM orders WHERE id='order-1'").get()}),
  updatedAt:()=>database.prepare("SELECT payment_updated_at FROM orders WHERE id='order-1'").get().payment_updated_at,
 };
}

async function signedRequest({id='123456',signedId=id,secret=testEnvironment.MERCADOPAGO_WEBHOOK_SECRET}={}){
 const ts='1704908010';const requestId='webhook-test';const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(`id:${signedId};request-id:${requestId};ts:${ts};`));
 return new Request(`https://shop.example/api/payments/webhook?data.id=${id}&type=payment`,{
  method:'POST',headers:{'Content-Type':'application/json','x-request-id':requestId,'x-signature':`ts=${ts},v1=${Buffer.from(signature).toString('hex')}`},
  // The receiver must use the fetched payment, not these conflicting values.
  body:JSON.stringify({data:{id},status:'rejected',transaction_amount:0,collector_id:42}),
 });
}

test('webhook configuration remains available while either checkout flag is disabled',()=>{
 for(const variables of [
  {PAYMENTS_ENABLED:'false',CATALOG_CONFIRMED:'false'},
  {PAYMENTS_ENABLED:'false',CATALOG_CONFIRMED:'true'},
  {PAYMENTS_ENABLED:'true',CATALOG_CONFIRMED:'false'},
 ]){
  const {payment}=paymentHarness({variables});
  assert.equal(payment.paymentConfig(),null);
  assert.equal(payment.webhookConfig()?.origin,'https://shop.example');
 }
 const {payment}=paymentHarness({variables:{PAYMENTS_ENABLED:'true',CATALOG_CONFIRMED:'true'}});
 assert.deepEqual(payment.paymentConfig(),payment.webhookConfig());
});

test('missing credentials keep both configurations unavailable even with checkout enabled',()=>{
 for(const key of ['MERCADOPAGO_ACCESS_TOKEN','MERCADOPAGO_WEBHOOK_SECRET','MERCADOPAGO_COLLECTOR_ID','MERCADOPAGO_MODE','SITE_URL']){
  const {payment}=paymentHarness({missing:[key],variables:{PAYMENTS_ENABLED:'true',CATALOG_CONFIRMED:'true'}});
  assert.equal(payment.webhookConfig(),null);
  assert.equal(payment.paymentConfig(),null);
 }
});

test('a real signed notification reconciles the authoritative payment with checkout disabled',async t=>{
 const fixture=webhookHarness(t);
 assert.equal(fixture.payment.paymentConfig(),null);
 const response=await fixture.run(await signedRequest());
 assert.equal(response.status,200);
 assert.deepEqual(fixture.calls,[{url:'https://api.mercadopago.com/users/me',method:'GET'},{url:'https://api.mercadopago.com/v1/payments/123456',method:'GET'}]);
 assert.equal(fixture.writes.length,1);
 assert.deepEqual(fixture.order(),{status:'approved',payment_id:'123456'});
 assert.equal(fixture.updatedAt(),approvedAt);
});

test('a delayed older payment response cannot undo approval and newer refunds still reconcile',async t=>{
 const olderPayment={...authoritativePayment,status:'in_process',date_last_updated:'2026-10-01T11:59:59.000-06:00'};
 let releaseOlder;let markOlderWaiting;
 const olderReleased=new Promise(resolve=>{releaseOlder=resolve;});
 const olderWaiting=new Promise(resolve=>{markOlderWaiting=resolve;});
 const fixture=webhookHarness(t,{payment:olderPayment,beforeWrite:async(_sql,args)=>{
  if(args[1]==='in_process'){markOlderWaiting();await olderReleased;}
 }});
 const olderResponse=fixture.run(await signedRequest());
 await olderWaiting;
 fixture.setPayment(authoritativePayment);
 try{
  assert.equal((await fixture.run(await signedRequest())).status,200);
  assert.deepEqual(fixture.order(),{status:'approved',payment_id:'123456'});
 }finally{releaseOlder();}
 assert.equal((await olderResponse).status,200);
 assert.deepEqual(fixture.order(),{status:'approved',payment_id:'123456'});
 assert.equal(fixture.updatedAt(),approvedAt);
 assert.deepEqual(fixture.writes.map(write=>write.changes),[1,0]);
 // A duplicate is acknowledged without modifying the stored version.
 assert.equal((await fixture.run(await signedRequest())).status,200);
 assert.equal(fixture.writes.at(-1).changes,0);
 fixture.setPayment({...authoritativePayment,status:'refunded',date_last_updated:'2026-10-01T12:01:00.000-06:00'});
 assert.equal((await fixture.run(await signedRequest())).status,200);
 assert.deepEqual(fixture.order(),{status:'refunded',payment_id:'123456'});
 assert.equal(fixture.updatedAt(),approvedAt+60000);
 assert.equal(fixture.writes.at(-1).changes,1);
});

test('missing or invalid authoritative payment timestamps return 400 without database writes',async t=>{
 for(const date_last_updated of [undefined,null,123,'not-a-date','2026-02-30T12:00:00Z','2026-10-01T12:00:00']){
  const fixture=webhookHarness(t,{payment:{...authoritativePayment,date_last_updated}});
  const response=await fixture.run(await signedRequest());
  assert.equal(response.status,400);
  assert.equal(await response.text(),'Invalid payment timestamp');
  assert.equal(fixture.calls.length,2);assert.equal(fixture.reads.length,0);assert.equal(fixture.writes.length,0);
  assert.deepEqual(fixture.order(),{status:'pending',payment_id:null});
  assert.equal(fixture.updatedAt(),null);
 }
});

test('invalid or absent webhook signatures are rejected before querying Mercado Pago or D1',async t=>{
 for(const request of [
  await signedRequest({secret:'incorrect-test-secret'}),
  await signedRequest({id:'123457',signedId:'123456'}),
  new Request('https://shop.example/api/payments/webhook?data.id=123456',{method:'POST'}),
 ]){
  const fixture=webhookHarness(t);
  assert.equal((await fixture.run(request)).status,401);
  assert.equal(fixture.calls.length,0);assert.equal(fixture.reads.length,0);assert.equal(fixture.writes.length,0);
 }
});

test('missing webhook configuration or D1 returns 503 without API or database operations',async t=>{
 for(const options of [{missing:['MERCADOPAGO_WEBHOOK_SECRET']},{dbAvailable:false}]){
  const fixture=webhookHarness(t,options);
  assert.equal((await fixture.run(await signedRequest())).status,503);
  assert.equal(fixture.calls.length,0);assert.equal(fixture.reads.length,0);assert.equal(fixture.writes.length,0);
 }
});

test('payment identity, amount, currency, collector and mode mismatches cannot update orders',async t=>{
 for(const changed of [{id:123457},{transaction_amount:150},{currency_id:'USD'},{collector_id:9002},{live_mode:'true'}]){
  const fixture=webhookHarness(t,{payment:{...authoritativePayment,...changed}});
  assert.equal((await fixture.run(await signedRequest())).status,400);
  assert.equal(fixture.writes.length,0);
  assert.deepEqual(fixture.order(),{status:'pending',payment_id:null});
 }
});

test('an unknown payment and other API failures remain retryable without database writes or sensitive logs',async t=>{
 for(const upstreamStatus of [404,401,500]){
  const fixture=webhookHarness(t,{upstreamStatus});
  const response=await fixture.run(await signedRequest());
  assert.equal(response.status,503);
  assert.equal(await response.text(),'Retry later');
  assert.equal(fixture.calls.length,2);assert.equal(fixture.reads.length,0);assert.equal(fixture.writes.length,0);
  assert.deepEqual(fixture.logs,[['payment_notification_unavailable',upstreamStatus]]);
  assert.deepEqual(fixture.order(),{status:'pending',payment_id:null});
 }
});

test('unknown environment names fail closed',()=>{
 for(const mode of ['', 'production','TEST','false'])assert.equal(paymentHarness({variables:{MERCADOPAGO_MODE:mode}}).payment.webhookConfig(),null);
});

test('APP_USR test seller can reconcile a test payment reported with live_mode true',async t=>{
 const fixture=webhookHarness(t,{payment:{...authoritativePayment,live_mode:true}});
 assert.equal((await fixture.run(await signedRequest())).status,200);
 assert.deepEqual(fixture.order(),{status:'approved',payment_id:'123456'});
});

test('seller identity and environment must be verified before any order access',async t=>{
 for(const options of [
  {seller:{id:9001,site_id:'MLM',tags:[]}},
  {variables:{MERCADOPAGO_MODE:'live'}},
  {seller:{id:9002,site_id:'MLM',tags:['test_user']}},
  {seller:{id:9001,site_id:'MLA',tags:['test_user']}},
  {seller:{id:9001,site_id:'MLM'}},
  {seller:{id:9001,site_id:'MLM',tags:'test_user'}},
  {seller:{id:9001,site_id:'MLM',tags:['test_user',null]}},
  {seller:null},
  {sellerStatus:401},
  {sellerStatus:500},
 ]){
  const fixture=webhookHarness(t,options);
  assert.equal((await fixture.run(await signedRequest())).status,503);
  assert.equal(fixture.calls.length,1);
  assert.equal(fixture.reads.length,0);assert.equal(fixture.writes.length,0);
 }
});

test('live environment requires a real seller and a live payment',async t=>{
 for(const live_mode of [false,true]){
  const fixture=webhookHarness(t,{variables:{MERCADOPAGO_MODE:'live'},seller:{id:9001,site_id:'MLM',tags:['normal']},payment:{...authoritativePayment,live_mode}});
  assert.equal((await fixture.run(await signedRequest())).status,live_mode?200:400);
  assert.equal(fixture.writes.length,live_mode?1:0);
 }
});

test('plan email work starts only after authoritative reconciliation, without delaying webhook response',async t=>{
 const fixture=webhookHarness(t);
 assert.equal((await fixture.run(await signedRequest())).status,200);
 assert.deepEqual(fixture.queued,[{id:'order-1',status:'approved'}]);
 assert.deepEqual(fixture.delivered,[]);
 await fixture.flush();
 assert.deepEqual(fixture.delivered,['order-1']);
});

test('email enqueue failure does not undo or reject a confirmed payment',async t=>{
 const fixture=webhookHarness(t,{emailEnqueueFails:true});
 assert.equal((await fixture.run(await signedRequest())).status,200);
 assert.equal(fixture.order().status,'approved');
 await fixture.flush();
 assert.deepEqual(fixture.delivered,[]);
 assert.deepEqual(fixture.logs,[]);
});
