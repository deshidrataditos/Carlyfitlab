import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProductModule} from './load-product-module.mjs';
const desserts=loadProductModule('dessert-pack');
const {emptyCartState,parseCartState,cartWithItems,cartWithDesserts,trackCheckout,linkCheckout,discardCheckout,settleCheckout}=loadProductModule('cart-state');
const cookie=quantity=>({id:'galletas',quantity});
const core=quantity=>({id:'core-cookie',quantity});
const dulce=quantity=>({id:'dulce-90',quantity});
const carrot=quantity=>({id:'pastel-zanahoria',quantity});
const plain=value=>JSON.parse(JSON.stringify(value));
function checkout(items=[cookie(1)]){return linkCheckout(trackCheckout(cartWithItems(emptyCartState(),items),'attempt'),'attempt','order');}
function dessertCheckout(selection=[cookie(4),carrot(1)],quantity=1){
 const state=cartWithDesserts(cartWithItems(emptyCartState(),[dulce(quantity)]),selection);
 return linkCheckout(trackCheckout(state,'attempt'),'attempt','order');
}

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

test('five chosen dessert pieces are copied into a checkout and survive a storage round trip',()=>{
 const choices=[cookie(4),carrot(1)];
 const state=dessertCheckout(choices);
 choices[0].quantity=1;
 assert.deepEqual(plain(state.checkouts[0].dessertSelection),[cookie(4),carrot(1)]);
 assert.deepEqual(plain(state.dessertSelection),[cookie(4),carrot(1)]);
 assert.notEqual(state.checkouts[0].dessertSelection,state.dessertSelection);
 assert.notEqual(state.checkouts[0].dessertSelection[0],state.dessertSelection[0]);
 const restored=parseCartState(JSON.stringify(state),null);
 assert.deepEqual(plain(restored),plain(state));
 assert.deepEqual(plain(desserts.validateDessertSelection(restored.checkouts[0].dessertSelection,1)),[cookie(4),carrot(1)]);
});

test('editing dessert quantities after checkout leaves the purchased snapshot intact',()=>{
 let state=cartWithItems(dessertCheckout(),[dulce(2)]);
 state=cartWithDesserts(state,[cookie(4),carrot(1),core(5)]);
 assert.deepEqual(plain(state.checkouts[0].dessertSelection),[cookie(4),carrot(1)]);
 const paid=settleCheckout(state,'order','approved');
 assert.deepEqual(plain(paid.items),[dulce(1)]);
 assert.deepEqual(plain(paid.dessertSelection),[core(5)]);
 assert.deepEqual(plain(paid.checkouts),[]);
 assert.deepEqual(plain(parseCartState(JSON.stringify(paid),null).dessertSelection),[core(5)]);
});

test('a confirmed dessert plan clears its chosen pieces and cannot consume a later selection twice',()=>{
 const paid=settleCheckout(dessertCheckout(),'order','approved');
 assert.deepEqual(plain(paid.items),[]);
 assert.deepEqual(plain(paid.dessertSelection),[]);
 const fresh=cartWithDesserts(cartWithItems(paid,[dulce(1)]),[cookie(5)]);
 assert.equal(settleCheckout(fresh,'order','approved'),fresh);
 assert.deepEqual(plain(fresh.dessertSelection),[cookie(5)]);
});

test('removing and re-adding a dessert plan preserves new choices on an older payment return',()=>{
 const removed=cartWithItems(dessertCheckout(),[]);
 const readded=cartWithDesserts(cartWithItems(removed,[dulce(1)]),[cookie(4),carrot(1)]);
 const result=settleCheckout(readded,'order','approved');
 assert.deepEqual(plain(result.items),[dulce(1)]);
 assert.deepEqual(plain(result.dessertSelection),[cookie(4),carrot(1)]);
});

test('two payment returns cannot remove a fresh dessert selection after the original plan was paid',()=>{
 let state=linkCheckout(trackCheckout(dessertCheckout(),'attempt-2'),'attempt-2','order-2');
 state=settleCheckout(state,'order','approved');
 state=cartWithDesserts(cartWithItems(state,[dulce(1)]),[cookie(4),carrot(1)]);
 const result=settleCheckout(state,'order-2','approved');
 assert.deepEqual(plain(result.items),[dulce(1)]);
 assert.deepEqual(plain(result.dessertSelection),[cookie(4),carrot(1)]);
});

test('reducing the number of plans trims choices to the new limits and increasing does not auto-fill',()=>{
 let state=cartWithDesserts(cartWithItems(emptyCartState(),[dulce(2)]),[carrot(2),cookie(8)]);
 state=cartWithItems(state,[dulce(1)]);
 assert.deepEqual(plain(state.dessertSelection),[carrot(1),cookie(4)]);
 state=cartWithItems(state,[dulce(2)]);
 assert.deepEqual(plain(state.dessertSelection),[carrot(1),cookie(4)]);
 assert.throws(()=>desserts.validateDessertSelection(state.dessertSelection,2),/exactamente 10/);
});

