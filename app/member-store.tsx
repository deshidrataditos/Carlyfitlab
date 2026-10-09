'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowUpRight, Check, ChevronDown, ClipboardList, FileText, LoaderCircle, LockKeyhole, Package, Play, RefreshCw, ShieldCheck} from 'lucide-react';
import {catalog, money} from '@/lib/catalog';
import {dessertSelectionSummary,type DessertSelection} from '@/lib/dessert-pack';
import StoreAdmin from './store-admin';
import './store-portal.css';

export type Intake = {goal:string; experience:'beginner'|'intermediate'|'advanced'; place:'home'|'gym'; days:number; minutes:number; equipment:string};
export type Material = {id:string; title:string; kind:'routine'|'nutrition'|'video'};
export type StoreOrder = {
  id:string; items:{id:string; title:string; quantity:number; unit_price:number}[]; status:string;
  amount_cents:number; currency?:string; delivery:string; created_at:string;
  fulfillment_status:string; fulfillment_note:string|null; version:number;
  materials:Material[]; hasPlan?:boolean; planReady?:boolean;
  dessert_selection?:DessertSelection|null;
};
type StoreAccount = {canManageStore:boolean; orders:StoreOrder[]; intake:Intake|null; hasApprovedPlan:boolean; hasMore:boolean};
type Resource = Material & {url:string};
const defaultIntake:Intake = {goal:'', experience:'beginner', place:'home', days:3, minutes:45, equipment:''};
const fulfillmentLabels:Record<string,string> = {received:'Recibido', preparing:'En preparación', ready:'Listo', shipped:'En camino', delivered:'Entregado'};
const paymentLabels:Record<string,string> = {approved:'Pago aprobado', pending:'Pago pendiente', in_process:'Pago en proceso', in_mediation:'Pago en revisión', rejected:'Pago rechazado', cancelled:'Pago cancelado', refunded:'Pago reembolsado', charged_back:'Pago revertido'};
const materialLabels:Record<Material['kind'],string> = {routine:'Rutina · PDF', nutrition:'Alimentación · PDF', video:'Video explicativo'};

class StoreError extends Error {constructor(message:string, readonly status:number) {super(message);}}
async function request<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response = await fetch(path, {...options, credentials:'same-origin', cache:'no-store'});
  const data:unknown = await response.json().catch(() => null);
  if (!response.ok) throw new StoreError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'No pudimos abrir tu espacio. Inténtalo otra vez.', response.status);
  if (data === null) throw new Error('No pudimos leer la respuesta. Inténtalo otra vez.');
  return data as T;
}
function dateLabel(value:string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});
}
function hasPlan(order:StoreOrder) {return order.hasPlan ?? order.items.some(item => catalog.some(product => product.id === item.id && product.kind === 'plan'));}

