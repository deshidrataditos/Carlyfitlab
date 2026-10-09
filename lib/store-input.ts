import {MemberInputError} from './member-input';
import {catalog} from './catalog';

export const PLAN_IDS = catalog.filter(item => item.kind === 'plan').map(item => item.id);
export const MAX_MATERIAL_BYTES = 45 * 1024 * 1024;
export const FULFILLMENT_STATES = ['received', 'preparing', 'ready', 'shipped', 'delivered'] as const;
export type FulfillmentStatus = typeof FULFILLMENT_STATES[number];
export type MaterialKind = 'routine' | 'nutrition' | 'video';
export type StoreIntake = {goal: string; experience: string; place: string; days: number; minutes: number; equipment: string};
export const PRODUCT_FIELDS = ['ingredients', 'allergens', 'storage', 'preparation', 'servings', 'shipping'] as const;
export type ProductInformation = Record<typeof PRODUCT_FIELDS[number], string>;
export type StoreContent = {products: Record<string, ProductInformation>; presentationVideoUrl: string; secondaryVideoUrl: string; googleMapsUrl: string; instagramUrl: string; businessHours: string};

export function storeId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new MemberInputError('El identificador no es válido.');
  }
  return value;
}

function plainText(value: unknown, max: number, min = 0) {
  if (typeof value !== 'string') throw new MemberInputError('Revisa los datos del formulario.');
  const clean = value.trim();
  if ([...clean].length < min || [...clean].length > max || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) {
    throw new MemberInputError(`Escribe texto sin etiquetas, de ${min} a ${max} caracteres.`);
  }
  return clean;
}

function integer(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new MemberInputError('Revisa los números del formulario.');
  return value;
}

export function intakeInput(data: Record<string, unknown>): StoreIntake {
  if (typeof data.experience !== 'string' || typeof data.place !== 'string' || !['beginner', 'intermediate', 'advanced'].includes(data.experience) || !['home', 'gym'].includes(data.place)) {
    throw new MemberInputError('Elige tu experiencia y lugar de entrenamiento.');
  }
  return {goal: plainText(data.goal, 240, 3), experience: String(data.experience), place: String(data.place), days: integer(data.days, 1, 7), minutes: integer(data.minutes, 15, 180), equipment: plainText(data.equipment, 1000)};
}

export function fulfillmentInput(data: Record<string, unknown>) {
  if (data.action !== 'fulfillment' || !FULFILLMENT_STATES.includes(data.fulfillmentStatus as FulfillmentStatus)) throw new MemberInputError('El estado del pedido no es válido.');
  return {orderId: storeId(data.orderId), expectedVersion: integer(data.expectedVersion, 0, 2147483647), fulfillmentStatus: data.fulfillmentStatus as FulfillmentStatus, fulfillmentNote: plainText(data.fulfillmentNote, 1000)};
}

export function checkFulfillmentTransition(paymentStatus: string, previous: string, next: FulfillmentStatus, delivery: string) {
  if (next !== 'received' && paymentStatus !== 'approved') throw new MemberInputError('El pago debe estar aprobado antes de preparar o entregar el pedido.', 409);
  if (next === previous) return;
  const transitions: Record<string, string[]> = {received: ['preparing'], preparing: ['ready'], ready: ['shipped', 'delivered'], shipped: ['delivered'], delivered: []};
  if (!transitions[previous]?.includes(next) || (next === 'shipped' && delivery !== 'shipping')) throw new MemberInputError('Ese cambio de estado no corresponde al siguiente paso del pedido.', 409);
}

export function storeQuery(url: string) {
  const params = new URL(url).searchParams;
  const offset = params.get('offset') ?? '0';
  const status = params.get('status') ?? '';
  if (!/^\d{1,6}$/.test(offset) || Number(offset) > 100000 || (status && !['pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'in_process', 'in_mediation'].includes(status))) throw new MemberInputError('El filtro de pedidos no es válido.');
  return {offset: Number(offset), status};
}

export function materialInput(data: Record<string, unknown>) {
  const kind = data.kind as MaterialKind;
  if (!['routine', 'nutrition', 'video'].includes(kind)) throw new MemberInputError('Elige el tipo de material.');
  const contentType = typeof data.contentType === 'string' ? data.contentType : '';
  const extensions: Record<string, string> = {'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/webm': 'webm'};
  const extension = extensions[contentType];
  if (!extension || (kind === 'video' ? !contentType.startsWith('video/') : contentType !== 'application/pdf')) throw new MemberInputError('Usa PDF para rutina y alimentación, o MP4/WebM para video.');
  const fileName = plainText(data.fileName, 180, 1);
  if (/[\/\\\r\n]/.test(fileName) || !fileName.toLowerCase().endsWith(`.${extension}`)) throw new MemberInputError('El nombre y el tipo de archivo no coinciden.');
  return {orderId: storeId(data.orderId), title: plainText(data.title, 100, 1), kind, contentType, size: integer(data.size, 1, MAX_MATERIAL_BYTES), extension};
}

function externalUrl(value: unknown, purpose: 'video' | 'maps' | 'instagram') {
  const text = plainText(value, 2048);
  if (!text) return '';
  let url: URL;
  try { url = new URL(text); } catch { throw new MemberInputError('El enlace no es válido.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new MemberInputError('Usa un enlace HTTPS válido.');
  if (purpose === 'instagram') {
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || !/^\/(?:[A-Za-z0-9._]{1,30}|reel\/[A-Za-z0-9_-]{1,50})\/?$/.test(url.pathname)) throw new MemberInputError('Usa un enlace de perfil o reel de Instagram.');
    url.search = '';
    url.hash = '';
    return url.href;
  }
  const valid = purpose === 'video'
    ? ['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)
      || (['facebook.com', 'www.facebook.com'].includes(url.hostname) && /^\/(?:reel\/\d+|share\/r\/[A-Za-z0-9]+)\/?$/.test(url.pathname))
    : (['www.google.com', 'google.com'].includes(url.hostname) && url.pathname.startsWith('/maps')) || url.hostname === 'maps.google.com' || (url.hostname === 'maps.app.goo.gl' && url.pathname.length > 1) || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/'));
  if (!valid) throw new MemberInputError(purpose === 'video' ? 'Usa un enlace de YouTube, Vimeo o un reel de Facebook.' : 'Usa un enlace de Google Maps.');
  return url.href;
}

export function contentInput(data: Record<string, unknown>): StoreContent {
  if (!data.products || typeof data.products !== 'object' || Array.isArray(data.products)) throw new MemberInputError('Revisa la información de los productos.');
  const validKeys = new Set(catalog.filter(item => item.kind === 'product').flatMap(item => [item.id, ...(item.productGroup ? [item.productGroup] : [])]));
  const products: Record<string, ProductInformation> = {};
  for (const [key, value] of Object.entries(data.products)) {
    if (!validKeys.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) throw new MemberInputError('El producto no es válido.');
    products[key] = Object.fromEntries(PRODUCT_FIELDS.map(field => [field, plainText((value as Record<string, unknown>)[field] ?? '', 2000)])) as ProductInformation;
  }
  return {products, presentationVideoUrl: externalUrl(data.presentationVideoUrl ?? '', 'video'), secondaryVideoUrl: externalUrl(data.secondaryVideoUrl ?? '', 'video'), googleMapsUrl: externalUrl(data.googleMapsUrl ?? '', 'maps'), instagramUrl: externalUrl(data.instagramUrl ?? '', 'instagram'), businessHours: plainText(data.businessHours ?? '', 500)};
}
