# Activar el acceso con Google de Carlyfit Lab

Estado al **1 de octubre de 2026**: la tienda está publicada en **https://carlyfitlab.com**. Supabase y Google tienen guardadas y verificadas las direcciones del dominio propio. El acceso con Google funciona en la vista local; permanece desactivado en el sitio público hasta completar la información de marca, el aviso de privacidad y las pruebas de acceso en el dominio.

Las contraseñas, códigos de verificación y secretos se introducen directamente en Google/Supabase, no en el chat ni en el repositorio.

## Configuración completada

El proyecto de Google **Carlyfit Lab**, ID `carlyfit-lab`, y su aplicación OAuth ya están creados. **carlyfit.lab@gmail.com** es el correo de asistencia y contacto; conserva el rol **Editor de configuración de OAuth (Beta)** (`roles/oauthconfig.editor`) aprobado por el propietario. El cliente **Carlyfit Lab web** tiene el ID público `101396925502-dqaoqsnbfoqeo6iff01nqkj0j61imjtc.apps.googleusercontent.com`. La verificación en dos pasos está activa. No hace falta volver a crear la aplicación ni el cliente.

- **Orígenes JavaScript autorizados en Google:** `http://localhost:5173` y `https://carlyfitlab.com`. Se verificaron al reabrir el cliente OAuth.
- **URI de redireccionamiento de Google a Supabase:** `https://owaeescwhbtegmxzqpip.supabase.co/auth/v1/callback`; no cambia al usar el dominio propio.
- **Proveedor Google de Supabase:** guardado y habilitado, con comprobación de nonce y sin permitir usuarios sin correo. El usuario guardó el secreto directamente allí.
- **Site URL de Supabase:** `https://carlyfitlab.com`, guardada y verificada.
- **Retornos autorizados en Supabase:** `https://carlyfitlab.com/auth/callback` y `http://localhost:5173/auth/callback` para desarrollo.
- **Dominios de la tienda:** la raíz responde por HTTPS; `www.carlyfitlab.com` y la dirección provisional de Cloudflare redirigen a la raíz, conservando ruta y parámetros. El acceso debe iniciarse desde el dominio principal.

## Prueba local completada

El 29 de septiembre de 2026 se inició sesión desde `http://localhost:5173` con la cuenta del propietario, distinta del correo de asistencia. Google devolvió al sitio en `#comunidad`, el perfil cargó y la sesión se mantuvo al recargar. En Supabase se verificaron el registro con proveedor Google y el perfil creado automáticamente, además de los cambios de nombre y preferencias guardados por el propio usuario.

También se comprobaron el cierre de sesión y un nuevo inicio con Google. El perfil conservó sus datos y mostró una reseña enviada por el propio usuario con estado **En revisión**. El asistente no envió ni aprobó testimonios ni cambió la preferencia de comunicaciones. La configuración local utiliza `GOOGLE_AUTH_ENABLED=true`; esta prueba no equivale a una validación del acceso público.

## Antes de abrir al público

1. Completar la información de marca de Google con los datos y enlaces del sitio, y atender los requisitos para pasar la aplicación a producción. En la última revisión de audiencia seguía en **Testing / Prueba**, con **0 usuarios de prueba** añadidos y el botón **Publicar** desactivado por información de marca incompleta.
2. Completar el aviso de privacidad y los datos comerciales antes de registrar clientes.
3. Mantener las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en el alojamiento. Habilitar `GOOGLE_AUTH_ENABLED=true` cuando la configuración esté preparada y comprobar registro, cierre y nuevo inicio de sesión en `https://carlyfitlab.com`.
4. Actualizar también el indicador explícito de `wrangler.cloudflare.jsonc`: `keep_vars` no conserva un valor del panel que contradiga ese archivo al desplegar. Esto también se aplica a los indicadores de pagos cuando se activen.

Solicitar únicamente datos básicos para el acceso: `openid`, `userinfo.email` y `userinfo.profile`. No hace falta acceso a la bandeja de Gmail. El secreto de Google corresponde al proveedor de Supabase, no al código ni al navegador de la tienda.

## Administración

Los registros se consultan en **Authentication → Users** y los perfiles en **Table Editor → profiles**. Las reseñas se revisan en **Table Editor → testimonials**; solo cambiar a `approved` las que se decida publicar. Las promociones se crean en **promotions** con fechas válidas y `active=true`.

El acceso público con Google y los pagos permanecen desactivados. Mercado Pago sigue en modo de prueba y requiere su firma de Webhooks, confirmación del catálogo y pruebas de cobro. Su receptor utiliza `https://carlyfitlab.com/api/payments/webhook`; los pasos están en [ACTIVACION.md](ACTIVACION.md). La tienda no almacena contraseñas de Google ni datos de tarjetas.

Fuentes: [acceso con Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [direcciones de retorno](https://supabase.com/docs/guides/auth/redirect-urls), [verificación en dos pasos de Google Cloud](https://cloud.google.com/docs/authentication/external/mfa-requirement).
