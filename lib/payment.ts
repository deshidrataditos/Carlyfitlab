// Server-only integration. Never import this module from a client component.
export type MPConfig={token:string;webhookSecret:string;collectorId:string;origin:string;live:boolean};
export class MPRequestError extends Error{
 readonly status:number;
 constructor(status:number){super(`Mercado Pago request failed (${status}).`);this.name='MPRequestError';this.status=status;}
}
// Legacy orders lack a version: retain terminal states until a matching state or reversal arrives.
export const reconcilePaymentSql="UPDATE orders SET payment_id=?,status=?,payment_updated_at=? WHERE id=? AND (payment_id IS NULL OR (payment_id=? AND ((payment_updated_at IS NULL AND (status NOT IN ('approved','refunded','charged_back') OR status=? OR ? IN ('refunded','charged_back'))) OR payment_updated_at<?)) OR (payment_id<>? AND ?='approved' AND status IN ('pending','in_process','rejected','cancelled','authorized')))";
// Use only Mercado Pago's timestamp, with an explicit timezone and valid calendar date.
export function paymentUpdatedAt(value:unknown):number|null{
 if(typeof value!=='string')return null;
 const date=value.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
 if(!date||Number(date[3])>new Date(Date.UTC(Number(date[1]),Number(date[2]),0)).getUTCDate())return null;
 const timestamp=Date.parse(value);
 return Number.isSafeInteger(timestamp)&&timestamp>=0?timestamp:null;
}
// Existing payments must keep receiving updates while new checkouts are disabled.
export function webhookConfig():MPConfig|null{
 const {MERCADOPAGO_ACCESS_TOKEN:token,MERCADOPAGO_WEBHOOK_SECRET:webhookSecret,MERCADOPAGO_COLLECTOR_ID:collectorId,SITE_URL:origin,MERCADOPAGO_MODE:mode}=process.env;
 if(!token||!webhookSecret||!collectorId||!/^\d+$/.test(collectorId)||!origin||(mode!=='test'&&mode!=='live'))return null;
 try{const site=new URL(origin);if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)return null;return {token,webhookSecret,collectorId,origin:site.origin,live:mode==='live'};}catch{return null;}
}
export function paymentConfig():MPConfig|null{
 if(process.env.PAYMENTS_ENABLED!=='true'||process.env.CATALOG_CONFIRMED!=='true')return null;
 return webhookConfig();
}
export async function mpRequest<T>(config:MPConfig,path:string,body?:unknown):Promise<T>{
 const response=await fetch(`https://api.mercadopago.com${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new MPRequestError(response.status);
 return await response.json() as T;
}
// APP_USR test accounts may report live_mode=true. Verify the token owner instead.
export async function sellerEnvironmentMatches(config:MPConfig):Promise<boolean>{
 try{
  const seller=await mpRequest<{id:unknown;site_id:unknown;tags:unknown}>(config,'/users/me');
  return String(seller.id)===config.collectorId&&seller.site_id==='MLM'&&Array.isArray(seller.tags)&&seller.tags.every(tag=>typeof tag==='string')&&seller.tags.includes('test_user')===!config.live;
 }catch{return false;}
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
