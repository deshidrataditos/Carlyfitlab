'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Check, LoaderCircle, RefreshCw, Star, X} from 'lucide-react';

type Status = 'pending' | 'approved' | 'rejected';
type Review = {
  id:string;
  display_name:string;
  body:string;
  rating:number;
  status:Status;
  created_at:string;
  moderated_at:string|null;
};
type ReviewList = {testimonials:Review[]; hasMore:boolean};
const views:{status:Status; label:string; empty:string}[] = [
  {status:'pending', label:'Pendientes', empty:'No hay comentarios pendientes de revisión.'},
  {status:'approved', label:'Publicados', empty:'Todavía no hay comentarios publicados.'},
  {status:'rejected', label:'No publicados', empty:'No hay comentarios rechazados u ocultos.'},
];

class ModerationError extends Error {
  constructor(message:string, readonly status:number) {super(message);}
}

async function request<T>(path:string, options:RequestInit):Promise<T> {
  const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options});
  const result:unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result && typeof result === 'object' && 'error' in result ? result.error : null;
    throw new ModerationError(typeof detail === 'string' ? detail : 'No pudimos completar la solicitud. Inténtalo de nuevo.', response.status);
  }
  if (result === null) throw new Error('No pudimos leer la respuesta. Inténtalo de nuevo.');
  return result as T;
}

function dateLabel(value:string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});
}

