'use client';

import {useEffect, useRef, useState, type FormEvent, type MouseEvent} from 'react';
import {ArrowUpRight, Bot, LoaderCircle, LockKeyhole, MessageCircle, RefreshCw, Send, X} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger} from '@/components/ui/dialog';
import {whatsapp} from '@/lib/catalog';
import './store-assistant.css';

type Quota = {limit:number; remaining:number; resetsAt:string};
type Availability = {enabled:false} | ({enabled:true} & Quota);
type Exchange = {question:string; reply:string};
type Failure = {message:string; status:number};
type StoreSection = 'planes' | 'tienda';
const quickQuestions = ['¿Qué incluyen los tres planes?', '¿Qué postres puedo elegir por menos de $150?', '¿Cómo funcionan los pedidos y envíos?'];
const contact = whatsapp('Hola, Carly. Tengo una consulta sobre los planes o productos de Carlyfit Lab.');

function record(value:unknown):Record<string,unknown>|null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
function quota(value:Record<string,unknown>):Quota|null {
  if (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 ||
    typeof value.remaining !== 'number' || !Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > value.limit ||
    typeof value.resetsAt !== 'string' || !Number.isFinite(new Date(value.resetsAt).getTime())) return null;
  return {limit:value.limit, remaining:value.remaining, resetsAt:value.resetsAt};
}
function errorMessage(status:number, value:Record<string,unknown>|null):string {
  if (status === 401) return 'Tu sesión terminó. Inicia sesión de nuevo para usar el asistente.';
  if (status === 403) return typeof value?.error === 'string' && value.error.trim() && value.error.length <= 1000
    ? value.error : 'Para usar el asistente, inicia sesión con tu cuenta de Google.';
  if (status === 429) return typeof value?.error === 'string' ? value.error : 'Alcanzamos el límite de consultas. Puedes volver más tarde o consultar con Carly.';
  if (status === 503) return 'El asistente no está disponible por el momento. Puedes consultar con Carly por WhatsApp.';
  return typeof value?.error === 'string' ? value.error : 'No pudimos completar la consulta. Inténtalo otra vez.';
}
function resetLabel(value:string):string {
  return new Intl.DateTimeFormat('es-MX', {timeZone:'America/Mexico_City', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
}
function retrySeconds(value:string|null):number {
  if (value === null) return 30;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(172800, seconds)) : 30;
}
function waitLabel(seconds:number):string {
  if (seconds >= 3600) {const minutes = Math.ceil(seconds / 60); return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;}
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} min`;
  return `${seconds} s`;
}

function AssistantPanel({userId, onSignIn, onClose, onNavigate}:{userId:string|null; onSignIn:()=>void; onClose:()=>void; onNavigate:(event:MouseEvent<HTMLAnchorElement>, section:StoreSection)=>void}) {
  const [availability, setAvailability] = useState<Availability|null>(null);
  const [loading, setLoading] = useState(!!userId);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [failure, setFailure] = useState<Failure|null>(null);
  const [reload, setReload] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const actionController = useRef<AbortController|null>(null);
  const input = useRef<HTMLTextAreaElement|null>(null);
  const transcript = useRef<HTMLDivElement|null>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setFailure(null);
      try {
        const response = await fetch('/api/assistant', {credentials:'same-origin', cache:'no-store', signal:controller.signal});
        const body = record(await response.json().catch(() => null));
        if (controller.signal.aborted) return;
        if (!response.ok) {setAvailability(null); setFailure({status:response.status, message:errorMessage(response.status, body)}); return;}
        if (body?.enabled === false) {setAvailability({enabled:false}); return;}
        const limits = body && quota(body);
        if (body?.enabled !== true || !limits) throw new Error('invalid_response');
        setAvailability({enabled:true, ...limits});
      } catch {
        if (!controller.signal.aborted) {setAvailability(null); setFailure({status:0, message:'No pudimos conectar con el asistente. Revisa tu conexión e inténtalo otra vez.'});}
      } finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();
    return () => controller.abort();
  }, [userId, reload]);

  useEffect(() => () => {actionController.current?.abort();}, []);
  useEffect(() => {if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;}, [exchanges, sending]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setCooldown(seconds);
      if (seconds === 0) {
        clearInterval(timer);
        setFailure(current => current?.status === 429 ? null : current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const sessionExpired = failure?.status === 401;
  const blocked = !availability?.enabled || availability.remaining === 0 || failure?.status === 403 || failure?.status === 503 || sessionExpired;

  function waitBeforeNextRequest(response:Response) {
    const seconds = retrySeconds(response.headers.get('Retry-After'));
    setCooldown(seconds); setRetryAt(Date.now() + seconds * 1000);
  }

  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!userId || sending || loading || blocked || cooldown > 0 || !message || message.length > 600) return;
    const controller = new AbortController();
    actionController.current?.abort(); actionController.current = controller;
    setSending(true); setFailure(null);
    try {
      const response = await fetch('/api/assistant', {method:'POST', credentials:'same-origin', cache:'no-store', signal:controller.signal, headers:{'Content-Type':'application/json'}, body:JSON.stringify({message})});
      const body = record(await response.json().catch(() => null));
      if (controller.signal.aborted) return;
      const limits = body && quota(body);
      if (limits) setAvailability(current => current?.enabled ? {...current, ...limits} : current);
      if (!response.ok) {
        if (response.status === 429) waitBeforeNextRequest(response);
        if (response.status === 403) setAvailability(null);
        setFailure({status:response.status, message:errorMessage(response.status, body)}); return;
      }
      if (typeof body?.reply !== 'string' || !body.reply.trim() || body.reply.length > 6000 || !limits) throw new Error('invalid_response');
      const reply = body.reply;
      setExchanges(current => [...current, {question:message, reply}]);
      setDraft('');
      waitBeforeNextRequest(response);
    } catch {
      if (!controller.signal.aborted) setFailure({status:0, message:'La consulta se interrumpió. Puedes volver a intentarlo; una solicitud que llegó a procesarse puede contar para tu límite diario.'});
    } finally {if (!controller.signal.aborted) setSending(false);}
  }

  return <>
    <header className="assistant-heading">
      <span className="assistant-avatar"><Bot size={24} aria-hidden="true"/></span>
      <div><p className="assistant-kicker">CARLYFIT LAB · IA</p><DialogTitle>Tu guía Carlyfit</DialogTitle></div>
      <button type="button" className="icon-button assistant-close" aria-label="Cerrar asistente" onClick={onClose}><X size={21}/></button>
    </header>
    <DialogDescription className="assistant-description">Encuentra información sobre nuestros productos, planes y pedidos.</DialogDescription>

    {!userId || sessionExpired ? <div className="assistant-sign-in">
      <span className="assistant-lock"><LockKeyhole size={25} aria-hidden="true"/></span>
      <h3>{sessionExpired ? 'Vuelve a iniciar sesión' : 'Primero, inicia sesión'}</h3>
      <p>{sessionExpired ? failure?.message : 'Usa tu cuenta de Google para conversar con el asistente. Cada cuenta tiene un límite diario para que todos puedan usarlo.'}</p>
      <button type="button" className="button primary" onClick={onSignIn}>Iniciar sesión con Google <ArrowUpRight size={18}/></button>
    </div> : <>
      <div className="assistant-conversation" ref={transcript}>
        <div className="assistant-welcome"><p>¡Hola! Te ayudo a comparar planes y a elegir tus próximos antojos según tus gustos y presupuesto.</p><p>Cada pregunta se responde por separado. Incluye en ella lo que necesitas saber.</p></div>
        {!exchanges.length && <div className="assistant-suggestions" aria-label="Ideas para preguntar">{quickQuestions.map(question => <button key={question} type="button" disabled={loading || sending || !!blocked} onClick={() => {setDraft(question); input.current?.focus();}}>{question}<ArrowUpRight size={15} aria-hidden="true"/></button>)}</div>}
        <div role="log" aria-label="Preguntas y respuestas del asistente" aria-live="polite" aria-relevant="additions text">
          {exchanges.map((exchange, index) => <div className="assistant-exchange" key={index}>
            <div className="assistant-question"><span>Tú</span><p>{exchange.question}</p></div>
            <div className="assistant-answer"><span>Asistente IA</span><p>{exchange.reply}</p></div>
          </div>)}
          {sending && <p className="assistant-loading"><LoaderCircle size={16} className="assistant-spinner" aria-hidden="true"/> Consultando la información de la tienda…</p>}
        </div>
      </div>
      <div className="assistant-controls">
        {loading && <p className="assistant-loading" role="status"><LoaderCircle size={16} className="assistant-spinner" aria-hidden="true"/> Preparando el asistente…</p>}
        {failure && <div className="assistant-notice" role="alert"><p>{failure.message}</p>{!sending && (failure.status !== 429 || cooldown === 0) && <button type="button" className="assistant-refresh" onClick={() => setReload(current => current + 1)} disabled={loading}><RefreshCw size={14}/> Consultar disponibilidad</button>}</div>}
        {!loading && !failure && availability && !availability.enabled && <div className="assistant-notice" role="status"><p>El asistente no está disponible por el momento. Carly puede ayudarte por WhatsApp.</p><button type="button" className="assistant-refresh" onClick={() => setReload(current => current + 1)}><RefreshCw size={14}/> Consultar disponibilidad</button></div>}
        {availability?.enabled && <p className="assistant-quota" role="status">{availability.remaining > 0 ? `${availability.remaining} de ${availability.limit} consultas disponibles hoy.` : 'Ya utilizaste tus consultas de hoy.'} <span>Se renuevan el {resetLabel(availability.resetsAt)} (hora del centro de México).</span>{availability.remaining === 0 && cooldown === 0 && <button type="button" className="assistant-refresh" onClick={() => setReload(current => current + 1)} disabled={loading}><RefreshCw size={14}/> Consultar disponibilidad</button>}</p>}
        {cooldown > 0 && availability?.enabled && availability.remaining > 0 && <p className="assistant-cooldown" id="assistant-cooldown" role="timer" aria-live="off">Espera {waitLabel(cooldown)} antes de enviar otra pregunta.</p>}
        <form onSubmit={send} className="assistant-form">
          <label htmlFor="carlyfit-assistant-question">Tu pregunta</label>
          <textarea id="carlyfit-assistant-question" ref={input} rows={2} maxLength={600} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Por ejemplo: ¿qué incluye el plan con postres?" disabled={loading || sending || !!blocked} aria-describedby={`assistant-message-guidance${cooldown > 0 && availability?.enabled && availability.remaining > 0 ? ' assistant-cooldown' : ''}`}/>
          <div className="assistant-compose-footer"><span id="assistant-message-guidance">{draft.length}/600 · Sin datos personales ni de salud</span><button type="submit" className="assistant-send" disabled={loading || sending || !!blocked || cooldown > 0 || !draft.trim()}>{sending ? 'Consultando…' : 'Preguntar'}<Send size={16} aria-hidden="true"/></button></div>
        </form>
      </div>
    </>}

    <footer className="assistant-footer">
      <nav aria-label="Enlaces de ayuda"><a href="#planes" onClick={event => onNavigate(event, 'planes')}>Ver planes</a><a href="#tienda" onClick={event => onNavigate(event, 'tienda')}>Ver productos</a><a href={contact} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> Hablar con Carly</a></nav>
      <p>La IA puede equivocarse. Confirma con Carly las dudas de ingredientes y la atención personalizada. Tu pregunta se envía a Cloudflare para responder. <a href="/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a></p>
    </footer>
  </>;
}

export default function StoreAssistant({userId, onSignIn}:{userId:string|null; onSignIn:()=>void}) {
  const [open, setOpen] = useState(false);
  const openingSignIn = useRef(false);
  const pendingSection = useRef<StoreSection|null>(null);

  function navigateToSection(event:MouseEvent<HTMLAnchorElement>, section:StoreSection) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pendingSection.current = section;
    setOpen(false);
  }

  return <Dialog open={open} onOpenChange={next => {if (next) {openingSignIn.current = false; pendingSection.current = null;} setOpen(next);}}>
    <DialogTrigger asChild><button type="button" className="assistant-launch" aria-label="Abrir asistente de Carlyfit Lab"><Bot size={22} aria-hidden="true"/><span>¿Te ayudo?<small>Asistente IA</small></span></button></DialogTrigger>
    <DialogContent className="assistant-dialog translate-x-0 translate-y-0" showCloseButton={false} onCloseAutoFocus={event => {
      if (openingSignIn.current) event.preventDefault();
      const sectionId = pendingSection.current;
      if (!sectionId) return;
      event.preventDefault();
      pendingSection.current = null;
      // Navigate after closing, instead of restoring focus to the launcher.
      requestAnimationFrame(() => {
        const section = document.getElementById(sectionId);
        if (!section) return;
        const hash = `#${sectionId}`;
        if (window.location.hash !== hash) window.history.pushState(window.history.state, '', hash);
        const previousTabIndex = section.getAttribute('tabindex');
        section.setAttribute('tabindex', '-1');
        section.focus({preventScroll:true});
        section.addEventListener('blur', () => {
          if (previousTabIndex === null) section.removeAttribute('tabindex');
          else section.setAttribute('tabindex', previousTabIndex);
        }, {once:true});
        // Always scroll, including when this section is already in the URL.
        section.scrollIntoView({block:'start'});
      });
    }}>
      {open && <AssistantPanel key={userId ?? 'guest'} userId={userId} onClose={() => setOpen(false)} onNavigate={navigateToSection} onSignIn={() => {openingSignIn.current = true; setOpen(false); onSignIn();}}/>}
    </DialogContent>
  </Dialog>;
}
