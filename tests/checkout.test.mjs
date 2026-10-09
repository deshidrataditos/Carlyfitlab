import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {loadProductModule} from './load-product-module.mjs';
const {catalog,validateCart}=loadProductModule('catalog');

const desserts=loadProductModule('dessert-pack');
const productOptions=loadProductModule('product-options');
class MemberInputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
class MPRequestError extends Error {constructor(status){super('Provider rejection');this.status=status;}}
const availability={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/product-availability.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:availability,require:name=>name==='./catalog'?{catalog}:name==='./member-input'?{MemberInputError}:{},Date,Intl,Error,
});

// Exercise the real Worker route with isolated DB and payment API boundaries.
const route=ts.transpileModule(readFileSync(new URL('../app/api/checkout/route.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const checkoutUrl='https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=test-preference';
const planUser={id:'12345678-1234-1234-1234-123456789abc',email:'plan-buyer@example.test',is_anonymous:false,email_confirmed_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'google'}};

function checkoutHarness({live=false,enabled=true,initPoint=checkoutUrl,sellerMatches=true,items=[{id:'galletas',quantity:1}],delivery='pickup',dessertSelection,extraBody={},sessionEnabled=false,user=null,authError=null,profileError=null,stockError=false,rateLimited=false,providerError=null}={}){
 const writes=[];const calls=[];const exported={};const sessionCalls=[];const reservations=[];const released=[];
 const config=enabled?{origin:'https://shop.example',live}:null;
 const session=sessionEnabled?{
  client:{
   auth:{getUser:async()=>{sessionCalls.push({operation:'getUser'});return {data:{user},error:authError};}},
   from:table=>({select:columns=>({eq:(column,value)=>({maybeSingle:async()=>{
    sessionCalls.push({operation:'profile',table,columns,column,value});
    return {data:{display_name:'Verified member'},error:profileError};
   }})})}),
  },
  finish:response=>{response.headers.set('X-Test-Session-Finished','true');return response;},
 }:null;
 const dependencies={
  'cloudflare:workers':{env:{DB:{prepare:sql=>({bind:(...args)=>({run:async()=>{writes.push({sql,args});}})})}}},
  '@/lib/catalog':{catalog,validateCart},
  '@/lib/product-options':productOptions,
  '@/lib/dessert-pack':desserts,
  '@/lib/supabase-server':{memberSession:()=>session},
  '@/lib/member-input':{MemberInputError},
  '@/lib/product-availability':{...availability,limitCheckoutAttempts:async()=>{if(rateLimited)throw new MemberInputError('Try later',429);},reserveProductAvailability:async(_db,id,items)=>{if(stockError)throw new MemberInputError('Sold out',409);reservations.push({id,items});return '2026-12-31T23:59:59.000Z';},releaseRejectedPreference:async(_db,id)=>released.push(id)},
  '@/lib/payment':{MPRequestError,paymentConfig:()=>config,sellerEnvironmentMatches:async()=>sellerMatches,mpRequest:async(...args)=>{
   calls.push(args);
   if(providerError)throw providerError;
   return {id:'test-preference',init_point:initPoint,sandbox_init_point:'https://sandbox.mercadopago.com.mx/checkout/legacy-test'};
  }},
 };
 runInNewContext(route,{
  exports:exported,require:name=>{assert.ok(name in dependencies);return dependencies[name];},
  URL,Response,TextDecoder,Uint8Array,crypto,Error,console:{error:()=>{}},
 });
 const request=new Request('https://shop.example/api/checkout',{
  method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json'},
  body:JSON.stringify({items,delivery,customer:'Test buyer',dessertSelection,...extraBody}),
 });
 return {run:()=>exported.POST(request),writes,calls,sessionCalls,reservations,released,orderWrite:()=>writes.find(write=>write.sql.startsWith('INSERT INTO orders'))};
}

for(const live of [false,true])test(`checkout uses init_point for ${live?'live':'test seller'} mode`,async()=>{
 const fixture=checkoutHarness({live});
 const response=await fixture.run();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{url:checkoutUrl,orderId:fixture.writes[0].args[0]});
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

test('unverified or mismatched seller cannot create a preference or order',async()=>{
 for(const live of [false,true]){
  const fixture=checkoutHarness({live,sellerMatches:false});
  assert.equal((await fixture.run()).status,503);
  assert.equal(fixture.calls.length,0);
  assert.equal(fixture.writes.length,0);
 }
});

test('cake sizes remain distinct in the payment and stored order, with server prices',async()=>{
 const items=[
  {id:'pastel-zanahoria',quantity:2,price:1},
  {id:'pastel-zanahoria-grande',quantity:1,price:1},
  {id:'cheesecake-carlyfit',quantity:1,price:1,cheesecakeTopping:'frutos-rojos'},
  {id:'cheesecake-carlyfit-grande',quantity:1,price:1,cheesecakeTopping:'fresa-chia'},
 ];
 const fixture=checkoutHarness({items});
 assert.equal((await fixture.run()).status,200);
 const sent=fixture.calls[0][2].items;
 assert.deepEqual(Array.from(sent,item=>item.id),items.map(item=>item.id));
 assert.deepEqual(Array.from(sent,item=>item.unit_price),[95,750,99,720]);
 assert.match(sent[0].title,/Pastel de zanahoria.*Individual.*1 porción/);
 assert.match(sent[1].title,/Pastel de zanahoria.*Grande.*15 cm/);
 assert.match(sent[2].title,/Cheesecake Carlyfit.*Individual.*1 porción/);
 assert.match(sent[3].title,/Cheesecake Carlyfit.*Grande.*15 cm/);
 assert.equal(fixture.writes[0].args[2],175900);
 assert.deepEqual(JSON.parse(fixture.writes[0].args[1]),JSON.parse(JSON.stringify(sent)));
});

test('the retired monthly in-person plan is rejected before creating a payment or writing an order',async()=>{
 const fixture=checkoutHarness({items:[{id:'presencial-mensual',quantity:1,price:1}],delivery:'digital'});
 const response=await fixture.run();
 assert.equal(response.status,409);
 assert.match((await response.json()).error,/directamente con Carly/);
 assert.equal(fixture.calls.length,0);
 assert.equal(fixture.writes.length,0);
});

test('a complete five-piece pack persists its selection without charging for its included products',async()=>{
 const selection=[{id:'galletas',quantity:4,price:0},{id:'pastel-zanahoria',quantity:1}];
 const fixture=checkoutHarness({sessionEnabled:true,user:planUser,items:[{id:'dulce-90',quantity:1,price:1}],dessertSelection:selection});
 assert.equal((await fixture.run()).status,200);
 const order=fixture.orderWrite();
 assert.equal(order.args[2],299000);
 assert.deepEqual(JSON.parse(order.args[9]),selection.map(({id,quantity})=>({id,quantity})));
 assert.equal(fixture.calls[0][2].items.length,1);
 assert.equal(fixture.calls[0][2].items[0].id,'dulce-90');
 assert.equal(fixture.calls[0][2].items[0].unit_price,2990);
 assert.deepEqual(JSON.parse(order.args[1]),JSON.parse(JSON.stringify(fixture.calls[0][2].items)));
});

test('two dessert plans require ten included pieces while paid products remain separately priced',async()=>{
 const selection=[{id:'galletas',quantity:8},{id:'pastel-zanahoria',quantity:1},{id:'cheesecake-carlyfit',quantity:1,cheesecakeTopping:'manzana-canela'}];
 const fixture=checkoutHarness({sessionEnabled:true,user:planUser,items:[{id:'dulce-90',quantity:2},{id:'galletas',quantity:1}],dessertSelection:selection});
 assert.equal((await fixture.run()).status,200);
 assert.equal(fixture.orderWrite().args[2],603900);
 assert.deepEqual(JSON.parse(fixture.orderWrite().args[9]),selection);
 assert.deepEqual(Array.from(fixture.calls[0][2].items,item=>({id:item.id,quantity:item.quantity})),[{id:'dulce-90',quantity:2},{id:'galletas',quantity:1}]);
});

test('incomplete packs, extra pieces, combined cakes, excluded products and duplicate IDs fail before side effects',async()=>{
 const invalidSelections=[
  undefined,[],[{id:'galletas',quantity:4}],[{id:'galletas',quantity:6}],
  [{id:'galletas',quantity:3},{id:'pastel-zanahoria',quantity:1},{id:'cheesecake-carlyfit',quantity:1}],
  [{id:'galletas',quantity:4},{id:'pastel-zanahoria-grande',quantity:1}],
  [{id:'galletas',quantity:4},{id:'cheesecake-carlyfit-grande',quantity:1}],
  [{id:'galletas',quantity:4},{id:'inventado',quantity:1}],
  [{id:'galletas',quantity:2},{id:'galletas',quantity:3}],
 ];
 for(const dessertSelection of invalidSelections){
  const fixture=checkoutHarness({items:[{id:'dulce-90',quantity:1}],dessertSelection});
  const response=await fixture.run();
  assert.equal(response.status,400,JSON.stringify(dessertSelection));
  assert.equal(fixture.writes.length,0);
  assert.equal(fixture.calls.length,0);
 }
 const noPlan=checkoutHarness({dessertSelection:[{id:'galletas',quantity:5}]});
 assert.equal((await noPlan.run()).status,400);
 assert.equal(noPlan.writes.length,0);
 assert.equal(noPlan.calls.length,0);
});

test('a guest cannot attach an order to a client-supplied account ID',async()=>{
 for(const sessionEnabled of [false,true]){
  const fixture=checkoutHarness({sessionEnabled,authError:sessionEnabled?{name:'AuthSessionMissingError'}:null,extraBody:{userId:'spoofed-user',user_id:'spoofed-user',email:'spoofed@example.test'}});
  assert.equal((await fixture.run()).status,200);
  assert.equal(fixture.orderWrite().args[8],null);
  assert.deepEqual(JSON.parse(fixture.orderWrite().args[9]),[]);
  assert.equal(fixture.writes.some(write=>write.sql.includes('member_directory')),false);
 }
});

test('an authenticated order uses only the verified session identity and refreshes its member directory entry',async()=>{
 const user={id:'verified-user',email:'member@example.test',is_anonymous:false};
 const fixture=checkoutHarness({sessionEnabled:true,user,extraBody:{userId:'spoofed-user',user_id:'spoofed-user',email:'spoofed@example.test'}});
 const response=await fixture.run();
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-Test-Session-Finished'),'true');
 assert.equal(fixture.orderWrite().args[8],'verified-user');
 const directory=fixture.writes.find(write=>write.sql.includes('member_directory'));
 assert.deepEqual(directory.args.slice(0,3),['verified-user','member@example.test','Verified member']);
 assert.deepEqual(fixture.sessionCalls,[{operation:'getUser'},{operation:'profile',table:'profiles',columns:'display_name',column:'id',value:'verified-user'}]);
});

test('anonymous sessions remain guest orders and unavailable verification cannot create an order',async()=>{
 const anonymous=checkoutHarness({sessionEnabled:true,user:{id:'anonymous-user',is_anonymous:true}});
 assert.equal((await anonymous.run()).status,200);
 assert.equal(anonymous.orderWrite().args[8],null);
 assert.equal(anonymous.sessionCalls.length,1);
 for(const session of [
  {authError:{name:'AuthRetryableFetchError',status:503}},
  {user:{id:'verified-user',is_anonymous:false},profileError:{message:'Temporary profile outage'}},
 ]){
  const fixture=checkoutHarness({sessionEnabled:true,...session});
  assert.equal((await fixture.run()).status,400);
  assert.equal(fixture.writes.length,0);
  assert.equal(fixture.calls.length,0);
 }
});

test('topping selections are canonical in paid order titles and cannot change the cheesecake price',async()=>{
 for(const {value,label} of productOptions.cheesecakeToppings){
  const fixture=checkoutHarness({items:[{id:'cheesecake-carlyfit-grande',quantity:2,cheesecakeTopping:value,unit_price:1,price:1,toppingLabel:'Inventado'}]});
  assert.equal((await fixture.run()).status,200);
  const sent=fixture.calls[0][2].items[0];
  assert.equal(sent.unit_price,720);
  assert.equal(fixture.orderWrite().args[2],144000);
  assert.ok(sent.title.includes(`Mermelada de ${label.toLocaleLowerCase('es-MX')} · endulzada con alulosa`));
  assert.ok(!sent.title.includes('Inventado'));
  assert.deepEqual(JSON.parse(fixture.orderWrite().args[1]),JSON.parse(JSON.stringify(fixture.calls[0][2].items)));
 }
});

test('a bundled cheesecake stores its selected topping and includes it in the plan payment title without surcharge',async()=>{
 const selection=[{id:'galletas',quantity:4},{id:'cheesecake-carlyfit',quantity:1,cheesecakeTopping:'manzana-canela',price:1}];
 const fixture=checkoutHarness({sessionEnabled:true,user:planUser,items:[{id:'dulce-90',quantity:1}],dessertSelection:selection});
 assert.equal((await fixture.run()).status,200);
 assert.equal(fixture.orderWrite().args[2],299000);
 const persisted=JSON.parse(fixture.orderWrite().args[9]);
 assert.equal(persisted[1].cheesecakeTopping,'manzana-canela');
 assert.equal(persisted[1].price,undefined);
 assert.match(fixture.calls[0][2].items[0].title,/Cheesecake del paquete: Mermelada de manzana canela/);
});

test('missing or adulterated toppings fail before any payment or database side effects',async()=>{
 for(const cheesecakeTopping of [undefined,'chocolate','',null,{},1]){
  for(const bundled of [false,true]){
   const cheese={id:'cheesecake-carlyfit',quantity:1,...(cheesecakeTopping===undefined?{}:{cheesecakeTopping})};
   const fixture=checkoutHarness(bundled?{items:[{id:'dulce-90',quantity:1}],dessertSelection:[{id:'galletas',quantity:4},cheese]}:{items:[cheese]});
   assert.equal((await fixture.run()).status,400);
   assert.equal(fixture.writes.length,0);
   assert.equal(fixture.calls.length,0);
  }
 }
});

test('plans require a confirmed Google email before creating an order or preference',async()=>{
 for(const options of [
  {},{sessionEnabled:true},{sessionEnabled:true,user:{...planUser,is_anonymous:true}},
  {sessionEnabled:true,user:{...planUser,email_confirmed_at:null}},
  {sessionEnabled:true,user:{...planUser,email_confirmed_at:'not-a-date'}},
  {sessionEnabled:true,user:{...planUser,email_confirmed_at:'2999-01-01T00:00:00Z'}},
  {sessionEnabled:true,user:{...planUser,app_metadata:{provider:'email'}}},
  {sessionEnabled:true,user:{...planUser,email:'recipient@example.test,other@example.test'}},
  {sessionEnabled:true,user:planUser,authError:{status:401}},
 ]){
  const fixture=checkoutHarness({...options,items:[{id:'rutina-90',quantity:1}],delivery:'digital',extraBody:{email:planUser.email,user_id:planUser.id}});
  const response=await fixture.run();
  assert.ok([401,403].includes(response.status));
  assert.equal((await response.json()).code,'PLAN_SIGN_IN_REQUIRED');
  assert.equal(fixture.writes.length,0);
  assert.equal(fixture.calls.length,0);
 }
});

test('only a plan purchase snapshots the confirmed Google email; client email cannot choose a recipient',async()=>{
 for(const id of ['rutina-90','integral-90','galletas']){
  const fixture=checkoutHarness({sessionEnabled:true,user:planUser,items:[{id,quantity:1}],delivery:id==='galletas'?'pickup':'digital',extraBody:{email:'attacker@example.test',plan_contact_email:'attacker@example.test'}});
  assert.equal((await fixture.run()).status,200);
  assert.equal(fixture.orderWrite().args[8],planUser.id);
  assert.equal(fixture.orderWrite().args[10],id==='galletas'?null:planUser.email);
 }
});

test('checkout checks availability before creating a preference and uses the reservation expiry exactly',async()=>{
 const blocked=checkoutHarness({stockError:true});assert.equal((await blocked.run()).status,409);assert.equal(blocked.calls.length,0);
 const allowed=checkoutHarness();assert.equal((await allowed.run()).status,200);
 assert.equal(allowed.reservations[0].id,allowed.orderWrite().args[0]);assert.equal(allowed.calls[0][2].expiration_date_to,'2026-12-31T23:59:59.000Z');
 assert.equal(allowed.calls[0][2].expires,true);
 const limited=checkoutHarness({rateLimited:true});assert.equal((await limited.run()).status,429);assert.equal(limited.calls.length,0);assert.equal(limited.orderWrite(),undefined);
});

test('checkout reserves paid and included quantities together and never trusts client availability',async()=>{
 const fixture=checkoutHarness({sessionEnabled:true,user:planUser,items:[{id:'dulce-90',quantity:1},{id:'galletas',quantity:2}],dessertSelection:[{id:'galletas',quantity:5}],extraBody:{capacity:999,availability:{galletas:'available'}}});
 assert.equal((await fixture.run()).status,200);
 assert.equal(fixture.reservations[0].items.find(item=>item.id==='galletas').quantity,7);
 assert.equal(fixture.reservations[0].items.find(item=>item.id==='dulce-90').quantity,1);
});

test('requested delivery date is validated and persisted as an optional request, never sent as a payment promise',async()=>{
 const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const fixture=checkoutHarness({extraBody:{requestedDeliveryDate:tomorrow}});assert.equal((await fixture.run()).status,200);
 assert.equal(fixture.orderWrite().args[11],tomorrow);assert.equal(fixture.calls[0][2].requestedDeliveryDate,undefined);
 for(const requestedDeliveryDate of ['2026-02-30','1999-01-01','9999-12-31','tomorrow']){
  const bad=checkoutHarness({extraBody:{requestedDeliveryDate}});assert.equal((await bad.run()).status,400);assert.equal(bad.calls.length,0);assert.equal(bad.orderWrite(),undefined);
 }
 const cake=checkoutHarness({items:[{id:'pastel-zanahoria',quantity:1}],extraBody:{requestedDeliveryDate:tomorrow}});assert.equal((await cake.run()).status,400);assert.equal(cake.calls.length,0);
});

test('definitive preference rejection releases its reservation, while ambiguous failures keep capacity held',async()=>{
 const rejected=checkoutHarness({providerError:new MPRequestError(400)});assert.equal((await rejected.run()).status,400);assert.deepEqual(rejected.released,[rejected.orderWrite().args[0]]);
 for(const providerError of [new Error('timeout'),new MPRequestError(503)]){
  const ambiguous=checkoutHarness({providerError});assert.equal((await ambiguous.run()).status,400);assert.equal(ambiguous.released.length,0);
 }
});
