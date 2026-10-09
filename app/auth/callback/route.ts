import {memberSession} from '@/lib/supabase-server';
import {env} from 'cloudflare:workers';
import {after} from 'next/server';
import {enqueueWelcomeEmail, deliverWelcomeEmail, type WelcomeEmailBindings} from '@/lib/welcome-email';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = memberSession(request);
  let succeeded = false;
  try {
    const code = url.searchParams.get('code');
    if (session?.config.enabled && code && !url.searchParams.has('error')) {
      const {error} = await session.client.auth.exchangeCodeForSession(code);
      if (!error) {
        const {data: {user}, error: userError} = await session.client.auth.getUser();
        succeeded = Boolean(user) && !userError;
        if (user && !userError && !user.is_anonymous) {
          try {
            const bindings = env as unknown as WelcomeEmailBindings;
            if (await enqueueWelcomeEmail(bindings, user)) after(() => deliverWelcomeEmail(bindings, user.id).catch(() => {}));
          } catch { /* Email never prevents a successful sign-in. Account loading can recover enqueue failures. */ }
        }
      }
    }
  } catch { /* Return a safe message, without exposing OAuth error details. */ }
  const response = new Response(null, {
    status: 303,
    headers: {Location: new URL(succeeded ? '/?auth=success#comunidad' : '/?auth=error#comunidad', url.origin).href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'},
  });
  return session ? session.finish(response) : response;
}
