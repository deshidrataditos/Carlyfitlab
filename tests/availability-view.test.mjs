import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProductModule} from './load-product-module.mjs';
const {availableLimit,cartAvailabilityError,deliveryDateBounds}=loadProductModule('availability-view');
const row=(id,values={})=>({id,status:'available',remaining:null,maxPerOrder:null,leadDays:0,version:0,...values});
test('carrito suma las piezas incluidas y compradas; respeta límite y unidades restantes',()=>{
 const map={galletas:row('galletas',{remaining:6,maxPerOrder:5}),'dulce-90':row('dulce-90')};
 assert.equal(availableLimit(map.galletas),5);
 assert.equal(cartAvailabilityError([{id:'galletas',quantity:1},{id:'dulce-90',quantity:1}],[{id:'galletas',quantity:4}],map),'');
 assert.match(cartAvailabilityError([{id:'galletas',quantity:2}],[{id:'galletas',quantity:4}],map),/hasta 5/);
 assert.match(cartAvailabilityError([{id:'galletas',quantity:1}],[],null),/consultando/);
 assert.match(cartAvailabilityError([{id:'galletas',quantity:1}],[],{galletas:row('galletas',{status:'sold_out'})}),/no está disponible/);
});
test('fecha solicitada respeta los pasteles incluidos y cambio de mes/año',()=>{
 const value=deliveryDateBounds('2026-12-30',[{id:'dulce-90'},{id:'pastel-zanahoria'}],null);
 assert.equal(value.min,'2027-01-02');assert.equal(value.max,'2027-12-30');
 assert.equal(deliveryDateBounds('2028-02-27',[{id:'cheesecake-carlyfit-grande'}],null).min,'2028-03-01');
 assert.equal(deliveryDateBounds('2026-10-09',[{id:'galletas'}],{galletas:row('galletas')}).min,'2026-10-09');
});
