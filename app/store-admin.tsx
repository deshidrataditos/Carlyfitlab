'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, ChevronDown, FileText, LoaderCircle, Package, RefreshCw, Upload} from 'lucide-react';
import {catalog, money} from '@/lib/catalog';
import {dessertSelectionSummary} from '@/lib/dessert-pack';
import type {Intake, Material, StoreOrder} from './member-store';
import StoreDashboard from './store-dashboard';
import {PlanProgressAdmin} from './plan-progress';
import ProductAvailabilityAdmin from './product-availability-admin';
import type {DashboardFilter} from '@/lib/store-dashboard';

type AdminOrder = StoreOrder & {user_id:string|null; email:string|null; purchaseEmail:string|null; customer_name:string|null; intake:Intake|null; availabilityStatus?:string};
type PendingPublication = {uploadId:string; title:string};
type ContentFields = {ingredients:string; allergens:string; storage:string; preparation:string; servings:string; shipping:string};
type StoreContent = {products:Record<string,ContentFields>; presentationVideoUrl:string; secondaryVideoUrl:string; googleMapsUrl:string; instagramUrl:string; businessHours:string};
const contentFields:{key:keyof ContentFields; label:string; help:string}[] = [
  {key:'ingredients', label:'Ingredientes', help:'Ingredientes declarados del producto. No incluyas recetas ni cantidades de elaboración.'},
  {key:'allergens', label:'Alérgenos', help:'Ingredientes alergénicos y avisos de trazas que hayas confirmado.'},
  {key:'storage', label:'Conservación', help:'Temperatura, refrigeración y duración que correspondan.'},
  {key:'preparation', label:'Anticipación del pedido', help:'Tiempo confirmado con el que se debe pedir antes de la entrega.'},
  {key:'servings', label:'Presentación', help:'Tamaño, cantidad de piezas o porciones de cada presentación.'},
  {key:'shipping', label:'Envío y entrega', help:'Disponibilidad, zona y condiciones de entrega.'},
];
const emptyFields:ContentFields = {ingredients:'', allergens:'', storage:'', preparation:'', servings:'', shipping:''};
const emptyContent:StoreContent = {products:{}, presentationVideoUrl:'', secondaryVideoUrl:'', googleMapsUrl:'', instagramUrl:'', businessHours:''};
const products = catalog.filter(item => item.kind === 'product').filter((item, index, all) => all.findIndex(other => (other.productGroup || other.id) === (item.productGroup || item.id)) === index);
const fulfillmentOptions = [
  {value:'received', label:'Recibido'}, {value:'preparing', label:'En preparación'}, {value:'ready', label:'Listo'}, {value:'shipped', label:'En camino'}, {value:'delivered', label:'Entregado'},
];
const transitions:Record<string,string[]> = {received:['received','preparing'], preparing:['preparing','ready'], ready:['ready','shipped','delivered'], shipped:['shipped','delivered'], delivered:['delivered']};
const paymentLabels:Record<string,string> = {approved:'Pago aprobado', pending:'Pago pendiente', in_process:'Pago en proceso', in_mediation:'Pago en revisión', rejected:'Pago rechazado', cancelled:'Pago cancelado', refunded:'Pago reembolsado', charged_back:'Pago revertido'};
class AdminError extends Error {constructor(message:string, readonly status:number) {super(message);}}
async function request<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response = await fetch(path, {...options, credentials:'same-origin', cache:'no-store'});
  const data:unknown = await response.json().catch(() => null);
  if (!response.ok) throw new AdminError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'No pudimos completar la solicitud. Inténtalo otra vez.', response.status);
  if (data === null) throw new Error('No pudimos leer la respuesta. Inténtalo otra vez.');
  return data as T;
}
function dateLabel(value:string) {const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});}
function isPlan(order:StoreOrder) {return order.hasPlan ?? order.items.some(item => catalog.some(product => product.id === item.id && product.kind === 'plan'));}
function contentFrom(value:StoreContent):StoreContent {
  return {...emptyContent, ...value, products:Object.fromEntries(Object.entries(value.products || {}).map(([id, fields]) => [id, {...emptyFields, ...fields}]))};
}

