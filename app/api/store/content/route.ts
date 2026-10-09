import {MemberInputError, checkMemberOrigin} from '@/lib/member-input';
import {memberSession, memberJson} from '@/lib/supabase-server';
import {contentInput} from '@/lib/store-input';
import {requireStoreAdmin, requireStoreUser, storeContentBody, storeDatabase, storeFailure} from '@/lib/store-server';

export async function GET() {
  try {
    const db = storeDatabase();
    const row = await db.prepare("SELECT content FROM store_content WHERE id='public'").first<{content: string}>();
    const content = row ? contentInput(JSON.parse(row.content)) : {products: {}, presentationVideoUrl: '', secondaryVideoUrl: '', googleMapsUrl: '', instagramUrl: '', businessHours: ''};
    return Response.json(content, {headers: {'Cache-Control': 'public, max-age=60'}});
  } catch (error) {
    return Response.json({error: error instanceof MemberInputError ? error.message : 'La información de la tienda aún no está disponible.'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user} = await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    const content = contentInput(await storeContentBody(request));
    const db = storeDatabase();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO store_content (id,content,updated_by,updated_at) VALUES ('public',?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(content), user.id, now),
      db.prepare('INSERT INTO store_audit (id,actor_id,order_id,action,details,created_at) VALUES (?,?,NULL,?,?,?)').bind(crypto.randomUUID(), user.id, 'content_updated', JSON.stringify({products: Object.keys(content.products)}), now),
    ]);
    return session!.finish(memberJson(content));
  } catch (error) { return storeFailure(session, error); }
}
