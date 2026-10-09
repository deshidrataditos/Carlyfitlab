# Carlyfit Lab

Sitio de Carla Judith Fernández Arzate: entrenamiento, asesoría en nutrición deportiva y productos Carlyfit Lab. Incluye planes a distancia de 90 días, atención presencial a consultar, catálogo, carrito y pedidos por WhatsApp, además de comunidad con acceso mediante Google, testimonios moderados y promociones para miembros.

La atención es en línea y presencial en La Barca, Jalisco. Los productos pueden solicitarse por separado o junto con un plan. El paquete inicial del plan con postres permite incluir hasta un pastel individual de zanahoria o cheesecake entre sus cinco piezas; los pasteles completos de 15 cm se venden por separado. Los envíos se cotizan antes de cobrar. Las imágenes son ilustrativas. Los precios mostrados son los vigentes en MXN para cada presentación y plan.

## Portal de planes y pedidos — actualización del 8 de octubre de 2026

**Mi espacio Carlyfit** incorpora **Mi plan**, **Mis pedidos** y un formulario privado de objetivo, experiencia, casa o gimnasio, días, minutos y equipo disponible, sin campos médicos. Para vincular una compra al portal, el cliente debe iniciar sesión **antes de comprar**. El servidor obtiene el propietario de la sesión; las compras como invitado y los pedidos históricos permanecen sin asignar, aunque coincida el correo, y se coordinan directamente con Carly. El checkout como invitado sigue disponible.

**Administrar tienda y planes** exige el permiso independiente `store_admin`, registrado en `carlyfit_private.store_admins`. Ser moderador de testimonios no concede ese acceso; la migración tampoco asigna el permiso a ninguna cuenta. Carly puede avanzar la preparación y entrega, escribir una nota al cliente y asignar materiales a planes pagados. El estado del pago se consulta al sistema de pagos y no se edita desde este panel.

Rutinas y alimentación se entregan como PDF; los videos privados admiten MP4/WebM. Cada archivo tiene un máximo de **45 MiB**, se almacena en el bucket privado `carlyfit-plans` y utiliza una autorización de carga firmada de **2 horas**. La publicación comprueba el archivo almacenado y registra el acceso del propietario. Si falla la confirmación final, el panel permite reintentar la publicación con el mismo identificador de carga. Los enlaces de descarga emitidos por la aplicación duran **60 segundos**. Tras un reembolso o contracargo, la API bloquea nuevas descargas; el acceso directo de un cliente a un archivo ya publicado requiere **revocación explícita en Storage por un operador autorizado**. Los archivos publicados y su permiso de acceso no caducan automáticamente con el enlace.