function OrderEditor({order, busy, pendingPublication, onSave, onIntakeReceipt, onUpload, onRetryPublication, onDatesSaved, onAccessLost}:{order:AdminOrder; onDatesSaved:()=>void; onAccessLost:()=>void; busy:boolean; pendingPublication?:PendingPublication; onSave:(status:string,note:string)=>Promise<void>; onIntakeReceipt:(status:'received'|'pending')=>Promise<void>; onUpload:(file:File,title:string,kind:Material['kind'])=>Promise<void>; onRetryPublication:()=>Promise<void>}) {
  const [status, setStatus] = useState(order.fulfillment_status || 'received');
  const [note, setNote] = useState(order.fulfillment_note || '');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Material['kind']>('routine');
  const [file, setFile] = useState<File|null>(null);
  const fileInput = useRef<HTMLInputElement|null>(null);
  const allowedStates = (transitions[order.fulfillment_status] || ['received','preparing']).filter(value => value !== 'shipped' || order.delivery === 'shipping');
  const canAssign = order.status === 'approved' && Boolean(order.user_id) && isPlan(order);

  async function upload(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    await onUpload(file, title.trim(), kind);
    setFile(null); setTitle(''); if (fileInput.current) fileInput.current.value = '';
  }
  async function retryPublication() {
    await onRetryPublication();
    setFile(null); setTitle(''); if (fileInput.current) fileInput.current.value = '';
  }
  return <div className="store-admin-order-body">
    {['conflict','released'].includes(order.availabilityStatus ?? 'legacy') && <p className="member-feedback error" role="alert">Este pago llegó después de liberarse su reserva. Revisa la disponibilidad y acuerda una solución con el cliente antes de preparar el pedido.</p>}
    {order.status === 'approved' && <PlanProgressAdmin orderId={order.id} disabled={busy} onSaved={onDatesSaved} onAccessLost={onAccessLost}/>}
    <dl className="store-intake-summary"><div><dt>Cliente</dt><dd>{order.customer_name || 'Sin nombre registrado'}{order.email && <span className="store-client-email">{order.email}</span>}</dd></div><div><dt>Entrega</dt><dd>{order.delivery === 'pickup' ? 'Recoger en La Barca' : order.delivery === 'shipping' ? 'Envío' : order.delivery === 'digital' ? 'Digital' : 'Por acordar'}</dd></div><div><dt>Cuenta</dt><dd>{order.user_id ? 'Compra vinculada a una cuenta' : 'Compra como invitado · coordina la entrega con el cliente'}</dd></div></dl>
    <ul className="store-items">{order.items.map((item, index) => <li key={`${item.id}-${index}`}><span>{item.title}</span><span>× {item.quantity}</span></li>)}</ul>
    {Boolean(order.dessert_selection?.length) && <div className="store-dessert-summary"><h5>Postres incluidos en el plan</h5><p className="member-help">{dessertSelectionSummary(order.dessert_selection!)}</p></div>}
    {order.status === 'approved' && !['conflict','released'].includes(order.availabilityStatus ?? 'legacy') ? <form className="member-form store-form store-admin-subsection" onSubmit={event => {event.preventDefault(); void onSave(status, note.trim());}}><h5>Preparación y entrega</h5><label htmlFor={`fulfillment-${order.id}`}>Estado del pedido</label><select id={`fulfillment-${order.id}`} value={status} onChange={event => setStatus(event.target.value)} disabled={busy}>{fulfillmentOptions.filter(option => allowedStates.includes(option.value)).map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select><label htmlFor={`fulfillment-note-${order.id}`}>Nota para el cliente <span className="store-optional">(opcional)</span></label><textarea id={`fulfillment-note-${order.id}`} rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Por ejemplo, la fecha o las indicaciones de entrega acordadas" disabled={busy}/><p className="member-help">Esta nota se muestra en Mis pedidos. El estado del pago se confirma automáticamente.</p><button type="submit" className="button outline" disabled={busy}>Guardar estado <Check size={16}/></button></form> : <p className="store-empty store-empty-small">La preparación y asignación de materiales estarán disponibles cuando el pago esté aprobado.</p>}
    {canAssign && <div className="store-admin-subsection store-intake-receipt">
      <div className="store-section-heading"><h5>Ficha inicial privada</h5><span className={`store-status ${order.intakeReceivedAt ? 'store-status-positive' : ''}`}>{order.intakeReceivedAt ? 'Ficha recibida' : 'Ficha pendiente'}</span></div>
      <dl className="store-intake-summary"><div><dt>Correo registrado al comprar el plan</dt><dd>{order.purchaseEmail || 'Sin correo de compra registrado en este pedido.'}</dd></div></dl>
      <p className="member-help">{order.intakeReceivedAt ? `Recepción confirmada el ${dateLabel(order.intakeReceivedAt)}.` : 'Confirma la recepción después de revisar la respuesta en Google Forms y cotejar el correo de compra y el número de pedido.'}</p>
      <p className="member-help">Aquí solo se guarda la confirmación de recepción. Las respuestas privadas permanecen en Google Forms; no las copies en las notas del pedido.</p>
      <button type="button" className="button outline" disabled={busy} onClick={() => void onIntakeReceipt(order.intakeReceivedAt ? 'pending' : 'received')}>{order.intakeReceivedAt ? 'Corregir: marcar pendiente' : 'Confirmar ficha recibida'} <Check size={16}/></button>
    </div>}
    {isPlan(order) && <div className="store-admin-subsection"><h5>Preferencias de entrenamiento</h5><p className="member-help">Preferencias de la cuenta, separadas de la ficha inicial privada de Google Forms.</p>{order.intake ? <dl className="store-intake-summary"><div><dt>Objetivo</dt><dd>{order.intake.goal}</dd></div><div><dt>Experiencia</dt><dd>{{beginner:'Principiante', intermediate:'Intermedia', advanced:'Avanzada'}[order.intake.experience]}</dd></div><div><dt>Disponibilidad</dt><dd>{order.intake.place === 'home' ? 'Casa' : 'Gimnasio'} · {order.intake.days} días por semana · {order.intake.minutes} min por sesión</dd></div><div><dt>Equipo</dt><dd>{order.intake.equipment || 'Sin especificar'}</dd></div></dl> : <p className="member-help">{order.user_id ? 'El cliente todavía no ha completado sus preferencias.' : 'Este pedido se realizó como invitado. Coordina las preferencias y la entrega directamente con el cliente.'}</p>}</div>}
    {canAssign && <div className="store-admin-subsection">
      <h5>Materiales privados</h5>
      {order.materials.length > 0 && <ul className="store-assigned-materials">{order.materials.map(material => <li key={material.id}><FileText size={16}/><span>{material.title}</span></li>)}</ul>}
      {pendingPublication ? <div className="store-publication-retry">
        <p className="member-help">El archivo «{pendingPublication.title}» ya se subió. Falta confirmar que esté disponible para el cliente.</p>
        <button type="button" className="button outline" disabled={busy} onClick={() => void retryPublication().catch(() => undefined)}>{busy ? 'Confirmando…' : 'Reintentar publicación'} <RefreshCw size={16}/></button>
      </div> : <form className="member-form store-form" onSubmit={event => {void upload(event).catch(() => undefined);}}>
        <p className="member-help">Sube un archivo para este pedido. Aparecerá únicamente en el espacio de este cliente.</p>
        <label htmlFor={`material-kind-${order.id}`}>Tipo de material</label>
        <select id={`material-kind-${order.id}`} value={kind} onChange={event => {setKind(event.target.value as Material['kind']); setFile(null); if (fileInput.current) fileInput.current.value = '';}} disabled={busy}><option value="routine">Rutina en PDF</option><option value="nutrition">Alimentación en PDF</option><option value="video">Video explicativo</option></select>
        <label htmlFor={`material-title-${order.id}`}>Nombre para el cliente</label>
        <input id={`material-title-${order.id}`} value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={100} required placeholder="Por ejemplo, Tu rutina de 90 días" disabled={busy}/>
        <label htmlFor={`material-file-${order.id}`}>Archivo {kind === 'video' ? 'MP4 o WebM' : 'PDF'} · máximo 45 MB</label>
        <input ref={fileInput} id={`material-file-${order.id}`} type="file" accept={kind === 'video' ? '.mp4,.webm,video/mp4,video/webm' : '.pdf,application/pdf'} onChange={event => setFile(event.target.files?.[0] || null)} required disabled={busy}/>
        <button type="submit" className="button primary" disabled={busy || !file}>{busy ? 'Guardando…' : 'Asignar material'} <Upload size={16}/></button>
      </form>}
    </div>}
  </div>;
}

export default function StoreAdmin({onAccessLost}:{onAccessLost:()=>void}) {
  const [tab, setTab] = useState<'orders'|'content'|'availability'>('orders');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const [query, setQuery] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [content, setContent] = useState<StoreContent|null>(null);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.productGroup || products[0]?.id || '');
  const [expanded, setExpanded] = useState<string|null>(null);
  const [acting, setActing] = useState<string|null>(null);
  const [pendingPublications, setPendingPublications] = useState<Record<string,PendingPublication>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const lifecycle = useRef(0);
  const listSequence = useRef(0);
  const listController = useRef<AbortController|null>(null);
  const contentController = useRef<AbortController|null>(null);
  const actionController = useRef<AbortController|null>(null);
  const accessLost = useRef(onAccessLost);
  useEffect(() => {accessLost.current = onAccessLost;}, [onAccessLost]);
  const loseAccess = useCallback(() => {setOrders([]); setContent(null); setPendingPublications({}); accessLost.current();}, []);
  const handleError = useCallback((cause:unknown) => {
    if (cause instanceof AdminError && (cause.status === 401 || cause.status === 403)) {setOrders([]); setContent(null); setPendingPublications({}); accessLost.current(); return;}
    setError(cause instanceof Error ? cause.message : 'No pudimos completar la solicitud. Inténtalo otra vez.');
  }, []);

  const loadOrders = useCallback(async (offset = 0) => {
    const generation = lifecycle.current; const sequence = ++listSequence.current;
    listController.current?.abort(); const controller = new AbortController(); listController.current = controller;
    setLoading(true); setError('');
    try {
      const result = await request<{orders:AdminOrder[];hasMore:boolean}>(`/api/store/admin?${new URLSearchParams({offset:String(offset),filter,q:query})}`, {signal:controller.signal});
      if (controller.signal.aborted || generation !== lifecycle.current || sequence !== listSequence.current) return;
      setOrders(current => offset === 0 ? result.orders : [...current, ...result.orders.filter(order => !current.some(existing => existing.id === order.id))]); setHasMore(result.hasMore); if (offset === 0) setSummaryRevision(value => value + 1);
    } catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current && sequence === listSequence.current) handleError(cause);}
    finally {if (!controller.signal.aborted && generation === lifecycle.current && sequence === listSequence.current) setLoading(false);}
  }, [handleError,filter,query]);

  const loadContent = useCallback(async () => {
    const generation = lifecycle.current;
    contentController.current?.abort(); const controller = new AbortController(); contentController.current = controller;
    setContentLoading(true); setError('');
    try {
      const result = await request<StoreContent>('/api/store/content', {signal:controller.signal});
      if (!controller.signal.aborted && generation === lifecycle.current) setContent(contentFrom(result));
    } catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current) handleError(cause);}
    finally {if (!controller.signal.aborted && generation === lifecycle.current) setContentLoading(false);}
  }, [handleError]);

  // Fetch protected data only while Carly's administration panel is mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {void loadOrders(); return () => {lifecycle.current += 1; listSequence.current += 1; listController.current?.abort(); contentController.current?.abort(); actionController.current?.abort();};}, [loadOrders]);
  // Load the public editor from its server source on first opening it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {if (tab === 'content' && content === null) void loadContent();}, [tab, content, loadContent]);

  async function saveFulfillment(order:AdminOrder, fulfillmentStatus:string, fulfillmentNote:string) {
    if (acting || loading) return;
    const generation = lifecycle.current; const controller = new AbortController(); actionController.current = controller;
    setActing(order.id); setError(''); setSuccess('');
    try {
      await request('/api/store/admin', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'fulfillment',orderId:order.id,expectedVersion:order.version,fulfillmentStatus,fulfillmentNote})});
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      setSuccess('El estado y la nota del pedido se guardaron.'); await loadOrders();
    } catch (cause) {
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      if (cause instanceof AdminError && cause.status === 409) {await loadOrders(); if (!controller.signal.aborted && generation === lifecycle.current) setError('Este pedido cambió mientras lo editabas. Revisa su estado actualizado e intenta de nuevo.');} else handleError(cause);
    } finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  async function saveIntakeReceipt(order:AdminOrder, status:'received'|'pending') {
    if (acting || loading) return;
    const generation = lifecycle.current; const controller = new AbortController(); actionController.current = controller;
    setActing(order.id); setError(''); setSuccess('');
    try {
      await request('/api/store/admin/intake', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({orderId:order.id, expectedVersion:order.version, status})});
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      setSuccess(status === 'received' ? 'La ficha inicial quedó confirmada como recibida.' : 'La ficha inicial volvió a pendiente de confirmación.');
      await loadOrders();
    } catch (cause) {
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      if (cause instanceof AdminError && cause.status === 409) {await loadOrders(); if (!controller.signal.aborted && generation === lifecycle.current) setError('Este pedido cambió mientras lo editabas. Revisa su estado actualizado e intenta de nuevo.');} else handleError(cause);
    } finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  async function completePublication(orderId:string, pending:PendingPublication, controller:AbortController, generation:number) {
    const result = await request<{emailNotification?:{status:string}}>('/api/store/material', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'complete',uploadId:pending.uploadId})});
    if (controller.signal.aborted || generation !== lifecycle.current) return;
    setPendingPublications(current => {const next = {...current}; delete next[orderId]; return next;});
    const emailStatus = result.emailNotification?.status;
    const emailNote = emailStatus === 'sent' ? ' El correo de aviso fue aceptado para envío.' : emailStatus === 'pending' || emailStatus === 'retry_pending' ? ' El aviso por correo está en cola; se enviará automáticamente.' : ' El aviso por correo no está disponible para este material. El cliente puede consultarlo en Mi plan.';
    setSuccess('El material está guardado y disponible en el espacio de este cliente.' + emailNote);
    await loadOrders();
  }

  async function retryPublication(orderId:string) {
    const pending = pendingPublications[orderId];
    if (!pending || acting || loading) return;
    const generation = lifecycle.current; const controller = new AbortController(); actionController.current = controller;
    setActing(orderId); setError(''); setSuccess('');
    try {await completePublication(orderId, pending, controller, generation);}
    catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current) handleError(cause); throw cause;}
    finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  async function uploadMaterial(order:AdminOrder, file:File, title:string, kind:Material['kind']) {
    if (acting || loading || pendingPublications[order.id]) return;
    const generation = lifecycle.current; const controller = new AbortController(); actionController.current = controller;
    setActing(order.id); setError(''); setSuccess('');
    try {
      const allowedTypes = kind === 'video' ? ['video/mp4','video/webm'] : ['application/pdf'];
      if (!allowedTypes.includes(file.type) || file.size === 0 || file.size > 45 * 1024 * 1024) throw new Error(kind === 'video' ? 'Elige un video MP4 o WebM de hasta 45 MB.' : 'Elige un PDF de hasta 45 MB.');
      const prepared = await request<{uploadId:string;uploadUrl:string}>('/api/store/material', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'prepare',orderId:order.id,title,kind,fileName:file.name,contentType:file.type,size:file.size})});
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      const url = new URL(prepared.uploadUrl);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith('/storage/v1/object/upload/sign/')) throw new Error('No pudimos preparar una carga segura. Inténtalo otra vez.');
      const uploaded = await fetch(url.href, {method:'PUT', credentials:'omit', cache:'no-store', signal:controller.signal, headers:{'Content-Type':file.type}, body:file});
      if (!uploaded.ok) throw new Error('No se terminó de subir el archivo. Vuelve a intentarlo.');
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      const pending = {uploadId:prepared.uploadId, title};
      setPendingPublications(current => ({...current, [order.id]:pending}));
      await completePublication(order.id, pending, controller, generation);
    } catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current) handleError(cause); throw cause;}
    finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  async function saveContent(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!content || acting) return;
    const generation = lifecycle.current; const controller = new AbortController(); actionController.current = controller;
    setActing('content'); setError(''); setSuccess('');
    try {
      await request('/api/store/content', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify(content)});
      if (!controller.signal.aborted && generation === lifecycle.current) setSuccess('La información pública se guardó. Se mostrará al volver a cargar la tienda.');
    } catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current) handleError(cause);}
    finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  return <div className="store-admin" id="store-admin"><div className="store-admin-intro"><p className="eyebrow">PARA CARLY</p><h4>La tienda, en tus manos.</h4><p className="member-help">Revisa pedidos, comparte materiales privados y completa la información de tus productos.</p></div><div className="store-tabs" role="group" aria-label="Administración de la tienda"><button type="button" aria-pressed={tab === 'orders'} disabled={acting !== null} onClick={() => {setTab('orders'); setSuccess(''); setError('');}}>Pedidos y planes</button><button type="button" aria-pressed={tab === 'content'} disabled={acting !== null} onClick={() => {setTab('content'); setSuccess(''); setError('');}}>Información pública</button><button type="button" aria-pressed={tab === 'availability'} disabled={acting !== null} onClick={() => {setTab('availability');setSuccess('');setError('');}}>Disponibilidad</button></div>
    {error && <div className="member-feedback error" role="alert">{error}</div>}{success && <div className="member-feedback success" role="status"><Check size={17}/><span>{success}</span></div>}{acting && <p className="member-loading" role="status"><LoaderCircle size={17}/>{acting === 'content' ? 'Guardando información…' : 'Guardando los cambios del pedido…'}</p>}
    {tab === 'availability' && <ProductAvailabilityAdmin onAccessLost={loseAccess}/>}
    {tab === 'orders' && <><StoreDashboard filter={filter} onFilter={value=>{if(acting)return;setFilter(value);setExpanded(null);}} onAccessLost={loseAccess} refreshKey={summaryRevision}/><form className="member-form store-search" onSubmit={event=>{event.preventDefault();if(acting)return;setQuery(queryDraft.trim());setExpanded(null);}}><label htmlFor="store-search">Buscar por nombre, correo o pedido</label><div><input id="store-search" maxLength={100} value={queryDraft} onChange={event=>setQueryDraft(event.target.value)} placeholder="Nombre, correo o número de pedido"/><button className="button outline" disabled={acting!==null}>Buscar</button></div><label htmlFor="store-filter">Mostrar pedidos</label><select id="store-filter" value={filter} disabled={acting!==null} onChange={event=>{setFilter(event.target.value as DashboardFilter);setExpanded(null);}}><option value="all">Todos</option><option value="intake_pending">Fichas por revisar</option><option value="materials_pending">Planes sin materiales</option><option value="delivery_pending">Pedidos por entregar</option><option value="overdue">Fechas vencidas</option></select>{(query||filter!=='all')&&<button type="button" className="text-link" onClick={()=>{setQuery('');setQueryDraft('');setFilter('all');}}>Quitar filtros</button>}</form><div className="store-refresh"><button type="button" className="text-link" disabled={loading || acting !== null} onClick={() => void loadOrders()}><RefreshCw size={15}/> Actualizar pedidos</button></div><div className="store-admin-orders" aria-busy={loading}>{orders.map(order => <article className="store-admin-order" key={order.id}><button type="button" className="store-order-toggle" aria-expanded={expanded === order.id} aria-controls={`admin-order-${order.id}`} disabled={acting !== null} onClick={() => setExpanded(current => current === order.id ? null : order.id)}><Package size={19}/><span><strong>{order.customer_name || order.email || `Pedido ${order.id.slice(0, 8).toUpperCase()}`}</strong><small>{dateLabel(order.created_at)} · {money(order.amount_cents / 100)}</small><span className="store-order-summary-status">{paymentLabels[order.status] || 'Pago por confirmar'} · {fulfillmentOptions.find(option => option.value === order.fulfillment_status)?.label || 'Recibido'}</span></span><ChevronDown size={18}/></button>{expanded === order.id && <div id={`admin-order-${order.id}`}><p className="store-caption store-order-id">Pedido {order.id}</p><OrderEditor key={`${order.id}-${order.version}-${order.materials.length}`} order={order} busy={loading || acting !== null} onDatesSaved={()=>void loadOrders()} onAccessLost={loseAccess} pendingPublication={pendingPublications[order.id]} onRetryPublication={() => retryPublication(order.id)} onSave={(status,note) => saveFulfillment(order,status,note)} onIntakeReceipt={status => saveIntakeReceipt(order,status)} onUpload={(file,title,kind) => uploadMaterial(order,file,title,kind)}/></div>}</article>)}</div>{loading && <p className="member-loading" role="status"><LoaderCircle size={18}/> Cargando pedidos…</p>}{!loading && !error && orders.length === 0 && <div className="store-empty store-empty-small"><p>No hay pedidos que coincidan con esta búsqueda. Puedes cambiar los filtros o actualizar la lista.</p></div>}{hasMore && <button type="button" className="button outline" disabled={loading || acting !== null} onClick={() => void loadOrders(orders.length)}>Ver más pedidos</button>}</>}
    {tab === 'content' && <>{contentLoading && <p className="member-loading" role="status"><LoaderCircle size={18}/> Cargando información…</p>}{!contentLoading && !content && <button type="button" className="button outline" onClick={() => void loadContent()}>Intentar de nuevo</button>}{content && <form className="member-form store-form store-content-form" onSubmit={saveContent}><p className="member-help">Completa únicamente los datos confirmados. Los campos vacíos quedan pendientes de información.</p><h5>Ficha de producto</h5><label htmlFor="store-product">Producto</label><select id="store-product" value={selectedProduct} onChange={event => setSelectedProduct(event.target.value)} disabled={acting !== null}>{products.map(product => <option value={product.productGroup || product.id} key={product.productGroup || product.id}>{product.name}</option>)}</select>{contentFields.map(field => <div className="store-field" key={field.key}><label htmlFor={`product-${field.key}`}>{field.label}</label><textarea id={`product-${field.key}`} rows={2} maxLength={2000} value={content.products[selectedProduct]?.[field.key] || ''} onChange={event => {const value = event.target.value; setContent(current => current ? {...current, products:{...current.products, [selectedProduct]:{...emptyFields, ...current.products[selectedProduct], [field.key]:value}}} : current);}} placeholder={field.help} disabled={acting !== null}/></div>)}<div className="store-admin-subsection store-content-links"><h5>Presentación y contacto</h5><label htmlFor="store-presentation-video">Video de presentación <span className="store-optional">(opcional)</span></label><input id="store-presentation-video" type="url" maxLength={2000} value={content.presentationVideoUrl} placeholder="https://www.youtube.com/…" onChange={event => setContent(current => current ? {...current,presentationVideoUrl:event.target.value} : current)} disabled={acting !== null}/><p className="member-help">Enlace HTTPS de YouTube, Vimeo o un reel de Facebook. Verifica que esté listo para compartirse; Facebook puede pedir iniciar sesión.</p><label htmlFor="store-secondary-video">Segundo video de Carly <span className="store-optional">(opcional)</span></label><input id="store-secondary-video" type="url" maxLength={2000} value={content.secondaryVideoUrl} placeholder="Enlace HTTPS al segundo video" onChange={event => setContent(current => current ? {...current,secondaryVideoUrl:event.target.value} : current)} disabled={acting !== null}/><label htmlFor="store-instagram">Perfil de Instagram <span className="store-optional">(opcional)</span></label><input id="store-instagram" type="url" maxLength={2000} value={content.instagramUrl} placeholder="https://www.instagram.com/tu_perfil/" onChange={event => setContent(current => current ? {...current,instagramUrl:event.target.value} : current)} disabled={acting !== null}/><label htmlFor="store-google-maps">Ubicación en Google Maps <span className="store-optional">(opcional)</span></label><input id="store-google-maps" type="url" maxLength={2000} value={content.googleMapsUrl} placeholder="Enlace de tu ubicación en Google Maps" onChange={event => setContent(current => current ? {...current,googleMapsUrl:event.target.value} : current)} disabled={acting !== null}/><label htmlFor="store-hours">Horarios de atención <span className="store-optional">(opcional)</span></label><textarea id="store-hours" rows={3} maxLength={500} value={content.businessHours} placeholder="Días y horarios confirmados de atención" onChange={event => setContent(current => current ? {...current,businessHours:event.target.value} : current)} disabled={acting !== null}/></div><button type="submit" className="button primary" disabled={acting !== null || contentLoading}>Guardar información pública <Check size={16}/></button></form>}</>}
  </div>;
}
