import {MemberInputError, checkMemberOrigin, memberBody, profileInput} from '@/lib/member-input';
import {memberSession, memberJson, memberFailure, unavailable} from '@/lib/supabase-server';

export async function GET(request: Request) {
  const session = memberSession(request);
  const guest = {user: null, profile: null, testimonials: [], promotions: [], canModerateTestimonials: false};
  if (!session) return memberJson({configured: false, ...guest});
  try {
    const {data: {user}, error: userError} = await session.client.auth.getUser();
    if (!user) {
      if (userError && userError.name !== 'AuthSessionMissingError' && userError.status !== 401 && userError.status !== 403) throw userError;
      return session.finish(memberJson({configured: session.config.enabled, ...guest}));
    }
    const [profile, testimonials, promotions, permission] = await Promise.all([
      session.client.from('profiles').select('display_name,marketing_opt_in').eq('id', user.id).single(),
      session.client.from('testimonials').select('id,body,rating,status,created_at').eq('user_id', user.id).order('created_at', {ascending: false}).limit(10),
      session.client.from('promotions').select('id,title,body,starts_at,ends_at').order('starts_at', {ascending: false}).limit(20),
      session.client.rpc('can_moderate_testimonials'),
    ]);
    if (profile.error || testimonials.error || promotions.error) throw new Error('Member database unavailable');
    return session.finish(memberJson({configured: session.config.enabled, user: {id: user.id, email: user.email}, profile: profile.data, testimonials: testimonials.data, promotions: promotions.data, canModerateTestimonials: !user.is_anonymous && !permission.error && permission.data === true}));
  } catch (error) { return session.finish(memberFailure(error)); }
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    if (!session) return unavailable();
    const {data: {user}} = await session.client.auth.getUser();
    if (!user) throw new MemberInputError('Inicia sesión para guardar tu perfil.', 401);
    const input = profileInput(await memberBody(request));
    const {data, error} = await session.client.from('profiles').update(input).eq('id', user.id).select('display_name,marketing_opt_in').single();
    if (error) throw error;
    return session.finish(memberJson({profile: data}));
  } catch (error) { return session?.finish(memberFailure(error)) ?? memberFailure(error); }
}
