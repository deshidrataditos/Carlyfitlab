import {memberSession} from '@/lib/supabase-server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = memberSession(request);
  let succeeded = false;
  try {
    const code = url.searchParams.get('code');
    if (session?.config.enabled && code && !url.searchParams.has('error')) {
      const {error} = await session.client.auth.exchangeCodeForSession(code);
      if (!error) {
        const {data: {user}} = await session.client.auth.getUser();
        succeeded = Boolean(user);
      }
    }
  } catch { /* Return a safe message, without exposing OAuth error details. */ }
  const response = new Response(null, {
    status: 303,
    headers: {Location: new URL(succeeded ? '/?auth=success#comunidad' : '/?auth=error#comunidad', url.origin).href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'},
  });
  return session ? session.finish(response) : response;
}
