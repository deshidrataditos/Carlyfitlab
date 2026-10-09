export const cheesecakeToppings = [
 {value:'frutos-rojos',label:'Frutos rojos'},
 {value:'manzana-canela',label:'Manzana canela'},
 {value:'fresa-chia',label:'Fresa chía'},
] as const;
export type CheesecakeTopping = typeof cheesecakeToppings[number]['value'];
type ProductChoice = {id:string;cheesecakeTopping?:CheesecakeTopping};

export function isCheesecake(id:string):boolean {
 return id==='cheesecake-carlyfit'||id==='cheesecake-carlyfit-grande';
}
export function validateCheesecakeTopping(id:string,value:unknown):CheesecakeTopping|undefined {
 if(value===undefined)return undefined;
 if(!isCheesecake(id)||!cheesecakeToppings.some(option=>option.value===value))throw new Error('Elige una mermelada disponible para el cheesecake.');
 return value as CheesecakeTopping;
}
export function cheesecakeToppingLabel(value:unknown):string {
 return cheesecakeToppings.find(option=>option.value===value)?.label??'';
}
export function productOptionLabel(line:ProductChoice):string {
 const label=isCheesecake(line.id)?cheesecakeToppingLabel(line.cheesecakeTopping):'';
 return label?`Mermelada de ${label.toLocaleLowerCase('es-MX')} · endulzada con alulosa`:'';
}
export function requireCheesecakeToppings(lines:readonly ProductChoice[]):void {
 for(const line of lines){
  const selected=validateCheesecakeTopping(line.id,line.cheesecakeTopping);
  if(isCheesecake(line.id)&&!selected)throw new Error('Elige la mermelada de tu cheesecake: frutos rojos, manzana canela o fresa chía.');
 }
}
export function sameProductChoice(first:ProductChoice,second:ProductChoice):boolean {
 return first.id===second.id&&first.cheesecakeTopping===second.cheesecakeTopping;
}
