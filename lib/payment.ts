// Server-only integration. Never import this module from a client component.
export type MPConfig={token:string;webhookSecret:string;collectorId:string;origin:string;live:boolean};
export const reconcilePaymentSql="UPDATE orders SET payment_id=?,status=? WHERE id=? AND (payment_id IS NULL OR payment_id=? OR (?='approved' AND status IN ('pending','in_process','rejected','cancelled','authorized')))";
export function paymentConfig():MPConfig|null{
 const {MERCADOPAGO_ACCESS_TOKEN:token,MERCADOPAGO_WEBHOOK_SECRET:webhookSecret,MERCADOPAGO_COLLECTOR_ID:collectorId,SITE_URL:origin,PAYMENTS_ENABLED:enabled,CATALOG_CONFIRMED:confirmed}=process.env;
 if(enabled!=='true'||confirmed!=='true'||!token||!webhookSecret||!collectorId||!origin)return null;
 try{const site=new URL(origin);if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)return null;return {token,webhookSecret,collectorId,origin:site.origin,live:process.env.MERCADOPAGO_MODE==='live'};}catch{return null;}
}
export async function mpRequest<T>(config:MPConfig,path:string,body?:unknown):Promise<T>{
 const response=await fetch(`https://api.mercadopago.com${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error(`Mercado Pago request failed (${response.status}).`);
 return await response.json() as T;
}
export async function validWebhook(request:Request,secret:string):Promise<boolean>{
 const signature=request.headers.get('x-signature')||'';
 const requestId=request.headers.get('x-request-id');
 const paymentId=new URL(request.url).searchParams.get('data.id')?.toLowerCase();
 const pairs=Object.fromEntries(signature.split(',').map(p=>p.trim().split('=')));
 if(!paymentId||!/^[a-z0-9-]{1,100}$/.test(paymentId)||!requestId||!pairs.ts||!/^[0-9]+$/.test(pairs.ts)||!/^[0-9a-f]{64}$/i.test(pairs.v1||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const supplied=new Uint8Array((pairs.v1.match(/.{2}/g) as string[]).map(h=>parseInt(h,16)));
 return crypto.subtle.verify('HMAC',key,supplied,new TextEncoder().encode(`id:${paymentId};request-id:${requestId};ts:${pairs.ts};`));
}
