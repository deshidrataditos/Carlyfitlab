import {env} from 'cloudflare:workers';
import {whatsapp} from '@/lib/catalog';
import PaidCart from './paid-cart';
export const dynamic='force-dynamic';
export default async function Order({searchParams}:{searchParams:Promise<{order?:string}>}){
 const {order}=await searchParams;let status='unknown';
 if(order&&/^[0-9a-f-]{36}$/.test(order)&&env.DB){try{const row=await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(order).first<{status:string}>();status=row?.status||'unknown';}catch{}}
 const approved=status==='approved';
 return <main className="wrap section">{approved&&order&&<PaidCart orderId={order}/>}<a href="/" className="wordmark">carlyfit<span>LAB</span></a><div style={{maxWidth:620,margin:'70px auto'}}><p className="eyebrow">TU PEDIDO</p><h1 style={{fontSize:48}}>{approved?'Pago confirmado.':'Revisemos tu pedido.'}</h1><p className="intro">{approved?'Mercado Pago confirmó tu pago. Contacta a Carly para acordar la entrega o el inicio de tu plan.':'Aún no hay un pago aprobado confirmado para este pedido. Si acabas de pagar, espera un momento y actualiza esta página; evita repetir el pago mientras lo verificamos.'}</p><a className="button primary" style={{marginTop:28}} href={whatsapp(`Hola, Carly. Quiero consultar el estado de mi pedido${order&&/^[0-9a-f-]{36}$/.test(order)?` ${order}`:''}.`)} target="_blank" rel="noopener noreferrer">Consultar con Carly</a><a className="text-link" style={{marginLeft:20}} href="/">Volver a la tienda</a></div></main>;
}
