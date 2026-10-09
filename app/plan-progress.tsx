'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {CalendarDays, Check, LoaderCircle, RefreshCw} from 'lucide-react';
import {addPlanDays, formatPlanDate, PLAN_REVIEW_DAYS, type PlanProgressReview, type PlanProgressSnapshot, type PlanReviewDay} from '@/lib/plan-progress';
import type {PlanProgressInput} from '@/lib/plan-progress-input';
import './plan-progress.css';

type Change<T = PlanProgressInput> = T extends PlanProgressInput ? Omit<T, 'orderId'|'requestId'|'expectedVersion'> : never;
type PanelProps = {orderId:string; disabled?:boolean; onSaved?:()=>void; onAccessLost?:()=>void};
class ProgressError extends Error {constructor(message:string, readonly status:number) {super(message);}}
async function request(path:string, options:RequestInit) {
  const response = await fetch(path, {...options, credentials:'same-origin', cache:'no-store'});
  const result:unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ProgressError(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'No pudimos guardar o consultar el seguimiento.', response.status);
  if (!result || typeof result !== 'object' || !('order' in result)) throw new Error('No pudimos confirmar la respuesta. Actualiza el seguimiento.');
  return result as PlanProgressSnapshot;
}

function useProgress({orderId, onSaved, onAccessLost}:PanelProps, admin:boolean) {
  const [data, setData] = useState<PlanProgressSnapshot|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState<PlanProgressInput|null>(null);
  const controller = useRef<AbortController|null>(null);
  const generation = useRef(0);
  const callbacks = useRef({onSaved, onAccessLost});
  useEffect(() => {callbacks.current = {onSaved, onAccessLost};}, [onSaved, onAccessLost]);
  const path = admin ? '/api/store/admin/progress' : '/api/store/progress';

  const load = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const current = generation.current;
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await request(`${path}?orderId=${encodeURIComponent(orderId)}`, {signal:active.signal});
      if (active.signal.aborted || current !== generation.current) return;
      setData(result); setPending(null);
    } catch (cause) {
      if (active.signal.aborted || current !== generation.current) return;
      setData(null); setError(cause instanceof Error ? cause.message : 'No pudimos consultar el seguimiento.');
      if (cause instanceof ProgressError && (cause.status === 401 || cause.status === 403)) callbacks.current.onAccessLost?.();
    } finally {if (!active.signal.aborted && current === generation.current) setBusy(false);}
  }, [orderId, path]);

  // Private records are fetched only while this order's panel is open.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {void load(); return () => {generation.current += 1; controller.current?.abort();};}, [load]);

  async function submit(payload:PlanProgressInput) {
    if (busy) return;
    const active = new AbortController(); controller.current = active;
    const current = generation.current;
    setBusy(true); setError(''); setSuccess(''); setPending(payload);
    try {
      const result = await request(path, {method:'POST', signal:active.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      if (active.signal.aborted || current !== generation.current) return;
      setData(result); setPending(null); setSuccess('Los cambios quedaron guardados.');
      callbacks.current.onSaved?.();
    } catch (cause) {
      if (active.signal.aborted || current !== generation.current) return;
      if (cause instanceof ProgressError && cause.status < 500) setPending(null);
      if (cause instanceof ProgressError && [401, 403, 404].includes(cause.status)) {setData(null); if (cause.status !== 404) callbacks.current.onAccessLost?.();}
      if (cause instanceof ProgressError && cause.status === 409) {
        await load();
        if (current !== generation.current) return;
      }
      setError(cause instanceof Error ? cause.message : 'No pudimos confirmar el guardado. Puedes reintentarlo.');
    } finally {if (!active.signal.aborted && current === generation.current) setBusy(false);}
  }

  function save(change:Change) {
    if (!data || busy || pending) return;
    void submit({...change, orderId, expectedVersion:data.order.progressVersion, requestId:crypto.randomUUID()});
  }
  return {data, busy, error, success, pending, save, load, retry:() => {if (pending) void submit(pending);}};
}

function ProgressMessages({state, disabled}:{state:ReturnType<typeof useProgress>; disabled?:boolean}) {
  return <>
    {state.busy && <p className="member-loading" role="status"><LoaderCircle size={17}/> Actualizando seguimiento…</p>}
    {state.error && <p className="member-feedback error" role="alert">{state.error}</p>}
    {state.success && <p className="member-feedback success" role="status"><Check size={17}/>{state.success}</p>}
    {state.pending && !state.busy && <div className="plan-progress-retry"><p className="member-help">No se confirmó el resultado del último guardado. Reintenta o actualiza para comprobarlo.</p><button type="button" className="button outline" disabled={disabled} onClick={state.retry}>Reintentar guardado</button></div>}
  </>;
}

export function OrderDates({requestedDeliveryDate, estimatedDeliveryDate, planStartedOn}:{requestedDeliveryDate?:string|null; estimatedDeliveryDate?:string|null; planStartedOn?:string|null}) {
  return <dl className="plan-progress-dates">
    {requestedDeliveryDate && <div><dt>Fecha solicitada</dt><dd><time dateTime={requestedDeliveryDate}>{formatPlanDate(requestedDeliveryDate)}</time></dd></div>}
    <div><dt>Entrega estimada</dt><dd>{estimatedDeliveryDate ? <time dateTime={estimatedDeliveryDate}>{formatPlanDate(estimatedDeliveryDate)}</time> : 'Por acordar con Carly'}</dd></div>
    {planStartedOn && <div><dt>Inicio acordado del plan</dt><dd><time dateTime={planStartedOn}>{formatPlanDate(planStartedOn)}</time></dd></div>}
  </dl>;
}

function ReviewEditor({day, review, start, today, disabled, admin, onSave, orderId}:{day:PlanReviewDay; review?:PlanProgressReview; start:string; today:string; disabled:boolean; admin:boolean; onSave:(change:Change)=>void; orderId:string}) {
  const [comment, setComment] = useState(admin ? review?.feedback ?? '' : review?.comment ?? '');
  const due = addPlanDays(start, day - 1);
  const unlocked = today >= due;
  const fieldId = `progress-${admin ? 'feedback' : 'review'}-${orderId}-${day}`;
  const canWrite = !disabled && unlocked && (!admin || Boolean(review));
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canWrite) onSave(admin ? {action:'feedback', day, feedback:comment.trim()} : {action:'review', day, comment:comment.trim()});
  }
  return <section className="plan-progress-review" aria-labelledby={`${fieldId}-title`}>
    <div className="store-section-heading"><h5 id={`${fieldId}-title`}>Revisión del día {day}</h5><span className={`store-status ${review ? 'store-status-positive' : ''}`}>{review ? 'Registrada' : unlocked ? 'Disponible' : 'Próximamente'}</span></div>
    <p className="store-caption">Disponible desde el <time dateTime={due}>{formatPlanDate(due)}</time>.</p>
    {admin && review && <div className="plan-progress-comment"><strong>Comentario del cliente</strong><p>{review.comment}</p></div>}
    {!admin && review?.feedback && <div className="plan-progress-feedback"><strong>Retroalimentación de Carly</strong><p>{review.feedback}</p></div>}
    {admin && !review ? <p className="member-help">El cliente todavía no ha registrado esta revisión.</p> : <form className="member-form store-form" onSubmit={save}>
      <label htmlFor={fieldId}>{admin ? 'Retroalimentación privada' : '¿Cómo vas con tu constancia y tu entrenamiento?'}</label>
      <textarea id={fieldId} rows={3} minLength={3} maxLength={1200} value={comment} onChange={event => setComment(event.target.value)} required disabled={!canWrite} aria-describedby={`${fieldId}-help`} placeholder={admin ? 'Reconoce avances y acuerda el siguiente paso de entrenamiento.' : 'Comparte lo que has podido cumplir y lo que te ayudaría a mantener el hábito.'}/>
      <p className="member-help" id={`${fieldId}-help`}>Solo comentarios sobre hábitos y entrenamiento. No incluyas peso, fotos, lesiones, diagnósticos ni otros datos médicos.{!admin && review?.feedback ? ' Si cambias tu comentario, Carly podrá revisarlo de nuevo.' : ''}</p>
      <button type="submit" className="button outline" disabled={!canWrite}>{admin ? 'Guardar retroalimentación' : review ? 'Actualizar revisión' : 'Guardar revisión'} <Check size={16}/></button>
    </form>}
  </section>;
}

