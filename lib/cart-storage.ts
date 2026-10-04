import {CART_STORAGE_KEY,LEGACY_CART_KEY,emptyCartState,parseCartState,type CartState} from './cart-state';

export const CART_CHANGED_EVENT='carlyfit-cart-changed';
let memory=emptyCartState();
export function readCart():CartState{
 try{memory=parseCartState(localStorage.getItem(CART_STORAGE_KEY),localStorage.getItem(LEGACY_CART_KEY));}catch{}
 return memory;
}
export function updateCart(update:(current:CartState)=>CartState):CartState{
 const previous=readCart();const next=update(previous);
 if(next===previous)return previous;
 memory=next;
 try{localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(next));localStorage.removeItem(LEGACY_CART_KEY);}catch{}
 window.dispatchEvent(new Event(CART_CHANGED_EVENT));
 return next;
}
