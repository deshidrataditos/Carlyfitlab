import {MemberInputError, checkMemberOrigin, memberBody, testimonialInput} from '@/lib/member-input';
import {memberSession, memberJson, memberFailure, unavailable} from '@/lib/supabase-server';
import {requireCommunityAccess} from '@/lib/member-restrictions';

export async function GET(request: Request) {
  const session = memberSession(request);
  if (!session) return memberJson({testimonials: []});
  try {
    const {data, error} = await session.client.rpc('list_public_testimonials', {p_limit: 12});
    if (error) throw error;
    return session.finish(memberJson({testimonials: data}));
  } catch (error) { return session.finish(memberFailure(error)); }
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    if (!session) return unavailable();
    const {data: {user}, error:authError} = await session.client.auth.getUser();
    if (authError && authError.name !== 'AuthSessionMissingError' && authError.status !== 401 && authError.status !== 403) throw authError;
    if (!user || authError) throw new MemberInputError('Inicia sesión para compartir tu experiencia.', 401);
    if (user.is_anonymous) throw new MemberInputError('Inicia sesión con Google para compartir tu experiencia.',403);
    await requireCommunityAccess(session);
    const input = testimonialInput(await memberBody(request));
    const {data, error} = await session.client.from('testimonials').insert({...input, user_id: user.id}).select('id,body,rating,status,created_at').single();
    if (error?.code === '23505') throw new MemberInputError('Ya tienes una experiencia pendiente de revisión. Podrás enviar otra cuando Carly la revise.', 409);
    // RLS repeats this check at insertion, including a suspension made after
    // the initial check. Return the same helpful notice for that race.
    if (error?.code === '42501') await requireCommunityAccess(session);
    if (error) throw error;
    return session.finish(memberJson({testimonial: data}, 201));
  } catch (error) { return session?.finish(memberFailure(error)) ?? memberFailure(error); }
}
