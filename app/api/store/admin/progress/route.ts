import {checkMemberOrigin, memberBody} from '@/lib/member-input';
import {memberSession, memberJson} from '@/lib/supabase-server';
import {requireStoreAdmin, requireStoreUser, storeDatabase, storeFailure} from '@/lib/store-server';
import {progressInput, progressQuery} from '@/lib/plan-progress-input';
import {readPlanProgress, writePlanProgress} from '@/lib/plan-progress-server';

export async function GET(request:Request) {
  const session = memberSession(request);
  try {
    const {user} = await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    return session!.finish(memberJson(await readPlanProgress(storeDatabase(), progressQuery(request.url), {userId:user.id, admin:true})));
  } catch (error) { return storeFailure(session, error); }
}

export async function POST(request:Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user} = await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    const input = progressInput(await memberBody(request), true);
    return session!.finish(memberJson(await writePlanProgress(storeDatabase(), input, {userId:user.id, admin:true})));
  } catch (error) { return storeFailure(session, error); }
}
