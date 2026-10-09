import {env} from 'cloudflare:workers';
import {MemberInputError,checkMemberOrigin,memberBody} from '@/lib/member-input';
import {memberSession,memberJson} from '@/lib/supabase-server';
import {requireStoreUser,requireStoreAdmin,storeDatabase,storeFailure} from '@/lib/store-server';
import {storeId} from '@/lib/store-input';
import {AVAILABILITY_TIME_ZONE,mexicoToday,readProductAvailability,updateProductAvailability,listProductReservations,reviewProductReservation,allocateLateProductReservation} from '@/lib/product-availability';

export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const admin=params.get('admin')==='1';
  const session=admin?memberSession(request):null;
  try {
    if([...params.keys()].some(key=>key!=='admin')||(params.has('admin')&&!admin))throw new MemberInputError('La consulta no es válida.');
    if(admin){await requireStoreUser(request,session);await requireStoreAdmin(session!);}
    if(!env.DB)throw new MemberInputError('No pudimos consultar la disponibilidad.',503);
    const body={products:await readProductAvailability(env.DB,admin),today:mexicoToday(),timeZone:AVAILABILITY_TIME_ZONE,...(admin?{reservations:await listProductReservations(env.DB)}:{})};
    return admin?session!.finish(memberJson(body)):Response.json(body,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return storeFailure(session,error);}
}

export async function POST(request:Request) {
  const session=memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user}=await requireStoreUser(request,session);
    await requireStoreAdmin(session!);
    const db=storeDatabase();
    const body=await memberBody(request);
    if(body.action==='review'||body.action==='allocate'){
      if(Object.keys(body).some(key=>!['action','orderId'].includes(key)))throw new MemberInputError('La acción de revisión no es válida.');
      if(body.action==='allocate')await allocateLateProductReservation(db,storeId(body.orderId),user.id);
      else await reviewProductReservation(db,storeId(body.orderId));
    }else await updateProductAvailability(db,body,user.id);
    return session!.finish(memberJson({products:await readProductAvailability(db,true),reservations:await listProductReservations(db),today:mexicoToday(),timeZone:AVAILABILITY_TIME_ZONE}));
  }catch(error){return storeFailure(session,error);}
}
