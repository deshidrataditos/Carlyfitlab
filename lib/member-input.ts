export class MemberInputError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function checkMemberOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new MemberInputError('Abre Carlyfit Lab para realizar esta acción.', 403);
  }
}

export async function memberBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new MemberInputError('El formato de la solicitud no es válido.', 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new MemberInputError('Faltan los datos de la solicitud.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new MemberInputError('El mensaje es demasiado largo.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch { throw new MemberInputError('No pudimos leer los datos.'); }
}

export function profileInput(data: Record<string, unknown>) {
  const name = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if ([...name].length < 2 || [...name].length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new MemberInputError('Escribe un nombre de 2 a 80 caracteres.');
  }
  if (typeof data.marketingOptIn !== 'boolean') throw new MemberInputError('Revisa tu preferencia de promociones.');
  return {display_name: name, marketing_opt_in: data.marketingOptIn};
}

export function testimonialInput(data: Record<string, unknown>) {
  const body = typeof data.body === 'string' ? data.body.trim() : '';
  if ([...body].length < 20 || [...body].length > 1500) {
    throw new MemberInputError('Tu experiencia debe tener entre 20 y 1500 caracteres.');
  }
  if (typeof data.rating !== 'number' || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    throw new MemberInputError('Elige una calificación de 1 a 5 estrellas.');
  }
  return {body, rating: data.rating};
}

export function moderationQuery(url: string) {
  const params = new URL(url).searchParams;
  const status = params.get('status') ?? 'pending';
  const offset = params.get('offset') ?? '0';
  if (!['pending', 'approved', 'rejected'].includes(status) || !/^\d{1,6}$/.test(offset) || Number(offset) > 100000) {
    throw new MemberInputError('El filtro de comentarios no es válido.');
  }
  return {status, offset: Number(offset)};
}

export function moderationInput(data: Record<string, unknown>) {
  if (typeof data.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)
    || (data.status !== 'approved' && data.status !== 'rejected')
    || typeof data.expectedStatus !== 'string' || !['pending', 'approved', 'rejected'].includes(data.expectedStatus)) {
    throw new MemberInputError('Revisa el comentario y la acción que quieres realizar.');
  }
  return {id: data.id, status: data.status, expectedStatus: data.expectedStatus};
}
