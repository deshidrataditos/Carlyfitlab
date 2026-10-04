import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {validateCart} from '../lib/catalog.ts';

const exported={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/cart-state.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports:exported,require:name=>{assert.equal(name,'./catalog');return {validateCart};}});
const {emptyCartState,parseCartState,cartWithItems,trackCheckout,linkCheckout,discardCheckout,settleCheckout}=exported;
const cookie=quantity=>({id:'galletas',quantity});
const core=quantity=>({id:'core-cookie',quantity});
const plain=value=>JSON.parse(JSON.stringify(value));
function checkout(items=[cookie(1)]){return linkCheckout(trackCheckout(cartWithItems(emptyCartState(),items),'attempt'),'attempt','order');}

test('a confirmed checkout removes its items, and reloading an old order preserves a new cart',()=>{
 const paid=settleCheckout(checkout(),'order','approved');
 assert.deepEqual(plain(paid.items),[]);
 const shoppingAgain=cartWithItems(paid,[cookie(1),core(1)]);
 assert.equal(settleCheckout(shoppingAgain,'order','approved'),shoppingAgain);
});
test('pending, rejected and unknown order returns do not clear the cart',()=>{
 const state=checkout();
 for(const status of ['pending','in_process','rejected','cancelled','unknown'])assert.equal(settleCheckout(state,'order',status),state);
 assert.equal(settleCheckout(state,'different-order','approved'),state);
});
test('additional products and additional units survive payment confirmation',()=>{
 const state=cartWithItems(checkout([cookie(2)]),[cookie(3),core(2)]);
 assert.deepEqual(plain(settleCheckout(state,'order','approved').items),[cookie(1),core(2)]);
});
test('removing and re-adding a product starts a new selection that an older checkout cannot remove',()=>{
 const removed=cartWithItems(checkout(),[]);
 const readded=cartWithItems(removed,[cookie(1)]);
 assert.deepEqual(plain(settleCheckout(readded,'order','approved').items),[cookie(1)]);
 const reduced=cartWithItems(checkout([cookie(3)]),[cookie(1)]);
 const increased=cartWithItems(reduced,[cookie(2)]);
 assert.deepEqual(plain(settleCheckout(increased,'order','approved').items),[cookie(1)]);
});
test('cart edits while the payment link is being created are preserved',()=>{
 const pending=trackCheckout(cartWithItems(emptyCartState(),[cookie(1)]),'attempt');
 const changed=cartWithItems(pending,[cookie(2),core(1)]);
 const linked=linkCheckout(changed,'attempt','order');
 assert.deepEqual(plain(settleCheckout(linked,'order','approved').items),[cookie(1),core(1)]);
 assert.deepEqual(plain(discardCheckout(changed,'attempt').items),[cookie(2),core(1)]);
});
test('two checkout attempts cannot subtract the same original items twice',()=>{
 let state=linkCheckout(trackCheckout(checkout(),'attempt-2'),'attempt-2','order-2');
 state=settleCheckout(state,'order','approved');
 state=cartWithItems(state,[cookie(1)]);
 assert.deepEqual(plain(settleCheckout(state,'order-2','approved').items),[cookie(1)]);
});
test('stored receipts survive navigation and are removed in the same update as the paid items',()=>{
 const restored=parseCartState(JSON.stringify(checkout()),null);
 const paid=settleCheckout(restored,'order','approved');
 const reloaded=parseCartState(JSON.stringify(paid),JSON.stringify([cookie(1)]));
 assert.deepEqual(plain(reloaded.items),[]);
 assert.deepEqual(plain(reloaded.checkouts),[]);
});
test('legacy carts migrate without inventing a payment association; invalid data fails safely',()=>{
 const legacy=parseCartState(null,JSON.stringify([cookie(1)]));
 assert.deepEqual(plain(legacy.items),[cookie(1)]);
 assert.equal(settleCheckout(legacy,'old-approved-order','approved'),legacy);
 for(const saved of ['bad-json','{}',JSON.stringify({version:1,items:[cookie(-1)],checkouts:[]})])assert.deepEqual(plain(parseCartState(saved,null).items),[]);
});
