import {validateCart,type CartLine} from './catalog';

export const CART_STORAGE_KEY='carlyfit-cart-state';
export const LEGACY_CART_KEY='carlyfit-cart-draft';
export type CartState={version:1;items:CartLine[];checkouts:{id:string;items:CartLine[]}[]};
export const emptyCartState=():CartState=>({version:1,items:[],checkouts:[]});
function lines(value:unknown):CartLine[]{return Array.isArray(value)&&value.length===0?[]:validateCart(value);}
export function parseCartState(saved:string|null,legacy:string|null):CartState{
 try{
  if(!saved)return {...emptyCartState(),items:legacy?lines(JSON.parse(legacy)):[]};
  const value=JSON.parse(saved);
  if(value.version!==1||!Array.isArray(value.checkouts)||value.checkouts.length>20)throw new Error('Invalid cart');
  return {version:1,items:lines(value.items),checkouts:value.checkouts.map((entry:{id:unknown;items:unknown})=>{
   if(typeof entry.id!=='string'||entry.id.length>80)throw new Error('Invalid checkout');
   return {id:entry.id,items:lines(entry.items)};
  })};
 }catch{return emptyCartState();}
}

// Removing an item also removes its association with outstanding checkouts.
// Adding it again is a new selection and must survive an older payment return.
export function cartWithItems(state:CartState,items:CartLine[]):CartState{
 const next=lines(items);
 const removed=new Map(state.items.map(line=>[line.id,Math.max(0,line.quantity-(next.find(item=>item.id===line.id)?.quantity||0))]));
 return {...state,items:next,checkouts:state.checkouts.map(checkout=>({...checkout,items:checkout.items.map(line=>({...line,quantity:Math.max(0,line.quantity-(removed.get(line.id)||0))})).filter(line=>line.quantity>0)}))};
}
export function trackCheckout(state:CartState,id:string):CartState{
 return {...state,checkouts:[...state.checkouts.filter(checkout=>checkout.id!==id),{id,items:state.items.map(line=>({...line}))}].slice(-20)};
}
export function linkCheckout(state:CartState,attemptId:string,orderId:string):CartState{
 return {...state,checkouts:state.checkouts.map(checkout=>checkout.id===attemptId?{...checkout,id:orderId}:checkout)};
}
export function discardCheckout(state:CartState,id:string):CartState{
 return {...state,checkouts:state.checkouts.filter(checkout=>checkout.id!==id)};
}
export function settleCheckout(state:CartState,orderId:string,status:string):CartState{
 const paid=state.checkouts.find(checkout=>checkout.id===orderId);
 if(status!=='approved'||!paid)return state;
 const remaining=state.items.map(line=>({...line,quantity:Math.max(0,line.quantity-(paid.items.find(item=>item.id===line.id)?.quantity||0))})).filter(line=>line.quantity>0);
 // One persisted update removes both the purchased quantities and the receipt.
 // Reloads and other tabs cannot apply the same receipt again.
 return discardCheckout(cartWithItems(state,remaining),orderId);
}
