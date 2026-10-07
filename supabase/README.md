# Datos de miembros de Carlyfit Lab

`migrations/202609230001_members.sql` prepara Supabase Postgres. Aplicar **una vez**, con el propietario del proyecto, en una base donde no existan estas tablas. Aplicada el 24 de septiembre de 2026 al proyecto Carlyfit lab (owaeescwhbtegmxzqpip). No volver a ejecutarla en ese proyecto; conservarla como historial y añadir migraciones para cambios posteriores. La transacción revierte completa si encuentra un conflicto. No reemplaza las tablas D1 de pedidos.

Mantener `carlyfit_private` fuera de **API → Exposed schemas**. Usar la clave pública y la sesión real del cliente en la aplicación; nunca una clave `service_role`/secret en el navegador. El acceso exige el JWT de Supabase, no un indicador guardado localmente. Las cuentas anónimas de Supabase Auth no tienen acceso de miembro.

## Contrato de consultas con supabase-js

Estas consultas usan un cliente Supabase con la sesión del usuario y están protegidas por RLS incluso si se llama directamente a la API.

```ts
// Perfil privado: email, fecha e identidad no se pueden cambiar desde profiles.
supabase.from('profiles')
  .select('id,display_name,email,marketing_opt_in,created_at')
  .eq('id', user.id).single();

supabase.from('profiles')
  .update({ display_name: name, marketing_opt_in: consent })
  .eq('id', user.id)
  .select('id,display_name,email,marketing_opt_in,created_at').single();

// Reseña: nombre público tomado del perfil; 20–1500 caracteres, 1–5 estrellas.
// Omitir status, id y created_at: se asignan en la base, siempre pending.
supabase.from('testimonials')
  .insert({ user_id: user.id, body, rating })
  .select('id,body,rating,status,created_at').single();

// El cliente solo ve sus propias reseñas y su estado de moderación.
supabase.from('testimonials')
  .select('id,body,rating,status,created_at')
  .eq('user_id', user.id).order('created_at', { ascending: false });

// Visitantes y miembros: lista pública de aprobadas, sin correo ni user_id.
// p_limit se limita entre 1 y 50; por defecto 12.
supabase.rpc('list_public_testimonials', { p_limit: 12 });
// Resultado: { id, display_name, body, rating, created_at }[]

// Solo miembros: RLS ya exige active, inicio alcanzado y fin no alcanzado.
supabase.from('promotions')
  .select('id,title,body,starts_at,ends_at')
  .order('ends_at', { ascending: true });
```

El alta en Supabase Auth crea el perfil. El nombre inicial usa texto normalizado de Google o `Cliente Carlyfit`; nunca se deriva del correo. El correo se sincroniza desde Auth. `marketing_opt_in` empieza en `false` aunque el usuario envíe metadatos distintos. El nombre admite 2–80 caracteres. La vista pública muestra ese nombre, por lo que el formulario de reseña debe indicar que se publicará junto con el comentario.

## Administración y comprobaciones

- Moderar reseñas desde Table Editor con un administrador: cambiar `status` a `approved` o `rejected`. El cliente no puede modificar ni borrar una reseña, ni cambiar su dueño, fecha o estado. Las correcciones requieren administración; no hay un panel de moderación en este cambio.
- Crear promociones reales en `promotions`, con fechas válidas y `active = true`. No se agregan promociones ni testimonios de ejemplo. Ver promociones en la cuenta no exige aceptar correos; `marketing_opt_in` controla únicamente el consentimiento para comunicaciones.
- Conservar la moderación manual y los límites de solicitudes del servidor; Cada miembro puede tener como máximo una reseña pendiente de revisión, mediante un índice único parcial. RLS controla acceso, no elimina el spam de una cuenta válida.
- Comprobar con dos usuarios distintos que cada uno solo lee su perfil/reseñas y no modifica los del otro. Como visitante, la lectura de tablas debe denegarse; la RPC solo devuelve aprobadas sin datos privados. Una cuenta no puede autoaprobarse ni alterar su correo en `profiles`. Verificar que promociones futuras, vencidas o inactivas no aparezcan.
- El primer registro, el cierre y el nuevo inicio de sesión de Google se probaron en la vista local el 29 de septiembre de 2026. El 4 de octubre se verificaron en el dominio público el acceso de una cuenta existente, la persistencia al recargar, el cierre y el nuevo inicio. No se creó otra cuenta durante la prueba pública.

