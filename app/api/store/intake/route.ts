import {checkMemberOrigin, memberBody} from '@/lib/member-input';
import {memberSession, memberJson} from '@/lib/supabase-server';
import {intakeInput} from '@/lib/store-input';
import {requireApprovedPlan, requireStoreUser, storeDatabase, storeFailure} from '@/lib/store-server';

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user} = await requireStoreUser(request, session);
    const db = storeDatabase();
    await requireApprovedPlan(db, user.id);
    const intake = intakeInput(await memberBody(request));
    await db.prepare('INSERT INTO store_intake (user_id,goal,experience,place,days,minutes,equipment,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET goal=excluded.goal,experience=excluded.experience,place=excluded.place,days=excluded.days,minutes=excluded.minutes,equipment=excluded.equipment,updated_at=excluded.updated_at')
      .bind(user.id, intake.goal, intake.experience, intake.place, intake.days, intake.minutes, intake.equipment, new Date().toISOString()).run();
    return session!.finish(memberJson({intake}));
  } catch (error) { return storeFailure(session, error); }
}
