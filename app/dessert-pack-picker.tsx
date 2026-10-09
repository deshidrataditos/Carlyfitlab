'use client';

import {useId} from 'react';
import {Check, Minus, Plus} from 'lucide-react';
import {DESSERTS_PER_PACK,dessertPackProducts,dessertSelectionCount,isDessertPackCake,type DessertSelection} from '@/lib/dessert-pack';
import './dessert-pack.css';

export type DessertPackPickerProps={
 packCount:number;
 value:DessertSelection;
 onChange:(selection:DessertSelection)=>void;
 disabled?:boolean;
};

export default function DessertPackPicker({packCount,value,onChange,disabled=false}:DessertPackPickerProps){
 const sectionId=useId();
 if(packCount<1)return null;
 const total=DESSERTS_PER_PACK*packCount;
 const chosen=dessertSelectionCount(value);
 const remaining=total-chosen;
 const cakeCount=value.reduce((count,item)=>count+(isDessertPackCake(item.id)?item.quantity:0),0);
 const complete=remaining===0&&cakeCount<=packCount;
 const status=remaining>0?`Te ${remaining===1?'falta 1 pieza':`faltan ${remaining} piezas`}`:remaining<0?`Retira ${-remaining} ${remaining===-1?'pieza':'piezas'}`:cakeCount>packCount?'Reduce los pasteles individuales':'Tu paquete está completo';
 function change(id:string,delta:number){
  if(disabled)return;
  const current=value.find(item=>item.id===id)?.quantity??0;
  if(delta>0&&(remaining<=0||(isDessertPackCake(id)&&cakeCount>=packCount)))return;
  if(delta<0&&current===0)return;
  const next=current+delta;
  onChange(current?value.map(item=>item.id===id?{id,quantity:next}:item).filter(item=>item.quantity>0):[...value,{id,quantity:next}]);
 }
 return <section className="dessert-pack" aria-labelledby={`${sectionId}-title`}>
  <div className="dessert-pack-heading">
   <h3 id={`${sectionId}-title`}>Arma tu paquete de postres</h3>
   <span className="dessert-pack-included">Incluido en tu plan</span>
  </div>
  <p className="dessert-pack-description">{packCount===1?'Elige tus 5 piezas favoritas.':`Elige ${total} piezas: 5 por cada plan.`} Puedes repetir productos.</p>
  <div className={`dessert-pack-progress${complete?' is-complete':''}`}>
   <div className="dessert-pack-progress-copy" role="status" aria-live="polite" aria-atomic="true">
    <strong>{chosen} de {total} piezas</strong>
    <span>{complete&&<Check size={14} aria-hidden="true"/>}{status}</span>
   </div>
   <progress max={total} value={Math.max(0,Math.min(chosen,total))} aria-label="Piezas elegidas para tu paquete"/>
  </div>
  <p className="dessert-pack-rule" id={`${sectionId}-rule`}>Hasta {packCount} {packCount===1?'pastel individual':'pasteles individuales'} en total, entre zanahoria y cheesecake. Los pasteles grandes no están incluidos.</p>
  <ul className="dessert-pack-products" aria-describedby={`${sectionId}-rule`}>
   {dessertPackProducts.map(item=>{
    const quantity=value.find(line=>line.id===item.id)?.quantity??0;
    const cake=isDessertPackCake(item.id);
    const cakeLimit=cake&&cakeCount>=packCount;
    const addDisabled=disabled||remaining<=0||cakeLimit;
    const displayName=`${item.name}${cake?' individual':''}`;
    const limitNote=cakeLimit?'Ya elegiste el máximo de pasteles individuales':remaining<=0?'Ya elegiste todas las piezas':undefined;
    return <li className={`dessert-pack-product${quantity?' is-selected':''}`} key={item.id}>
     <div className="dessert-pack-product-copy"><strong>{displayName}</strong><span>{item.presentation}</span></div>
     <div className="dessert-pack-quantity" role="group" aria-label={`Cantidad de ${displayName}`}>
      <button type="button" disabled={disabled||quantity===0} onClick={()=>change(item.id,-1)} aria-label={`Quitar una pieza de ${displayName}`}><Minus size={15} aria-hidden="true"/></button>
      <output aria-label={`Piezas de ${displayName}`}>{quantity}</output>
      <button type="button" disabled={addDisabled} onClick={()=>change(item.id,1)} aria-label={`Agregar una pieza de ${displayName}`} title={limitNote}><Plus size={15} aria-hidden="true"/></button>
     </div>
    </li>;
   })}
  </ul>
  <p className="dessert-pack-note">Sin costo adicional dentro del plan. Disponibilidad se confirma con Carly. El tiempo de preparación se acuerda al comenzar el plan.</p>
 </section>;
}
