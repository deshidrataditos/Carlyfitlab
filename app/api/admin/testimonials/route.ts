import {MemberInputError, checkMemberOrigin, memberBody, moderationInput, moderationQuery} from '@/lib/member-input';
import {memberSession, memberJson, memberFailure, unavailable} from '@/lib/supabase-server';

type Session = NonNullable<ReturnType<typeof memberSession>>;

async function requireModerator(session: Session) {
  const {data: {user}, error} = await session.client.auth.getUser();
  if (!user) {
    if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401 && error.status !== 403) throw error;
    throw new MemberInputError('Inicia sesión para administrar comentarios.', 401);
  }
  if (user.is_anonymous) throw new MemberInputError('Tu cuenta no tiene permiso para administrar comentarios.', 403);
  // The database checks the verified session UID against a private allowlist.
  // Neither a submitted email nor editable user metadata can grant this access.
  const permission = await session.client.rpc('can_moderate_testimonials');
  if (permission.error) throw permission.error;
  if (permission.data !== true) throw new MemberInputError('Tu cuenta no tiene permiso para administrar comentarios.', 403);
}

function moderationError(error: {code?: string}) {
  if (error.code === '42501') return new MemberInputError('Tu cuenta no tiene permiso para administrar comentarios.', 403);
  if (error.code === 'P0002') return new MemberInputError('Este comentario ya no está disponible.', 404);
  if (error.code === '40001') return new MemberInputError('El comentario cambió desde que lo abriste. Actualiza la lista antes de continuar.', 409);
  if (error.code === '22023') return new MemberInputError('La acción solicitada no es válida.');
  return error;
}

export async function GET(request: Request) {
  const session = memberSession(request);
  if (!session) return unavailable();
  try {
    await requireModerator(session);
    const {status, offset} = moderationQuery(request.url);
    const {data, error} = await session.client.rpc('list_moderation_testimonials', {p_status: status, p_limit: 21, p_offset: offset});
    if (error) throw moderationError(error);
    if (!Array.isArray(data)) throw new Error('Invalid moderation response');
    return session.finish(memberJson({testimonials: data.slice(0, 20), hasMore: data.length > 20}));
  } catch (error) { return session.finish(memberFailure(error)); }
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    if (!session) return unavailable();
    await requireModerator(session);
    const input = moderationInput(await memberBody(request));
    // The RPC repeats authorization and changes only status, in the same
    // transaction as its audit entry. The expected state rejects stale actions.
    const {data, error} = await session.client.rpc('moderate_testimonial', {p_id: input.id, p_status: input.status, p_expected_status: input.expectedStatus});
    if (error) throw moderationError(error);
    if (!Array.isArray(data) || data.length !== 1) throw new Error('Invalid moderation response');
    return session.finish(memberJson({testimonial: data[0]}));
  } catch (error) { return session?.finish(memberFailure(error)) ?? memberFailure(error); }
}
