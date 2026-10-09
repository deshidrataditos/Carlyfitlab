import {MemberInputError} from './member-input';
import type {StoreSession} from './store-server';

export const COMMUNITY_SUSPENDED_MESSAGE = 'Tu cuenta está suspendida para usar el asistente y publicar comentarios. Tus pedidos y materiales siguen disponibles. Contacta a Carly para revisarlo.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CustomerRestriction = {
  suspended:boolean; reason:string|null; updatedAt:string|null; version:number; canSuspend:boolean;
};

// The database reads the verified session's own ID. A client-supplied ID or
// cached profile cannot bypass a restriction, and private reasons stay in admin.
export async function requireCommunityAccess(session:StoreSession) {
  const result = await session.client.rpc('get_my_community_access');
  if (result.error) throw result.error;
  if (result.data === false) throw new MemberInputError(COMMUNITY_SUSPENDED_MESSAGE,403);
  if (result.data !== true) throw new Error('Invalid community access response');
}

function restrictionFailure(error:{code?:string}) {
  if (error.code === '42501') throw new MemberInputError('Tu cuenta no tiene permiso para realizar esta acción.',403);
  if (error.code === '40001') throw new MemberInputError('El estado de esta cuenta cambió. Actualiza la lista antes de intentarlo de nuevo.',409);
  if (error.code === '22023') throw new MemberInputError('Revisa la cuenta, el motivo y la acción que quieres realizar. No puedes cambiar una cuenta que ya tiene ese estado.',400);
  if (error.code === 'P0002') throw new MemberInputError('Esta cuenta ya no está disponible.',404);
  throw error;
}

function restrictionRows(value:unknown, userIds:string[]) {
  if (!Array.isArray(value) || value.length !== userIds.length) throw new Error('Invalid customer restrictions');
  const expected = new Set(userIds.map(id => id.toLowerCase()));
  const rows = new Map<string,CustomerRestriction>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.user_id !== 'string' || !UUID.test(row.user_id)
      || !expected.has(row.user_id.toLowerCase()) || rows.has(row.user_id.toLowerCase())
      || typeof row.is_suspended !== 'boolean' || typeof row.can_suspend !== 'boolean'
      || !Number.isSafeInteger(row.version) || row.version < 0 || row.version > 2147483647
      || (row.reason !== null && (typeof row.reason !== 'string' || [...row.reason].length < 5 || [...row.reason].length > 500 || /[\x00-\x1f\x7f]/.test(row.reason)))
      || (row.updated_at !== null && (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))))
      || (row.version === 0 && (row.is_suspended || row.reason !== null || row.updated_at !== null))
      || (row.version > 0 && (row.reason === null || row.updated_at === null))) {
      throw new Error('Invalid customer restrictions');
    }
    // Project explicitly; the audit actor and other private fields are omitted.
    rows.set(row.user_id.toLowerCase(),{suspended:row.is_suspended,reason:row.reason,updatedAt:row.updated_at,version:row.version,canSuspend:row.can_suspend});
  }
  return rows;
}

export async function listCustomerRestrictions(session:StoreSession, userIds:string[]) {
  if (!userIds.length || userIds.length > 20 || userIds.some(id => !UUID.test(id))) throw new Error('Invalid customer restriction lookup');
  const result = await session.client.rpc('list_store_customer_restrictions',{p_user_ids:userIds});
  if (result.error) restrictionFailure(result.error);
  return restrictionRows(result.data,userIds);
}

export function customerRestrictionInput(data:Record<string,unknown>) {
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (typeof data.userId !== 'string' || !UUID.test(data.userId) || typeof data.suspended !== 'boolean'
    || [...reason].length < 5 || [...reason].length > 500 || /[\x00-\x1f\x7f]/.test(reason)
    || typeof data.expectedVersion !== 'number' || !Number.isSafeInteger(data.expectedVersion)
    || data.expectedVersion < 0 || data.expectedVersion > 2147483646) {
    throw new MemberInputError('Elige una cuenta e indica un motivo de 5 a 500 caracteres.');
  }
  return {userId:data.userId.toLowerCase(),suspended:data.suspended,reason,expectedVersion:data.expectedVersion};
}

export async function setCustomerRestriction(session:StoreSession, data:Record<string,unknown>) {
  const input = customerRestrictionInput(data);
  const result = await session.client.rpc('set_store_customer_restriction',{
    p_user_id:input.userId,p_suspended:input.suspended,p_reason:input.reason,p_expected_version:input.expectedVersion,
  });
  if (result.error) restrictionFailure(result.error);
  const restriction = restrictionRows(result.data,[input.userId]).get(input.userId)!;
  if (restriction.suspended !== input.suspended || restriction.version <= input.expectedVersion) throw new Error('Invalid updated customer restriction');
  return {userId:input.userId,restriction};
}
