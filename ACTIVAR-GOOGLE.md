# Activar el acceso con Google de Carlyfit Lab

El acceso con Google ya funciona en la vista local y guarda los usuarios en Supabase. La página todavía no está publicada. Las contraseñas, códigos de verificación y secretos se introducen directamente en Google/Supabase, no en el chat.

Estado al 29 de septiembre de 2026: el proyecto de Google **Carlyfit Lab**, ID `carlyfit-lab`, y su aplicación OAuth están creados, con **carlyfit.lab@gmail.com** como correo de asistencia y contacto. Esa cuenta conserva el rol **Editor de configuración de OAuth (Beta)** (`roles/oauthconfig.editor`) aprobado por el propietario. El cliente **Carlyfit Lab web** tiene el ID público `101396925502-dqaoqsnbfoqeo6iff01nqkj0j61imjtc.apps.googleusercontent.com`. El usuario guardó el secreto directamente en Supabase; el proveedor Google quedó guardado como **Enabled** con el ID correcto. La configuración de URL de Supabase está guardada y verificada: **Site URL** `http://localhost:5173` y un único retorno autorizado `http://localhost:5173/auth/callback`. El archivo `.env` local tiene `GOOGLE_AUTH_ENABLED=true`; el servidor está iniciado en `http://localhost:5173` (sesión `48920`). El secreto de Google no se guardó en el proyecto local ni en esta documentación.

## Configuración completada

La verificación en dos pasos ya se activó y permitió completar la configuración. No hace falta volver a crear la aplicación ni el cliente.

- **Origen autorizado en Google:** `http://localhost:5173`.
- **URI de redireccionamiento de Google a Supabase:** `https://owaeescwhbtegmxzqpip.supabase.co/auth/v1/callback`.
- **Proveedor Google de Supabase:** guardado y habilitado, con comprobación de nonce y sin permitir usuarios sin correo.
- **Audiencia de Google:** Usuarios externos, todavía en **Testing / Prueba**. Muestra **0 usuarios de prueba**; no se añadió ninguno durante esta configuración.
- **Publicación de Google:** el botón **Publicar** aparece desactivado por la información de marca incompleta.

## Prueba real completada

El 29 de septiembre se inició sesión desde `http://localhost:5173` con la cuenta del propietario, distinta del correo de asistencia **carlyfit.lab@gmail.com**. Google devolvió al sitio en `#comunidad`, el perfil cargó correctamente y la sesión se mantuvo al recargar. En **Supabase → Authentication → Users** se verificó el registro con proveedor social Google, y en **Table Editor → profiles** se comprobó su perfil creado automáticamente. También se verificó que los cambios de nombre y preferencias realizados por el propio usuario se guardaron en la base.

En la revisión posterior del mismo día se comprobó el cierre de sesión y un nuevo inicio con Google. El perfil conservó sus datos y mostró una reseña enviada por el propio usuario con estado **En revisión**. El asistente no envió ni aprobó testimonios ni cambió la preferencia de comunicaciones. Las pruebas anteriores de RLS y las 9 comprobaciones automatizadas ya habían pasado; no se repitieron en esta validación. Se observó un error transitorio de conexión de la vista local; después, las consultas y el flujo de Google respondieron correctamente sin cambiar credenciales.

## Antes de abrir al público

1. Elegir el dominio HTTPS, conectar el alojamiento y publicar la página. La dirección local solo funciona mientras está activo el servidor de esta computadora.
2. Completar la información de marca de Google con los datos y enlaces del sitio, y atender los requisitos que indique Google antes de pasar la aplicación de prueba a producción. No se declara disponible para todo el público todavía.
3. En Supabase, sustituir **Site URL** por el dominio HTTPS y añadir su `/auth/callback` exacto a las direcciones de retorno. En Google, añadir el dominio HTTPS como origen. El retorno de Google a Supabase permanece igual. Evitar comodines generales.
4. Configurar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `GOOGLE_AUTH_ENABLED=true` en el alojamiento. El secreto de Google corresponde al proveedor de Supabase, no al código ni al navegador de la tienda.
5. Probar registro, cierre y nuevo inicio de sesión en el dominio publicado. El ciclo de acceso y cierre ya está comprobado en la vista local.
6. Completar el aviso de privacidad y los datos comerciales. Mercado Pago continúa desactivado y requiere su configuración y pruebas de cobro antes de abrir pagos.

Solicitar únicamente datos básicos para el acceso: `openid`, `userinfo.email` y `userinfo.profile`. No hace falta acceso a la bandeja de Gmail.

## Administración y validaciones pendientes

Los registros se consultan en **Authentication → Users** y los perfiles en **Table Editor → profiles**. El guardado del nombre, las preferencias y una reseña enviada por el usuario está verificado. Las reseñas recibidas se revisan en **Table Editor → testimonials**; solo cambiar a `approved` las que se decida publicar. Las promociones se crean en **promotions** con fechas válidas y `active=true`.

La aplicación aún no está publicada y Mercado Pago sigue desactivado. La base y el flujo de cuentas no almacenan contraseñas de Google ni datos de tarjetas.

Fuentes: [acceso con Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [direcciones de retorno](https://supabase.com/docs/guides/auth/redirect-urls), [verificación en dos pasos de Google Cloud](https://cloud.google.com/docs/authentication/external/mfa-requirement).
