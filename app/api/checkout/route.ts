import {env} from 'cloudflare:workers';
import {catalog,validateCart} from '@/lib/catalog';
import {validateDessertSelection,dessertPackCount} from '@/lib/dessert-pack';
import {memberSession} from '@/lib/supabase-server';
import {paymentConfig,mpRequest,sellerEnvironmentMatches} from '@/lib/payment';
export async function POST(request:Request){
 const config=paymentConfig();
 const session=memberSession(request);
 const finish=(response:Response)=>session?.finish(response)??response;
 if(!config||!env.DB)return Response.json({error:'El pago en línea aún no está activado. Confirma tu pedido por WhatsApp para recibir de Carly el importe final y las indicaciones de pago con Mercado Pago.'},{status:503});
 if(request.headers.get('origin')!==config.origin)return Response.json({error:'Solicitud no permitida.'},{status:403});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Formato no válido.'},{status:415});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error('Empty request');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192){await reader.cancel();return Response.json({error:'Pedido demasiado grande.'},{status:413});}chunks.push(chunk.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const raw=new TextDecoder().decode(bytes);
  const body=JSON.parse(raw) as {items:unknown;delivery:unknown;customer:unknown;dessertSelection?:unknown};
  const lines=validateCart(body.items);
  if(lines.some(line=>catalog.find(item=>item.id===line.id)?.available===false))return finish(Response.json({error:'El acompañamiento presencial ahora se acuerda directamente con Carly. Retíralo del carrito para continuar.'},{status:409}));
  let dessertSelection;
  try{dessertSelection=validateDessertSelection(body.dessertSelection??[],dessertPackCount(lines));}catch(error){return finish(Response.json({error:error instanceof Error?error.message:'Revisa las cinco piezas de tu paquete.'},{status:400}));}
  if(!['pickup','digital','shipping'].includes(String(body.delivery)))throw new Error('Entrega inválida.');
  if(body.delivery==='shipping')return Response.json({error:'Primero confirma el costo de envío con Carly por WhatsApp. Te compartirá el importe total antes de pagar.'},{status:409});
  if(lines.some(l=>catalog.find(p=>p.id===l.id)!.kind==='product'||l.id==='dulce-90')&&body.delivery!=='pickup')throw new Error('Confirma la entrega de tus productos.');
  const items=lines.map(l=>{const p=catalog.find(p=>p.id===l.id)!;return {id:p.id,title:p.presentation?`${p.name} — ${p.presentation}`:p.name,quantity:l.quantity,currency_id:'MXN',unit_price:p.price};});
  const amount=items.reduce((n,i)=>n+i.quantity*i.unit_price*100,0);
  if(!await sellerEnvironmentMatches(config))return Response.json({error:'El pago no está disponible en este momento. Contacta a Carly para verificarlo.'},{status:503});
  let userId:string|null=null;
  if(session){
   const {data:{user},error}=await session.client.auth.getUser();
   if(error&&error.name!=='AuthSessionMissingError'&&error.status!==401&&error.status!==403)throw new Error('Member session unavailable');
   if(user&&!user.is_anonymous){
    userId=user.id;
    const profile=await session.client.from('profiles').select('display_name').eq('id',user.id).maybeSingle();
    if(profile.error)throw new Error('Member profile unavailable');
    await env.DB.prepare('INSERT INTO member_directory (user_id,email,display_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at').bind(user.id,user.email??'',profile.data?.display_name??'',new Date().toISOString()).run();
   }
  }
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO orders (id,items,amount_cents,currency,delivery,customer_name,status,created_at,user_id,dessert_selection) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,JSON.stringify(items),amount,'MXN',body.delivery,typeof body.customer==='string'?body.customer.trim().slice(0,100):'','pending',new Date().toISOString(),userId,JSON.stringify(dessertSelection)).run();
  const result=await mpRequest<{id:string;init_point:string}>(config,'/checkout/preferences',{items,external_reference:id,back_urls:{success:`${config.origin}/pedido?order=${id}`,pending:`${config.origin}/pedido?order=${id}`,failure:`${config.origin}/pedido?order=${id}`},auto_return:'approved',notification_url:`${config.origin}/api/payments/webhook`,expires:true,expiration_date_to:new Date(Date.now()+86400000).toISOString()});
  const url=new URL(result.init_point);
  if(url.protocol!=='https:'||!['www.mercadopago.com.mx','sandbox.mercadopago.com.mx'].includes(url.hostname))throw new Error('Unexpected checkout URL');
  await env.DB.prepare('UPDATE orders SET preference_id=? WHERE id=?').bind(result.id,id).run();
  return finish(Response.json({url:url.href,orderId:id},{headers:{'Cache-Control':'no-store'}}));
 }catch(error){console.error('checkout_unavailable',error instanceof SyntaxError?'invalid_json':error instanceof Error?error.message:'unknown');return finish(Response.json({error:'No pudimos iniciar el pago. Revisa tu selección o contacta a Carly por WhatsApp.'},{status:400}));}
}
