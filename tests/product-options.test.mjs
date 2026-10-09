import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProductModule} from './load-product-module.mjs';
const {validateCart}=loadProductModule('catalog');
const {cheesecakeToppings,requireCheesecakeToppings,productOptionLabel}=loadProductModule('product-options');
const plain=value=>JSON.parse(JSON.stringify(value));

test('both cheesecake presentations accept only the three canonical toppings and discard untrusted price fields',()=>{
 for(const id of ['cheesecake-carlyfit','cheesecake-carlyfit-grande']){
  for(const {value,label} of cheesecakeToppings){
   const line={id,quantity:2,cheesecakeTopping:value};
   assert.deepEqual(plain(validateCart([{...line,unit_price:1,price:0,toppingLabel:'inventado'}])),[line]);
   assert.doesNotThrow(()=>requireCheesecakeToppings([line]));
   assert.equal(productOptionLabel(line),`Mermelada de ${label.toLocaleLowerCase('es-MX')} · endulzada con alulosa`);
  }
 }
});
test('topping injection, malformed values and topping attached to another product are rejected',()=>{
 for(const cheesecakeTopping of ['<script>','chocolate','',null,{},[],1,true]){
  assert.throws(()=>validateCart([{id:'cheesecake-carlyfit',quantity:1,cheesecakeTopping}]));
 }
 assert.throws(()=>validateCart([{id:'galletas',quantity:1,cheesecakeTopping:'frutos-rojos'}]));
});
test('legacy cheesecake lines remain readable but must select a topping before ordering',()=>{
 const old={id:'cheesecake-carlyfit',quantity:1};
 assert.deepEqual(plain(validateCart([old])),[old]);
 assert.throws(()=>requireCheesecakeToppings([old]),/Elige la mermelada/);
 assert.equal(productOptionLabel(old),'');
});
