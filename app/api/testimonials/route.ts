import {MemberInputError, checkMemberOrigin, memberBody, testimonialInput} from '@/lib/member-input';
import {memberSession, memberJson, memberFailure, unavailable} from '@/lib/supabase-server';

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
    const {data: {user}} = await session.client.auth.getUser();
    if (!user) throw new MemberInputError('Inicia sesión para compartir tu experiencia.', 401);
    const input = testimonialInput(await memberBody(request));
    const {data, error} = await session.client.from('testimonials').insert({...input, user_id: user.id}).select('id,body,rating,status,created_at').single();
    if (error?.code === '23505') throw new MemberInputError('Ya tienes una experiencia pendiente de revisión. Podrás enviar otra cuando Carly la revise.', 409);
    if (error) throw error;
    return session.finish(memberJson({testimonial: data}, 201));
  } catch (error) { return session?.finish(memberFailure(error)) ?? memberFailure(error); }
}
