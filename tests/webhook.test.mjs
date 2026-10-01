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
};

function paymentHarness({variables={},missing=[],payment=authoritativePayment,upstreamStatus=200}={}){
 const variablesForTest={...testEnvironment,...variables};
 for(const key of missing)delete variablesForTest[key];
 const exported={};const calls=[];
 runInNewContext(paymentModule,{
  exports:exported,process:{env:variablesForTest},URL,Response,AbortSignal,crypto,TextEncoder,Uint8Array,
  fetch:async(url,options)=>{
   calls.push({url,method:options.method});
   return new Response(JSON.stringify(upstreamStatus===200?payment:{message:'upstream-body-must-not-be-logged'}),{status:upstreamStatus});
  },
 });
 return {payment:exported,calls};
}

function webhookHarness(t,{dbAvailable=true,...options}={}){
 const fixture=paymentHarness(options);const exported={};const writes=[];const reads=[];const logs=[];
 const database=new DatabaseSync(':memory:');t.after(()=>database.close());
 database.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,amount_cents INTEGER,status TEXT,payment_id TEXT UNIQUE); INSERT INTO orders VALUES ('order-1',14900,'pending',NULL)");
 const DB={prepare:sql=>({bind:(...args)=>({
  first:async()=>{reads.push({sql,args});return database.prepare(sql).get(...args)??null;},
  run:async()=>{writes.push({sql,args});return database.prepare(sql).run(...args);},
 })})};
 const dependencies={
  'cloudflare:workers':{env:dbAvailable?{DB}:{}},
  '@/lib/payment':fixture.payment,
 };
 runInNewContext(webhookRoute,{
  exports:exported,require:name=>{assert.ok(name in dependencies);return dependencies[name];},
  URL,Response,console:{error:(...args)=>logs.push(args)},
 });
 return {...fixture,writes,reads,logs,run:request=>exported.POST(request),
  order:()=>({...database.prepare("SELECT status,payment_id FROM orders WHERE id='order-1'").get()}),
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
 for(const key of ['MERCADOPAGO_ACCESS_TOKEN','MERCADOPAGO_WEBHOOK_SECRET','MERCADOPAGO_COLLECTOR_ID','SITE_URL']){
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
 assert.deepEqual(fixture.calls,[{url:'https://api.mercadopago.com/v1/payments/123456',method:'GET'}]);
 assert.equal(fixture.writes.length,1);
 assert.deepEqual(fixture.order(),{status:'approved',payment_id:'123456'});
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
 for(const changed of [{id:123457},{transaction_amount:150},{currency_id:'USD'},{collector_id:9002},{live_mode:true}]){
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
  assert.equal(fixture.calls.length,1);assert.equal(fixture.reads.length,0);assert.equal(fixture.writes.length,0);
  assert.deepEqual(fixture.logs,[['payment_notification_unavailable',upstreamStatus]]);
  assert.deepEqual(fixture.order(),{status:'pending',payment_id:null});
 }
});
