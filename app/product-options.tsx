'use client';

import {useId} from 'react';
import {cheesecakeToppings,type CheesecakeTopping} from '@/lib/product-options';
import './product-options.css';

export function CheesecakeOptionsNote(){
 return <p className="cheesecake-options-note">Elige en el carrito tu mermelada de frutos rojos, manzana canela o fresa chía, endulzada con alulosa. Sin costo adicional.</p>;
}

export default function CheesecakeToppingPicker({value,onChange,quantity,label,disabled=false}:{value?:CheesecakeTopping;onChange:(value:CheesecakeTopping)=>void;quantity:number;label:string;disabled?:boolean}){
 const id=useId();
 return <div className="cheesecake-topping">
  <label htmlFor={id}>Mermelada de tu cheesecake</label>
  <select id={id} value={value??''} required disabled={disabled} aria-label={`Mermelada de ${label}`} aria-describedby={`${id}-note`} onChange={event=>{
   const selected=cheesecakeToppings.find(option=>option.value===event.target.value);
   if(selected)onChange(selected.value);
  }}>
   <option value="" disabled>Elige un sabor</option>
   {cheesecakeToppings.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
  </select>
  <p id={`${id}-note`}>Endulzada con alulosa · Sin costo adicional.{quantity>1?' El sabor elegido aplica a todas las piezas de esta presentación.':''}</p>
 </div>;
}
