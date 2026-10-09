'use client';

import {useState} from 'react';
import {ArrowUpRight, Plus} from 'lucide-react';
import {catalog, money, type CatalogItem} from '@/lib/catalog';
import {isCheesecake} from '@/lib/product-options';
import {CheesecakeOptionsNote} from './product-options';

export const productGroups = Object.values(catalog.filter(item=>item.kind==='product').reduce<Record<string,CatalogItem[]>>((groups,item)=>{
 (groups[item.productGroup??item.id]??=[]).push(item);
 return groups;
},{}));

export function ProductPresentation({item,onChange,context}:{item:CatalogItem;onChange:(item:CatalogItem)=>void;context:string}){
 const variants=item.productGroup?catalog.filter(option=>option.productGroup===item.productGroup):[];
 if(variants.length<2)return null;
 const id=`presentation-${context}-${item.productGroup}`;
 return <div className="product-presentation"><label htmlFor={id}>Presentación</label><select id={id} aria-label={`Presentación de ${item.name}`} value={item.id} onChange={event=>{
  const selected=variants.find(option=>option.id===event.target.value);
  if(selected)onChange(selected);
 }}>{variants.map(option=><option value={option.id} key={option.id}>{option.variantLabel}</option>)}</select></div>;
}

export default function ProductCard({variants,onDetails,onAdd}:{variants:CatalogItem[];onDetails:(item:CatalogItem)=>void;onAdd:(id:string)=>void}){
 const [selected,setSelected]=useState(variants[0]);
 return <article className="product-card">
  <button className="product-image" onClick={()=>onDetails(selected)} aria-label={`Ver detalles de ${selected.name}`}><img src={selected.image} alt={`Imagen ilustrativa de ${selected.name}`} loading="lazy" width="1024" height="1024"/><span>{selected.tag}</span><span className="product-see"><ArrowUpRight size={22}/></span></button>
  <div className="product-info">
   <button onClick={()=>onDetails(selected)}><h3>{selected.name}</h3></button>
   <ProductPresentation item={selected} onChange={setSelected} context="card"/>
   {isCheesecake(selected.id)&&<CheesecakeOptionsNote/>}
   <div className="product-buy"><div><strong>{money(selected.price)} <small>MXN</small></strong><p>{selected.presentation}</p></div><button className="icon-button" onClick={()=>onAdd(selected.id)} aria-label={`Agregar ${selected.name}, ${selected.presentation}, al carrito`}><Plus size={22}/></button></div>
   {(selected.excludedFromPlans||selected.planNote)&&<p className="product-plan-note">{selected.planNote??'Venta por separado · No incluido en los planes'}</p>}
  </div>
 </article>;
}
