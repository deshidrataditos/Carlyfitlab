'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowUpRight, Check, ChevronDown, Heart, LoaderCircle, LockKeyhole, LogOut, MessageCircle, ShieldCheck, Sparkles, Star, X} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group';
import {whatsapp} from '@/lib/catalog';
import TestimonialModeration from './testimonial-moderation';

type Mode = 'register' | 'login';
type Testimonial = {id:string; body:string; rating:number; created_at:string};
type PublicTestimonial = Testimonial & {display_name:string};
type MemberTestimonial = Testimonial & {status:string};
type Promotion = {id:string; title:string; body:string; starts_at:string; ends_at:string|null};
type Account = {
  configured:boolean;
  user:null|{id:string; email?:string};
  profile:null|{display_name:string; marketing_opt_in:boolean};
  testimonials:MemberTestimonial[];
  promotions:Promotion[];
  canModerateTestimonials:boolean;
};

const emptyAccount:Account = {configured:false, user:null, profile:null, testimonials:[], promotions:[], canModerateTestimonials:false};
const contact = whatsapp('Hola, Carly. Me gustaría saber más sobre la comunidad Carlyfit Lab.');

async function request<T>(path:string, options:RequestInit = {}):Promise<T> {
  const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options});
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result && typeof result === 'object' && 'error' in result ? result.error : null;
    throw new Error(typeof detail === 'string' ? detail : 'No pudimos completar la solicitud. Inténtalo de nuevo.');
  }
  if (result === null) throw new Error('No pudimos leer la respuesta. Inténtalo de nuevo.');
  return result as T;
}

function post<T>(path:string, data:unknown):Promise<T> {
  return request<T>(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
}

function dateLabel(value:string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});
}

function Rating({value}:{value:number}) {
  return <div className="member-rating" aria-label={`${value} de 5 estrellas`}>
    {Array.from({length:5}, (_, index) => <Star key={index} size={17} aria-hidden="true" fill={index < value ? 'currentColor' : 'none'}/>)}
  </div>;
}

