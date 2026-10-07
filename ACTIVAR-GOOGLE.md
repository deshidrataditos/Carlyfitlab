# Activar el acceso con Google de Carlyfit Lab

Estado al **4 de octubre de 2026**: el acceso con Google está habilitado y comprobado en **https://carlyfitlab.com**. Google muestra la aplicación **En producción** para usuarios externos. El Worker público `carlyfit-lab`, versión `fe862e7f-ca94-49b8-8228-0d8181804511`, tiene `GOOGLE_AUTH_ENABLED=true` y conserva los cobros en modo `live`, con `PAYMENTS_ENABLED=true` y `CATALOG_CONFIRMED=true`.

Las contraseñas, códigos de verificación y secretos se introducen directamente en Google/Supabase, no en el chat ni en el repositorio.

## Configuración completada

El proyecto de Google **Carlyfit Lab**, ID `carlyfit-lab`, y su aplicación OAuth ya están creados. **carlyfit.lab@gmail.com** es el correo de asistencia y contacto; conserva el rol **Editor de configuración de OAuth (Beta)** (`roles/oauthconfig.editor`) aprobado por el propietario. El cliente **Carlyfit Lab web** tiene el ID público `101396925502-dqaoqsnbfoqeo6iff01nqkj0j61imjtc.apps.googleusercontent.com`. La verificación en dos pasos está activa. No hace falta volver a crear la aplicación ni el cliente.

- **Orígenes JavaScript autorizados en Google:** `http://localhost:5173` y `https://carlyfitlab.com`. Se verificaron al reabrir el cliente OAuth.
- **URI de redireccionamiento de Google a Supabase:** `https://owaeescwhbtegmxzqpip.supabase.co/auth/v1/callback`; no cambia al usar el dominio propio.
- **Proveedor Google de Supabase:** guardado y habilitado, con comprobación de nonce y sin permitir usuarios sin correo. El usuario guardó el secreto directamente allí.
- **Site URL de Supabase:** `https://carlyfitlab.com`, guardada y verificada.
- **Retornos autorizados en Supabase:** `https://carlyfitlab.com/auth/callback` y `http://localhost:5173/auth/callback` para desarrollo.
- **Dominios de la tienda:** la raíz responde por HTTPS; `www.carlyfitlab.com` y la dirección provisional de Cloudflare redirigen a la raíz, conservando ruta y parámetros. El acceso debe iniciarse desde el dominio principal.
- **Marca de Google:** página principal `https://carlyfitlab.com` y política de privacidad `https://carlyfitlab.com/privacidad` guardadas. La página de privacidad es pública y está enlazada en el pie de la tienda y antes del acceso con Google.
- **Audiencia y permisos:** aplicación externa **En producción**; únicamente `openid`, `userinfo.email` y `userinfo.profile`, sin permisos sensibles ni restringidos. No se solicita acceso a Gmail.

## Prueba pública completada el 4 de octubre de 2026

Desde la interfaz pública se inició sesión con la cuenta existente del propietario. Google permitió el acceso sin advertencia ni alta como usuario de prueba; el retorno cargó el perfil y sus datos anteriores. La sesión se conservó al recargar. Después se comprobó el cierre de sesión y un nuevo inicio con Google.

No se modificaron el perfil, las preferencias de comunicaciones ni las reseñas durante esta comprobación. No se creó una cuenta nueva: el alta inicial de usuario y perfil se comprobó anteriormente en local, como se detalla abajo. Pasaron TypeScript, las cuatro pruebas automatizadas de miembros y la compilación pública.

Google puede mostrar `owaeescwhbtegmxzqpip.supabase.co` en el selector o consentimiento porque no se realizó la verificación de marca. Esto no impidió el acceso comprobado con los tres permisos básicos. El entorno `carlyfit-lab-testing` conserva `GOOGLE_AUTH_ENABLED=false` y no se modificó durante esta activación.

## Antecedente: prueba local del 29 de septiembre de 2026

El 29 de septiembre de 2026 se inició sesión desde `http://localhost:5173` con la cuenta del propietario, distinta del correo de asistencia. Google devolvió al sitio en `#comunidad`, el perfil cargó y la sesión se mantuvo al recargar. En Supabase se verificaron el registro con proveedor Google y el perfil creado automáticamente, además de los cambios de nombre y preferencias guardados por el propio usuario.

También se comprobaron el cierre de sesión y un nuevo inicio con Google. El perfil conservó sus datos y mostró una reseña enviada por el propio usuario con estado **En revisión**. El asistente no envió ni aprobó testimonios ni cambió la preferencia de comunicaciones. La configuración local utilizaba `GOOGLE_AUTH_ENABLED=true`; aquella prueba local es un antecedente separado de la validación pública del 4 de octubre.

## Mantenimiento

1. Mantener `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el alojamiento, y `GOOGLE_AUTH_ENABLED=true` en `wrangler.cloudflare.jsonc` para el dominio público.
2. Conservar las direcciones autorizadas y los tres permisos básicos. Si cambia el dominio o se amplía el acceso solicitado, revisar también Google y Supabase antes de publicar.
3. Mantener actualizada `/privacidad` cuando cambie el tratamiento de datos. No introducir reseñas ni aceptar comunicaciones promocionales en nombre de clientes durante las pruebas.
4. Los indicadores explícitos de `wrangler.cloudflare.jsonc` prevalecen sobre un valor distinto del panel, aunque se use `keep_vars`. Conservar el entorno de pruebas separado y comprobar el destino antes de desplegar.

Solicitar únicamente datos básicos para el acceso: `openid`, `userinfo.email` y `userinfo.profile`. No hace falta acceso a la bandeja de Gmail. El secreto de Google corresponde al proveedor de Supabase, no al código ni al navegador de la tienda.

## Administración

Los registros se consultan en **Authentication → Users** y los perfiles en **Table Editor → profiles**. Las reseñas se revisan en **Table Editor → testimonials**; solo cambiar a `approved` las que se decida publicar. Las promociones se crean en **promotions** con fechas válidas y `active=true`.

El acceso público con Google y los cobros reales están habilitados. El primer pago real y su conciliación siguen pendientes de comprobar cuando lo complete un comprador. El receptor público usa `https://carlyfitlab.com/api/payments/webhook`; el registro de pagos está en [ACTIVACION.md](ACTIVACION.md). La tienda no almacena contraseñas de Google ni datos de tarjetas.

Fuentes: [acceso con Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [direcciones de retorno](https://supabase.com/docs/guides/auth/redirect-urls), [verificación en dos pasos de Google Cloud](https://cloud.google.com/docs/authentication/external/mfa-requirement).
