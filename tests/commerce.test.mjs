import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCart,catalog} from '../lib/catalog.ts';
import {validWebhook,paymentConfig,reconcilePaymentSql} from '../lib/payment.ts';
import {DatabaseSync} from 'node:sqlite';

test('cart rejects unrecognized items, duplicates and invalid quantities',()=>{
 for(const value of [[],[{id:'inventado',quantity:1}],[{id:'galletas',quantity:-1}],[{id:'galletas',quantity:21}],[{id:'galletas',quantity:1.5}],[{id:'galletas',quantity:1},{id:'galletas',quantity:1}]])assert.throws(()=>validateCart(value));
});
test('cart drops client-supplied prices and totals',()=>{
 const lines=validateCart([{id:'galletas',quantity:2,price:0,total:0}]);
 assert.deepEqual(lines,[{id:'galletas',quantity:2}]);
 assert.equal(catalog.find(p=>p.id===lines[0].id).price*lines[0].quantity,298);
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
  db.exec("CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,payment_id TEXT UNIQUE); INSERT INTO orders VALUES ('order-1','pending',NULL)");
  const update=db.prepare(reconcilePaymentSql);
  const apply=(id,status)=>update.run(id,status,'order-1',id,status);
  apply('attempt-A','rejected');apply('attempt-B','approved');
  assert.deepEqual({...db.prepare('SELECT status,payment_id FROM orders').get()},{status:'approved',payment_id:'attempt-B'});
  apply('attempt-A','rejected');apply('attempt-B','approved');apply('attempt-C','pending');
  assert.deepEqual({...db.prepare('SELECT status,payment_id FROM orders').get()},{status:'approved',payment_id:'attempt-B'});
  apply('attempt-B','refunded');
  assert.equal(db.prepare('SELECT status FROM orders').get().status,'refunded');
 }finally{db.close();}
});
