import {createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions} from '@supabase/ssr';
import {MemberInputError} from './member-input';

// Server-only auth: tokens are never returned to browser JavaScript.
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    // Reject elevated secret/service-role keys, including accidental config mistakes.
    if (!key.startsWith('sb_publishable_')) return null;
    return {url: parsed.origin, key, enabled: process.env.GOOGLE_AUTH_ENABLED === 'true'};
  } catch { return null; }
}

export function memberSession(request: Request) {
  const config = supabaseConfig();
  if (!config) return null;
  const pending = new Map<string, {name: string; value: string; options: CookieOptions}>();
  const incoming = parseCookieHeader(request.headers.get('cookie') ?? '');
  const client = createServerClient(config.url, config.key, {
    cookieOptions: {httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/'},
    cookies: {
      getAll: () => incoming,
      setAll: cookies => {
        for (const cookie of cookies) {
          pending.set(cookie.name, cookie);
          const existing = incoming.find(item => item.name === cookie.name);
          if (existing) existing.value = cookie.value;
          else incoming.push({name: cookie.name, value: cookie.value});
        }
      },
    },
  });
  function finish(response: Response) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Vary', 'Cookie');
    for (const {name, value, options} of pending.values()) {
      response.headers.append('Set-Cookie', serializeCookieHeader(name, value, options));
    }
    return response;
  }
  return {client, config, finish};
}

export function memberJson(data: unknown, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie'}});
}

export function memberFailure(error: unknown) {
  return memberJson({error: error instanceof MemberInputError ? error.message : 'No pudimos completar esta acción. Inténtalo de nuevo en un momento.'}, error instanceof MemberInputError ? error.status : 503);
}

export function unavailable() {
  return memberJson({error: 'Estamos preparando el acceso a la comunidad. Por ahora, puedes contactar a Carly por WhatsApp.'}, 503);
}