export default function TestimonialModeration({onModerated, onAccessLost}:{
  onModerated:()=>void;
  onAccessLost:()=>void;
}) {
  const [status, setStatus] = useState<Status>('pending');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string|null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const lifecycle = useRef(0);
  const listSequence = useRef(0);
  const listController = useRef<AbortController|null>(null);
  const actionController = useRef<AbortController|null>(null);
  const successMessage = useRef<HTMLDivElement|null>(null);
  const restoreActionFocus = useRef(false);

  useEffect(() => () => {
    lifecycle.current += 1;
    listController.current?.abort();
    actionController.current?.abort();
  }, []);

  useEffect(() => {
    if (success && acting === null && restoreActionFocus.current) {
      restoreActionFocus.current = false;
      successMessage.current?.focus();
    }
  }, [success, acting]);

  const handleError = useCallback((cause:unknown) => {
    if (cause instanceof ModerationError && (cause.status === 401 || cause.status === 403)) {
      setReviews([]);
      setHasMore(false);
      onAccessLost();
      return;
    }
    setError(cause instanceof Error ? cause.message : 'No pudimos completar la solicitud. Inténtalo de nuevo.');
  }, [onAccessLost]);

  const loadReviews = useCallback(async (offset = 0) => {
    const currentLifecycle = lifecycle.current;
    const sequence = ++listSequence.current;
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setLoading(true);
    setError('');
    if (offset === 0) {setReviews([]); setHasMore(false);}
    try {
      const result = await request<ReviewList>(`/api/admin/testimonials?status=${status}&offset=${offset}`, {signal:controller.signal});
      if (controller.signal.aborted || currentLifecycle !== lifecycle.current || sequence !== listSequence.current) return;
      setReviews(current => offset === 0 ? result.testimonials : [...current, ...result.testimonials.filter(review => !current.some(existing => existing.id === review.id))]);
      setHasMore(result.hasMore);
    } catch (cause) {
      if (controller.signal.aborted || currentLifecycle !== lifecycle.current || sequence !== listSequence.current) return;
      handleError(cause);
    } finally {
      if (!controller.signal.aborted && currentLifecycle === lifecycle.current && sequence === listSequence.current) setLoading(false);
    }
  }, [status, handleError]);

  useEffect(() => {
    setSuccess('');
    void loadReviews();
    return () => {listController.current?.abort();};
  }, [loadReviews]);

  async function moderate(review:Review, nextStatus:'approved'|'rejected', actionButton:HTMLButtonElement) {
    if (acting || loading) return;
    const currentLifecycle = lifecycle.current;
    const controller = new AbortController();
    actionController.current = controller;
    restoreActionFocus.current = false;
    setActing(review.id);
    setError('');
    setSuccess('');
    try {
      await request<{testimonial:{id:string; status:Status; moderated_at:string}}>('/api/admin/testimonials', {
        method:'POST',
        signal:controller.signal,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:review.id, status:nextStatus, expectedStatus:review.status}),
      });
      if (controller.signal.aborted || currentLifecycle !== lifecycle.current) return;
      // Recover focus when its action disappears, without interrupting a user
      // who moved to another control while the request was in progress.
      restoreActionFocus.current = document.activeElement === actionButton || document.activeElement === document.body;
      setReviews(current => current.filter(item => item.id !== review.id));
      setSuccess(nextStatus === 'approved' ? 'El comentario ya está publicado en la comunidad.' : review.status === 'approved' ? 'El comentario dejó de mostrarse en la comunidad.' : 'El comentario se guardó como no publicado.');
      onModerated();
    } catch (cause) {
      if (controller.signal.aborted || currentLifecycle !== lifecycle.current) return;
      handleError(cause);
    } finally {
      if (!controller.signal.aborted && currentLifecycle === lifecycle.current) setActing(null);
    }
  }

  return <div className="moderation-panel" id="testimonial-moderation">
    <p className="member-help">Revisa las experiencias de la comunidad. Al aprobar un comentario, su nombre y contenido se muestran en la página.</p>
    <div className="moderation-filters" role="group" aria-label="Estado de los comentarios">
      {views.map(view => <button type="button" key={view.status} aria-pressed={status === view.status} onClick={() => setStatus(view.status)} disabled={acting !== null}>{view.label}</button>)}
    </div>
    <div className="moderation-toolbar"><button type="button" className="text-link" onClick={() => void loadReviews()} disabled={loading || acting !== null}><RefreshCw size={15}/> Actualizar lista</button></div>
    {error && <div className="member-feedback error" role="alert">{error}</div>}
    {success && <div className="member-feedback success" role="status" tabIndex={-1} ref={successMessage}><Check size={17}/><span>{success}</span></div>}
    <div className="moderation-list" aria-busy={loading} aria-label={`Comentarios ${views.find(view => view.status === status)?.label.toLowerCase()}`}>
      {reviews.map(review => <article className="moderation-review" key={review.id} aria-labelledby={`review-author-${review.id}`}>
        <div className="moderation-review-heading"><strong id={`review-author-${review.id}`}>{review.display_name}</strong><div className="member-rating" aria-label={`${review.rating} de 5 estrellas`}>{Array.from({length:5}, (_, index) => <Star key={index} size={15} fill={index < review.rating ? 'currentColor' : 'none'} aria-hidden="true"/>)}</div></div>
        <time dateTime={review.created_at}>{dateLabel(review.created_at)}</time>
        <p className="moderation-review-body">{review.body}</p>
        <div className="moderation-actions">
          {review.status !== 'approved' && <button type="button" className="button primary" disabled={acting !== null || loading} aria-label={`Aprobar comentario de ${review.display_name}, ${dateLabel(review.created_at)}`} onClick={event => void moderate(review, 'approved', event.currentTarget)}><Check size={16}/> Aprobar</button>}
          {review.status !== 'rejected' && <button type="button" className="button outline" disabled={acting !== null || loading} aria-label={`${review.status === 'approved' ? 'Ocultar' : 'Rechazar'} comentario de ${review.display_name}, ${dateLabel(review.created_at)}`} onClick={event => void moderate(review, 'rejected', event.currentTarget)}><X size={16}/>{review.status === 'approved' ? 'Ocultar' : 'Rechazar'}</button>}
          {acting === review.id && <span className="member-loading" role="status"><LoaderCircle size={16}/> Guardando…</span>}
        </div>
      </article>)}
      {loading && <p className="member-loading" role="status"><LoaderCircle size={18}/> Cargando comentarios…</p>}
      {!loading && !error && reviews.length === 0 && <p className="moderation-empty">{views.find(view => view.status === status)?.empty}</p>}
    </div>
    {hasMore && <button type="button" className="button outline moderation-more" disabled={loading || acting !== null} onClick={() => void loadReviews(reviews.length)}>{loading ? 'Cargando…' : 'Ver más comentarios'}</button>}
  </div>;
}
