'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, LoaderCircle, RefreshCw, Search, ShieldCheck, ShieldOff, Users} from 'lucide-react';
import {money} from '@/lib/catalog';
import './store-customers.css';

type Restriction = {suspended:boolean; reason:string|null; updatedAt:string|null; version:number; canSuspend:boolean};
type Customer = {
  id:string;
  displayName:string|null;
  email:string|null;
  registeredAt:string;
  orderCount:number;
  approvedOrderCount:number;
  approvedAmountCents:number;
  lastOrderAt:string|null;
  restriction:Restriction;
};
type CustomerResponse = {customers:Customer[]; hasMore:boolean; error?:string};
type RestrictionResponse = {userId:string; restriction:Restriction; error?:string};
const dateFormatter = new Intl.DateTimeFormat('es-MX', {timeZone:'America/Mexico_City', day:'numeric', month:'short', year:'numeric'});
const changeFormatter = new Intl.DateTimeFormat('es-MX', {timeZone:'America/Mexico_City', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
function dateLabel(value:string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}
function validRestriction(value:unknown):value is Restriction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Restriction>;
  return typeof item.suspended === 'boolean' && typeof item.canSuspend === 'boolean'
    && typeof item.version === 'number' && Number.isSafeInteger(item.version) && item.version >= 0
    && (item.reason === null || typeof item.reason === 'string')
    && (item.updatedAt === null || (typeof item.updatedAt === 'string' && !Number.isNaN(new Date(item.updatedAt).getTime())));
}

export default function StoreCustomers({onAccessLost}:{onAccessLost:()=>void}) {
  const [queryDraft, setQueryDraft] = useState('');
  const [request, setRequest] = useState({query:'', offset:0, revision:0});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string|null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState<string|null>(null);
  const sequence = useRef(0);
  const activeRequest = useRef<AbortController|null>(null);
  const actionRequest = useRef<AbortController|null>(null);
  const mounted = useRef(false);
  const reasonInput = useRef<HTMLTextAreaElement|null>(null);
  const actionButtons = useRef(new Map<string,HTMLButtonElement>());
  const restoreFocus = useRef<string|null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false; actionRequest.current?.abort();};
  }, []);
  useEffect(() => {if (editing) reasonInput.current?.focus();}, [editing]);
  useEffect(() => {
    if (!editing && acting === null && restoreFocus.current) {
      actionButtons.current.get(restoreFocus.current)?.focus(); restoreFocus.current = null;
    }
  }, [editing, acting]);

  useEffect(() => {
    const generation = ++sequence.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({q:request.query, offset:String(request.offset)});
        const response = await fetch(`/api/store/admin/customers?${params}`, {credentials:'same-origin', cache:'no-store', signal:controller.signal});
        const data = await response.json().catch(() => null) as CustomerResponse|null;
        if (controller.signal.aborted || generation !== sequence.current) return;
        if (response.status === 401 || response.status === 403) {
          setCustomers([]);
          setHasMore(false);
          setEditing(null);
          setReason('');
          setNotice('');
          setError('Tu acceso ha cambiado. Vuelve a iniciar sesión para continuar.');
          onAccessLost();
          return;
        }
        if (!response.ok) throw new Error(data?.error || 'No pudimos cargar los clientes. Inténtalo de nuevo.');
        if (!data || !Array.isArray(data.customers) || !data.customers.every(customer => validRestriction(customer.restriction)) || typeof data.hasMore !== 'boolean') throw new Error('No pudimos leer la lista de clientes. Inténtalo de nuevo.');
        setCustomers(current => request.offset === 0 ? data.customers : [...current, ...data.customers.filter(customer => !current.some(existing => existing.id === customer.id))]);
        setHasMore(data.hasMore);
      } catch (cause) {
        if (controller.signal.aborted || generation !== sequence.current) return;
        // Do not leave previously fetched personal data visible after a failed check.
        setCustomers([]);
        setHasMore(false);
        setEditing(null);
        setReason('');
        setError(cause instanceof Error ? cause.message : 'No pudimos cargar los clientes. Inténtalo de nuevo.');
      } finally {
        if (!controller.signal.aborted && generation === sequence.current) setLoading(false);
      }
    }
    void load();
    return () => {controller.abort(); sequence.current += 1;};
  }, [request, onAccessLost]);

  function restart(query:string, nextNotice = '') {
    if (actionRequest.current) return;
    activeRequest.current?.abort();
    sequence.current += 1;
    setCustomers([]);
    setHasMore(false);
    setError('');
    setEditing(null);
    setReason('');
    setActionError('');
    setNotice(nextNotice);
    setLoading(true);
    setRequest(current => ({query, offset:0, revision:current.revision + 1}));
  }
  function search(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionRequest.current) return;
    const query = String(new FormData(event.currentTarget).get('customerQuery') || '').trim();
    setQueryDraft(query);
    restart(query);
  }
  function edit(customer:Customer) {
    if (loading || actionRequest.current || !customer.restriction.canSuspend) return;
    setReason(''); setActionError(''); setNotice(''); setEditing(customer.id);
  }
  function cancelEdit() {
    if (actionRequest.current) return;
    if (editing) actionButtons.current.get(editing)?.focus();
    setEditing(null); setReason(''); setActionError('');
  }
  async function saveRestriction(event:FormEvent<HTMLFormElement>, customer:Customer) {
    event.preventDefault();
    if (loading || actionRequest.current || editing !== customer.id || !customer.restriction.canSuspend) return;
    const cleanReason = reason.trim();
    if (Array.from(cleanReason).length < 5 || Array.from(cleanReason).length > 500) {
      setActionError('Escribe un motivo de entre 5 y 500 caracteres.'); reasonInput.current?.focus(); return;
    }
    const controller = new AbortController();
    actionRequest.current = controller;
    setActing(customer.id); setActionError(''); setNotice('');
    try {
      const response = await fetch('/api/store/admin/customers', {method:'POST', credentials:'same-origin', cache:'no-store', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:customer.id, suspended:!customer.restriction.suspended, reason:cleanReason, expectedVersion:customer.restriction.version})});
      const data = await response.json().catch(() => null) as RestrictionResponse|null;
      if (!mounted.current || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setCustomers([]); setHasMore(false); setEditing(null); setReason(''); setNotice('');
        setError('Tu acceso ha cambiado. Vuelve a iniciar sesión para continuar.'); onAccessLost(); return;
      }
      if (response.status === 409) {
        actionRequest.current = null;
        restart(request.query, 'Esta cuenta cambió mientras la revisabas. Cargamos su estado actual; revísalo antes de volver a confirmar.');
        return;
      }
      if (!response.ok) throw new Error(data?.error || 'No pudimos guardar el cambio. Inténtalo de nuevo.');
      if (!data || data.userId !== customer.id || !validRestriction(data.restriction)) throw new Error('No pudimos confirmar el cambio. Actualiza la lista para revisar su estado antes de intentarlo otra vez.');
      setCustomers(current => current.map(item => item.id === customer.id ? {...item, restriction:data.restriction} : item));
      restoreFocus.current = customer.id;
      setEditing(null); setReason('');
      setNotice(`${data.restriction.suspended ? 'Uso de IA y comentarios suspendido' : 'Uso de IA y comentarios reactivado'} para ${customer.displayName || customer.email || 'esta cuenta'}. Sus pedidos y materiales siguen disponibles.`);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setActionError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'No pudimos confirmar si se guardó el cambio. Actualiza la lista para revisar su estado antes de intentarlo otra vez.');
    } finally {
      if (actionRequest.current === controller) actionRequest.current = null;
      if (mounted.current && !controller.signal.aborted) setActing(null);
    }
  }

  return <section className="store-customers" aria-labelledby="store-customers-title">
    <div className="store-customers-heading"><Users size={22} aria-hidden="true"/><div><h5 id="store-customers-title">Clientes registrados</h5><p className="member-help">Consulta las cuentas de la comunidad, incluidas las que todavía no han comprado.</p></div></div>
    <form className="member-form store-customer-search" onSubmit={search} role="search" aria-label="Buscar clientes registrados">
      <label htmlFor="store-customer-query">Buscar por nombre o correo</label>
      <div><input id="store-customer-query" name="customerQuery" type="search" maxLength={100} value={queryDraft} onChange={event => setQueryDraft(event.target.value)} placeholder="Nombre o correo" autoComplete="off" disabled={acting !== null}/><button type="submit" className="button outline" disabled={acting !== null}><Search size={16} aria-hidden="true"/> Buscar</button></div>
      {request.query && <button type="button" className="text-link" disabled={acting !== null} onClick={() => {setQueryDraft(''); restart('');}}>Limpiar búsqueda de clientes</button>}
    </form>
    <p className="store-caption store-customers-access-note">La suspensión limita el asistente de IA y la publicación de comentarios. La persona conserva sus pedidos y materiales pagados. Cada cambio guarda un motivo y una fecha.</p>
    <div className="store-customers-toolbar"><p className="store-caption">Ordenados por registro más reciente. Fechas de Ciudad de México.</p><button type="button" className="text-link" disabled={loading || acting !== null} onClick={() => restart(request.query)}><RefreshCw size={15} aria-hidden="true"/> Actualizar clientes</button></div>
    {error && <div className="store-customers-error"><p className="member-feedback error" role="alert">{error}</p><button type="button" className="button outline" onClick={() => restart(request.query)}>Reintentar carga</button></div>}
    {notice && <p className="member-feedback success store-customer-notice" role="status"><Check size={17} aria-hidden="true"/><span>{notice}</span></p>}
    <div className="store-customers-list" aria-busy={loading}>
      {customers.map(customer => <article className="store-customer" key={customer.id}>
        <div className="store-customer-identity"><h6>{customer.displayName || 'Sin nombre registrado'}</h6><p>{customer.email || 'Sin correo registrado'}</p></div>
        <p className="store-customer-date">Registro: <time dateTime={customer.registeredAt}>{dateLabel(customer.registeredAt)}</time></p>
        <dl className="store-customer-orders"><div><dt>Pedidos totales</dt><dd>{customer.orderCount}</dd></div><div><dt>Con pago aprobado</dt><dd>{customer.approvedOrderCount}</dd></div><div className="store-customer-amount"><dt>Importe aprobado</dt><dd>{money(customer.approvedAmountCents / 100)} <small>MXN</small></dd></div></dl>
        <p className="store-caption">{customer.lastOrderAt ? <>Último pedido: <time dateTime={customer.lastOrderAt}>{dateLabel(customer.lastOrderAt)}</time></> : 'Todavía no tiene pedidos vinculados a su cuenta.'}</p>
        <div className="store-customer-access">
          <div className="store-customer-access-heading"><span className={`store-customer-access-status${customer.restriction.suspended ? ' is-suspended' : ''}`}>{customer.restriction.suspended ? <ShieldOff size={15} aria-hidden="true"/> : <ShieldCheck size={15} aria-hidden="true"/>}{customer.restriction.suspended ? 'IA y comentarios suspendidos' : 'Cuenta activa'}</span>
            {customer.restriction.canSuspend && <button type="button" className="text-link store-customer-access-action" disabled={loading || acting !== null} aria-expanded={editing === customer.id} aria-controls={`customer-access-${customer.id}`} ref={node => {if (node) actionButtons.current.set(customer.id, node); else actionButtons.current.delete(customer.id);}} onClick={() => editing === customer.id ? cancelEdit() : edit(customer)}>{customer.restriction.suspended ? 'Reactivar cuenta' : 'Suspender cuenta'}</button>}
          </div>
          {customer.restriction.updatedAt && <p className="store-caption">Último cambio: <time dateTime={customer.restriction.updatedAt}>{changeFormatter.format(new Date(customer.restriction.updatedAt))}</time></p>}
          {customer.restriction.reason && <p className="store-customer-access-reason"><strong>Motivo registrado:</strong> {customer.restriction.reason}</p>}
          {!customer.restriction.canSuspend && <p className="store-caption">Cuenta protegida. Las cuentas administradoras y tu propia cuenta no se pueden suspender.</p>}
          {editing === customer.id && <form id={`customer-access-${customer.id}`} className="member-form store-customer-access-form" aria-labelledby={`customer-access-title-${customer.id}`} aria-busy={acting === customer.id} onSubmit={event => void saveRestriction(event, customer)}>
            <h6 id={`customer-access-title-${customer.id}`}>{customer.restriction.suspended ? 'Reactivar esta cuenta' : 'Suspender esta cuenta'}</h6>
            <p className="member-help">{customer.restriction.suspended ? 'Volverá a poder usar el asistente de IA y publicar comentarios sujetos a moderación.' : 'Dejará de poder usar el asistente de IA y publicar nuevos comentarios. Puedes reactivarla después.'} Sus pedidos y materiales pagados seguirán disponibles.</p>
            <label htmlFor={`customer-reason-${customer.id}`}>Motivo {customer.restriction.suspended ? 'de la reactivación' : 'de la suspensión'}</label>
            <textarea id={`customer-reason-${customer.id}`} ref={reasonInput} value={reason} onChange={event => {setReason(event.target.value); setActionError('');}} rows={3} required minLength={5} maxLength={500} disabled={acting !== null} aria-describedby={`customer-reason-help-${customer.id}${actionError ? ` customer-action-error-${customer.id}` : ''}`} aria-invalid={Boolean(actionError)} placeholder={customer.restriction.suspended ? 'Explica por qué se puede restablecer el acceso' : 'Describe el uso indebido que revisaste'}/>
            <p className="store-caption" id={`customer-reason-help-${customer.id}`}>Entre 5 y 500 caracteres. Nota interna para la administración; evita datos sensibles.</p>
            {actionError && <p className="member-feedback error" id={`customer-action-error-${customer.id}`} role="alert">{actionError}</p>}
            <div className="store-customer-access-buttons"><button type="submit" className={`button ${customer.restriction.suspended ? 'primary' : 'outline store-customer-suspend'}`} disabled={acting !== null || reason.trim().length < 5}>{acting === customer.id ? <><LoaderCircle size={16} aria-hidden="true"/> Guardando…</> : customer.restriction.suspended ? 'Confirmar reactivación' : 'Confirmar suspensión'}</button><button type="button" className="button outline" disabled={acting !== null} onClick={cancelEdit}>Cancelar</button></div>
          </form>}
        </div>
      </article>)}
    </div>
    {loading && <p className="member-loading" role="status"><LoaderCircle size={18} aria-hidden="true"/> Cargando clientes…</p>}
    {!loading && !error && customers.length === 0 && <div className="store-empty store-empty-small"><p>{request.query ? 'No encontramos cuentas con ese nombre o correo. Prueba otra búsqueda.' : 'Todavía no hay clientes registrados.'}</p></div>}
    {!error && customers.length > 0 && <p className="store-caption" role="status">{customers.length} {customers.length === 1 ? 'cuenta mostrada' : 'cuentas mostradas'}{request.query ? ' en esta búsqueda' : ''}{hasMore ? ' · Hay más resultados.' : '.'}</p>}
    {hasMore && <button type="button" className="button outline store-customers-more" disabled={loading || acting !== null} onClick={() => {setEditing(null); setReason(''); setActionError(''); setLoading(true); setRequest(current => ({...current, offset:customers.length, revision:current.revision + 1}));}}>Ver más clientes</button>}
    <p className="store-caption store-customers-note">Solo se cuentan pedidos vinculados a cada cuenta. El importe aprobado excluye pagos pendientes, rechazados y reembolsados; no descuenta comisiones. Los pedidos como invitado no se asignan automáticamente por correo.</p>
  </section>;
}
