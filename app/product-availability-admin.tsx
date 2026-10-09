'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {catalog} from '@/lib/catalog';
import type {AdminAvailability,AvailabilityStatus} from '@/lib/product-availability';
import './product-availability-admin.css';

type Reservation={order_id:string;state:string;expires_at:number;preference_id:string|null;status:string};
type Inventory={products:AdminAvailability[];reservations:Reservation[]};
class AvailabilityError extends Error {constructor(message:string,readonly status:number){super(message);}}
async function request(options:RequestInit={},admin=true):Promise<Inventory>{
  const response=await fetch(`/api/store/availability${admin?'?admin=1':''}`,{...options,credentials:'same-origin',cache:'no-store'});
  const value:unknown=await response.json().catch(()=>null);
  const data=value&&typeof value==='object'?value as {error?:unknown;products?:unknown;reservations?:unknown}:{};
  if(!response.ok)throw new AvailabilityError(typeof data.error==='string'?data.error:'No pudimos consultar la disponibilidad.',response.status);
  if(!Array.isArray(data.products)||!Array.isArray(data.reservations))throw new Error('No pudimos leer la disponibilidad.');
  return {products:data.products as AdminAvailability[],reservations:data.reservations as Reservation[]};
}

function ProductEditor({row,busy,onSave}:{row:AdminAvailability;busy:boolean;onSave:(input:Record<string,unknown>)=>Promise<void>}) {
  const [status,setStatus]=useState(row.status),[capacity,setCapacity]=useState(row.capacity===null?'':String(row.capacity)),[maximum,setMaximum]=useState(row.maxPerOrder===null?'':String(row.maxPerOrder));
  const product=catalog.find(item=>item.id===row.id)!;
  function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const fields=new FormData(event.currentTarget);const capacity=String(fields.get('capacity')||''),maximum=String(fields.get('maximum')||'');void onSave({productId:row.id,status:String(fields.get('status')),capacity:capacity===''?null:Number(capacity),maxPerOrder:maximum===''?null:Number(maximum),expectedVersion:row.version});}
  return <form className="availability-editor" onSubmit={save}>
    <div><h5>{product.name}</h5><p>{product.presentation||'Plan digital'}{row.leadDays>0?` · ${row.leadDays} días de anticipación`:''}</p></div>
    <label>Estado<select name="status" value={status} disabled={busy} onChange={event=>setStatus(event.target.value as AvailabilityStatus)}><option value="available">Disponible</option><option value="made_to_order">Bajo pedido</option><option value="sold_out">Agotado</option></select></label>
    <label>Capacidad total<input name="capacity" type="number" inputMode="numeric" min={row.reserved+row.committed} max={1000000} step={1} value={capacity} placeholder="Sin límite configurado" disabled={busy} onChange={event=>setCapacity(event.target.value)}/></label>
    <label>Máximo por pedido<input name="maximum" type="number" inputMode="numeric" min={1} max={1000} step={1} value={maximum} placeholder="Sin límite adicional" disabled={busy} onChange={event=>setMaximum(event.target.value)}/></label>
    <p className="availability-counts">{row.reserved} reservadas · {row.committed} con pago confirmado · {row.remaining===null?'sin cantidad disponible publicada':`${row.remaining} disponibles`}</p>
    <button className="button outline" type="submit" disabled={busy}>Guardar disponibilidad</button>
  </form>;
}

export default function ProductAvailabilityAdmin({onAccessLost}:{onAccessLost?:()=>void}) {
  const [data,setData]=useState<Inventory|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(true);
  const active=useRef<AbortController|null>(null),accessLost=useRef(onAccessLost);
  useEffect(()=>{accessLost.current=onAccessLost;},[onAccessLost]);
  const load=useCallback(async(options:RequestInit={})=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;
    try{const result=await request({...options,signal:controller.signal},options.method!=='POST');if(!controller.signal.aborted)setData(result);return !controller.signal.aborted;}
    catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'No pudimos completar la acción.');if(cause instanceof AvailabilityError&&[401,403].includes(cause.status)){setData(null);accessLost.current?.();}}return false;}
    finally{if(!controller.signal.aborted)setBusy(false);}
  },[]);
  useEffect(()=>{
    const controller=new AbortController();active.current=controller;
    request({signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(cause=>{
      if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'No pudimos consultar la disponibilidad.');if(cause instanceof AvailabilityError&&[401,403].includes(cause.status)){setData(null);accessLost.current?.();}}
    }).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[]);
  async function save(body:Record<string,unknown>){setBusy(true);setError('');setNotice('');if(await load({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))setNotice(body.action==='review'?'Revisión completada. La reserva permanece si aún no puede liberarse.':'Disponibilidad actualizada.');}
  return <section className="product-availability-admin" aria-label="Disponibilidad de productos y planes">
    <div className="availability-heading"><div><h4>Disponibilidad y capacidad</h4><p>Cada presentación se administra por separado. Sin un límite configurado, la página no anuncia una cantidad en existencia.</p></div><button type="button" className="button outline" disabled={busy} onClick={()=>{setBusy(true);setError('');setNotice('');void load();}}>Actualizar</button></div>
    <p className="member-help">La capacidad total incluye unidades reservadas y con pago confirmado. Para reponer, aumenta ese total con una cantidad verificada. Los pasteles conservan 3 días de anticipación. La fecha que el cliente solicita siempre requiere tu confirmación.</p>
    {error&&<p role="alert" className="availability-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!data&&<p role="status">{busy?'Consultando disponibilidad…':'Actualiza para consultar los productos.'}</p>}
    {data&&<><div className="availability-products">{data.products.filter(row=>catalog.some(item=>item.id===row.id&&item.available!==false)).map(row=><ProductEditor key={`${row.id}:${row.version}`} row={row} busy={busy} onSave={save}/>)}</div>
    <div className="availability-reservations"><h5>Reservas por revisar</h5><p className="member-help">Los pagos en proceso conservan su capacidad. Las reservas vencidas se revisan automáticamente después de un día adicional. Solo se libera capacidad cuando Mercado Pago confirma una preferencia vencida y no hay pagos aprobados o en proceso. Los reembolsos no reponen productos automáticamente.</p>
      {data.reservations.length?data.reservations.map(row=><article key={row.order_id}><div><strong>Pedido {row.order_id}</strong><p>{row.state==='conflict'?'Pago tardío: confirma o repón la capacidad de todos los productos antes de asignarla y preparar el pedido.':`Enlace vence: ${new Date(row.expires_at*1000).toLocaleString('es-MX')}`}</p>{!row.preference_id&&<p>La creación del enlace no quedó confirmada. Requiere revisión del operador; no se libera automáticamente.</p>}</div>{row.state==='conflict'?<button type="button" className="button outline" disabled={busy||row.status!=='approved'} onClick={()=>void save({action:'allocate',orderId:row.order_id})}>Asignar disponibilidad al pago tardío</button>:<button type="button" className="button outline" disabled={busy||!row.preference_id} onClick={()=>void save({action:'review',orderId:row.order_id})}>Revisar con Mercado Pago</button>}</article>):<p>No hay reservas pendientes de revisión.</p>}
      <p className="member-help">Se muestran hasta 50 reservas. Revisar no cancela pagos ni fuerza una liberación. Si continúa aquí, aún no se cumplen las condiciones para liberarla.</p>
    </div></>}
  </section>;
}
