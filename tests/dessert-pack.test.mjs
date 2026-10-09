import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProductModule} from './load-product-module.mjs';
const {catalog}=loadProductModule('catalog');

const {validateDessertSelection,adjustSelectionForPacks,dessertPackCount,dessertPackProducts,dessertSelectionCount,dessertSelectionSummary}=loadProductModule('dessert-pack');
const cookie=quantity=>({id:'galletas',quantity});
const carrot=quantity=>({id:'pastel-zanahoria',quantity});
const cheesecake=quantity=>({id:'cheesecake-carlyfit',quantity,cheesecakeTopping:'frutos-rojos'});
const plain=value=>JSON.parse(JSON.stringify(value));

test('a dessert plan requires exactly five chosen pieces and returns only canonical quantities',()=>{
 assert.deepEqual(plain(validateDessertSelection([{...cookie(4),price:0},carrot(1)],1)),[cookie(4),carrot(1)]);
 assert.deepEqual(plain(validateDessertSelection([cookie(5)],1)),[cookie(5)]);
 for(const input of [undefined,null,{},[],[cookie(4)],[cookie(6)]])assert.throws(()=>validateDessertSelection(input,1));
});

test('the individual cake limit is shared between carrot cake and cheesecake',()=>{
 assert.throws(()=>validateDessertSelection([cookie(3),carrot(1),cheesecake(1)],1),/hasta 1 pastel individual/);
 assert.throws(()=>validateDessertSelection([cookie(3),carrot(2)],1),/hasta 1 pastel individual/);
 assert.deepEqual(plain(validateDessertSelection([cookie(4),cheesecake(1)],1)),[cookie(4),cheesecake(1)]);
});

test('two plans allow ten pieces and at most two individual cakes combined',()=>{
 const selection=[cookie(8),carrot(1),cheesecake(1)];
 assert.deepEqual(plain(validateDessertSelection(selection,2)),selection);
 assert.deepEqual(plain(validateDessertSelection([cookie(8),carrot(2)],2)),[cookie(8),carrot(2)]);
 assert.throws(()=>validateDessertSelection([cookie(7),carrot(2),cheesecake(1)],2),/hasta 2 pasteles individuales/);
 assert.throws(()=>validateDessertSelection([cookie(5)],2),/exactamente 10 piezas/);
});

test('unknown products, plans, and the large cake variants cannot enter the included pack',()=>{
 for(const id of ['inventado','dulce-90','rutina-90','presencial-mensual','pastel-zanahoria-grande','cheesecake-carlyfit-grande'])assert.throws(()=>validateDessertSelection([cookie(4),{id,quantity:1}],1));
 assert.equal(dessertPackProducts.length,catalog.filter(item=>item.kind==='product'&&!item.excludedFromPlans).length);
 assert.ok(dessertPackProducts.every(item=>item.kind==='product'&&!item.excludedFromPlans));
});

test('invalid quantities, duplicate products and malformed rows are rejected',()=>{
 for(const quantity of [-1,0,1.5,'5',null,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateDessertSelection([cookie(quantity)],1));
 for(const row of [null,[],{},'galletas'])assert.throws(()=>validateDessertSelection([cookie(4),row],1));
 assert.throws(()=>validateDessertSelection([cookie(2),cookie(3)],1),/una sola vez/);
 for(const packs of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>validateDessertSelection([],packs));
});

test('only an empty selection is accepted when there is no dessert plan',()=>{
 assert.deepEqual(plain(validateDessertSelection([],0)),[]);
 for(const selection of [undefined,null,[cookie(1)]])assert.throws(()=>validateDessertSelection(selection,0));
 assert.equal(dessertPackCount([{id:'dulce-90',quantity:2},{id:'galletas',quantity:5}]),2);
 assert.equal(dessertPackCount([{id:'integral-90',quantity:1}]),0);
});

test('reducing plan quantity trims deterministically without filling or mutating the existing selection',()=>{
 const before=[carrot(1),cheesecake(1),cookie(8)];
 assert.deepEqual(plain(adjustSelectionForPacks(before,1)),[carrot(1),cookie(4)]);
 assert.deepEqual(before,[carrot(1),cheesecake(1),cookie(8)]);
 assert.deepEqual(plain(adjustSelectionForPacks([cookie(5)],2)),[cookie(5)]);
 assert.deepEqual(plain(adjustSelectionForPacks(before,0)),[]);
 assert.deepEqual(plain(adjustSelectionForPacks(undefined,1)),[]);
});

test('stored valid choices retain their stable IDs, order and quantities',()=>{
 const selection=[{id:'mermelada',quantity:1},{id:'golden-milk',quantity:1},{id:'core-cookie',quantity:2},cheesecake(1)];
 const restored=JSON.parse(JSON.stringify(selection));
 assert.deepEqual(plain(adjustSelectionForPacks(restored,1)),selection);
 assert.deepEqual(plain(validateDessertSelection(restored,1)),selection);
 assert.equal(dessertSelectionCount(selection),5);
 assert.match(dessertSelectionSummary(selection),/1 × Cheesecake Carlyfit \(Individual · 1 porción\)/);
});

test('partial stored selections discard invalid entries and duplicates without inventing missing products',()=>{
 const selection=[null,{id:'pastel-zanahoria-grande',quantity:1},cookie(-1),cookie(2),cookie(2),carrot(2),cheesecake(1)];
 assert.deepEqual(plain(adjustSelectionForPacks(selection,1)),[cookie(2),carrot(1)]);
 assert.deepEqual(plain(adjustSelectionForPacks([],1)),[]);
});

test('pack topping survives persistence and appears in the customer and administrator summary',()=>{
 const selection=[cookie(4),{...cheesecake(1),cheesecakeTopping:'fresa-chia'}];
 const restored=adjustSelectionForPacks(JSON.parse(JSON.stringify(selection)),1);
 assert.deepEqual(plain(validateDessertSelection(restored,1)),selection);
 assert.match(dessertSelectionSummary(restored),/Mermelada de fresa chía · endulzada con alulosa/);
});

test('old packs retain a cheesecake without selecting a flavor for the shopper, while orders require one',()=>{
 const old=[cookie(4),{id:'cheesecake-carlyfit',quantity:1}];
 assert.deepEqual(plain(adjustSelectionForPacks(old,1)),old);
 assert.throws(()=>validateDessertSelection(old,1),/Elige la mermelada/);
 for(const cheesecakeTopping of ['chocolate','',null,{},1]){
  assert.throws(()=>validateDessertSelection([cookie(4),{...cheesecake(1),cheesecakeTopping}],1));
 }
 assert.throws(()=>validateDessertSelection([{...cookie(4),cheesecakeTopping:'frutos-rojos'},carrot(1)],1));
});