function MemberProgressPanel({orderId, onAccessLost}:PanelProps) {
  const state = useProgress({orderId, onAccessLost}, false);
  const [selectedDate, setSelectedDate] = useState('');
  const {data} = state;
  const start = data?.order.planStartedOn;
  const end = data?.order.planEndsOn;
  const lastAvailable = data && end ? (data.today < end ? data.today : end) : '';
  const date = selectedDate || (start && lastAvailable >= start ? lastAvailable : '');
  const disabled = state.busy || Boolean(state.pending);
  const started = Boolean(data && start && data.today >= start);
  function record(event:FormEvent<HTMLFormElement>) {event.preventDefault(); const date=String(new FormData(event.currentTarget).get('sessionDate')||''); if (started && date) state.save({action:'session', date, completed:true});}
  return <div className="plan-progress-body">
    <ProgressMessages state={state}/>
    {data && <>
      <OrderDates {...data.order}/>
      <p className="member-help">Este seguimiento es privado entre tú y Carly y no se comparte con el asistente de IA. Las fechas se cuentan con la hora de Ciudad de México.</p>
      {!start ? <p className="plan-progress-empty">Carly acordará contigo el inicio de tus 90 días. El conteo comienza en esa fecha, cuando quede guardada aquí.</p> : <>
        <p className="store-caption">Tus 90 días: {formatPlanDate(start)} al {formatPlanDate(end)}.{data.today > end! ? ' Este periodo terminó; puedes consultar tus avances y completar registros de fechas transcurridas.' : ''}</p>
        <section className="plan-progress-sessions" aria-labelledby={`sessions-${orderId}`}>
          <h5 id={`sessions-${orderId}`}>Mis sesiones · {data.sessions.length} registradas</h5>
          <p className="member-help">Registra una sesión por fecha realizada dentro del plan. Tu frecuencia de entrenamiento es la que acuerdes con Carly.</p>
          {!started && <p className="member-help">Podrás registrar sesiones a partir del {formatPlanDate(start)}.</p>}
          <form className="member-form store-form plan-progress-session-form" onSubmit={record}>
            <div><label htmlFor={`session-date-${orderId}`}>Fecha de la sesión</label><input id={`session-date-${orderId}`} name="sessionDate" type="date" min={start} max={lastAvailable} value={date} onChange={event => setSelectedDate(event.target.value)} disabled={disabled || !started} required/></div>
            <button type="submit" className="button primary" disabled={disabled || !started || data.sessions.includes(date)}>Registrar sesión <Check size={16}/></button>
          </form>
          {data.sessions.length ? <details className="plan-progress-session-list"><summary>Ver sesiones registradas ({data.sessions.length})</summary><ul>{data.sessions.map(sessionDate => <li key={sessionDate}><time dateTime={sessionDate}>{formatPlanDate(sessionDate)}</time><button type="button" className="text-link" disabled={disabled} aria-label={`Quitar sesión del ${formatPlanDate(sessionDate)}`} onClick={() => state.save({action:'session', date:sessionDate, completed:false})}>Quitar</button></li>)}</ul></details> : <p className="member-help">Todavía no hay sesiones registradas.</p>}
        </section>
        <div className="plan-progress-reviews">{PLAN_REVIEW_DAYS.map(day => {const review = data.reviews.find(item => item.day === day); return <ReviewEditor key={`${day}-${review?.updatedAt ?? ''}-${review?.feedbackAt ?? ''}`} day={day} review={review} start={start} today={data.today} disabled={disabled} admin={false} onSave={state.save} orderId={orderId}/>;})}</div>
      </>}
    </>}
    <button type="button" className="text-link plan-progress-refresh" onClick={() => void state.load()} disabled={state.busy}><RefreshCw size={15}/> Actualizar seguimiento</button>
  </div>;
}

