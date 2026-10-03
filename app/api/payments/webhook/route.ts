import {env} from 'cloudflare:workers';
import {webhookConfig,mpRequest,MPRequestError,validWebhook,reconcilePaymentSql,paymentUpdatedAt,sellerEnvironmentMatches} from '@/lib/payment';
export async function POST(request:Request){
 const config=webhookConfig();if(!config||!env.DB)return new Response('Unavailable',{status:503});
 try{
  if(!await validWebhook(request,config.webhookSecret))return new Response('Unauthorized',{status:401});
  const url=new URL(request.url);const id=url.searchParams.get('data.id')!;
  if(url.searchParams.get('type')&&url.searchParams.get('type')!=='payment')return new Response('OK');
  if(!await sellerEnvironmentMatches(config))return new Response('Seller unavailable',{status:503});
  const p=await mpRequest<{id:number;external_reference:string;currency_id:string;transaction_amount:number;collector_id:number;status:string;live_mode:boolean;date_last_updated:unknown}>(config,`/v1/payments/${encodeURIComponent(id)}`);
  const updatedAt=paymentUpdatedAt(p.date_last_updated);
  if(updatedAt===null)return new Response('Invalid payment timestamp',{status:400});
  const order=await env.DB.prepare('SELECT id,amount_cents,payment_id FROM orders WHERE id=?').bind(p.external_reference).first<{id:string;amount_cents:number;payment_id:string|null}>();
  if(!order)return new Response('OK');
  if(p.currency_id!=='MXN'||Math.round(p.transaction_amount*100)!==order.amount_cents||String(p.collector_id)!==config.collectorId||typeof p.live_mode!=='boolean'||(config.live&&!p.live_mode)||String(p.id)!==id)return new Response('Payment mismatch',{status:400});
  // The atomic timestamp guard prevents an older concurrent response from replacing newer state.
  await env.DB.prepare(reconcilePaymentSql).bind(String(p.id),p.status,updatedAt,order.id,String(p.id),p.status,p.status,updatedAt,String(p.id),p.status).run();
  return new Response('OK');
 }catch(error){console.error('payment_notification_unavailable',error instanceof MPRequestError?error.status:'internal_error');return new Response('Retry later',{status:503});}
}
