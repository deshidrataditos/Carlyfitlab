import {env} from 'cloudflare:workers';
import {catalog,validateCart} from '@/lib/catalog';
import {paymentConfig,mpRequest,sellerEnvironmentMatches} from '@/lib/payment';
export async function POST(request:Request){
 const config=paymentConfig();
 if(!config||!env.DB)return Response.json({error:'El pago en línea aún no está activado. Confirma tu pedido por WhatsApp para recibir de Carly el importe final y las indicaciones de pago con Mercado Pago.'},{status:503});
 if(request.headers.get('origin')!==config.origin)return Response.json({error:'Solicitud no permitida.'},{status:403});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Formato no válido.'},{status:415});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error('Empty request');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192){await reader.cancel();return Response.json({error:'Pedido demasiado grande.'},{status:413});}chunks.push(chunk.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const raw=new TextDecoder().decode(bytes);
  const body=JSON.parse(raw) as {items:unknown;delivery:unknown;customer:unknown};
  const lines=validateCart(body.items);
  if(!['pickup','digital','shipping'].includes(String(body.delivery)))throw new Error('Entrega inválida.');
  if(body.delivery==='shipping')return Response.json({error:'Primero confirma el costo de envío con Carly por WhatsApp. Te compartirá el importe total antes de pagar.'},{status:409});
  if(lines.some(l=>catalog.find(p=>p.id===l.id)!.kind==='product'||l.id==='dulce-90')&&body.delivery!=='pickup')throw new Error('Confirma la entrega de tus productos.');
  const items=lines.map(l=>{const p=catalog.find(p=>p.id===l.id)!;return {id:p.id,title:p.presentation?`${p.name} — ${p.presentation}`:p.name,quantity:l.quantity,currency_id:'MXN',unit_price:p.price};});
  const amount=items.reduce((n,i)=>n+i.quantity*i.unit_price*100,0);
  if(!await sellerEnvironmentMatches(config))return Response.json({error:'El pago no está disponible en este momento. Contacta a Carly para verificarlo.'},{status:503});
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO orders (id,items,amount_cents,currency,delivery,customer_name,status,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,JSON.stringify(items),amount,'MXN',body.delivery,typeof body.customer==='string'?body.customer.trim().slice(0,100):'','pending',new Date().toISOString()).run();
  const result=await mpRequest<{id:string;init_point:string}>(config,'/checkout/preferences',{items,external_reference:id,back_urls:{success:`${config.origin}/pedido?order=${id}`,pending:`${config.origin}/pedido?order=${id}`,failure:`${config.origin}/pedido?order=${id}`},auto_return:'approved',notification_url:`${config.origin}/api/payments/webhook`,expires:true,expiration_date_to:new Date(Date.now()+86400000).toISOString()});
  const url=new URL(result.init_point);
  if(url.protocol!=='https:'||!['www.mercadopago.com.mx','sandbox.mercadopago.com.mx'].includes(url.hostname))throw new Error('Unexpected checkout URL');
  await env.DB.prepare('UPDATE orders SET preference_id=? WHERE id=?').bind(result.id,id).run();
  return Response.json({url:url.href,orderId:id},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('checkout_unavailable',error instanceof SyntaxError?'invalid_json':error instanceof Error?error.message:'unknown');return Response.json({error:'No pudimos iniciar el pago. Revisa tu selección o contacta a Carly por WhatsApp.'},{status:400});}
}
