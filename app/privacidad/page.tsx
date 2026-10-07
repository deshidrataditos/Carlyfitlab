import type {Metadata} from 'next';
import {ArrowLeft, ArrowUpRight, LockKeyhole, Mail, MessageCircle} from 'lucide-react';
import {whatsapp} from '@/lib/catalog';
import styles from './privacy.module.css';

export const metadata:Metadata = {
  title:'Privacidad | Carlyfit Lab',
  description:'Conoce qué información utiliza Carlyfit Lab para tu cuenta, tus experiencias y tus pedidos, y cómo contactar a Carly sobre tus datos.',
};

export default function PrivacyPage() {
  return <main className={`wrap ${styles.page}`}>
    <header className={styles.header}>
      <a href="/" className="brand" aria-label="Carlyfit Lab, inicio"><img src="/images/carlyfit-brand-mark.png" width="48" height="48" alt=""/><div className="wordmark">carlyfit<span>LAB</span><i>ENTRENA · NUTRE · DISFRUTA</i></div></a>
      <a href="/" className="text-link"><ArrowLeft size={17} aria-hidden="true"/> Volver a la tienda</a>
    </header>

    <div className={styles.intro}>
      <span className={styles.icon}><LockKeyhole size={28} aria-hidden="true"/></span>
      <p className="eyebrow">TU INFORMACIÓN, CON CLARIDAD</p>
      <h1>Privacidad<br/><em>en Carlyfit Lab.</em></h1>
      <p className={styles.lead}>Aquí te contamos qué datos utiliza nuestra tienda, para qué los necesitamos y cómo puedes consultar o solicitar cambios.</p>
      <p className={styles.updated}>Última actualización: 4 de octubre de 2026</p>
    </div>

    <div className={styles.content}>
      <section>
        <h2>Quién atiende tus datos</h2>
        <p>Carla Judith Fernández Arzate, responsable de Carlyfit Lab, atiende en línea y en La Barca, Jalisco, México. Para consultas sobre tu información puedes escribir a <a href="mailto:carlyfit.lab@gmail.com">carlyfit.lab@gmail.com</a> o al WhatsApp <a href={whatsapp('Hola, Carly. Quisiera hacer una consulta sobre mis datos personales.')} target="_blank" rel="noopener noreferrer">+52 1 443 358 0280</a>.</p>
      </section>

      <section>
        <h2>Tu cuenta con Google</h2>
        <p>Al registrarte o iniciar sesión, Google confirma tu identidad y comparte los datos básicos de tu perfil: nombre, correo e identificador de cuenta. El servicio de acceso puede recibir también la URL de tu foto de perfil; actualmente no la mostramos en la comunidad.</p>
        <p>Usamos Supabase para gestionar el acceso y guardar tu perfil, las preferencias que elijas y las experiencias que envíes. Estos datos permiten reconocer tu cuenta, mostrarte tu espacio de miembro y proteger el acceso a tu información. No recibimos tu contraseña de Google ni solicitamos leer tus mensajes de Gmail, contactos o archivos.</p>
        <p>Puedes cambiar tu nombre para la comunidad y tu preferencia de promociones desde tu espacio Carlyfit. Tu correo no se muestra en los testimonios públicos.</p>
      </section>

      <section>
        <h2>Experiencias y promociones</h2>
        <p>Si compartes una experiencia, guardamos el texto, la calificación, la fecha y su estado de revisión, asociados a tu cuenta. Tras la aprobación, se publican el nombre que elegiste para la comunidad, el comentario, la calificación y la fecha. Comparte únicamente lo que quieras hacer público; evita incluir información de salud u otros datos sensibles.</p>
        <p>Las promociones para miembros aparecen en tu espacio de cuenta. Recibir promociones por correo es opcional: la casilla está desactivada inicialmente y puedes cambiar esa preferencia cuando quieras. Registrarte no te suscribe automáticamente a comunicaciones promocionales.</p>
      </section>

      <section>
        <h2>Pedidos, pagos y contacto</h2>
        <p>Cuando inicias un pago, guardamos los productos o planes elegidos, cantidades, importe, modalidad de entrega, nombre del cliente si lo proporcionas y las referencias y el estado del pedido y del pago. Usamos esta información para gestionar tu compra y comprobar su resultado.</p>
        <p>Mercado Pago procesa el pago en su plataforma. Carlyfit Lab no recibe ni almacena el número completo de tu tarjeta ni su código de seguridad.</p>
        <p>Al abrir un enlace de WhatsApp se prepara un mensaje con los datos del pedido o la consulta correspondiente. Tú decides si lo envías. La información que compartas allí se utiliza para atenderte y coordinar tu pedido, entrega o plan.</p>
      </section>

      <section>
        <h2>Qué se guarda en tu navegador</h2>
        <p>Utilizamos cookies de autenticación para mantener y proteger tu sesión. Puedes cerrarla desde tu espacio Carlyfit. El carrito y las referencias necesarias para actualizarlo al confirmar una compra se guardan en el almacenamiento local de este navegador.</p>
        <p>Puedes borrar estos datos desde las opciones de tu navegador. Al hacerlo puedes perder el carrito guardado y necesitar iniciar sesión de nuevo; borrar el navegador no elimina tu cuenta ni los pedidos registrados.</p>
      </section>

      <section>
        <h2>Servicios que hacen posible la tienda</h2>
        <p>Cloudflare aloja la web y la base de pedidos; Supabase gestiona las cuentas y la comunidad. Google facilita el inicio de sesión y las fuentes de la página. Mercado Pago procesa los pagos y WhatsApp permite contactar con Carly. Al utilizar estos servicios, sus proveedores pueden tratar datos técnicos, como la dirección IP y datos de la conexión, conforme a sus propias políticas.</p>
        <p>Estos proveedores pueden procesar información en infraestructura situada fuera de México. Puedes consultar sus políticas: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google</a>, <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase</a>, <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare</a>, <a href="https://www.mercadopago.com.mx/privacidad" target="_blank" rel="noopener noreferrer">Mercado Pago</a> y <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
      </section>

      <section>
        <h2>Consulta, cambios o eliminación</h2>
        <p>Puedes pedir información sobre tus datos, su corrección o eliminación, retirar tu preferencia de comunicaciones o solicitar que se retire un testimonio. Escríbenos desde el correo asociado a tu cuenta e indica qué necesitas. Carly podrá pedir la información necesaria para comprobar que la solicitud corresponde a su titular.</p>
        <p>Los perfiles, testimonios y pedidos se almacenan en nuestros servicios; cerrar sesión no los elimina. Si solicitas eliminar información, revisaremos también los registros de pedidos que sea necesario conservar para atender compras u obligaciones aplicables.</p>
        <p>Los cambios en esta información se publicarán en esta página con su fecha de actualización.</p>
      </section>

      <aside className={styles.contact}>
        <h2>Hablemos de tus datos.</h2>
        <p>Carly te ayuda con las consultas sobre tu cuenta y tu información.</p>
        <div className={styles.actions}>
          <a className="button primary" href="mailto:carlyfit.lab@gmail.com"><Mail size={18} aria-hidden="true"/> Escribir por correo</a>
          <a className="text-link" href={whatsapp('Hola, Carly. Quisiera hacer una consulta sobre mis datos personales.')} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true"/> Contactar por WhatsApp <ArrowUpRight size={17} aria-hidden="true"/></a>
        </div>
      </aside>
    </div>
    <div className={styles.bottom}><a href="/" className="text-link"><ArrowLeft size={17} aria-hidden="true"/> Volver a Carlyfit Lab</a><span>Entrena · Nutre · Disfruta</span></div>
  </main>;
}