export default function MemberCommunity({open, onOpenChange, mode, onModeChange}:{
  open:boolean;
  onOpenChange:(value:boolean)=>void;
  mode:Mode;
  onModeChange:(value:Mode)=>void;
}) {
  const [account, setAccount] = useState<Account>(emptyAccount);
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState('');
  const [actionError, setActionError] = useState('');
  const [oauthError, setOauthError] = useState('');
  const [action, setAction] = useState<'google'|'profile'|'comment'|'logout'|null>(null);
  const [success, setSuccess] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [body, setBody] = useState('');
  const [rating, setRating] = useState('');
  const [publicTestimonials, setPublicTestimonials] = useState<PublicTestimonial[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState('');
  const [moderationOpen, setModerationOpen] = useState(false);
  const accountRequest = useRef(0);
  const publicRequest = useRef(0);

  const loadAccount = useCallback(async (silent = false) => {
    const sequence = ++accountRequest.current;
    if (!silent) setLoading(true);
    setAccountError('');
    try {
      const data = await request<Account>('/api/account');
      if (sequence !== accountRequest.current) return;
      setAccount(data);
      setDisplayName(data.profile?.display_name || '');
      setMarketingOptIn(data.profile?.marketing_opt_in === true);
    } catch (error) {
      if (sequence !== accountRequest.current) return;
      setAccount(emptyAccount);
      setAccountError(error instanceof Error ? error.message : 'No pudimos abrir tu cuenta. Inténtalo de nuevo.');
    } finally {
      if (sequence === accountRequest.current) setLoading(false);
    }
  }, []);

  const loadTestimonials = useCallback(async () => {
    const sequence = ++publicRequest.current;
    setPublicLoading(true);
    setPublicError('');
    try {
      const data = await request<{testimonials:PublicTestimonial[]}>('/api/testimonials');
      if (sequence !== publicRequest.current) return;
      setPublicTestimonials(data.testimonials);
    } catch {
      if (sequence !== publicRequest.current) return;
      setPublicError('Por ahora no pudimos cargar las experiencias. Puedes intentarlo de nuevo.');
    } finally {
      if (sequence === publicRequest.current) setPublicLoading(false);
    }
  }, []);

  const refreshAfterModeration = useCallback(() => {
    void loadTestimonials();
    void loadAccount(true);
  }, [loadAccount, loadTestimonials]);

  const loseModerationAccess = useCallback(() => {
    setModerationOpen(false);
    setAccount(current => ({...current, canModerateTestimonials:false}));
    setActionError('Tu sesión ya no tiene acceso para administrar comentarios. Vuelve a abrir tu cuenta para comprobar el permiso.');
  }, []);

  useEffect(() => {
    void loadTestimonials();
    return () => {publicRequest.current += 1;};
  }, [loadTestimonials]);
  useEffect(() => {void loadAccount();}, [loadAccount]);
  useEffect(() => {setModerationOpen(false);}, [open, account.user?.id, account.canModerateTestimonials]);
  useEffect(() => {
    if (open) {
      void loadAccount();
      setActionError('');
      setSuccess('');
    }
  }, [open, loadAccount]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const authResult = url.searchParams.get('auth');
    if (authResult !== 'error' && authResult !== 'success') return;
    if (authResult === 'error') setOauthError('No se completó el acceso con Google. Puedes intentarlo otra vez.');
    onOpenChange(true);
    url.searchParams.delete('auth');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [onOpenChange]);

  function showAccount(nextMode:Mode = 'register') {
    onModeChange(nextMode);
    onOpenChange(true);
  }

  async function googleLogin() {
    setOauthError('');
    setAction('google');
    setActionError('');
    try {
      const data = await post<{url:string}>('/api/auth/google', {});
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('No pudimos abrir Google. Inténtalo de nuevo.');
      window.location.assign(url.href);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos abrir Google. Inténtalo de nuevo.');
      setAction(null);
    }
  }

  async function saveProfile(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction('profile');
    setSuccess('');
    setActionError('');
    try {
      const name = displayName.trim();
      await post('/api/account', {displayName:name, marketingOptIn});
      setAccount(current => ({...current, profile:{display_name:name, marketing_opt_in:marketingOptIn}}));
      setDisplayName(name);
      setSuccess('Tu nombre y tus preferencias se guardaron.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos guardar los cambios. Inténtalo de nuevo.');
    } finally {
      setAction(null);
    }
  }

  async function submitTestimonial(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {setActionError('Elige una calificación para compartir tu experiencia.'); return;}
    setAction('comment');
    setSuccess('');
    setActionError('');
    try {
      await post('/api/testimonials', {body:body.trim(), rating:Number(rating)});
      setBody('');
      setRating('');
      await loadAccount();
      setSuccess('Gracias por compartir tu experiencia. Tu comentario fue enviado a revisión.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos enviar tu comentario. Inténtalo de nuevo.');
    } finally {
      setAction(null);
    }
  }

  async function logout() {
    setAction('logout');
    setModerationOpen(false);
    setActionError('');
    setSuccess('');
    try {
      await post('/api/auth/logout', {});
      ++accountRequest.current;
      setAccount(current => ({...current, user:null, profile:null, testimonials:[], promotions:[], canModerateTestimonials:false}));
      setDisplayName('');
      setMarketingOptIn(false);
      setBody('');
      setRating('');
      setSuccess('Cerraste tu sesión. ¡Nos vemos pronto!');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setAction(null);
    }
  }

  return <>
    <section id="comunidad" className="community-section">
      <div className="wrap community-grid">
        <div>
          <p className="eyebrow">CRECEMOS CONTIGO</p>
          <h2>Tu experiencia<br/><em>también inspira.</em></h2>
          <p>Un espacio para compartir tu proceso, conocer experiencias reales y disfrutar promociones para la comunidad Carlyfit.</p>
          <button className="button primary" onClick={() => showAccount(account.user ? 'login' : 'register')}>
            {account.user ? 'Ir a mi espacio Carlyfit' : 'Únete a la comunidad'} <ArrowUpRight size={18}/>
          </button>
          <p className="small-note"><LockKeyhole size={13} aria-hidden="true"/> {account.user ? 'Tu cuenta, tus experiencias y tus promociones.' : 'Tu cuenta de Google es tu entrada a la comunidad.'}</p>
        </div>
        <div className="community-experiences" aria-busy={publicLoading}>
          {publicLoading ? <div className="testimonial-empty"><p className="member-loading" role="status"><LoaderCircle size={20}/> Cargando experiencias…</p></div> : publicError ?
            <div className="testimonial-empty"><h3>Las experiencias<br/>nos acercan.</h3><p>{publicError}</p><button className="text-link" onClick={() => void loadTestimonials()}>Intentar de nuevo <ArrowUpRight size={17}/></button></div> :
            publicTestimonials.length ? <>
              <div className="public-testimonial-list">
                {publicTestimonials.map(testimonial => <article className="public-testimonial" key={testimonial.id}>
                  <Rating value={testimonial.rating}/>
                  <blockquote>{testimonial.body}</blockquote>
                  <div className="testimonial-author"><strong>{testimonial.display_name}</strong><time dateTime={testimonial.created_at}>{dateLabel(testimonial.created_at)}</time></div>
                </article>)}
              </div>
              <button className="text-link community-share" onClick={() => showAccount()}>Comparte tu experiencia <ArrowUpRight size={17}/></button>
              <div className="verified-note"><LockKeyhole size={15}/> Experiencias de usuarios registrados</div>
            </> :
            <div className="testimonial-empty">
              <div className="stars" aria-hidden="true">{Array.from({length:5}, (_, i) => <Star key={i} size={23}/>)}</div>
              <h3>Las buenas historias<br/>comienzan contigo.</h3>
              <p>Aún no hay testimonios publicados. Comparte cómo has vivido tu proceso con Carly.</p>
              <button className="text-link" onClick={() => showAccount()}>Quiero compartir mi experiencia <ArrowUpRight size={17}/></button>
              <div className="verified-note"><LockKeyhole size={15}/> Comentarios exclusivos de usuarios registrados</div>
            </div>}
        </div>
      </div>
    </section>

    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`account-dialog ${account.user ? 'member-dashboard' : ''}`} showCloseButton={false}>
        <button className="dialog-close icon-button" aria-label="Cerrar cuenta" onClick={() => onOpenChange(false)}><X/></button>
        <div className="member-icon"><Sparkles size={27}/></div>
        <p className="eyebrow">TU ESPACIO EN CARLYFIT</p>
        <DialogTitle>{account.user ? 'Qué gusto tenerte aquí.' : mode === 'register' ? 'Disfruta ser parte.' : 'Qué gusto verte de nuevo.'}</DialogTitle>
        <DialogDescription>{account.user ? 'Comparte tu proceso, cuida tus preferencias y encuentra lo que tenemos para ti.' : mode === 'register' ? 'Tu cuenta es el punto de encuentro para compartir tu experiencia y descubrir promociones exclusivas.' : 'Accede a la comunidad con tu cuenta de Google.'}</DialogDescription>

        {loading && <p className="member-loading" role="status"><LoaderCircle size={19}/> Abriendo tu espacio…</p>}
        {accountError && <div className="member-feedback error" role="alert"><p>{accountError}</p><button type="button" className="text-link" onClick={() => void loadAccount()} disabled={loading}>Intentar de nuevo</button></div>}
        {actionError && <div className="member-feedback error" role="alert">{actionError}</div>}
        {oauthError && <div className="member-feedback error" role="alert">{oauthError}</div>}
        {success && <div className="member-feedback success" role="status"><Check size={18}/><span>{success}</span></div>}

        {!loading && !account.user && <>
          <div className="member-benefits"><span><Star size={18}/> Comparte tu experiencia real</span><span><Heart size={18}/> Promociones para miembros</span><span><LockKeyhole size={18}/> Acceso con tu cuenta de Google</span></div>
          <button type="button" className="button google-button" onClick={() => void googleLogin()} disabled={!account.configured || action !== null}>
            {action === 'google' ? <LoaderCircle size={21} className="member-spinner"/> : <strong aria-hidden="true">G</strong>}
            {action === 'google' ? 'Abriendo Google…' : mode === 'register' ? 'Registrarme con Google' : 'Iniciar sesión con Google'}
          </button>
          {!account.configured && !accountError && <p className="connection-note">Estamos preparando el acceso a la comunidad. Por ahora, Carly te atiende por WhatsApp.</p>}
          <p className="small-note member-data-note">Google confirma tu identidad. Guardamos tu correo, tu nombre y las preferencias que elijas para tu cuenta Carlyfit. No recibimos tu contraseña de Google. <a href="/privacidad" className="member-privacy-link">Lee cómo cuidamos tu información.</a></p>
          <a className="text-link" href={contact} target="_blank" rel="noopener noreferrer">Hablar con Carly <ArrowUpRight size={17}/></a>
          <button className="account-switch" onClick={() => onModeChange(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Ya tengo cuenta · Iniciar sesión' : 'Soy nuevo · Crear una cuenta'}</button>
        </>}

        {!loading && account.user && <div className="member-content">
          <p className="member-email"><LockKeyhole size={15}/><span>{account.user.email}</span></p>
          {account.canModerateTestimonials && <section className="member-panel member-moderation" aria-labelledby="member-moderation-title">
            <h3 id="member-moderation-title">Administración</h3>
            <button type="button" className="button outline moderation-toggle" aria-expanded={moderationOpen} aria-controls="testimonial-moderation" disabled={action === 'logout'} onClick={() => setModerationOpen(current => !current)}><ShieldCheck size={19}/><span>Administrar comentarios</span><ChevronDown size={18} aria-hidden="true"/></button>
            {open && moderationOpen && action !== 'logout' && <TestimonialModeration key={account.user.id} onModerated={refreshAfterModeration} onAccessLost={loseModerationAccess}/>}
          </section>}
          <section className="member-panel" aria-labelledby="member-profile-title">
            <h3 id="member-profile-title">A tu manera</h3>
            <form className="member-form" onSubmit={saveProfile}>
              <label htmlFor="member-display-name">Tu nombre para la comunidad</label>
              <input id="member-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={80} required autoComplete="nickname" placeholder="¿Cómo te gusta que te llamen?" disabled={action !== null}/>
              <p className="member-help">Este nombre acompañará tus comentarios cuando se publiquen.</p>
              <label className="member-opt-in" htmlFor="member-marketing">
                <Checkbox id="member-marketing" checked={marketingOptIn} onCheckedChange={value => setMarketingOptIn(value === true)} disabled={action !== null}/>
                <span>Quiero recibir promociones de Carlyfit Lab por correo.<small>Es opcional. Puedes cambiar tu preferencia cuando quieras.</small></span>
              </label>
              <button className="button outline" type="submit" disabled={action !== null}>{action === 'profile' ? 'Guardando…' : 'Guardar mis preferencias'}<Check size={17}/></button>
            </form>
          </section>

          <section className="member-panel member-promotions" aria-labelledby="member-promotions-title">
            <p className="eyebrow"><Heart size={15}/> SOLO PARA NUESTRA COMUNIDAD</p>
            <h3 id="member-promotions-title">Un extra para disfrutar</h3>
            {account.promotions.length ? <div className="member-promotion-list">{account.promotions.map(promotion => <article key={promotion.id}><h4>{promotion.title}</h4><p>{promotion.body}</p>{promotion.ends_at && <small>Disponible hasta el {dateLabel(promotion.ends_at)}.</small>}</article>)}</div> : <p className="member-help">Todavía no hay promociones disponibles. Cuando Carly publique una para la comunidad, la encontrarás aquí.</p>}
          </section>

          <section className="member-panel" aria-labelledby="member-review-title">
            <h3 id="member-review-title">Tu historia cuenta</h3>
            {account.profile?.display_name ? <form className="member-form" onSubmit={submitTestimonial}>
              <fieldset className="member-rating-field" disabled={action !== null}>
                <legend>¿Cómo ha sido tu experiencia?</legend>
                <RadioGroup value={rating} onValueChange={setRating} className="member-rating-options" aria-label="Califica tu experiencia" disabled={action !== null} required>
                  {[1,2,3,4,5].map(value => <label key={value} className={rating === String(value) ? 'selected' : ''}>
                    <RadioGroupItem value={String(value)} aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`}/><span>{value}</span><Star size={14} aria-hidden="true"/>
                  </label>)}
                </RadioGroup>
              </fieldset>
              <label htmlFor="member-testimonial">Cuéntanos tu experiencia con Carly</label>
              <textarea id="member-testimonial" value={body} onChange={event => setBody(event.target.value)} minLength={20} maxLength={1500} rows={4} required disabled={action !== null} placeholder="¿Qué has disfrutado de tu entrenamiento, alimentación o productos?" aria-describedby="member-review-note"/>
              <p className="member-help" id="member-review-note">Tu nombre y comentario se mostrarán públicamente después de una revisión. Comparte solo los detalles que quieras hacer públicos.</p>
              <button className="button primary" type="submit" disabled={action !== null || !rating}>{action === 'comment' ? 'Enviando…' : 'Enviar mi experiencia'}<MessageCircle size={17}/></button>
            </form> : <p className="member-help">Guarda tu nombre en la comunidad para poder compartir tu experiencia.</p>}
            {account.testimonials.length > 0 && <div className="member-review-history"><h4>Mis experiencias compartidas</h4>{account.testimonials.map(testimonial => <article key={testimonial.id}><div className="member-review-top"><Rating value={testimonial.rating}/><span className={`member-review-status ${testimonial.status === 'published' || testimonial.status === 'approved' ? 'published' : ''}`}>{testimonial.status === 'published' || testimonial.status === 'approved' ? 'Publicado' : testimonial.status === 'rejected' ? 'No publicado' : 'En revisión'}</span></div><p>{testimonial.body}</p><time dateTime={testimonial.created_at}>{dateLabel(testimonial.created_at)}</time></article>)}</div>}
          </section>

          <div className="member-session-footer"><button className="text-link" onClick={() => void logout()} disabled={action !== null}><LogOut size={17}/>{action === 'logout' ? 'Cerrando sesión…' : 'Cerrar sesión'}</button><a href={contact} target="_blank" rel="noopener noreferrer">¿Necesitas ayuda?</a></div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