export default function PlanProgress({orderId, title, onAccessLost}:{orderId:string; title:string; onAccessLost?:()=>void}) {
  const [open, setOpen] = useState(false);
  return <details className="plan-progress" onToggle={event => setOpen(event.currentTarget.open)}><summary><CalendarDays size={19}/><span>Mi seguimiento de 90 días<small>{title}</small></span></summary>{open && <MemberProgressPanel orderId={orderId} onAccessLost={onAccessLost}/>}</details>;
}

function AdminDates({data, disabled, onSave}:{data:PlanProgressSnapshot; disabled:boolean; onSave:(change:Change)=>void}) {
  const [estimate, setEstimate] = useState(data.order.estimatedDeliveryDate ?? '');
  const [start, setStart] = useState(data.order.planStartedOn ?? '');
  function save(event:FormEvent<HTMLFormElement>) {event.preventDefault(); const fields=new FormData(event.currentTarget); onSave({action:'dates', estimatedDeliveryDate:String(fields.get('estimatedDeliveryDate')||'')||null, planStartedOn:data.order.hasPlan?String(fields.get('planStartedOn')||'')||null:null});}
  return <form className="member-form store-form plan-progress-date-form" onSubmit={save}>
    <p className="member-help">Fecha solicitada por el cliente: <strong>{data.order.requestedDeliveryDate ? formatPlanDate(data.order.requestedDeliveryDate) : 'No indicada al comprar'}</strong>. La solicitud no confirma la entrega.</p>
    <label htmlFor={`estimated-date-${data.order.id}`}>Fecha estimada de entrega de materiales o productos</label>
    <input id={`estimated-date-${data.order.id}`} name="estimatedDeliveryDate" type="date" value={estimate} onChange={event => setEstimate(event.target.value)} disabled={disabled}/>
    {data.order.hasPlan && <><label htmlFor={`start-date-${data.order.id}`}>Inicio del plan acordado con el cliente</label><input id={`start-date-${data.order.id}`} name="planStartedOn" type="date" value={start} onChange={event => setStart(event.target.value)} disabled={disabled}/><p className="member-help">Confirma la fecha con el cliente antes de guardarla. No se calcula a partir del pago. Una vez que haya avances registrados, el inicio no podrá cambiarse.</p></>}
    <button type="submit" className="button outline" disabled={disabled}>Guardar fechas <Check size={16}/></button>
  </form>;
}