export default function MemberStore({onSessionExpired}:{onSessionExpired:()=>void}) {
  const [data, setData] = useState<StoreAccount|null>(null);
  const [tab, setTab] = useState<'plan'|'orders'>('plan');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [intake, setIntake] = useState<Intake>(defaultIntake);
  const [editingIntake, setEditingIntake] = useState(false);
  const [acting, setActing] = useState<string|null>(null);
  const [resource, setResource] = useState<Resource|null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const lifecycle = useRef(0);
  const sequence = useRef(0);
  const loadController = useRef<AbortController|null>(null);
  const actionController = useRef<AbortController|null>(null);

  const handleError = useCallback((cause:unknown) => {
    if (cause instanceof StoreError && cause.status === 401) {setData(null); setResource(null); setAdminOpen(false); onSessionExpired(); return;}
    setError(cause instanceof Error ? cause.message : 'No pudimos completar esta acción. Inténtalo otra vez.');
  }, [onSessionExpired]);

  const load = useCallback(async (offset = 0) => {
    const generation = lifecycle.current;
    const current = ++sequence.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setError(''); setResource(null);
    try {
      const result = await request<StoreAccount>(`/api/store/me?offset=${offset}`, {signal:controller.signal});
      if (controller.signal.aborted || generation !== lifecycle.current || current !== sequence.current) return;
      setData(current => offset === 0 || !current ? result : {...result, orders:[...current.orders, ...result.orders.filter(order => !current.orders.some(existing => existing.id === order.id))]});
      if (offset === 0) {setIntake(result.intake || defaultIntake); setEditingIntake(!result.intake);}
      if (!result.canManageStore) setAdminOpen(false);
    } catch (cause) {
      if (!controller.signal.aborted && generation === lifecycle.current && current === sequence.current) {setData(null); handleError(cause);}
    } finally {
      if (!controller.signal.aborted && generation === lifecycle.current && current === sequence.current) setLoading(false);
    }
  }, [handleError]);

  // Start the authenticated request when this account's portal mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {void load(); return () => {lifecycle.current += 1; sequence.current += 1; loadController.current?.abort(); actionController.current?.abort();};}, [load]);

  async function saveIntake(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (acting || !data?.hasApprovedPlan) return;
    const generation = lifecycle.current;
    const controller = new AbortController(); actionController.current = controller;
    setActing('intake'); setError(''); setSuccess('');
    const saved = {...intake, goal:intake.goal.trim(), equipment:intake.equipment.trim()};
    try {
      await request('/api/store/intake', {method:'POST', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify(saved)});
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      setData(current => current ? {...current, intake:saved} : current); setIntake(saved); setEditingIntake(false);
      setSuccess('Tus preferencias están guardadas. Carly puede consultarlas para preparar tu plan.');
    } catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current) handleError(cause);}
    finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  async function openMaterial(material:Material) {
    if (acting) return;
    const generation = lifecycle.current;
    const controller = new AbortController(); actionController.current = controller;
    setActing(material.id); setError(''); setResource(null);
    try {
      const result = await request<{url:string}>(`/api/store/material?id=${encodeURIComponent(material.id)}`, {signal:controller.signal});
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith('/storage/v1/object/sign/')) throw new Error('No pudimos abrir este archivo de forma segura. Inténtalo otra vez.');
      if (controller.signal.aborted || generation !== lifecycle.current) return;
      setResource({...material, url:url.href});
    } catch (cause) {if (!controller.signal.aborted && generation === lifecycle.current) handleError(cause);}
    finally {if (!controller.signal.aborted && generation === lifecycle.current) setActing(null);}
  }

  const approvedPlans = data?.orders.filter(order => order.status === 'approved' && hasPlan(order)) || [];
  const materials = approvedPlans.flatMap(order => order.materials);

  return <section className="store-portal member-panel" aria-labelledby="store-portal-title">
    <div className="store-heading"><div><p className="eyebrow">A TU RITMO</p><h3 id="store-portal-title">Mi espacio Carlyfit</h3></div><LockKeyhole size={22} aria-hidden="true"/></div>
    <div className="store-tabs" role="group" aria-label="Tu espacio privado">
      <button type="button" aria-pressed={tab === 'plan'} onClick={() => {setTab('plan'); setResource(null);}}><ClipboardList size={17}/> Mi plan</button>
      <button type="button" aria-pressed={tab === 'orders'} onClick={() => {setTab('orders'); setResource(null);}}><Package size={17}/> Mis pedidos</button>
    </div>
    {error && <div className="member-feedback error" role="alert">{error}</div>}
    {success && <div className="member-feedback success" role="status"><Check size={17}/><span>{success}</span></div>}
    {loading && <p className="member-loading" role="status"><LoaderCircle size={18}/> Cargando tu plan y tus pedidos…</p>}
    {!loading && !data && <button type="button" className="button outline" onClick={() => void load()}>Intentar de nuevo <RefreshCw size={16}/></button>}
    {!loading && data && <>
      {tab === 'plan' && <div className="store-plan">
        {!data.hasApprovedPlan ? <div className="store-empty"><ClipboardList size={28}/><h4>Tu próximo paso comienza aquí.</h4><p>Cuando se apruebe la compra de un plan con esta cuenta, podrás compartir tus preferencias y recibir aquí tu rutina, tus videos y los materiales incluidos.</p><p className="member-help">Inicia sesión antes de comprar para guardar tu plan aquí. Si compraste como invitado, coordina tu entrega con Carly.</p></div> : <>
          <div className="store-section-heading"><h4>Mis materiales</h4><span className="store-private"><LockKeyhole size={13}/> Solo para ti</span></div>
          {materials.length ? <div className="store-materials">{approvedPlans.map(order => order.materials.length > 0 && <div className="store-material-group" key={order.id}><p className="store-caption">{order.items.filter(item => catalog.some(product => product.id === item.id && product.kind === 'plan')).map(item => item.title).join(' · ') || 'Tu plan'} · {dateLabel(order.created_at)}</p>{order.materials.map(material => <button type="button" key={material.id} className="store-material" onClick={() => void openMaterial(material)} disabled={acting !== null}><span className="store-material-icon">{material.kind === 'video' ? <Play size={21}/> : <FileText size={21}/>}</span><span><strong>{material.title}</strong><small>{materialLabels[material.kind]}</small></span>{acting === material.id ? <LoaderCircle size={18} className="member-spinner"/> : <ArrowUpRight size={18}/>}</button>)}</div>)}</div> : <div className="store-empty store-empty-small"><p>{data.intake ? 'Carly ya puede consultar tus preferencias. Tus materiales aparecerán aquí cuando estén listos.' : 'Completa tus preferencias para que Carly pueda preparar tu plan. Aquí encontrarás tus materiales cuando estén listos.'}</p></div>}
          {resource && <div className="store-resource" role="region" aria-label={resource.title}><h4>{resource.title}</h4>{resource.kind === 'video' && <video controls preload="metadata" src={resource.url} onError={() => setError('El enlace del video puede haber vencido. Vuelve a abrir el material para renovarlo.')} aria-label={resource.title}/>}<a className="button outline" href={resource.url} target="_blank" rel="noopener noreferrer">{resource.kind === 'video' ? 'Abrir video' : 'Abrir PDF'} <ArrowUpRight size={16}/></a><p className="member-help">El acceso al archivo es temporal. Puedes volver a abrirlo desde tus materiales.</p></div>}
          <div className="store-intake"><div className="store-section-heading"><h4>Tu punto de partida</h4>{data.intake && !editingIntake && <button type="button" className="text-link" onClick={() => setEditingIntake(true)} disabled={acting !== null}>Editar</button>}</div><p className="member-help">Cuéntale a Carly cómo quieres entrenar. Esta información es privada.</p>
            {!editingIntake && data.intake ? <dl className="store-intake-summary"><div><dt>Objetivo</dt><dd>{data.intake.goal}</dd></div><div><dt>Experiencia</dt><dd>{{beginner:'Estoy empezando', intermediate:'Intermedia', advanced:'Avanzada'}[data.intake.experience]}</dd></div><div><dt>Dónde y cuándo</dt><dd>{data.intake.place === 'home' ? 'En casa' : 'En gimnasio'} · {data.intake.days} días por semana · {data.intake.minutes} min por sesión</dd></div><div><dt>Equipo disponible</dt><dd>{data.intake.equipment || 'Sin equipo especificado'}</dd></div></dl> : <form className="member-form store-form" onSubmit={saveIntake}><label htmlFor="store-goal">¿Qué te gustaría lograr?</label><textarea id="store-goal" rows={2} minLength={3} maxLength={240} required value={intake.goal} placeholder="Por ejemplo, ganar fuerza o crear un hábito de entrenamiento" onChange={event => setIntake(current => ({...current, goal:event.target.value}))} disabled={acting !== null}/><div className="store-form-grid"><div><label htmlFor="store-experience">Tu experiencia</label><select id="store-experience" value={intake.experience} onChange={event => setIntake(current => ({...current, experience:event.target.value as Intake['experience']}))} disabled={acting !== null}><option value="beginner">Estoy empezando</option><option value="intermediate">Intermedia</option><option value="advanced">Avanzada</option></select></div><div><label htmlFor="store-place">¿Dónde entrenarás?</label><select id="store-place" value={intake.place} onChange={event => setIntake(current => ({...current, place:event.target.value as Intake['place']}))} disabled={acting !== null}><option value="home">En casa</option><option value="gym">En gimnasio</option></select></div><div><label htmlFor="store-days">Días por semana</label><input id="store-days" type="number" min={1} max={7} step={1} required value={intake.days} onChange={event => setIntake(current => ({...current, days:Number(event.target.value)}))} disabled={acting !== null}/></div><div><label htmlFor="store-minutes">Minutos por sesión</label><input id="store-minutes" type="number" min={15} max={180} step={1} required value={intake.minutes} onChange={event => setIntake(current => ({...current, minutes:Number(event.target.value)}))} disabled={acting !== null}/></div></div><label htmlFor="store-equipment">Equipo disponible <span className="store-optional">(opcional)</span></label><textarea id="store-equipment" rows={2} maxLength={1000} value={intake.equipment} placeholder="Mancuernas, ligas, máquinas o sin equipo" onChange={event => setIntake(current => ({...current, equipment:event.target.value}))} disabled={acting !== null}/><p className="member-help">Comparte solo tus preferencias de entrenamiento; no incluyas datos médicos.</p><div className="store-actions"><button type="submit" className="button primary" disabled={acting !== null}>{acting === 'intake' ? 'Guardando…' : 'Guardar mis preferencias'}<Check size={16}/></button>{data.intake && <button type="button" className="text-link" disabled={acting !== null} onClick={() => {setIntake(data.intake!); setEditingIntake(false);}}>Cancelar</button>}</div></form>}
          </div>
        </>}
      </div>}
      {tab === 'orders' && <div className="store-orders">{data.orders.length ? data.orders.map(order => <article className="store-order" key={order.id}><div className="store-order-heading"><div><h4>Pedido {order.id.slice(0, 8).toUpperCase()}</h4><time dateTime={order.created_at}>{dateLabel(order.created_at)}</time></div><strong>{money(order.amount_cents / 100)}</strong></div><ul className="store-items">{order.items.map((item, index) => <li key={`${item.id}-${index}`}><span>{item.title}</span><span>× {item.quantity}</span></li>)}</ul>{Boolean(order.dessert_selection?.length) && <p className="store-caption">Postres incluidos: {dessertSelectionSummary(order.dessert_selection!)}</p>}<div className="store-status-row"><span className={`store-status ${order.status === 'approved' ? 'store-status-positive' : ''}`}>{paymentLabels[order.status] || 'Estado de pago por confirmar'}</span>{order.status === 'approved' && <span className="store-status">{fulfillmentLabels[order.fulfillment_status] || 'Recibido'}</span>}</div><p className="store-caption">{order.delivery === 'pickup' ? 'Entrega: recoger en La Barca' : order.delivery === 'shipping' ? 'Entrega: envío' : order.delivery === 'digital' ? 'Entrega digital' : 'Entrega según lo acordado con Carly'}</p>{order.fulfillment_note && <p className="store-order-note">{order.fulfillment_note}</p>}{order.status === 'approved' && hasPlan(order) && <button type="button" className="text-link" onClick={() => setTab('plan')}>Ver mi plan <ArrowUpRight size={16}/></button>}</article>) : <div className="store-empty"><Package size={28}/><h4>Aún no hay pedidos en tu cuenta.</h4><p>Inicia sesión antes de comprar para guardar tus pedidos aquí. Las compras como invitado se coordinan directamente con Carly.</p></div>}</div>}
      {data.hasMore && <button type="button" className="button outline" disabled={acting !== null} onClick={() => void load(data.orders.length)}>Ver planes y pedidos anteriores</button>}
      <div className="store-refresh"><button type="button" className="text-link" onClick={() => {setSuccess(''); void load();}} disabled={acting !== null}><RefreshCw size={14}/> Actualizar mi espacio</button></div>
      {data.canManageStore && <div className="store-admin-access"><button type="button" className="button outline moderation-toggle" aria-expanded={adminOpen} aria-controls="store-admin" disabled={acting !== null} onClick={() => setAdminOpen(current => !current)}><ShieldCheck size={18}/><span>Administrar tienda y planes</span><ChevronDown size={17}/></button>{adminOpen && <StoreAdmin onAccessLost={() => {setAdminOpen(false); setData(current => current ? {...current, canManageStore:false} : current); setError('Tu sesión ya no tiene acceso a la administración de la tienda.');}}/>}</div>}
    </>}
  </section>;
}
