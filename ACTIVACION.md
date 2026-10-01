# Carlyfit Lab — primera versión

## Disponible para revisar

- Página adaptable a celular y computadora, con fotografía original de Carla Judith Fernández Arzate.
- Presentación de su experiencia como chef y de sus dos certificaciones WABBA México, según los datos proporcionados.
- Planes de entrenamiento de 90 días: $1,490; integral con alimentación: $2,490; integral con selección de postres: $2,990 MXN. Son propuestas, no precios confirmados.
- Catálogo de mermelada sin azúcar, galletas de alulosa y golden milk, con imágenes ilustrativas y precios provisionales de $129, $149 y $189 MXN.
- Carrito con cantidades, eliminación de artículos, subtotal y borrador guardado en el navegador. Resumen para WhatsApp +52 1 443 358 0280, con recolección o solicitud de envío.
- Comunidad conectada a Supabase, con perfil privado, consentimiento opcional, formulario de testimonios moderados y promociones visibles solo a miembros. El acceso con Google está habilitado y fue probado en la vista local el 29 de septiembre de 2026. Sin reseñas ficticias.

## Publicación y comprobaciones — 1 de octubre de 2026

La primera subida a [deshidrataditos/Carlyfitlab en GitHub](https://github.com/deshidrataditos/Carlyfitlab) quedó en el commit `e462989532a9843319bc613b26e0ebeb41d67dde`. La compilación, la comprobación de TypeScript y las 13 pruebas automatizadas de comercio, checkout y miembros terminaron correctamente. Las credenciales locales y capturas de trabajo quedaron fuera del repositorio.

El usuario compró **carlyfitlab.com** y se conectaron tanto la raíz como `www` al Worker `carlyfit-lab`. La dirección principal es **https://carlyfitlab.com**. En la versión `88f374c7-c570-4b54-b540-e8ae5bafe16d` se verificó la respuesta `200` de la raíz y las respuestas `308` de `www.carlyfitlab.com/pedido?test=domain` y `carlyfit-lab.carlyfitlab.workers.dev/pedido?test=domain`, ambas hacia `https://carlyfitlab.com/pedido?test=domain`. Las redirecciones conservan ruta y parámetros.

La base D1 `carlyfit-lab-orders` está enlazada a `DB` y tiene aplicada la migración inicial. En la publicación provisional anterior se verificaron la página, el estado sin testimonios publicados y el carrito, añadiendo Golden milk por $189 MXN y comprobando el subtotal y el enlace de consulta por WhatsApp. Se eliminó el artículo de prueba sin enviar mensajes ni realizar compras. GitHub conserva el código; todavía no existe un despliegue automático al subir commits.

La configuración de publicación está en `wrangler.cloudflare.jsonc`, con `SITE_URL=https://carlyfitlab.com`; ejecutar `npm run deploy:cloudflare` para compilar y publicar desde una sesión autorizada de Cloudflare. La configuración local de Sites se conserva. Las claves existentes de Supabase y Mercado Pago están guardadas como secretos del Worker, sin incluirlas en el código ni en la compilación. Google permanece desactivado en el sitio público hasta completar su configuración y prueba; Mercado Pago permanece desactivado y en modo de prueba. Las antiguas tablas D1 de miembros no se usan para las cuentas Supabase.

Al activar Google o los pagos, actualizar también los indicadores explícitos de `wrangler.cloudflare.jsonc`. `keep_vars` no preserva un valor del panel que contradiga esos indicadores en el siguiente despliegue.

Confirmar precios, contenidos y entregas del paquete con postres; presentaciones, ingredientes, alérgenos y conservación de productos; dirección y horarios de recolección; tiempos de preparación; políticas de envío y compra. Sustituir fotos provisionales cuando estén disponibles. Completar el aviso de privacidad con los datos del negocio antes de registrar clientes.

## Activar Mercado Pago

Ya se escribió la integración de Checkout Pro y la verificación de notificaciones. Los cobros están desactivados por defecto. No se ha hecho una transacción ni una prueba completa con una cuenta real.

El 29 de septiembre el usuario creó una aplicación de Checkout Pro con API de Preferencias y mostró la pantalla **Datos de las credenciales de prueba** de México. Introdujo el Access Token directamente en `.env`. Una consulta de solo lectura a `/users/me` confirmó que el token es válido, corresponde al identificador del vendedor configurado, tiene país `MLM` y la etiqueta `test_user`. No se imprimió el token ni se guardó ninguna contraseña del usuario de prueba. `MERCADOPAGO_MODE=test`, `PAYMENTS_ENABLED=false` y `CATALOG_CONFIRMED=false` se mantienen. La dirección HTTPS pública y la base de pedidos ya están preparadas; faltan la firma de Webhooks, confirmar el catálogo y completar las pruebas de pago. Antes de crear un comprador, buscar el existente en **Cuentas de prueba → Comprador**; debe ser distinto del vendedor. El prefijo de la clave por sí solo no identifica si la cuenta es de prueba o real.

Se corrigió el retorno de Checkout Pro para usar el `init_point` validado también con el vendedor de prueba. Las 9 pruebas de comercio y de la ruta de checkout pasaron. Se mantienen las comprobaciones del vendedor, el modo de pago y las notificaciones. No se creó ni se cobró ningún pago durante la validación del token.

1. En la aplicación de Mercado Pago, configurar el evento **Pagos / payment** con la URL `https://carlyfitlab.com/api/payments/webhook`. Guardar la firma secreta como `MERCADOPAGO_WEBHOOK_SECRET` en los secretos del Worker de Cloudflare. No enviarla por chat ni guardarla en GitHub.
2. Comprobar que `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` y `MERCADOPAGO_COLLECTOR_ID` corresponden a la misma cuenta y entorno. El dominio HTTPS y D1 ya están verificados.
3. Aprobar el catálogo final y después establecer `CATALOG_CONFIRMED=true` y `PAYMENTS_ENABLED=true`, inicialmente con `MERCADOPAGO_MODE=test`.
4. Probar un cobro aprobado, pendiente, rechazado y una notificación repetida en el entorno de prueba; verificar el importe, receptor y estado almacenados. Luego se puede pasar a `MERCADOPAGO_MODE=live` con credenciales de producción.
5. Cambiar los avisos provisionales y el texto de privacidad cuando la activación se haya comprobado.

El servidor reconstruye los importes desde su catálogo, nunca desde precios enviados por el navegador. Los envíos nacionales requieren cotización por WhatsApp antes de cobrar. Checkout no almacena tarjetas. El regreso desde Mercado Pago no prueba un pago: solo la notificación firmada y consultada en su API actualiza el estado. Los pedidos físicos de esta primera integración se cobran para recolección; pedidos con envío continúan mediante cotización y enlace que comparte Carly.

## Registro con Google, testimonios y promociones

Implementado con Supabase Auth y Postgres del proyecto Carlyfit lab. La migración de `supabase/migrations` se aplicó y probó; conservarla como historial, no repetirla. La conexión local usa `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en `.env`, con `GOOGLE_AUTH_ENABLED=true`. No necesita `service_role` ni contraseña de la base. El usuario guardó el secreto de Google directamente en Supabase; no se guardó en el proyecto local. El proveedor Google está guardado y aparece **Enabled** con el ID de cliente correcto.

Estado al 1 de octubre: Supabase tiene guardados y verificados **Site URL** `https://carlyfitlab.com` y el retorno exacto `https://carlyfitlab.com/auth/callback`. Se conservó `http://localhost:5173/auth/callback` para desarrollo. Al reabrir el cliente OAuth de Google se verificaron los orígenes JavaScript `http://localhost:5173` y `https://carlyfitlab.com`. El retorno de Google a Supabase no cambia.

El servidor verifica la identidad con Supabase, guarda sesiones en cookies HttpOnly y protege los cambios contra solicitudes de otros sitios. Los perfiles solo permiten modificar nombre y consentimiento; el correo procede de Google/Supabase Auth. Los testimonios empiezan pendientes, con una pendiente por cliente; el listado público no expone correos. Las promociones requieren una sesión verificada y fechas vigentes en la propia base.

Verificado el 29 de septiembre de 2026: el inicio de sesión real desde la vista local con la cuenta del propietario volvió a #comunidad, cargó el perfil y conservó la sesión tras recargar. Supabase → Authentication → Users muestra el registro con proveedor social Google; Table Editor → profiles confirma el perfil creado automáticamente y los cambios de nombre y preferencias que guardó el propio usuario. La cuenta usada en la prueba es distinta del contacto carlyfit.lab@gmail.com. También se verificaron el cierre y el nuevo inicio de sesión, conservando los datos del perfil y la reseña enviada por el propio usuario con estado En revisión. El asistente no envió ni aprobó testimonios ni cambió la preferencia de comunicaciones. Las pruebas previas de RLS y las 9 comprobaciones automatizadas ya habían pasado y no se repitieron.

Pendiente: completar la información de marca de Google y pasar su aplicación a producción cuando corresponda. En la última revisión de audiencia Google seguía en **Testing / Prueba**, con 0 usuarios de prueba añadidos y el botón **Publicar** desactivado por información de marca incompleta. `GOOGLE_AUTH_ENABLED=false` permanece en el sitio público. Antes de abrir registros, completar el aviso de privacidad y comprobar registro, cierre y nuevo inicio de sesión en el dominio propio. Detalles en [ACTIVAR-GOOGLE.md](ACTIVAR-GOOGLE.md).

Administración: Supabase → Authentication → Users muestra registros; Table Editor → profiles muestra perfiles. Aprobar o rechazar testimonios en testimonials y crear promociones reales en promotions. No se ha añadido un panel administrativo a la página.

## Archivos y ejecución

Vista local: http://localhost:5173/ mientras siga activo el servidor. Iniciar con `node scripts/run-framework.mjs dev`; construir con `node scripts/run-framework.mjs build`. Verificar tipos con `node node_modules/typescript/bin/tsc --noEmit` y ejecutar las 13 comprobaciones de comercio, checkout y miembros con `node --test tests/commerce.test.mjs tests/checkout.test.mjs tests/members.test.mjs`.

El catálogo se edita en lib/catalog.ts. La página está en app/storefront.tsx y el diseño en app/globals.css. Las fotografías suministradas y las cuatro imágenes generadas están en public/images. Los originales generados y el manifiesto completo de prompts se conservaron en ../carlyfit-assets. Se utilizó el generador de imágenes integrado.

## Referencias de integración

- [Mercado Pago: crear preferencia de Checkout Pro](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post)
- [Mercado Pago: notificaciones firmadas](https://www.mercadopago.com.mx/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks)
- [Google a través de Supabase Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Cloudflare D1](https://developers.cloudflare.com/d1/worker-api/d1-database/)