El editor público permite completar ingredientes declarados, alérgenos, conservación, anticipación del pedido, presentación y entrega. **Los datos iniciales no incluyen recetas privadas ni sus cantidades de elaboración; tampoco deben introducirse en este editor**. Los datos aún desconocidos quedan para consulta con Carly. Incluye el perfil de Instagram y dos botones al [primer reel](https://www.facebook.com/reel/2470379943438648) y al [segundo reel](https://www.facebook.com/reel/27463019223386626) proporcionados en Facebook, que pueden pedir iniciar sesión. Los enlaces públicos no se utilizan como materiales privados de clientes.

La opción presencial se solicita por consulta con Carly: el SKU fijo `presencial-mensual` está retirado de nuevas compras, conservando los pedidos anteriores. El plan con postres mantiene **5 piezas por paquete**, con **máximo 1 pastel individual entre zanahoria y cheesecake**; los pasteles grandes se compran por separado. Los pasteles requieren **3 días de anticipación**, con fecha de entrega acordada.

Preparación de datos para esta actualización:

- D1: [0002_store_portal.sql](drizzle/0002_store_portal.sql) añade propietarios, preparación, preferencias, materiales y auditoría; [0003_public_product_facts.sql](drizzle/0003_public_product_facts.sql) carga datos públicos iniciales y enlaces, conservando las ediciones existentes de Carly.
- Supabase: [202610080002_store_portal.sql](supabase/migrations/202610080002_store_portal.sql) crea permisos y almacenamiento privado. Para instalaciones que ya aplicaron su versión anterior, [202610080003_store_storage_guard_permissions.sql](supabase/migrations/202610080003_store_storage_guard_permissions.sql) repara las comprobaciones de permisos de Storage sin reasignar cuentas ni cambiar datos. Verificar el estado del destino antes de aplicar migraciones; la concesión a Carly se realiza por separado con su identidad comprobada.

Actualización del 8 de octubre de 2026: migraciones D1 0002/0003 y Supabase 0002/0003 aplicadas; pruebas transaccionales de permisos completadas con ROLLBACK, sin conservar usuarios ni archivos temporales. Carly recibió el permiso de tienda con confirmación expresa y se verificó el acceso a «Administrar tienda y planes» desde su cuenta. Publicado en carlyfitlab.com, versión `987264a8-22b1-404f-a145-31fd53588380`. Pasaron 88 pruebas automatizadas, TypeScript y compilación; carrito y fichas revisados en celular. No se realizó una compra real ni se asignaron materiales a pedidos reales durante esta revisión.

## Planes y precios actualizados — 8 de octubre de 2026

El usuario confirmó conservar los tres planes a distancia de 90 días: ahora explican una sola entrega de rutina y video explicativo, adaptada a los horarios, equipo y necesidades para casa o gimnasio. Se añadió **Entrena con Carly**, presencial en La Barca, por **$2,200 MXN al mes**. El nuevo identificador `presencial-mensual` conserva el período de un mes en carrito, WhatsApp y Mercado Pago; usa el checkout de pago único existente y no genera una suscripción. No se promete un número de sesiones ni se incluyen alimentación o postres en esa opción: horarios e inicio se acuerdan con Carly. La actualización describe el entregable; no añade videos o documentos de clientes al servidor.

Nombre comercial corregido a **Psi Cookie**, conservando su identificador e imagen. Nuevos precios: pastel de zanahoria completo de 15 cm **$750**, cheesecake completo de 15 cm **$720**, tiramisú individual **$140** y minitartaleta **$95**. Individuales de zanahoria y cheesecake conservan **$95 y $99**; el resto de los precios se conserva. El servidor usa el catálogo actualizado para nuevas preferencias de pago; no se modifican pedidos ni preferencias ya creados.

Validación: TypeScript, compilación Cloudflare y **23 pruebas de comercio, checkout y carrito**. Se verificaron el cobro de un mes a precio del servidor y la conservación de tamaños en las órdenes simuladas. En la revisión local, las seis selecciones (presencial, dos pasteles grandes, tiramisú, minitartaleta y Psi Cookie) sumaron **$3,964 MXN**, también en el mensaje preparado de WhatsApp. Se retiraron las selecciones de prueba, sin enviar mensajes ni cobrar. Diseño revisado en escritorio y viewports de 390 y 320 px, sin desbordamiento horizontal. Publicación verificada en carlyfitlab.com: versión `937db606-dccc-406f-818c-f3b02551ae05`. Se comprobaron los nuevos precios en el catálogo público y el bloque presencial de $2,200/mes. El entorno de pruebas permanece sin cambios.

## Precios, certificaciones y fotografía — 8 de octubre de 2026

Se retiró la leyenda de precio sugerido de los planes, las tarjetas y detalles de productos, el carrito, la información de compra y el mensaje preparado para WhatsApp. Todos los importes y las presentaciones se conservan; el catálogo indica que los precios ya no son provisionales.

Los nombres de los programas se contrastaron con las páginas oficiales de [Entrenador Profesional de Pesas](https://www.fisicoculturismomx.com/index.php/certificacioneslinea/entrenador-profesional) y [Asesor en Nutrición Deportiva](https://fisicoculturismomx.com/index.php/certificacioneslinea/nutricion-deportiva). Se reemplazó la referencia genérica a WABBA México por el aval publicado de **Fisicoculturismo México S.C. y WABBA International**, con enlaces a las fuentes. Esta revisión de nomenclatura no constituye una comprobación independiente de folios personales.

Se añadió la fotografía proporcionada por el usuario, sin alteraciones, en la introducción a los planes: `public/images/carly-training.png`. Conserva el cuerpo completo, dimensiones intrínsecas y carga diferida; el bloque se apila en móvil.

Validación: TypeScript y compilación para Cloudflare aprobados; 8 pruebas de comercio aprobadas para la actualización de precios. Revisión visual en escritorio y en viewport móvil de 390 px, sin desbordamiento horizontal y con fotografía completa. La vista local usó la fecha de compatibilidad del runtime instalado solo durante la revisión visual; la configuración de producción se conservó. En el sitio público se verificaron la fotografía cargada, los enlaces de certificaciones, los precios sin la leyenda anterior, los detalles de producto y la información de compra. Versión pública final: `271054e1-8138-474d-865a-48463fff2093`. El entorno de pruebas no se modificó.

## Moderación de comentarios — publicación del 8 de octubre de 2026

Se implementó el panel **Mi cuenta → Administración → Administrar comentarios**, disponible solo para cuentas con permiso explícito. Permite revisar pendientes, aprobar, rechazar, ocultar publicados y volver a aprobar comentarios no publicados. La lista muestra el nombre público, la experiencia, las estrellas y la fecha, sin correos de clientes. Los testimonios nuevos continúan entrando como `pending`; un cliente no puede aprobar los suyos.

La migración `supabase/migrations/202610080001_testimonial_moderation.sql` **ya se aplicó** en Supabase el 8 de octubre; no volver a ejecutarla. Agrega una lista privada de moderadores y un registro de cambios de estado. Las comprobaciones SQL finalizaron con **PASS** dentro de una transacción revertida por completo, sin modificar datos reales. También pasaron las 10 pruebas automatizadas de miembros y moderación, TypeScript y la compilación para Cloudflare.

El panel se publicó en el Worker público con la versión `3b0db7ad-5e89-43dc-8b62-786f08f2892c`. Con autorización del usuario, **se concedió a Carly el permiso de moderación el 8 de octubre a las 15:41, hora de Ciudad de México**, tras verificar el UUID exacto, el correo confirmado y la identidad de Google. Se completó el inicio con su cuenta y **Mi cuenta** mostró **Administración → Administrar comentarios**. La lista cargó dos pendientes con sus botones **Aprobar** y **Rechazar**; **Publicados** y **No publicados** estaban vacíos. La interfaz se verificó también a 390 px, sin recortes. No se aprobó ni modificó ningún comentario real durante la revisión. Una consulta de visitante al endpoint público devolvió `401` con `private, no-store` y `Vary: Cookie`. Aplicar la migración o publicar el panel no asigna permisos automáticamente. La guía de concesión y revocación por UUID verificado está en [supabase/README.md](supabase/README.md).

La marca de Google **quedó aprobada y publicada el 8 de octubre**. Search Console había verificado el dominio el día anterior; la revisión inicial de la mañana aún mostraba pendiente la acreditación de la página principal, resuelta en la comprobación posterior. El acceso con Google permanece habilitado. Detalles en [ACTIVAR-GOOGLE.md](ACTIVAR-GOOGLE.md).

## Catálogo publicado — 8 de octubre de 2026

La versión pública `8544260b-06f4-4236-842f-83f9f77cd827` agrega pastel de zanahoria y cheesecake en presentación individual y completa de 15 cm, tiramisú individual y minitartaletas de piña y dátil. Cada tamaño tiene su propio identificador; el carrito, el pedido por WhatsApp y Mercado Pago conservan la presentación elegida y el servidor determina el precio. Se actualizaron las fotografías de Psy Cookie y Core Cookie; las seis fotos nuevas son ilustrativas, generadas con la herramienta integrada de imágenes, con referencias reales para el pastel y las galletas.

Los tres planes incluyen rutina de movilidad. El paquete inicial conserva cinco piezas a elegir y permite incluir hasta un pastel individual de zanahoria o cheesecake; los completos de 15 cm se venden por separado. Se retiró el corazón de la firma Carly y el banner amarillo organiza sus cuatro frases en dos columnas en móvil, sin movimiento automático.

Validación: TypeScript, compilación para Cloudflare y 22 pruebas de checkout, carrito y pagos aprobadas. Revisión visual en 320, 390 y 1280 px, cambio de presentación desde tarjeta y detalles, y carrito público verificado sin realizar cobros. Se conservaron los artículos previos al retirar únicamente los agregados durante la revisión. Se mantienen el modo de pago `live`, los indicadores de pago y Google habilitados. El entorno de pruebas no se actualizó en esta publicación.

## Estado de la integración — 4 de octubre de 2026

**Google habilitado en el dominio público:** Google está **En producción** para usuarios externos, con los tres permisos básicos de identidad, correo y perfil, sin permisos sensibles ni restringidos. La marca tiene guardadas la página principal y `https://carlyfitlab.com/privacidad`, enlazada desde el pie y el acceso. Se verificaron el inicio de sesión de una cuenta existente, la persistencia al recargar, el cierre y el nuevo acceso. No se modificaron datos de la cuenta ni se creó un usuario nuevo durante esta prueba pública. Pasaron TypeScript, cuatro pruebas de miembros y la compilación.

**Cobros reales habilitados:** la versión pública del 4 de octubre `fe862e7f-ca94-49b8-8228-0d8181804511` incorporó Google y conservó modo `live` y ambos indicadores de pago en `true`. La activación de cobros del 3 de octubre se publicó en `83eeda74-88cb-4dae-8fa3-1844f70c3266`; entonces se verificaron el paquete de cinco piezas, la preparación al iniciar el plan y los importes vigentes. El entorno separado de pruebas conserva `ae8f11b8-a372-4060-8a1c-22512f0067fd`, con Google desactivado y sin cambios en esta actualización. La primera compra real aún no se ha ejecutado ni conciliado.

**Actualización final del carrito:** el usuario completó la compra de prueba de Psy Cookie de 59 MXN y confirmó el resultado. Mercado Pago muestra la operación `181274204659` aprobada; la página del pedido nuevo `eb88939c-ebdf-4772-9691-0104ff3ec607` confirmó el pago mediante su consulta a D1 y el carrito quedó en cero, también en otra pestaña. Durante esta compra no se utilizó el simulador ni se modificó D1: se verificó el recorrido automático. La corrección retira las cantidades pagadas una sola vez y conserva nuevas selecciones. Pasaron 35 pruebas y TypeScript. Detalles en el informe de Mercado Pago.

- El sitio y el carrito están implementados. Los pedidos por WhatsApp permiten solicitar recolección o cotización de envío.
- Supabase almacena cuentas, perfiles, testimonios y promociones. El registro inicial se comprobó en local el 29 de septiembre; el acceso público de una cuenta existente se verificó el 4 de octubre. Se conservaron las direcciones del dominio propio en Supabase y Google. La marca se verificó y publicó el 8 de octubre; un nuevo acceso mostró el nombre Carlyfit Lab y su logotipo en el selector de Google.
- Checkout Pro de Mercado Pago y su receptor de notificaciones están implementados. La activación autorizada configura `MERCADOPAGO_MODE=live`, `PAYMENTS_ENABLED=true` y `CATALOG_CONFIRMED=true`. Activación publicada y verificada en Cloudflare; no se ha realizado un cargo real.
- El entorno separado `https://carlyfit-lab-testing.carlyfitlab.workers.dev` tiene su propio Worker y base D1. El vendedor de prueba está verificado; el token, su identificador y la firma de Webhooks están guardados como secretos. Las migraciones `0000` y `0001_payment_update_timestamp.sql` están aplicadas en ambas bases. Pasaron 35 pruebas automatizadas de pagos, carrito y retorno, TypeScript y las compilaciones de ambos destinos.
- El 2 de octubre se confirmaron dos pagos de prueba de 149 MXN mediante avisos firmados del simulador: el receptor respondió `200`, D1 guardó `approved` y la página mostró «Pago confirmado». Es evidencia anterior a la compra automática verificada el 3 de octubre.
- El 3 de octubre se identificó la causa de las notificaciones automáticas rechazadas con `401`: el Worker de pruebas tenía la firma de la aplicación real. Se guardó la firma de la aplicación del vendedor de prueba y se corrigió su URL de notificaciones. Su simulador reenvió el pago `180975532205` y obtuvo `200 OK`; después se verificó la compra nueva sin simulación descrita arriba.
- El Access Token de producción y el identificador de la cuenta de Carla ya se guardaron, con autorización, como secretos del Worker `carlyfit-lab`. El registro de versiones de Cloudflare confirma ambos cambios. Una notificación firmada del simulador al receptor público pasó la firma y la comprobación de identidad real antes de consultar un ID de pago ficticio, que devolvió `404`. Esto verifica la conexión configurada, pero no acredita una compra real ni la entrega automática de una notificación.
- Publicación en Cloudflare con dominio propio: https://carlyfitlab.com. `www.carlyfitlab.com` y la dirección provisional de Cloudflare redirigen al dominio principal, conservando ruta y parámetros. El acceso público con Google está habilitado y es independiente de los cobros; comprar no exige registrarse.

Consulta [ACTIVACION.md](ACTIVACION.md) para el registro detallado de comprobaciones y pendientes, y [ACTIVAR-GOOGLE.md](ACTIVAR-GOOGLE.md) para la configuración de Google.

## Catálogo acordado

| Artículo | Precio MXN | Presentación / estado |
| --- | --- | --- |
| Activa tu fuerza | $1,490 | A distancia, 90 días, entrega única de rutina con video |
| Tu balance completo | $2,490 | A distancia, 90 días, entrega única de rutina con video y alimentación |
| El lado dulce del plan | $2,990 | A distancia, 90 días, entrega única y un paquete inicial de postres |
| Entrena con Carly | A consultar | Presencial en La Barca; consulta directa, sin compra del SKU fijo |
| Psi Cookie | $59 | Por pieza; chocolate con adaptógenos y cáñamo |
| Core Cookie | $55 | Por pieza; vainilla con centro firme de chocolate |
| Mermelada sin azúcar | $129 | 300 g |
| Golden milk | $189 | 250 g |
| Pastel de zanahoria | $95 / $750 | Individual, 1 porción / completo, 15 cm de diámetro |
| Cheesecake Carlyfit | $99 / $720 | Individual, 1 porción / completo, 15 cm de diámetro |
| Tiramisú saludable | $140 | Individual, 1 porción |
| Minitartaleta Crumble de Piña y Dátil | $95 | 1 pieza |

El paquete inicial del plan con postres incluye **cinco piezas en total, a elegir entre los productos, con opción de incluir hasta un pastel individual de zanahoria o cheesecake**, para probarlos y decidir con Carly cuáles integrar a la alimentación. El pastel individual ocupa una de las cinco piezas, no es un artículo adicional. Los pasteles completos de 15 cm se compran por separado. El tiempo de preparación se acuerda con Carly al comenzar el plan; los pasteles requieren tres días de anticipación. No implica entregas recurrentes; los postres adicionales se compran por separado. Los planes incluyen rutina de movilidad. Los tres a distancia se entregan una sola vez, con video explicativo, adaptados a la vida diaria para casa o gimnasio. La atención presencial, sus condiciones, horarios e inicio se consultan directamente con Carly. El 8 de octubre el usuario pidió retirar la leyenda «precio sugerido», conservando los importes vigentes para el cobro en línea: el total mostrado en el carrito es el importe de los productos y planes que se cobrará. Los envíos se cotizan antes de pagar. Las imágenes ilustrativas del catálogo están publicadas.

## Ejecutar en una computadora

Se requiere Node.js 22.13 o posterior y npm. El proyecto utiliza React, TypeScript, Vinext/Vite y Cloudflare Workers.

```sh
npm run install:ci
```

Crea un archivo `.env` local a partir de [.env.example](.env.example) y completa las variables necesarias. Conserva los valores de seguridad iniciales:

```dotenv
PAYMENTS_ENABLED=false
CATALOG_CONFIRMED=false
MERCADOPAGO_MODE=test
```

Inicia la vista local:

```sh
npm run dev
```

La dirección habitual es `http://localhost:5173`. Las funciones conectadas requieren sus servicios y variables configurados; una instalación limpia no incluye credenciales ni datos de clientes.

Para comprobar el proyecto y generar la compilación:

```sh
node --test tests/cart-state.test.mjs tests/order-return.test.mjs tests/commerce.test.mjs tests/checkout.test.mjs tests/webhook.test.mjs tests/members.test.mjs tests/moderation.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

## Datos y credenciales

| Servicio | Uso | Configuración |
| --- | --- | --- |
| Supabase Auth/Postgres | Google, perfiles, testimonios y promociones | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_AUTH_ENABLED` |
| Cloudflare D1 | Pedidos y estados de pago | Binding `DB` y migraciones de `drizzle/` |
| Mercado Pago | Checkout Pro y verificación de pagos | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_COLLECTOR_ID`, `MERCADOPAGO_MODE` |
| Dirección de la tienda | Retornos y notificaciones de pago | `SITE_URL`, solo el origen HTTPS, sin rutas |

El Access Token y la firma de Webhooks se guardan como secretos del servidor en el alojamiento. No deben aparecer en el navegador, el repositorio, capturas o mensajes. La aplicación de miembros utiliza la clave pública de Supabase y las políticas de acceso de la base; no requiere una clave `service_role` en el navegador.

Las migraciones de miembros y de moderación ya están aplicadas al proyecto Supabase de Carlyfit Lab. No se deben ejecutar de nuevo allí. Para otra base, sigue [supabase/README.md](supabase/README.md). Los testimonios se crean pendientes y no se publican automáticamente. El panel publicado usa permisos en la base y operaciones auditadas; Carly ya tiene el permiso y se verificaron el acceso, los filtros y la lectura de pendientes desde su cuenta.

`.gitignore` excluye credenciales locales, dependencias, compilaciones, estado de herramientas y capturas de trabajo. La carpeta `build/` contiene código fuente necesario del complemento de Vite y sí forma parte del proyecto.

## Publicación

Los dos destinos usan configuraciones y bases independientes. GitHub Pages no ejecuta las rutas de servidor que usa esta tienda.

| Destino | Configuración | Worker / base D1 | Indicadores de la activación autorizada |
| --- | --- | --- | --- |
| Sitio público: `https://carlyfitlab.com` | `wrangler.cloudflare.jsonc` | `carlyfit-lab` / `carlyfit-lab-orders` | Pagos y catálogo `true`; modo `live`; Google `true` |
| Pruebas: `https://carlyfit-lab-testing.carlyfitlab.workers.dev` | `wrangler.testing.jsonc` | `carlyfit-lab-testing` / `carlyfit-lab-testing-orders` | Pagos y catálogo `true`; modo `test`; `SITE_TESTING=true`; Google `false` |

`CATALOG_CONFIRMED=true` en pruebas permite ensayar con el catálogo provisional; no representa aprobación para venderlo. El entorno de prueba muestra el aviso **ENTORNO DE PRUEBA — No se realizan cobros reales** e indica a los buscadores `noindex`, `nofollow` y `noarchive`. No tiene rutas al dominio comercial. La base de pruebas tiene el identificador `baf321c0-1688-461c-9f6f-8d14327048ff`; las migraciones inicial y `0001_payment_update_timestamp.sql` ya están aplicadas. La segunda migración también está aplicada en la base pública.

El 3 de octubre de 2026 se comprobó que la versión pública anterior a la activación `9eb9f53d-e506-456e-8fc1-4751e7882a22` respondió `200` y mostró Psy Cookie, Core Cookie y el paquete inicial del plan, con cobros desactivados en ese momento. Las redirecciones `308` de `www` y la dirección anterior de Cloudflare se verificaron el 1 de octubre. `SITE_URL` utiliza `https://carlyfitlab.com`. Supabase tiene guardados ese **Site URL** y el retorno exacto `https://carlyfitlab.com/auth/callback`; conserva también el retorno local para desarrollo.

La versión de pruebas anterior a esta actualización es `878f9110-6af1-49c6-bcb0-03df3a3cfb2e`, publicada el 3 de octubre. Respondió `200` y mostró el catálogo actualizado y el aviso de que no se realizan cobros reales. Conservó la firma corregida de la aplicación del vendedor de prueba.

Para preparar y publicar el entorno de pruebas desde una sesión autorizada de Cloudflare:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.testing.jsonc
npm run build:testing
npm run deploy:testing
```

`build:testing` permite revisar la compilación; `deploy:testing` vuelve a compilar antes de publicar. Los tres secretos de Mercado Pago ya están guardados en **`carlyfit-lab-testing`**. No utilizar credenciales reales en este Worker.

Para actualizar el sitio público:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
npm run deploy:cloudflare
```

Cada comando de despliegue compila con su modo correspondiente y publica `dist/server/wrangler.json`. Ese archivo se reemplaza con cada compilación: no reutilizar una compilación de pruebas para publicar en el sitio comercial ni viceversa. Las compilaciones de Cloudflare no copian las claves del `.env` local. Los secretos se configuran en el Worker correspondiente. La conexión automática entre GitHub y Cloudflare no está configurada: subir un commit no publica por sí solo una versión nueva.

Al modificar la activación de Google o los pagos, actualizar también los indicadores explícitos de `wrangler.cloudflare.jsonc`: `keep_vars` no conserva un valor del panel que contradiga esos indicadores al desplegar.

Seguimiento:

1. El despliegue de la activación autorizada está registrado. La compra de prueba aprobada, su confirmación automática y el carrito están verificados; también la firma y la identidad real configuradas. El paquete inicial ya está definido por el usuario.
2. Verificar la conciliación del primer pago real cuando se realice. Como comprobación adicional, se recomiendan los recorridos pendiente/rechazado en Checkout Pro; ya están cubiertos por pruebas automatizadas y no bloquean la activación.
3. El acceso con Google, la audiencia en producción, la marca y el aviso de privacidad están publicados. Se comprobaron acceso de una cuenta existente, cierre y nuevo inicio en el dominio propio. El selector ya muestra Carlyfit Lab y su logotipo; el checkout no requiere registro.

## Webhooks de Mercado Pago

Cada aplicación debe usar el receptor HTTPS y la firma de su entorno:

| Aplicación / campo en Mercado Pago | URL |
| --- | --- |
| Aplicación real `7979217160634504`, modo Prueba | `https://carlyfit-lab-testing.carlyfitlab.workers.dev/api/payments/webhook` |
| Aplicación real `7979217160634504`, modo Productivo | `https://carlyfitlab.com/api/payments/webhook` |
| Aplicación del vendedor de prueba `1228080888276164`, modos Prueba y Productivo | `https://carlyfit-lab-testing.carlyfitlab.workers.dev/api/payments/webhook` |

El receptor procesa el tema **`payment`**, denominado **Pagos (legacy)** en la configuración. El 3 de octubre se revisó el historial de la aplicación del vendedor de prueba: los avisos automáticos de los pagos `181981714212` y `180975532205` habían fallado con `401`. El Worker de pruebas conservaba la firma de la aplicación real. Se reemplazó por la firma de `1228080888276164`, manteniendo la firma real únicamente en el Worker público, y se corrigió la URL del modo Productivo de la aplicación de prueba para que también apunte al Worker de pruebas. Estos pagos de cuentas de prueba aparecen en ese filtro Productivo del panel; no deben enviarse al dominio comercial.

Después de la corrección, el simulador de la aplicación del vendedor de prueba reenvió el pago `180975532205` al receptor de pruebas y recibió **`200 OK`**. Ese resultado confirma la aceptación del aviso firmado; no acredita por sí solo el estado de ese tercer pedido en D1 ni una entrega automática nueva. Las dos conciliaciones de 149 MXN verificadas el 2 de octubre se conservan como evidencia anterior. La firma de la aplicación real ya no debe usarse para simular avisos contra el Worker de pruebas. No uses el repositorio de GitHub ni `localhost` como receptor.

En Mercado Pago Developers:

1. Abre **Tus integraciones**, selecciona la aplicación de Carlyfit Lab y entra en **Webhooks → Configurar notificaciones**.
2. Revisa la aplicación y las URL de la tabla, y el evento **Pagos**, cuyo tema es `payment`, para esta integración de Checkout Pro con Preferencias. El panel también puede denominarlo **Pagos (legacy)**. Para ensayar las compras nuevas, usa la aplicación del vendedor de prueba.
3. Guarda la configuración y copia la firma secreta directamente a `MERCADOPAGO_WEBHOOK_SECRET` en el Worker correspondiente, junto al Access Token y el identificador de vendedor del mismo entorno. No enviarla por chat ni guardarla en GitHub.

Los nombres y pasos del panel se basan en la [documentación oficial de Webhooks](https://www.mercadopago.com.mx/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks). La integración también envía esta ruta al crear cada preferencia.

El receptor funciona independientemente de `PAYMENTS_ENABLED` y `CATALOG_CONFIRMED`, para poder conciliar pagos existentes aunque se suspendan nuevas compras. Devuelve `503` mientras falte configuración o D1, y `401` para firmas inválidas. Los errores al consultar Mercado Pago conservan `503` para permitir reintentos; los registros incluyen únicamente la etiqueta del error y el estado HTTP, nunca el token ni el cuerpo de la respuesta. Un identificador inventado del simulador no equivale a un pago de prueba existente.

Las pruebas de checkout se realizan **solo en `carlyfit-lab-testing`**, con comprador y vendedor de prueba distintos. Se verificaron dos conciliaciones mediante simulador y, después, una compra nueva con confirmación automática y carrito vacío. La validación automatizada cubre firmas inválidas, duplicados, avisos fuera de orden y conservación del carrito ante estados sin aprobación. Los recorridos completos pendiente/rechazado en Checkout Pro siguen pendientes. Un pedido local en `pending` sin `payment_id` no demuestra un pago pendiente en Mercado Pago.

La activación autorizada habilita `CATALOG_CONFIRMED=true` y `PAYMENTS_ENABLED=true` en `wrangler.cloudflare.jsonc`. La compra aprobada automática ya se verificó y el usuario definió el paquete inicial de cinco piezas a elegir, con preparación acordada al comenzar el plan. El modo público es `live` y su firma e identidad están comprobadas. El despliegue está verificado; comprobar la conciliación del primer pago real cuando ocurra. Conservar el Worker de pruebas en modo `test`.

El servidor valida la firma, consulta el pago en Mercado Pago y contrasta receptor, importe, moneda y modo antes de actualizar el pedido. Volver a la página de confirmación no acredita el cobro. Los productos físicos de esta primera integración se cobran para recolección; los envíos requieren cotización por WhatsApp.

## Asistente de la tienda (Cloudflare Workers AI)

`/api/assistant` requiere una sesión validada con Supabase en el servidor y rechaza usuarios anónimos. Usa exclusivamente el catálogo disponible y la fila pública de fichas; no envía al modelo identidad, pedidos, fichas de clientes ni materiales privados. Cada pregunta es independiente. No tiene herramientas para comprar, modificar carritos o administrar datos.

La conexión usa el binding `AI`, sin claves en JavaScript del navegador. El modelo fijado es `@cf/meta/llama-3.1-8b-instruct-fp8`, con un máximo de 450 tokens de salida y 20.000 bytes UTF-8 entre instrucciones, catálogo y pregunta. El panel Workers confirmó el plan **Free** el 8 de octubre de 2026; no se cambió la suscripción. La cuota de Workers AI es compartida con otros usos de la cuenta.

Antes de activar `ASSISTANT_ENABLED=true`, aplicar `drizzle/0004_assistant_usage.sql`. Una inserción condicional en D1 reserva cada consulta de forma atómica: **12 por cuenta y 30 globales por día UTC**, espera de 30 segundos y reserva en curso de 90 segundos. El contador sobrevive a despliegues y solicitudes concurrentes. El día UTC se renueva a las 18:00 de México central; la interfaz muestra la fecha local. Fallos y timeout no devuelven la consulta ni provocan reintentos automáticos. No se guardan preguntas/respuestas. Los identificadores de solicitudes con más de 48 horas se limpian en el siguiente uso. La interfaz mantiene WhatsApp como alternativa.

Para suspenderlo, establecer `ASSISTANT_ENABLED=false` en el servidor. Testing permanece desactivado y sin binding de IA. Las pruebas de `tests/assistant*.test.mjs` usan dobles del proveedor y SQLite local: no consumen IA ni prueban por sí solas la disponibilidad real del modelo. La verificación final en la web debe incluir una consulta con sesión y el rechazo HTTP 401 sin sesión.

Referencias: [cuota y precios](https://developers.cloudflare.com/workers-ai/platform/pricing/), [modelo](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/), [uso de datos](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

Verificación del 8 de octubre de 2026: migración aplicada en D1 local y producción, compilación y TypeScript correctos, 114 pruebas aprobadas (26 específicas del asistente). GET y POST sin sesión devuelven 401 con caché privada desactivada; las consultas con sesión en la web pública obtuvieron precios correctos de las galletas y la regla de un pastel individual en el paquete, descontando el contador. El diálogo se revisó en escritorio y móvil de 390 px. Publicación del asistente: `17754705-1565-4d78-8c51-62baf6733583`.

## Archivos principales

| Ruta | Contenido |
| --- | --- |
| `app/storefront.tsx` y `app/globals.css` | Página y diseño |
| `lib/catalog.ts` | Productos, planes y precios del servidor |
| `public/images/` | Logo, fotografía y recursos de la tienda |
| `app/api/checkout/route.ts` | Creación de preferencias de pago |
| `app/api/payments/webhook/route.ts` | Recepción y conciliación de notificaciones |
| `app/testimonial-moderation.tsx` y `app/api/admin/testimonials/route.ts` | Panel privado y operaciones de moderación de comentarios |
| `proxy.ts` | Redirección de `www` y la dirección provisional al dominio principal |
| `supabase/` | Migración, políticas y administración de miembros |
| `drizzle/` | Migraciones de D1 |
| `tests/` | Comprobaciones de comercio, checkout y miembros |

La corrección inicial de pagos se verificó en testing (`a4aa2ebd-e8f0-47f7-b57b-3ff700b58e5c`). Las versiones anteriores a esta activación fueron `878f9110-6af1-49c6-bcb0-03df3a3cfb2e` en pruebas y `9eb9f53d-e506-456e-8fc1-4751e7882a22` en público; esta última tenía los cobros cerrados. El servidor verifica la cuenta del vendedor con `/users/me` antes del checkout y del webhook; no usa `live_mode=false` como único criterio para pruebas con APP_USR. Detalles y límites de la validación en [INFORME-MERCADOPAGO.md](INFORME-MERCADOPAGO.md).

## Bienvenida automática por correo — 8 de octubre de 2026

El Worker de producción utiliza Resend Free para dar la bienvenida a las cuentas nuevas confirmadas por Google. El remitente es `Carlyfit Lab <hola@correo.carlyfitlab.com>` y las respuestas llegan a `carlyfit.lab@gmail.com`. El correo explica el acceso a la cuenta, pedidos, materiales asignados, comentarios moderados y asistente; no cambia `marketing_opt_in` ni añade usuarios a campañas.

- El subdominio `correo.carlyfitlab.com` está verificado en Resend mediante DKIM y las dos rutas CNAME indicadas por el proveedor. Los registros web y la verificación de Google se conservan. El seguimiento de aperturas/clics no está configurado.
- La clave tiene **Sending access** únicamente para ese subdominio. Está guardada en el secreto cifrado `RESEND_API_KEY` del Worker `carlyfit-lab`, nunca en Git, en archivos de configuración públicos ni en el navegador del cliente. Resend mantiene el plan gratuito y no se activa pago por consumo.
- `WELCOME_EMAIL_ENABLED=true` y `WELCOME_EMAIL_START_AT=2026-10-09T02:30:25Z` activan los registros a partir de ese momento (8 de octubre en México). **No cambiar esta fecha al desplegar nuevas versiones**: evita dar la bienvenida a cuentas históricas. Testing y `.env.example` mantienen la función apagada.
- `drizzle/0005_welcome_email.sql` ya está aplicada a D1 de producción. Una fila única por usuario conserva el destinatario y el mensaje originales mientras están pendientes; los elimina al terminar o descartar el envío. El recibo, estado y referencia del proveedor permanecen para impedir repeticiones. La limpieza de cuentas solicitada por un titular debe contemplar también estos recibos.
- El callback de Google encola tras `auth.getUser()` y entrega en segundo plano mediante `after()`. La consulta autenticada de cuenta recupera un alta pendiente. La fecha de alta, correo confirmado e identidad se toman del servidor; no existe un endpoint público para elegir destinatario o mensaje. Los errores de correo no bloquean el acceso a la cuenta.
- El punto de entrada `workers/store-worker.ts` delega las peticiones a Vinext y procesa pendientes cada cinco minutos. La tarea programada trabaja sin sesiones de navegador, con lotes de cinco, hasta ocho intentos, espera creciente y timeout de 15 segundos por petición. Una reserva atómica evita envíos concurrentes. Resend recibe la misma clave de idempotencia y el mismo contenido en cada reintento.
- Los reintentos paran a las **23 horas desde el primer intento**, antes de que expire la protección de 24 horas del proveedor. Un correo que nunca alcanzó un primer intento se descarta a los siete días. El procesador limpia los vencidos aunque el envío se desactive. Un estado `sent` significa que Resend aceptó la solicitud; la entrega al servidor destinatario se consulta en el panel de Resend. No repetir a mano un envío ambiguo ni borrar su recibo para forzar otro.

Despliegue: aplicar migraciones D1 pendientes, compilar con `npm run build:cloudflare` y publicar el archivo generado `dist/server/wrangler.json`. Conservar `keep_vars`, el secreto y el cron `*/5 * * * *`. Para pausar nuevos envíos, poner `WELCOME_EMAIL_ENABLED=false` y conservar el cron para la limpieza. Una nueva instalación requiere verificar su dominio, crear una clave con permiso de envío y fijar su propia fecha de activación.

Validación: **133 pruebas aprobadas**, incluidas 19 de bienvenida y plantilla; también pasan TypeScript, ESLint de los archivos nuevos y la compilación de producción. Se añadió cobertura de carreras, reintentos ambiguos, recibos inmutables, límite de 23 horas, limpieza con envío desactivado y ejecución programada esperada. No se usa ninguna cuenta ficticia de Supabase para las pruebas.

Verificación real: publicación `6db98660-a8b8-4104-b374-0e7eb3be3a49`. El 8 de octubre a las 20:40 de México, el cron envió la única prueba administrativa autorizada a la cuenta del negocio; Resend confirmó **Delivered**. La cola registró un solo intento y eliminó destinatario y contenido tras el envío. La sesión existente de Carly siguió funcionando y no generó una bienvenida retroactiva. La plantilla se revisó en escritorio y a 390 px. El alta de una cuenta Google nueva está cubierta con pruebas automatizadas; no se creó otra cuenta real durante esta comprobación.

Referencias: [Resend e idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys), [API de envío](https://resend.com/docs/api-reference/emails/send-email), [permisos de claves](https://resend.com/docs/dashboard/api-keys/introduction).
