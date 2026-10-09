import {memberSession,memberJson} from '@/lib/supabase-server';
import {requireStoreUser,requireStoreAdmin,storeDatabase,storeFailure} from '@/lib/store-server';
import {dashboardSummary} from '@/lib/store-dashboard';

export async function GET(request:Request) {
  const session=memberSession(request);
  try {
    await requireStoreUser(request,session); await requireStoreAdmin(session!);
    return session!.finish(memberJson(await dashboardSummary(storeDatabase(),request.url)));
  } catch(error) {return storeFailure(session,error);}
}