test('legacy carts and receipts without dessert choices load without inventing selections',()=>{
 const saved=JSON.stringify({version:1,items:[dulce(1)],checkouts:[{id:'old-order',items:[dulce(1)]}]});
 const modern=parseCartState(saved,null);
 assert.deepEqual(plain(modern.items),[dulce(1)]);
 assert.deepEqual(plain(modern.dessertSelection),[]);
 assert.deepEqual(plain(modern.checkouts[0].dessertSelection),[]);
 const legacy=parseCartState(null,JSON.stringify([dulce(1)]));
 assert.deepEqual(plain(legacy.items),[dulce(1)]);
 assert.deepEqual(plain(legacy.dessertSelection),[]);
});

test('retired monthly plans leave current carts while their old receipts remain readable',()=>{
 const monthly={id:'presencial-mensual',quantity:1};
 const saved=JSON.stringify({version:1,items:[monthly,cookie(2)],checkouts:[{id:'old-monthly',items:[monthly,cookie(1)]}]});
 const restored=parseCartState(saved,null);
 assert.deepEqual(plain(restored.items),[cookie(2)]);
 assert.deepEqual(plain(restored.checkouts[0].items),[monthly,cookie(1)]);
 assert.deepEqual(plain(settleCheckout(restored,'old-monthly','approved').items),[cookie(1)]);
 assert.deepEqual(plain(parseCartState(null,JSON.stringify([monthly,cookie(1)])).items),[cookie(1)]);
 assert.deepEqual(plain(cartWithItems(emptyCartState(),[monthly,cookie(1)]).items),[cookie(1)]);
});

const cheesecake=(quantity,cheesecakeTopping='frutos-rojos')=>({id:'cheesecake-carlyfit',quantity,cheesecakeTopping});
test('cart and checkout snapshots preserve toppings across reloads and successful settlement',()=>{
 const original=checkout([cheesecake(2)]);
 const restored=parseCartState(JSON.stringify(original),null);
 assert.deepEqual(plain(restored),plain(original));
 const increased=cartWithItems(restored,[cheesecake(3)]);
 assert.deepEqual(plain(settleCheckout(increased,'order','approved').items),[cheesecake(1)]);
 const bundled=dessertCheckout([cookie(4),cheesecake(1,'fresa-chia')]);
 const persisted=parseCartState(JSON.stringify(bundled),null);
 assert.deepEqual(plain(persisted.dessertSelection),[cookie(4),cheesecake(1,'fresa-chia')]);
 assert.deepEqual(plain(settleCheckout(persisted,'order','approved').items),[]);
 assert.deepEqual(plain(settleCheckout(persisted,'order','approved').dessertSelection),[]);
});

test('changing a topping after checkout preserves the new direct selection, even if the old topping is selected again',()=>{
 const changed=cartWithItems(checkout([cheesecake(2)]),[cheesecake(2,'fresa-chia')]);
 assert.deepEqual(plain(settleCheckout(changed,'order','approved').items),[cheesecake(2,'fresa-chia')]);
 const reverted=cartWithItems(changed,[cheesecake(2)]);
 assert.deepEqual(plain(settleCheckout(reverted,'order','approved').items),[cheesecake(2)]);
});

test('changing a bundled topping preserves the new complete plan selection on an older successful return',()=>{
 const initial=dessertCheckout([cookie(4),cheesecake(1)]);
 const changed=cartWithDesserts(initial,[cookie(4),cheesecake(1,'manzana-canela')]);
 const result=settleCheckout(parseCartState(JSON.stringify(changed),null),'order','approved');
 assert.deepEqual(plain(result.items),[dulce(1)]);
 assert.deepEqual(plain(result.dessertSelection),[cookie(4),cheesecake(1,'manzana-canela')]);
 const reverted=cartWithDesserts(changed,[cookie(4),cheesecake(1)]);
 assert.deepEqual(plain(settleCheckout(reverted,'order','approved').dessertSelection),[cookie(4),cheesecake(1)]);
});

test('settling persisted snapshots never matches a different topping even without a prior cart edit event',()=>{
 const state=checkout([cheesecake(1)]);
 state.items=[cheesecake(1,'fresa-chia')];
 assert.deepEqual(plain(settleCheckout(state,'order','approved').items),[cheesecake(1,'fresa-chia')]);
 const bundled=dessertCheckout([cookie(4),cheesecake(1)]);
 bundled.dessertSelection=[cookie(4),cheesecake(1,'fresa-chia')];
 const settled=settleCheckout(bundled,'order','approved');
 assert.deepEqual(plain(settled.items),[dulce(1)]);
 assert.deepEqual(plain(settled.dessertSelection),[cookie(4),cheesecake(1,'fresa-chia')]);
});

test('old cheesecake carts and checkout receipts keep their contents until a customer chooses a topping',()=>{
 const oldCheese={id:'cheesecake-carlyfit',quantity:1};
 const legacy=parseCartState(null,JSON.stringify([oldCheese,cookie(2)]));
 assert.deepEqual(plain(legacy.items),[oldCheese,cookie(2)]);
 const saved={version:1,items:[dulce(1),oldCheese],dessertSelection:[cookie(4),oldCheese],checkouts:[{id:'old',items:[dulce(1),oldCheese],dessertSelection:[cookie(4),oldCheese]}]};
 assert.deepEqual(plain(parseCartState(JSON.stringify(saved),null)),saved);
});
