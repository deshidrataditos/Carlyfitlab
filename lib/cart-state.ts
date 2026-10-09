import {catalog,validateCart,type CartLine} from './catalog';
import {adjustSelectionForPacks,dessertPackCount,type DessertSelection} from './dessert-pack';
import {isCheesecake,sameProductChoice} from './product-options';

export const CART_STORAGE_KEY='carlyfit-cart-state';
export const LEGACY_CART_KEY='carlyfit-cart-draft';
export type CartState={version:1;items:CartLine[];dessertSelection:DessertSelection;checkouts:{id:string;items:CartLine[];dessertSelection?:DessertSelection}[]};
export const emptyCartState=():CartState=>({version:1,items:[],dessertSelection:[],checkouts:[]});
function available(items:CartLine[]){return items.filter(line=>catalog.find(item=>item.id===line.id)?.available!==false);}
function lines(value:unknown):CartLine[]{return Array.isArray(value)&&value.length===0?[]:validateCart(value);}
export function parseCartState(saved:string|null,legacy:string|null):CartState{
 try{
  if(!saved)return {...emptyCartState(),items:legacy?available(lines(JSON.parse(legacy))):[]};
  const value=JSON.parse(saved);
  if(value.version!==1||!Array.isArray(value.checkouts)||value.checkouts.length>20)throw new Error('Invalid cart');
  const items=available(lines(value.items));
  return {version:1,items,dessertSelection:adjustSelectionForPacks(value.dessertSelection,dessertPackCount(items)),checkouts:value.checkouts.map((entry:{id:unknown;items:unknown;dessertSelection?:unknown})=>{
   if(typeof entry.id!=='string'||entry.id.length>80)throw new Error('Invalid checkout');
   const purchased=lines(entry.items);return {id:entry.id,items:purchased,dessertSelection:adjustSelectionForPacks(entry.dessertSelection,dessertPackCount(purchased))};
  })};
 }catch{return emptyCartState();}
}

// Removing an item also removes its association with outstanding checkouts.
// Adding it again is a new selection and must survive an older payment return.
export function cartWithItems(state:CartState,items:CartLine[]):CartState{
 const next=available(lines(items));
 const removed=state.items.map(line=>({...line,quantity:Math.max(0,line.quantity-(next.find(item=>sameProductChoice(item,line))?.quantity||0))}));
 return {...state,items:next,dessertSelection:adjustSelectionForPacks(state.dessertSelection,dessertPackCount(next)),checkouts:state.checkouts.map(checkout=>{const items=checkout.items.map(line=>({...line,quantity:Math.max(0,line.quantity-(removed.find(item=>sameProductChoice(item,line))?.quantity||0))})).filter(line=>line.quantity>0);return {...checkout,items,dessertSelection:adjustSelectionForPacks(checkout.dessertSelection,dessertPackCount(items))};})};
}
export function cartWithDesserts(state:CartState,selection:DessertSelection):CartState{
 const next=adjustSelectionForPacks(selection,dessertPackCount(state.items));
 const changedTopping=state.dessertSelection.some(line=>isCheesecake(line.id)&&next.some(item=>item.id===line.id&&!sameProductChoice(item,line)));
 // A new topping makes the plan a new choice. An older payment must not consume it,
 // even if the shopper later selects the old topping again.
 const checkouts=changedTopping?state.checkouts.map(checkout=>({...checkout,items:checkout.items.filter(line=>line.id!=='dulce-90'),dessertSelection:[]})):state.checkouts;
 return {...state,dessertSelection:next,checkouts};
}
export function trackCheckout(state:CartState,id:string):CartState{
 return {...state,checkouts:[...state.checkouts.filter(checkout=>checkout.id!==id),{id,items:state.items.map(line=>({...line})),dessertSelection:state.dessertSelection.map(line=>({...line}))}].slice(-20)};
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
 const changedPackTopping=paid.dessertSelection?.some(line=>isCheesecake(line.id)&&state.dessertSelection.some(item=>item.id===line.id&&!sameProductChoice(item,line)))??false;
 const purchased=changedPackTopping?paid.items.filter(line=>line.id!=='dulce-90'):paid.items;
 const remaining=state.items.map(line=>({...line,quantity:Math.max(0,line.quantity-(purchased.find(item=>sameProductChoice(item,line))?.quantity||0))})).filter(line=>line.quantity>0);
 // One persisted update removes both the purchased quantities and the receipt.
 // Reloads and other tabs cannot apply the same receipt again.
 const dessertSelection=changedPackTopping?state.dessertSelection:state.dessertSelection.map(line=>({...line,quantity:Math.max(0,line.quantity-(paid.dessertSelection?.find(item=>sameProductChoice(item,line))?.quantity||0))})).filter(line=>line.quantity>0);
 return discardCheckout(cartWithItems({...state,dessertSelection},remaining),orderId);
}
