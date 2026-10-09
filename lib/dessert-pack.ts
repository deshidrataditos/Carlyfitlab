import {catalog, type CartLine} from './catalog';
import {validateCheesecakeTopping,requireCheesecakeToppings,productOptionLabel} from './product-options';

export type DessertSelection = CartLine[];

export const DESSERTS_PER_PACK = 5;
export const dessertPackProducts = catalog.filter(item=>item.kind==='product'&&!item.excludedFromPlans);
const eligibleIds = new Set(dessertPackProducts.map(item=>item.id));
const individualCakeIds = new Set(['pastel-zanahoria','cheesecake-carlyfit']);

function validPackCount(packCount:number):boolean {
 return Number.isSafeInteger(packCount)&&packCount>=0&&Number.isSafeInteger(packCount*DESSERTS_PER_PACK);
}

export function dessertPackCount(items:readonly CartLine[]):number {
 return items.reduce((count,item)=>count+(item.id==='dulce-90'?item.quantity:0),0);
}

export function isDessertPackCake(id:string):boolean {
 return individualCakeIds.has(id);
}

export function dessertSelectionCount(selection:DessertSelection):number {
 return selection.reduce((total,item)=>total+item.quantity,0);
}

export function validateDessertSelection(value:unknown,packCount:number):DessertSelection {
 if(!validPackCount(packCount))throw new Error('La cantidad de planes con postres no es válida.');
 if(!Array.isArray(value))throw new Error(packCount>0?'Elige las piezas incluidas en tu plan con postres.':'La selección de postres no es válida.');
 if(packCount===0){
  if(value.length)throw new Error('Los postres incluidos requieren El lado dulce del plan.');
  return [];
 }
 if(value.length>dessertPackProducts.length)throw new Error('La selección de postres contiene productos repetidos o no disponibles para el plan.');
 const expected=packCount*DESSERTS_PER_PACK;
 const seen=new Set<string>();
 const selection:DessertSelection=value.map((row:unknown)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Revisa los productos de tu paquete de postres.');
  const {id,quantity,cheesecakeTopping:rawTopping}=row as {id:unknown;quantity:unknown;cheesecakeTopping?:unknown};
  if(typeof id!=='string'||!eligibleIds.has(id))throw new Error('Este producto no se puede incluir en el paquete de postres. Los pasteles grandes se compran por separado.');
  if(seen.has(id))throw new Error('Cada producto debe aparecer una sola vez en el paquete de postres.');
  if(typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<1||quantity>expected)throw new Error('Revisa la cantidad de cada producto del paquete de postres.');
  seen.add(id);
  const cheesecakeTopping=validateCheesecakeTopping(id,rawTopping);
  return {id,quantity,...(cheesecakeTopping?{cheesecakeTopping}:{})};
 });
 const cakeCount=selection.reduce((total,item)=>total+(isDessertPackCake(item.id)?item.quantity:0),0);
 if(cakeCount>packCount)throw new Error(`Puedes incluir hasta ${packCount} ${packCount===1?'pastel individual':'pasteles individuales'} en total, entre zanahoria y cheesecake.`);
 const total=dessertSelectionCount(selection);
 if(total!==expected)throw new Error(`Elige exactamente ${expected} piezas para ${packCount===1?'tu plan con postres':`tus ${packCount} planes con postres`}. ${total<expected?`Te faltan ${expected-total}.`:`Retira ${total-expected}.`}`);
 requireCheesecakeToppings(selection);
 return selection;
}

// Preserve the first valid occurrence of each product, in selection order.
// Reducing plan quantity trims the selection; increasing it never chooses for the customer.
export function adjustSelectionForPacks(value:unknown,packCount:number):DessertSelection {
 if(!validPackCount(packCount)||packCount===0||!Array.isArray(value))return [];
 let remaining=packCount*DESSERTS_PER_PACK;
 let cakesRemaining=packCount;
 const seen=new Set<string>();
 const selection:DessertSelection=[];
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row))continue;
  const {id,quantity,cheesecakeTopping:rawTopping}=row as {id:unknown;quantity:unknown;cheesecakeTopping?:unknown};
  if(typeof id!=='string'||!eligibleIds.has(id)||seen.has(id)||typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<1)continue;
  seen.add(id);
  const cake=isDessertPackCake(id);
  const kept=Math.min(quantity,remaining,cake?cakesRemaining:remaining);
  if(kept>0){
   // Old saved selections remain editable even if they predate topping choices.
   let cheesecakeTopping;
   try{cheesecakeTopping=validateCheesecakeTopping(id,rawTopping);}catch{cheesecakeTopping=undefined;}
   selection.push({id,quantity:kept,...(cheesecakeTopping?{cheesecakeTopping}:{})});
   remaining-=kept;
   if(cake)cakesRemaining-=kept;
  }
 }
 return selection;
}

export function dessertSelectionSummary(selection:DessertSelection):string {
 return selection.map(line=>{
  const item=dessertPackProducts.find(product=>product.id===line.id);
  const option=productOptionLabel(line);
  return item?`${line.quantity} × ${item.name}${item.presentation?` (${item.presentation})`:''}${option?` — ${option}`:''}`:'';
 }).filter(Boolean).join('; ');
}
