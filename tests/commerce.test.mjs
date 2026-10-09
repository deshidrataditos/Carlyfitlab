import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProductModule} from './load-product-module.mjs';
const {catalog,validateCart}=loadProductModule('catalog');
import {validWebhook,paymentConfig,reconcilePaymentSql,paymentUpdatedAt} from '../lib/payment.ts';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('cart rejects unrecognized items, duplicates and invalid quantities',()=>{
 for(const value of [[],[{id:'inventado',quantity:1}],[{id:'galletas',quantity:-1}],[{id:'galletas',quantity:21}],[{id:'galletas',quantity:1.5}],[{id:'galletas',quantity:1},{id:'galletas',quantity:1}]])assert.throws(()=>validateCart(value));
});
test('cart drops client-supplied prices and totals',()=>{
 const lines=validateCart([{id:'galletas',quantity:2,price:0,total:0}]);
 assert.deepEqual(JSON.parse(JSON.stringify(lines)),[{id:'galletas',quantity:2}]);
 assert.equal(catalog.find(p=>p.id===lines[0].id).price*lines[0].quantity,118);
});
test('signed webhook validates and rejects altered payment IDs and signatures',async()=>{
 const secret='test-only-not-a-real-credential';const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('id:123;request-id:request-test;ts:1704908010;'));
 const hex=Buffer.from(signature).toString('hex');
 const headers={'x-request-id':'request-test','x-signature':`ts=1704908010,v1=${hex}`};
 assert.equal(await validWebhook(new Request('https://site.example/api/payments/webhook?data.id=123',{headers}),secret),true);
 assert.equal(await validWebhook(new Request('https://site.example/api/payments/webhook?data.id=124',{headers}),secret),false);
 assert.equal(await validWebhook(new Request('https://site.example/api/payments/webhook?data.id=123',{headers:{...headers,'x-signature':`ts=1704908010,v1=${'0'.repeat(64)}`}}),secret),false);
 assert.equal(await validWebhook(new Request('https://site.example/api/payments/webhook?data.id=123'),secret),false);
});
test('payments fail closed unless explicitly activated with confirmed catalog',()=>{
 const saved=process.env.PAYMENTS_ENABLED;process.env.PAYMENTS_ENABLED='false';
 try{assert.equal(paymentConfig(),null);}finally{if(saved===undefined)delete process.env.PAYMENTS_ENABLED;else process.env.PAYMENTS_ENABLED=saved;}
});
test('an approved retry replaces a failed attempt atomically and remains approved',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,payment_id TEXT UNIQUE,payment_updated_at INTEGER); INSERT INTO orders VALUES ('order-1','pending',NULL,NULL)");
  const update=db.prepare(reconcilePaymentSql);
  const apply=(id,status,at)=>update.run(id,status,at,'order-1',id,status,status,at,id,status);
  // Timestamps belong to each payment; an approved retry can replace a newer failed attempt.
  apply('attempt-A','rejected',30);apply('attempt-B','approved',20);
  assert.deepEqual({...db.prepare('SELECT status,payment_id FROM orders').get()},{status:'approved',payment_id:'attempt-B'});
  apply('attempt-A','rejected',40);apply('attempt-B','approved',20);apply('attempt-C','pending',50);
  assert.deepEqual({...db.prepare('SELECT status,payment_id FROM orders').get()},{status:'approved',payment_id:'attempt-B'});
  apply('attempt-B','refunded',60);
  assert.equal(db.prepare('SELECT status FROM orders').get().status,'refunded');
 }finally{db.close();}
});

test('older and duplicate payment states cannot overwrite newer approval, refund or chargeback',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,payment_id TEXT UNIQUE,payment_updated_at INTEGER); INSERT INTO orders VALUES ('order-1','pending',NULL,NULL)");
  const update=db.prepare(reconcilePaymentSql);
  const apply=(status,at)=>update.run('payment-1',status,at,'order-1','payment-1',status,status,at,'payment-1',status);
  const order=()=>({...db.prepare('SELECT status,payment_updated_at FROM orders').get()});
  assert.equal(apply('approved',20).changes,1);
  assert.equal(apply('in_process',10).changes,0);
  assert.equal(apply('approved',20).changes,0);
  assert.equal(apply('in_process',20).changes,0);
  assert.deepEqual(order(),{status:'approved',payment_updated_at:20});
  assert.equal(apply('refunded',30).changes,1);
  assert.equal(apply('approved',25).changes,0);
  assert.deepEqual(order(),{status:'refunded',payment_updated_at:30});
  assert.equal(apply('charged_back',40).changes,1);
  assert.equal(apply('refunded',30).changes,0);
  assert.deepEqual(order(),{status:'charged_back',payment_updated_at:40});
 }finally{db.close();}
});

test('the timestamp migration preserves existing orders and initializes on the next reconciliation',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('../drizzle/0000_abandoned_darwin.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO orders (id,items,amount_cents,delivery,customer_name,status,payment_id,created_at) VALUES ('order-1','[]',14900,'pickup','Test buyer','approved','payment-1','2026-10-01T00:00:00Z')");
  db.exec(readFileSync(new URL('../drizzle/0001_payment_update_timestamp.sql',import.meta.url),'utf8'));
  assert.deepEqual({...db.prepare('SELECT status,payment_id,amount_cents,payment_updated_at FROM orders').get()},{status:'approved',payment_id:'payment-1',amount_cents:14900,payment_updated_at:null});
  const apply=(status,at)=>db.prepare(reconcilePaymentSql).run('payment-1',status,at,'order-1','payment-1',status,status,at,'payment-1',status);
  assert.equal(apply('in_process',10).changes,0);
  assert.deepEqual({...db.prepare('SELECT status,payment_updated_at FROM orders').get()},{status:'approved',payment_updated_at:null});
  assert.equal(apply('approved',20).changes,1);
  assert.equal(db.prepare('SELECT payment_updated_at FROM orders').get().payment_updated_at,20);
  db.exec('UPDATE orders SET payment_updated_at=NULL');
  assert.equal(apply('refunded',30).changes,1);
  assert.equal(db.prepare('SELECT status FROM orders').get().status,'refunded');
  db.exec('UPDATE orders SET payment_updated_at=NULL');
  assert.equal(apply('approved',20).changes,0);
  assert.equal(db.prepare('SELECT status FROM orders').get().status,'refunded');
 }finally{db.close();}
});

test('payment update timestamps require a real calendar date and explicit timezone',()=>{
 for(const value of ['2026-10-01T12:30:45.123Z','2026-10-01T06:30:45.123-06:00','2026-10-01T13:30:45.123+01:00']){
  assert.equal(paymentUpdatedAt(value),Date.UTC(2026,9,1,12,30,45,123));
 }
 assert.equal(paymentUpdatedAt('2024-02-29T00:00:00Z'),Date.UTC(2024,1,29));
 for(const value of [undefined,null,0,{},'', 'not-a-date','2026-10-01','2026-10-01T12:00:00','2026-02-29T00:00:00Z','2026-04-31T00:00:00Z','2026-13-01T00:00:00Z','2026-10-01T24:00:00Z','2026-10-01T12:60:00Z','2026-10-01T12:00:00+24:00','1969-12-31T23:59:59Z']){
  assert.equal(paymentUpdatedAt(value),null,`Unexpectedly accepted ${String(value)}`);
 }
});
