import {memberSession,memberJson} from '@/lib/supabase-server';
import {requireStoreUser,requireStoreAdmin,storeDatabase,storeFailure} from '@/lib/store-server';
import {listStoreCustomers} from '@/lib/store-customers';

export async function GET(request:Request) {
  const session = memberSession(request);
  try {
    await requireStoreUser(request,session);
    await requireStoreAdmin(session!);
    return session!.finish(memberJson(await listStoreCustomers(storeDatabase(),session!,request.url)));
  } catch (error) {return storeFailure(session,error);}
}
