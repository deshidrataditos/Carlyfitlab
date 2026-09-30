import {checkMemberOrigin} from '@/lib/member-input';
import {memberSession, memberJson, memberFailure} from '@/lib/supabase-server';

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    if (!session) return memberJson({ok: true});
    const {error} = await session.client.auth.signOut({scope: 'local'});
    if (error) throw error;
    return session.finish(memberJson({ok: true}));
  } catch (error) { return session?.finish(memberFailure(error)) ?? memberFailure(error); }
}
