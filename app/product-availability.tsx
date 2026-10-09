'use client';
import {useCallback,useEffect,useState} from 'react';
import {availableLimit,type AvailabilityMap,type AvailabilityView} from '@/lib/availability-view';
import './product-availability.css';

export function useProductAvailability(cartOpen:boolean){
 const [items,setItems]=useState<AvailabilityMap|null>(null);const[today,setToday]=useState(()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(v=>v.type===k)!.value).join('-');});const[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/store/availability',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('unavailable');return await response.json() as {products:AvailabilityView[];today:string};}).then(data=>{if(!controller.signal.aborted){setItems(Object.fromEntries(data.products.map(item=>[item.id,item])));setToday(data.today);}}).catch(()=>{if(!controller.signal.aborted)setItems(null);});return()=>controller.abort();},[revision,cartOpen]);
 return{availability:items,today,refresh};
}
export default function ProductAvailability({item}:{item:AvailabilityView|undefined}){
 if(!item)return <p className="product-availability">Consultando disponibilidad…</p>;
 const soldOut=availableLimit(item)===0;
 return <p className={`product-availability${soldOut?' is-sold-out':''}`}><strong>{soldOut?'Agotado temporalmente':item.status==='made_to_order'?'Bajo pedido':'Disponible para pedir'}</strong>{!soldOut&&item.leadDays>0&&<span>Solicita con al menos {item.leadDays} días de anticipación.</span>}{!soldOut&&item.maxPerOrder!==null&&<span>Máximo {item.maxPerOrder} por pedido.</span>}</p>;
}
