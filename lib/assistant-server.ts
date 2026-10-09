import {MemberInputError} from './member-input';

export const ASSISTANT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
export const ASSISTANT_USER_LIMIT = 12;
export const ASSISTANT_GLOBAL_LIMIT = 30;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 450;
export const ASSISTANT_MAX_PROMPT_BYTES = 20000;
export const ASSISTANT_TIMEOUT_MS = 25000;

export function assistantInput(data: Record<string, unknown>): string {
  if (Object.keys(data).length !== 1 || typeof data.message !== 'string') throw new MemberInputError('Envía únicamente tu pregunta sobre Carlyfit Lab.');
  const message = data.message.trim();
  if (!message || [...message].length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) throw new MemberInputError('Escribe una pregunta de hasta 600 caracteres.');
  if (/\S+@\S+\.\S+|(?:\d[\s()+.-]*){10,}/.test(message)) throw new MemberInputError('Evita incluir correos, teléfonos, números de tarjeta u otros datos personales.');
  return message;
}

// Handle sensitive/private requests without transmitting them to the model.
export function localAssistantReply(message: string): string | null {
  const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/diabet|embaraz|lactancia|amamant|enfermedad|diagnostic|medicament|antidepres|hipertens|insulina|trastorno|tratamiento|lesion|dolor|soy alergic|tengo alergia|soy celiac|tengo cancer/.test(normalized)) return 'Para una consulta de salud o una restricción personal, contacta a Carly y al profesional de salud que te atiende. Aquí puedo explicar los productos y sus ingredientes publicados, pero no confirmar si son adecuados para tu caso ni preparar una dieta.';
  if (/mi pedido|mis pedidos|mi pago|mi rutina|mis archivos|mi historial|datos de (?:un |otro |los )?cliente|datos privados|contrasen|token|api key/.test(normalized)) return 'Para tus pedidos y el material de tu plan, abre «Mi cuenta» en Carlyfit Lab. Este asistente solo consulta información pública de la tienda; Carly puede ayudarte por WhatsApp con la atención de tu compra.';
  if (/receta|paso a paso.*(?:pastel|postre|galleta)|ignora.*instruccion|system prompt|prompt del sistema|revela.*instruccion/.test(normalized)) return 'Puedo ayudarte con los productos, precios, ingredientes publicados y planes de Carlyfit Lab. Las recetas completas y la información interna no están disponibles en este asistente.';
  return null;
}

type UsageRow = {used: number; total: number; now: number; resets: number; wait_until: number};
export async function assistantUsage(db: D1Database, userId: string) {
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM assistant_requests WHERE user_id=? AND created_at >= (unixepoch()/86400)*86400) AS used,
    (SELECT COUNT(*) FROM assistant_requests WHERE created_at >= (unixepoch()/86400)*86400) AS total,
    unixepoch() AS now, (unixepoch()/86400+1)*86400 AS resets,
    COALESCE((SELECT MAX(MAX(created_at+30,lease_until)) FROM assistant_requests WHERE user_id=?),0) AS wait_until`)
    .bind(userId, userId).first<UsageRow>();
  if (!row) throw new Error('Assistant usage unavailable');
  return {limit: ASSISTANT_USER_LIMIT, remaining: Math.max(0, ASSISTANT_USER_LIMIT-row.used), resetsAt: new Date(row.resets*1000).toISOString(), globallyLimited: row.total >= ASSISTANT_GLOBAL_LIMIT, retryAfter: Math.max(0, row.wait_until-row.now), dailyRetryAfter: row.resets-row.now};
}

export async function reserveAssistantRequest(db: D1Database, userId: string, id: string) {
  // Retain short-lived identifiers only. Cleanup runs with the next valid request.
  await db.prepare('DELETE FROM assistant_requests WHERE created_at < unixepoch()-172800 AND lease_until < unixepoch()').run();
  const result = await db.prepare(`INSERT INTO assistant_requests (id,user_id,created_at,lease_until)
    SELECT ?,?,unixepoch(),unixepoch()+90
    WHERE (SELECT COUNT(*) FROM assistant_requests WHERE created_at >= (unixepoch()/86400)*86400) < ?
      AND (SELECT COUNT(*) FROM assistant_requests WHERE user_id=? AND created_at >= (unixepoch()/86400)*86400) < ?
      AND NOT EXISTS (SELECT 1 FROM assistant_requests WHERE user_id=? AND (created_at > unixepoch()-30 OR lease_until > unixepoch()))`)
    .bind(id, userId, ASSISTANT_GLOBAL_LIMIT, userId, ASSISTANT_USER_LIMIT, userId).run();
  return result.meta.changes === 1;
}

export async function releaseAssistantRequest(db: D1Database, id: string) {
  await db.prepare('UPDATE assistant_requests SET lease_until=0 WHERE id=?').bind(id).run();
}

export function assistantReply(value: unknown): string {
  const text = value && typeof value === 'object' && 'response' in value ? value.response : null;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty assistant reply');
  // Text only: no model HTML, navigation, tools, automatic purchases or URLs.
  const clean = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+|www\.\S+/gi, '').trim().slice(0, 3000);
  if (!clean) throw new Error('Empty assistant reply');
  return clean;
}
