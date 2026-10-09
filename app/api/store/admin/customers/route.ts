import {memberSession,memberJson} from '@/lib/supabase-server';
import {requireStoreUser,requireStoreAdmin,storeDatabase,storeFailure} from '@/lib/store-server';
import {listStoreCustomers} from '@/lib/store-customers';
import {checkMemberOrigin,memberBody} from '@/lib/member-input';
import {setCustomerRestriction} from '@/lib/member-restrictions';

export async function GET(request:Request) {
  const session = memberSession(request);
  try {
    await requireStoreUser(request,session);
    await requireStoreAdmin(session!);
    return session!.finish(memberJson(await listStoreCustomers(storeDatabase(),session!,request.url)));
  } catch (error) {return storeFailure(session,error);}
}

export async function POST(request:Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    await requireStoreUser(request,session);
    await requireStoreAdmin(session!);
    return session!.finish(memberJson(await setCustomerRestriction(session!,await memberBody(request))));
  } catch (error) {return storeFailure(session,error);}
}
