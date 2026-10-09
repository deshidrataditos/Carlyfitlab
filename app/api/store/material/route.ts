import {env} from 'cloudflare:workers';
import {after} from 'next/server';
import {MemberInputError, checkMemberOrigin, memberBody} from '@/lib/member-input';
import {memberSession, memberJson} from '@/lib/supabase-server';
import {materialInput, storeId} from '@/lib/store-input';
import {MATERIALS_PER_ORDER, PLAN_BUCKET, approvedMaterialOrder, canManageStore, requireStoreAdmin, requireStoreUser, storeDatabase, storeFailure, type StoreMaterial, type StoreSession} from '@/lib/store-server';
import {deliverMaterialEmail, enqueueMaterialEmail, materialEmailStatus, type MaterialEmailStatus} from '@/lib/material-email';

async function publishStorageAccess(session: StoreSession, material: StoreMaterial) {
  const result = await session.client.rpc('publish_store_material', {p_object_path: material.object_path, p_user_id: material.user_id, p_order_id: material.order_id, p_material_id: material.id});
  if (result.error || result.data !== true) throw new Error('Could not publish verified material access');
}

async function announcePublishedMaterial(db: D1Database, material: StoreMaterial): Promise<{status: MaterialEmailStatus}> {
  // This marker is written only after Storage confirms owner access. A D1-only
  // publication after a failed RPC must never trigger an availability email.
  const ready = await db.prepare(`UPDATE store_materials SET access_published_at=COALESCE(access_published_at,?)
    WHERE id=? AND state='published' AND order_id=? AND user_id=? AND EXISTS
      (SELECT 1 FROM orders WHERE orders.id=store_materials.order_id AND orders.user_id=store_materials.user_id AND orders.status='approved')`)
    .bind(new Date().toISOString(), material.id, material.order_id, material.user_id).run();
  if (ready.meta.changes !== 1) throw new MemberInputError('El pedido o el material cambió. Actualiza antes de continuar.', 409);
  try {
    await enqueueMaterialEmail(env, material.id);
    const status = await materialEmailStatus(env, material.id);
    if (status === 'pending') after(async () => { await deliverMaterialEmail(env, material.id).catch(() => {}); });
    return {status};
  } catch {
    // The material is already available. The scheduled recovery can queue its
    // receipt later, and email trouble must not report a failed file upload.
    return {status: 'retry_pending'};
  }
}

export async function GET(request: Request) {
  const session = memberSession(request);
  try {
    const {user} = await requireStoreUser(request, session);
    const id = storeId(new URL(request.url).searchParams.get('id'));
    const db = storeDatabase();
    const admin = await canManageStore(session!);
    // A guessed material ID cannot disclose another customer's file. Payment
    // approval is read afresh, including after a refund or chargeback.
    const material = await db.prepare(`SELECT m.* FROM store_materials AS m JOIN orders AS o ON o.id=m.order_id AND o.user_id=m.user_id WHERE m.id=? AND m.state='published' AND o.status='approved' AND (?=1 OR (m.user_id=? AND o.user_id=?))`).bind(id, admin ? 1 : 0, user.id, user.id).first<StoreMaterial>();
    if (!material) throw new MemberInputError('Este material no está disponible.', 404);
    const signed = await session!.client.storage.from(PLAN_BUCKET).createSignedUrl(material.object_path, 60, {download: material.kind !== 'video'});
    if (signed.error || !signed.data?.signedUrl) throw new Error('Could not sign material');
    return session!.finish(memberJson({url: signed.data.signedUrl}));
  } catch (error) { return storeFailure(session, error); }
}

