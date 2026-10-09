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
      <a href="/" className="brand" aria-label="Carlyfit Lab, inicio"><img src="/images/carlyfit-brand-mark.png" width="48" height="48" alt=""/><div className="wordmark">carlyfit<span>LAB</span><i>FORMULANDO TU MEJOR VERSIÓN</i></div></a>
      <a href="/" className="text-link"><ArrowLeft size={17} aria-hidden="true"/> Volver a la tienda</a>
    </header>

    <div className={styles.intro}>
      <span className={styles.icon}><LockKeyhole size={28} aria-hidden="true"/></span>
      <p className="eyebrow">TU INFORMACIÓN, CON CLARIDAD</p>
      <h1>Privacidad<br/><em>en Carlyfit Lab.</em></h1>
      <p className={styles.lead}>Aquí te contamos qué datos utiliza nuestra tienda, para qué los necesitamos y cómo puedes consultar o solicitar cambios.</p>
      <p className={styles.updated}>Última actualización: 9 de octubre de 2026</p>
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
        <p>Para atender tu cuenta, Carly y las personas autorizadas para administrar la tienda pueden consultar tu nombre, correo, fecha de registro y un resumen de los pedidos vinculados a tu cuenta, aunque todavía no hayas comprado. Esta lista es privada y no se comparte con el asistente de IA. Aparecer en ella no te suscribe a promociones.</p>
      </section>

      <section>
        <h2>Correos de tu cuenta y de tu plan</h2>
        <p>Cuando creas una cuenta nueva, enviamos un correo de bienvenida a la dirección confirmada por Google. El mensaje explica cómo entrar a tu cuenta y utilizarla; no te suscribe a promociones. Si respondes, tu mensaje llega a Carly.</p>
        <p>Cuando se confirma el pago de un pedido nuevo que incluye un plan, enviamos también las instrucciones para completar tu ficha inicial. Usamos el correo de Google confirmado al comprar y guardado con ese pedido. Este mensaje de servicio no te suscribe a promociones. Cuando Carly publica un nuevo material privado para tu pedido, enviamos un aviso con un enlace a Mi plan; no adjuntamos el archivo ni enviamos respuestas de la ficha clínica. Usamos Resend para entregar estos mensajes de servicio. Compartimos con ese servicio la dirección destinataria, el mensaje y una referencia técnica del envío. Para evitar duplicados y recuperar errores temporales, guardamos el estado del envío asociado a tu cuenta o pedido. La dirección y el contenido se eliminan de la cola cuando el envío se completa o se descarta al finalizar sus reintentos; conservamos la referencia y el estado para no repetir el correo.</p>
      </section>

      <section>
        <h2>Experiencias y promociones</h2>
        <p>Si compartes una experiencia, guardamos el texto, la calificación, la fecha y su estado de revisión, asociados a tu cuenta. Tras la aprobación, se publican el nombre que elegiste para la comunidad, el comentario, la calificación y la fecha. Comparte únicamente lo que quieras hacer público; evita incluir información de salud u otros datos sensibles.</p>
        <p>Las promociones para miembros aparecen en tu espacio de cuenta. Recibir promociones por correo es opcional: la casilla está desactivada inicialmente y puedes cambiar esa preferencia cuando quieras. Registrarte no te suscribe automáticamente a comunicaciones promocionales.</p>
      </section>

      <section>
        <h2>Tu plan, preferencias y ficha inicial</h2><p>Para comprar un plan en línea necesitas iniciar sesión con Google. Cuando su pago está aprobado, puedes guardar en tu cuenta tus preferencias de entrenamiento: objetivo, experiencia, lugar, días, tiempo por sesión y equipo disponible. Carly utiliza estos datos para preparar tu rutina. No incluyas diagnósticos ni historial médico en estas preferencias.</p><p>La ficha clínica inicial se completa por separado en Google Forms. Allí puedes proporcionar información de salud, medicamentos, lesiones y hábitos para que Carly revise tus necesidades antes de preparar el plan. Lee el aviso y las indicaciones del formulario antes de responder. Las respuestas permanecen en Google Forms y no se importan a la base de la tienda ni se envían al asistente de IA. Puedes solicitar a Carly acceso, corrección o eliminación a través del correo de contacto indicado en esta página.</p><p>En la tienda guardamos únicamente la referencia del pedido y si una persona autorizada confirmó la recepción de la ficha, junto con la fecha y el registro de esa acción. Abrir el formulario no lo marca como recibido. La revisión y confirmación son manuales.</p><p>También puedes registrar las sesiones realizadas y tus comentarios de avance en las revisiones de los días 30, 60 y 90. Guardamos la fecha de inicio acordada y las observaciones de Carly de forma privada, vinculadas al pedido. No incluyas datos clínicos en estos registros; no se envían al asistente de IA. Tus preferencias y los documentos o videos que Carly te asigne se consultan desde tu cuenta y por las personas autorizadas para atenderte. Los archivos se guardan en almacenamiento privado y se abren mediante enlaces temporales. Evita compartir esos enlaces. Puedes solicitar cambios o eliminación contactando a Carly.</p></section><section><h2>Pedidos, pagos y contacto</h2>
        <p>Cuando inicias un pago, guardamos los productos o planes elegidos, cantidades, importe, modalidad de entrega, nombre del cliente si lo proporcionas y las referencias y el estado del pedido y del pago. Usamos esta información para gestionar tu compra y comprobar su resultado. También guardamos las piezas que elijas para el paquete inicial, la fecha que solicites, la fecha estimada que acuerde Carly y el estado de preparación o entrega. Para respetar la disponibilidad, registramos las unidades reservadas durante el pago. Para limitar intentos abusivos, usamos temporalmente un identificador derivado de la dirección IP o de tu cuenta, junto con un contador de intentos; esos controles caducan en un máximo de 24 horas y se limpian periódicamente. Si inicias sesión antes del pago, asociamos el pedido a tu identificador de cuenta para mostrarlo en «Mis pedidos» y permitirte recibir el material de tu plan. Las compras como invitado no se vinculan automáticamente por nombre o correo.</p>
        <p>Mercado Pago procesa el pago en su plataforma. Carlyfit Lab no recibe ni almacena el número completo de tu tarjeta ni su código de seguridad.</p>
        <p>Al abrir un enlace de WhatsApp se prepara un mensaje con los datos del pedido o la consulta correspondiente. Tú decides si lo envías. La información que compartas allí se utiliza para atenderte y coordinar tu pedido, entrega o plan.</p>
      </section>

      <section>
        <h2>Asistente de inteligencia artificial</h2>
        <p>El asistente requiere iniciar sesión. Envía tu pregunta y la información pública del catálogo a Cloudflare Workers AI para generar una respuesta. No enviamos al modelo tu nombre, correo, identificador de cuenta, pedidos, ficha inicial ni archivos de entrenamiento. Evita escribir datos personales o de salud en tus preguntas.</p>
        <p>La conversación permanece en la memoria de esta página y se borra al cerrar el asistente, recargar o cambiar de cuenta. No guardamos el texto de las preguntas ni las respuestas en nuestra base de datos. Para controlar el uso, conservamos tu identificador de cuenta, un identificador de solicitud y sus tiempos; los registros con más de 48 horas se eliminan al procesar una nueva consulta. Cloudflare procesa las solicitudes según su <a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/" target="_blank" rel="noopener noreferrer">política de datos de Workers AI</a>.</p>
        <p>Las respuestas son informativas y pueden contener errores. El asistente no prepara dietas o rutinas personalizadas, no realiza compras ni consulta información privada de clientes. Para atención personalizada, contacta a Carly.</p>
      </section>

      <section>
        <h2>Qué se guarda en tu navegador</h2>
        <p>Utilizamos cookies de autenticación para mantener y proteger tu sesión. Puedes cerrarla desde tu espacio Carlyfit. El carrito, la selección del paquete inicial y las referencias necesarias para actualizarlo al confirmar una compra se guardan en el almacenamiento local de este navegador.</p>
        <p>Puedes borrar estos datos desde las opciones de tu navegador. Al hacerlo puedes perder el carrito guardado y necesitar iniciar sesión de nuevo; borrar el navegador no elimina tu cuenta ni los pedidos registrados.</p>
      </section>

      <section>
        <h2>Servicios que hacen posible la tienda</h2>
        <p>Cloudflare aloja la web, la base de pedidos, las preferencias de entrenamiento y las referencias de los materiales; Supabase gestiona las cuentas, la comunidad y el almacenamiento privado de documentos y videos. Google facilita el inicio de sesión, las fuentes de la página y el formulario externo de la ficha clínica. Mercado Pago procesa los pagos y WhatsApp permite contactar con Carly. Al utilizar estos servicios, sus proveedores pueden tratar datos técnicos, como la dirección IP y datos de la conexión, conforme a sus propias políticas.</p>
        <p>Estos proveedores pueden procesar información en infraestructura situada fuera de México. Puedes consultar sus políticas: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google</a>, <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase</a>, <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare</a>, <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Resend</a>, <a href="https://www.mercadopago.com.mx/privacidad" target="_blank" rel="noopener noreferrer">Mercado Pago</a> y <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
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
    <div className={styles.bottom}><a href="/" className="text-link"><ArrowLeft size={17} aria-hidden="true"/> Volver a Carlyfit Lab</a><span>Formulando tu mejor versión</span></div>
  </main>;
}
