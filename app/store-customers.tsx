'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {LoaderCircle, RefreshCw, Search, Users} from 'lucide-react';
import {money} from '@/lib/catalog';
import './store-customers.css';

type Customer = {
  id:string;
  displayName:string|null;
  email:string|null;
  registeredAt:string;
  orderCount:number;
  approvedOrderCount:number;
  approvedAmountCents:number;
  lastOrderAt:string|null;
};
type CustomerResponse = {customers:Customer[]; hasMore:boolean; error?:string};
const dateFormatter = new Intl.DateTimeFormat('es-MX', {timeZone:'America/Mexico_City', day:'numeric', month:'short', year:'numeric'});
function dateLabel(value:string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}

export default function StoreCustomers({onAccessLost}:{onAccessLost:()=>void}) {
  const [queryDraft, setQueryDraft] = useState('');
  const [request, setRequest] = useState({query:'', offset:0, revision:0});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const activeRequest = useRef<AbortController|null>(null);

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
          setError('Tu acceso ha cambiado. Vuelve a iniciar sesión para continuar.');
          onAccessLost();
          return;
        }
        if (!response.ok) throw new Error(data?.error || 'No pudimos cargar los clientes. Inténtalo de nuevo.');
        if (!data || !Array.isArray(data.customers) || typeof data.hasMore !== 'boolean') throw new Error('No pudimos leer la lista de clientes. Inténtalo de nuevo.');
        setCustomers(current => request.offset === 0 ? data.customers : [...current, ...data.customers.filter(customer => !current.some(existing => existing.id === customer.id))]);
        setHasMore(data.hasMore);
      } catch (cause) {
        if (controller.signal.aborted || generation !== sequence.current) return;
        // Do not leave previously fetched personal data visible after a failed check.
        setCustomers([]);
        setHasMore(false);
        setError(cause instanceof Error ? cause.message : 'No pudimos cargar los clientes. Inténtalo de nuevo.');
      } finally {
        if (!controller.signal.aborted && generation === sequence.current) setLoading(false);
      }
    }
    void load();
    return () => {controller.abort(); sequence.current += 1;};
  }, [request, onAccessLost]);

  function restart(query:string) {
    activeRequest.current?.abort();
    sequence.current += 1;
    setCustomers([]);
    setHasMore(false);
    setError('');
    setLoading(true);
    setRequest(current => ({query, offset:0, revision:current.revision + 1}));
  }
  function search(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('customerQuery') || '').trim();
    setQueryDraft(query);
    restart(query);
  }

  return <section className="store-customers" aria-labelledby="store-customers-title">
    <div className="store-customers-heading"><Users size={22} aria-hidden="true"/><div><h5 id="store-customers-title">Clientes registrados</h5><p className="member-help">Consulta las cuentas de la comunidad, incluidas las que todavía no han comprado.</p></div></div>
    <form className="member-form store-customer-search" onSubmit={search} role="search" aria-label="Buscar clientes registrados">
      <label htmlFor="store-customer-query">Buscar por nombre o correo</label>
      <div><input id="store-customer-query" name="customerQuery" type="search" maxLength={100} value={queryDraft} onChange={event => setQueryDraft(event.target.value)} placeholder="Nombre o correo" autoComplete="off"/><button type="submit" className="button outline"><Search size={16} aria-hidden="true"/> Buscar</button></div>
      {request.query && <button type="button" className="text-link" onClick={() => {setQueryDraft(''); restart('');}}>Limpiar búsqueda de clientes</button>}
    </form>
    <div className="store-customers-toolbar"><p className="store-caption">Ordenados por registro más reciente. Fechas de Ciudad de México.</p><button type="button" className="text-link" disabled={loading} onClick={() => restart(request.query)}><RefreshCw size={15} aria-hidden="true"/> Actualizar clientes</button></div>
    {error && <div className="store-customers-error"><p className="member-feedback error" role="alert">{error}</p><button type="button" className="button outline" onClick={() => restart(request.query)}>Reintentar carga</button></div>}
    <div className="store-customers-list" aria-busy={loading}>
      {customers.map(customer => <article className="store-customer" key={customer.id}>
        <div className="store-customer-identity"><h6>{customer.displayName || 'Sin nombre registrado'}</h6><p>{customer.email || 'Sin correo registrado'}</p></div>
        <p className="store-customer-date">Registro: <time dateTime={customer.registeredAt}>{dateLabel(customer.registeredAt)}</time></p>
        <dl className="store-customer-orders"><div><dt>Pedidos totales</dt><dd>{customer.orderCount}</dd></div><div><dt>Con pago aprobado</dt><dd>{customer.approvedOrderCount}</dd></div><div className="store-customer-amount"><dt>Importe aprobado</dt><dd>{money(customer.approvedAmountCents / 100)} <small>MXN</small></dd></div></dl>
        <p className="store-caption">{customer.lastOrderAt ? <>Último pedido: <time dateTime={customer.lastOrderAt}>{dateLabel(customer.lastOrderAt)}</time></> : 'Todavía no tiene pedidos vinculados a su cuenta.'}</p>
      </article>)}
    </div>
    {loading && <p className="member-loading" role="status"><LoaderCircle size={18} aria-hidden="true"/> Cargando clientes…</p>}
    {!loading && !error && customers.length === 0 && <div className="store-empty store-empty-small"><p>{request.query ? 'No encontramos cuentas con ese nombre o correo. Prueba otra búsqueda.' : 'Todavía no hay clientes registrados.'}</p></div>}
    {!error && customers.length > 0 && <p className="store-caption" role="status">{customers.length} {customers.length === 1 ? 'cuenta mostrada' : 'cuentas mostradas'}{request.query ? ' en esta búsqueda' : ''}{hasMore ? ' · Hay más resultados.' : '.'}</p>}
    {hasMore && <button type="button" className="button outline store-customers-more" disabled={loading} onClick={() => {setLoading(true); setRequest(current => ({...current, offset:customers.length, revision:current.revision + 1}));}}>Ver más clientes</button>}
    <p className="store-caption store-customers-note">Solo se cuentan pedidos vinculados a cada cuenta. El importe aprobado excluye pagos pendientes, rechazados y reembolsados; no descuenta comisiones. Los pedidos como invitado no se asignan automáticamente por correo.</p>
  </section>;
}