export async function POST(request: Request) {
  const session = memberSession(request);
  try {
    checkMemberOrigin(request);
    const {user} = await requireStoreUser(request, session);
    await requireStoreAdmin(session!);
    const data = await memberBody(request);
    const db = storeDatabase();
    if (data.action === 'prepare') {
      const input = materialInput(data);
      const order = await approvedMaterialOrder(db, input.orderId);
      const id = crypto.randomUUID();
      const path = `${order.user_id}/${order.id}/${id}.${input.extension}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      // Bounded pending uploads prevent accidental unbounded per-order uploads.
      const inserted = await db.prepare(`INSERT INTO store_materials (id,order_id,user_id,title,kind,object_path,content_type,byte_size,state,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,'pending',?,?,? WHERE (SELECT count(*) FROM store_materials WHERE order_id=? AND (state='published' OR (state='pending' AND expires_at>?)))<?`)
        .bind(id, order.id, order.user_id, input.title, input.kind, path, input.contentType, input.size, user.id, now, expiresAt, order.id, now, MATERIALS_PER_ORDER).run();
      if (inserted.meta.changes !== 1) throw new MemberInputError('Este pedido ya tiene el máximo de 20 materiales o cargas pendientes.', 409);
      // No upsert and no UPDATE policy: a published object cannot be replaced
      // through a still-valid upload URL after metadata verification.
      const signed = await session!.client.storage.from(PLAN_BUCKET).createSignedUploadUrl(path, {upsert: false});
      if (signed.error || !signed.data) {
        await db.prepare("UPDATE store_materials SET state='deleted' WHERE id=? AND state='pending'").bind(id).run();
        throw new Error('Could not prepare upload');
      }
      return session!.finish(memberJson({uploadId: id, uploadUrl: signed.data.signedUrl, token: signed.data.token, path, expiresAt}));
    }
    if (data.action === 'complete') {
      const uploadId = storeId(data.uploadId);
      const material = await db.prepare('SELECT * FROM store_materials WHERE id=? AND created_by=?').bind(uploadId, user.id).first<StoreMaterial>();
      if (!material || material.state === 'deleted') throw new MemberInputError('Esta carga no está disponible.', 404);
      const order = await approvedMaterialOrder(db, material.order_id);
      if (order.user_id !== material.user_id) throw new MemberInputError('Esta carga no corresponde al cliente del pedido.', 409);
      if (material.state === 'published') {
        // Recover a prior access-registration failure without republishing or
        // bypassing the fresh approved-payment/owner check immediately above.
        await publishStorageAccess(session!, material);
        const emailNotification = await announcePublishedMaterial(db, material);
        return session!.finish(memberJson({material: {id: material.id, title: material.title, kind: material.kind}, emailNotification}));
      }
      if (material.expires_at <= new Date().toISOString()) throw new MemberInputError('La carga venció. Selecciona de nuevo el archivo.', 409);
      const object = await session!.client.storage.from(PLAN_BUCKET).info(material.object_path);
      if (object.error || !object.data) throw new MemberInputError('El archivo todavía no se ha cargado. Vuelve a intentarlo.', 409);
      if (object.data.size !== material.byte_size || object.data.contentType !== material.content_type) throw new MemberInputError('El archivo cargado no coincide con el tamaño o formato esperado.', 409);
      const now = new Date().toISOString();
      const result = await db.batch([
        db.prepare("UPDATE store_materials SET state='published',published_at=? WHERE id=? AND state='pending' AND expires_at>? AND EXISTS (SELECT 1 FROM orders WHERE id=store_materials.order_id AND user_id=store_materials.user_id AND status='approved')").bind(now, material.id, now),
        db.prepare('INSERT INTO store_audit (id,actor_id,order_id,action,details,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(), user.id, order.id, 'material_published', JSON.stringify({materialId: material.id, kind: material.kind}), now),
      ]);
      if (result[0].meta.changes !== 1) throw new MemberInputError('El pedido o la carga cambió. Actualiza antes de continuar.', 409);
      await publishStorageAccess(session!, material);
      const emailNotification = await announcePublishedMaterial(db, material);
      return session!.finish(memberJson({material: {id: material.id, title: material.title, kind: material.kind}, emailNotification}));
    }
    throw new MemberInputError('La acción del material no es válida.');
  } catch (error) { return storeFailure(session, error); }
}
