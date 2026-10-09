import {catalog,type CartLine} from './catalog';

export type AvailabilityView={id:string;status:'available'|'made_to_order'|'sold_out';remaining:number|null;maxPerOrder:number|null;leadDays:number;version:number};
export type AvailabilityMap=Record<string,AvailabilityView>;
export function availableLimit(item:AvailabilityView|undefined):number {
  if(!item||!['available','made_to_order'].includes(item.status))return 0;
  if(item.remaining!==null&&(!Number.isSafeInteger(item.remaining)||item.remaining<0))return 0;
  if(item.maxPerOrder!==null&&(!Number.isSafeInteger(item.maxPerOrder)||item.maxPerOrder<1))return 0;
  return Math.min(item.remaining??Infinity,item.maxPerOrder??Infinity);
}
export function cartAvailabilityError(items:readonly CartLine[],desserts:readonly CartLine[],availability:AvailabilityMap|null):string {
  if(!availability)return 'Estamos consultando la disponibilidad. Si no se actualiza, vuelve a intentarlo o consulta con Carly.';
  const counts=new Map<string,number>();
  for(const line of [...items,...desserts]){if(!catalog.some(item=>item.id===line.id)||!Number.isSafeInteger(line.quantity)||line.quantity<1)return 'Revisa los productos y cantidades del carrito.';counts.set(line.id,(counts.get(line.id)??0)+line.quantity);}
  for(const[id,quantity]of counts){const item=catalog.find(product=>product.id===id);const limit=availableLimit(availability[id]);if(quantity>limit)return limit===0?`${item?.name??'Este producto'} (${item?.presentation??'presentación elegida'}) no está disponible por ahora. Retíralo o elige otro producto.`:`Puedes elegir hasta ${limit} de ${item?.name??'este producto'} (${item?.presentation??'presentación elegida'}), contando las piezas incluidas en el plan.`;}
  return '';
}
export function deliveryDateBounds(today:string,items:readonly {id:string}[],availability:AvailabilityMap|null){
  let base=new Date(`${today}T12:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isFinite(base.getTime())||base.toISOString().slice(0,10)!==today){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    base=new Date(`${['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-')}T12:00:00Z`);
  }
  const days=Math.max(0,...items.map(item=>{const known=/^(pastel-zanahoria|cheesecake-carlyfit)(-grande)?$/.test(item.id)?3:0;const supplied=availability?.[item.id]?.leadDays;return Math.max(known,typeof supplied==='number'&&Number.isSafeInteger(supplied)&&supplied>=0&&supplied<=365?supplied:0);}));
  const min=new Date(base);min.setUTCDate(min.getUTCDate()+days);const max=new Date(base);max.setUTCDate(max.getUTCDate()+365);
  return{min:min.toISOString().slice(0,10),max:max.toISOString().slice(0,10),days};
}
