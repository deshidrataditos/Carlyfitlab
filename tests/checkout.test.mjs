import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {catalog,validateCart} from '../lib/catalog.ts';

// Exercise the real Worker route with isolated DB and payment API boundaries.
const route=ts.transpileModule(readFileSync(new URL('../app/api/checkout/route.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const checkoutUrl='https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=test-preference';

function checkoutHarness({live=false,enabled=true,initPoint=checkoutUrl}={}){
 const writes=[];const calls=[];const exported={};
 const config=enabled?{origin:'https://shop.example',live}:null;
 const dependencies={
  'cloudflare:workers':{env:{DB:{prepare:sql=>({bind:(...args)=>({run:async()=>{writes.push({sql,args});}})})}}},
  '@/lib/catalog':{catalog,validateCart},
  '@/lib/payment':{paymentConfig:()=>config,mpRequest:async(...args)=>{
   calls.push(args);
   return {id:'test-preference',init_point:initPoint,sandbox_init_point:'https://sandbox.mercadopago.com.mx/checkout/legacy-test'};
  }},
 };
 runInNewContext(route,{
  exports:exported,require:name=>{assert.ok(name in dependencies);return dependencies[name];},
  URL,Response,TextDecoder,Uint8Array,crypto,console:{error:()=>{}},
 });
 const request=new Request('https://shop.example/api/checkout',{
  method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json'},
  body:JSON.stringify({items:[{id:'galletas',quantity:1}],delivery:'pickup',customer:'Test buyer'}),
 });
 return {run:()=>exported.POST(request),writes,calls};
}

for(const live of [false,true])test(`checkout uses init_point for ${live?'live':'test seller'} mode`,async()=>{
 const fixture=checkoutHarness({live});
 const response=await fixture.run();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{url:checkoutUrl});
 assert.equal(fixture.calls[0][1],'/checkout/preferences');
 assert.equal(fixture.calls[0][0].live,live);
 assert.equal(fixture.writes.length,2);
 assert.equal(fixture.writes[1].args[0],'test-preference');
});

test('checkout rejects unsafe init_point without falling back to sandbox',async()=>{
 for(const initPoint of ['not-a-url','http://www.mercadopago.com.mx/checkout','https://outside.example/checkout']){
  const fixture=checkoutHarness({initPoint});
  const response=await fixture.run();
  assert.equal(response.status,400);
  assert.equal((await response.json()).url,undefined);
  assert.equal(fixture.writes.length,1);
 }
});

test('disabled checkout does not create a preference or write an order',async()=>{
 const fixture=checkoutHarness({enabled:false});
 assert.equal((await fixture.run()).status,503);
 assert.equal(fixture.calls.length,0);
 assert.equal(fixture.writes.length,0);
});