Referencias oficiales: [perfiles y triggers](https://supabase.com/docs/guides/auth/managing-user-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [privilegios por columna](https://supabase.com/docs/guides/database/postgres/column-level-security), [funciones y permisos](https://supabase.com/docs/guides/database/functions).

## Verificado el 24 de septiembre de 2026

La migración se aplicó en el editor SQL del proyecto y confirmó éxito. Se ejecutaron pruebas en una transacción revertida: dos identidades temporales, aislamiento de perfiles y reseñas, consentimiento falso aunque los metadatos pidan lo contrario, fallback de nombre corto, actualización propia permitida, correo protegido, duplicados pendientes rechazados, suplantación de dueño rechazada, autoaprobación rechazada, RPC solo aprobadas y promociones solo autenticados/vigentes/activas. No quedaron usuarios, promociones ni reseñas de prueba.

Desde la aplicación, en esa fecha: lectura pública devolvió lista vacía real; perfil/comentario sin sesión devolvieron 401; el origen ajeno fue rechazado. Google estaba desactivado entonces. Estas comprobaciones y las 9 pruebas automatizadas previas no se repitieron durante la posterior validación de Google.

## Antecedente: acceso local con Google el 29 de septiembre de 2026

En esa fecha, el proveedor Google quedó guardado como **Enabled** con el ID público `101396925502-dqaoqsnbfoqeo6iff01nqkj0j61imjtc.apps.googleusercontent.com`. El usuario introdujo y guardó el secreto directamente en Supabase; no se guardó en el proyecto local. Entonces la **Site URL** era `http://localhost:5173` y el único retorno autorizado en Supabase era `http://localhost:5173/auth/callback`. La prueba local utilizó `GOOGLE_AUTH_ENABLED=true`. Las direcciones vigentes están en la sección siguiente.

La prueba real desde la interfaz inició sesión con la cuenta del propietario, volvió a `#comunidad`, cargó el perfil y mantuvo la sesión tras recargar. En **Authentication → Users** se verificó el registro con proveedor social Google, y en **Table Editor → profiles**, el perfil creado automáticamente junto con los cambios de nombre y preferencias guardados por el propio usuario. No fue un inicio con el correo de asistencia **carlyfit.lab@gmail.com**. También se verificaron el cierre y el nuevo inicio de sesión, conservando los datos del perfil y la reseña enviada por el propio usuario con estado En revisión. El asistente no envió ni aprobó testimonios ni cambió la preferencia de comunicaciones.

En aquel momento Google seguía en **Testing / Prueba** y el sitio aún no estaba publicado. Este estado histórico quedó sustituido por la publicación y las comprobaciones del 4 de octubre descritas a continuación.

En la revisión posterior del mismo día, sin borradores en el formulario, se verificó el cierre de sesión y el nuevo acceso con Google. El perfil conservó los cambios guardados y mostró una reseña enviada por el usuario como **En revisión**. El asistente no envió ni aprobó esa reseña. El cierre de sesión local ya no está pendiente.

## Acceso público habilitado y verificado el 4 de octubre de 2026

- Google está **En producción** para usuarios externos. Solo solicita `openid`, `userinfo.email` y `userinfo.profile`; no hay permisos sensibles ni restringidos. La página principal `https://carlyfitlab.com` y la política `https://carlyfitlab.com/privacidad` están guardadas en la información de marca.
- La **Site URL** de Supabase es `https://carlyfitlab.com`. Los retornos autorizados son `https://carlyfitlab.com/auth/callback` y `http://localhost:5173/auth/callback`. Google retorna a `https://owaeescwhbtegmxzqpip.supabase.co/auth/v1/callback`. Se conservaron estas direcciones existentes y el proveedor habilitado; no se recreó la aplicación ni se repitió la migración.
- El Worker público `carlyfit-lab`, versión `fe862e7f-ca94-49b8-8228-0d8181804511`, activa `GOOGLE_AUTH_ENABLED=true`. La configuración de pruebas permanece en `false`, sin modificaciones.
- Se inició sesión desde la web pública con la cuenta existente del propietario, sin advertencias ni alta como usuario de prueba. El perfil conservó sus datos, recargar mantuvo la sesión y se verificaron el cierre y un nuevo acceso. No se modificaron perfil, preferencias ni reseñas. No se ensayó un registro nuevo en esta comprobación pública.
- TypeScript, cuatro pruebas automatizadas de miembros y la compilación pública pasaron. La validación de aislamiento RLS del 24 de septiembre permanece como comprobación histórica; no se repitió en esta activación.

El selector de Google puede mostrar el dominio de Supabase porque no se realizó la verificación de marca; los tres permisos básicos permitieron completar el acceso comprobado. La página de privacidad es pública y se enlaza en el pie y el diálogo de acceso. Mercado Pago conserva los cobros reales habilitados, independientes del registro; falta comprobar la primera compra real y su conciliación. Consultar [ACTIVAR-GOOGLE.md](../ACTIVAR-GOOGLE.md) y [ACTIVACION.md](../ACTIVACION.md).