export function PlanProgressAdmin(props:PanelProps) {
  const state = useProgress(props, true);
  const {data} = state;
  const disabled = Boolean(props.disabled) || state.busy || Boolean(state.pending);
  return <section className="plan-progress plan-progress-admin" aria-labelledby={`admin-progress-${props.orderId}`}>
    <h5 id={`admin-progress-${props.orderId}`}>Fechas y seguimiento</h5>
    <ProgressMessages state={state} disabled={props.disabled}/>
    {data && <>
      <AdminDates key={data.order.progressVersion} data={data} disabled={disabled} onSave={state.save}/>
      {data.order.hasPlan && <><p className="member-help">Sesiones y comentarios privados entre el cliente y Carly. No se comparten con el asistente de IA. No registres peso, fotos ni datos médicos. Fechas de Ciudad de México.</p>
        {!data.order.planStartedOn ? <p className="plan-progress-empty">Guarda el inicio acordado para habilitar las sesiones y revisiones de los días 30, 60 y 90.</p> : <>
          <p className="store-caption">Periodo: {formatPlanDate(data.order.planStartedOn)} al {formatPlanDate(data.order.planEndsOn)}.</p>
          <details className="plan-progress-session-list"><summary>Sesiones del cliente ({data.sessions.length})</summary>{data.sessions.length ? <ul>{data.sessions.map(date => <li key={date}><time dateTime={date}>{formatPlanDate(date)}</time></li>)}</ul> : <p className="member-help">Aún no hay sesiones registradas.</p>}</details>
          <div className="plan-progress-reviews">{PLAN_REVIEW_DAYS.map(day => {const review = data.reviews.find(item => item.day === day); return <ReviewEditor key={`${day}-${review?.updatedAt ?? ''}-${review?.feedbackAt ?? ''}`} day={day} review={review} start={data.order.planStartedOn!} today={data.today} disabled={disabled} admin onSave={state.save} orderId={props.orderId}/>;})}</div>
        </>}
      </>}
    </>}
    <button type="button" className="text-link plan-progress-refresh" disabled={Boolean(props.disabled) || state.busy} onClick={() => void state.load()}><RefreshCw size={15}/> Actualizar fechas y seguimiento</button>
  </section>;
}
