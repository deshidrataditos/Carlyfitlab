import {checkMemberOrigin} from '@/lib/member-input';
import {memberSession, memberJson, memberFailure, unavailable} from '@/lib/supabase-server';

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    if (!session?.config.enabled) return unavailable();
    const {error: schemaError} = await session.client.rpc('list_public_testimonials', {p_limit: 1});
    if (schemaError) return session.finish(unavailable());
    const {data, error} = await session.client.auth.signInWithOAuth({
      provider: 'google',
      options: {redirectTo: new URL('/auth/callback', request.url).href, skipBrowserRedirect: true},
    });
    if (error || !data.url) return session.finish(unavailable());
    const destination = new URL(data.url);
    if (destination.origin !== session.config.url || destination.pathname !== '/auth/v1/authorize') return session.finish(unavailable());
    return session.finish(memberJson({url: destination.href}));
  } catch (error) { return session?.finish(memberFailure(error)) ?? memberFailure(error); }
}
