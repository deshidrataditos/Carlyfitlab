# Carlyfit Lab

Sitio de Carla Judith Fernández Arzate: entrenamiento, asesoría en nutrición deportiva y productos Carlyfit Lab. Incluye planes de 90 días, catálogo, carrito y pedidos por WhatsApp, además de comunidad con acceso mediante Google, testimonios moderados y promociones para miembros.

La atención es en línea y presencial en La Barca, Jalisco. Los productos pueden solicitarse por separado o junto con un plan; los envíos se cotizan antes de cobrar. Las imágenes son ilustrativas y los importes aún sugeridos se identifican como provisionales.

## Estado de la integración — 3 de octubre de 2026

**Cobros reales habilitados:** Cloudflare publicó `83eeda74-88cb-4dae-8fa3-1844f70c3266` con modo `live` y ambos indicadores de pago en `true`. El sitio respondió `200` y se verificó el paquete de cinco piezas, la preparación al iniciar el plan y los importes vigentes. El entorno separado de pruebas se actualizó a `ae8f11b8-a372-4060-8a1c-22512f0067fd`. La primera compra real aún no se ha ejecutado ni conciliado.

**Actualización final del carrito:** el usuario completó la compra de prueba de Psy Cookie de 59 MXN y confirmó el resultado. Mercado Pago muestra la operación `181274204659` aprobada; la página del pedido nuevo `eb88939c-ebdf-4772-9691-0104ff3ec607` confirmó el pago mediante su consulta a D1 y el carrito quedó en cero, también en otra pestaña. Durante esta compra no se utilizó el simulador ni se modificó D1: se verificó el recorrido automático. La corrección retira las cantidades pagadas una sola vez y conserva nuevas selecciones. Pasaron 35 pruebas y TypeScript. Detalles en el informe de Mercado Pago.

- El sitio y el carrito están implementados. Los pedidos por WhatsApp permiten solicitar recolección o cotización de envío.
- Supabase almacena cuentas, perfiles, testimonios y promociones. El acceso con Google se verificó en la vista local. Supabase y Google ya tienen guardadas las direcciones del dominio propio; faltan completar la configuración de marca y las pruebas de acceso público.
- Checkout Pro de Mercado Pago y su receptor de notificaciones están implementados. La activación autorizada configura `MERCADOPAGO_MODE=live`, `PAYMENTS_ENABLED=true` y `CATALOG_CONFIRMED=true`. Activación publicada y verificada en Cloudflare; no se ha realizado un cargo real.
- El entorno separado `https://carlyfit-lab-testing.carlyfitlab.workers.dev` tiene su propio Worker y base D1. El vendedor de prueba está verificado; el token, su identificador y la firma de Webhooks están guardados como secretos. Las migraciones `0000` y `0001_payment_update_timestamp.sql` están aplicadas en ambas bases. Pasaron 35 pruebas automatizadas de pagos, carrito y retorno, TypeScript y las compilaciones de ambos destinos.
- El 2 de octubre se confirmaron dos pagos de prueba de 149 MXN mediante avisos firmados del simulador: el receptor respondió `200`, D1 guardó `approved` y la página mostró «Pago confirmado». Es evidencia anterior a la compra automática verificada el 3 de octubre.
- El 3 de octubre se identificó la causa de las notificaciones automáticas rechazadas con `401`: el Worker de pruebas tenía la firma de la aplicación real. Se guardó la firma de la aplicación del vendedor de prueba y se corrigió su URL de notificaciones. Su simulador reenvió el pago `180975532205` y obtuvo `200 OK`; después se verificó la compra nueva sin simulación descrita arriba.
- El Access Token de producción y el identificador de la cuenta de Carla ya se guardaron, con autorización, como secretos del Worker `carlyfit-lab`. El registro de versiones de Cloudflare confirma ambos cambios. Una notificación firmada del simulador al receptor público pasó la firma y la comprobación de identidad real antes de consultar un ID de pago ficticio, que devolvió `404`. Esto verifica la conexión configurada, pero no acredita una compra real ni la entrega automática de una notificación.
- Publicación en Cloudflare con dominio propio: https://carlyfitlab.com. `www.carlyfitlab.com` y la dirección provisional de Cloudflare redirigen al dominio principal, conservando ruta y parámetros. El acceso público con Google permanece desactivado y es independiente de los cobros.

Consulta [ACTIVACION.md](ACTIVACION.md) para el registro detallado de comprobaciones y pendientes, y [ACTIVAR-GOOGLE.md](ACTIVAR-GOOGLE.md) para la configuración de Google.

## Catálogo acordado

| Artículo | Precio MXN | Presentación / estado |
| --- | --- | --- |
| Activa tu fuerza | $1,490 | 90 días; precio sugerido provisional |
| Tu balance completo | $2,490 | 90 días; precio sugerido provisional |
| El lado dulce del plan | $2,990 | 90 días y un paquete inicial de postres; precio sugerido provisional |
| Psy Cookie | $59 | Por pieza; chocolate con adaptógenos y cáñamo |
| Core Cookie | $55 | Por pieza; vainilla con centro firme de chocolate |
| Mermelada sin azúcar | $129 | 300 g; precio sugerido |
| Golden milk | $189 | 250 g; precio sugerido |

El paquete inicial del plan con postres incluye **cinco piezas en total, a elegir entre los productos**, para probarlos y decidir con Carly cuáles integrar a la alimentación. El tiempo de preparación se acuerda con Carly al comenzar el plan. No implica entregas recurrentes; los postres adicionales se compran por separado. Los precios sugeridos se mantienen por indicación del usuario como importes vigentes para el cobro en línea: el total mostrado en el carrito es el importe de los productos y planes que se cobrará. Los envíos se cotizan antes de pagar. Las imágenes ilustrativas de ambas galletas ya están publicadas.

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
node --test tests/cart-state.test.mjs tests/order-return.test.mjs tests/commerce.test.mjs tests/checkout.test.mjs tests/webhook.test.mjs tests/members.test.mjs
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

La migración de miembros ya está aplicada al proyecto Supabase de Carlyfit Lab. No se debe ejecutar de nuevo allí. Para otra base, sigue [supabase/README.md](supabase/README.md). Los testimonios se crean pendientes y se moderan desde Supabase; no se publican automáticamente.

`.gitignore` excluye credenciales locales, dependencias, compilaciones, estado de herramientas y capturas de trabajo. La carpeta `build/` contiene código fuente necesario del complemento de Vite y sí forma parte del proyecto.

## Publicación

Los dos destinos usan configuraciones y bases independientes. GitHub Pages no ejecuta las rutas de servidor que usa esta tienda.

| Destino | Configuración | Worker / base D1 | Indicadores de la activación autorizada |
| --- | --- | --- | --- |
| Sitio público: `https://carlyfitlab.com` | `wrangler.cloudflare.jsonc` | `carlyfit-lab` / `carlyfit-lab-orders` | Pagos y catálogo `true`; modo `live`; Google `false` |
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

Cuando se activen Google o los pagos, actualizar también los indicadores explícitos de `wrangler.cloudflare.jsonc`: `keep_vars` no conserva un valor del panel que contradiga esos indicadores al desplegar.

Seguimiento:

1. Verificar y registrar el despliegue de la activación autorizada. La compra de prueba aprobada, su confirmación automática y el carrito están verificados; también la firma y la identidad real configuradas. El paquete inicial ya está definido por el usuario.
2. Verificar la conciliación del primer pago real cuando se realice. Como comprobación adicional, se recomiendan los recorridos pendiente/rechazado en Checkout Pro; ya están cubiertos por pruebas automatizadas y no bloquean la activación.
3. Por separado, completar marca y audiencia de Google, el aviso de privacidad y las pruebas de registro, cierre y nuevo acceso en el dominio propio. Google permanece desactivado; el checkout no requiere registro.

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

## Archivos principales

| Ruta | Contenido |
| --- | --- |
| `app/storefront.tsx` y `app/globals.css` | Página y diseño |
| `lib/catalog.ts` | Productos, planes y precios del servidor |
| `public/images/` | Logo, fotografía y recursos de la tienda |
| `app/api/checkout/route.ts` | Creación de preferencias de pago |
| `app/api/payments/webhook/route.ts` | Recepción y conciliación de notificaciones |
| `proxy.ts` | Redirección de `www` y la dirección provisional al dominio principal |
| `supabase/` | Migración, políticas y administración de miembros |
| `drizzle/` | Migraciones de D1 |
| `tests/` | Comprobaciones de comercio, checkout y miembros |

La corrección inicial de pagos se verificó en testing (`a4aa2ebd-e8f0-47f7-b57b-3ff700b58e5c`). Las versiones anteriores a esta activación fueron `878f9110-6af1-49c6-bcb0-03df3a3cfb2e` en pruebas y `9eb9f53d-e506-456e-8fc1-4751e7882a22` en público; esta última tenía los cobros cerrados. El servidor verifica la cuenta del vendedor con `/users/me` antes del checkout y del webhook; no usa `live_mode=false` como único criterio para pruebas con APP_USR. Detalles y límites de la validación en [INFORME-MERCADOPAGO.md](INFORME-MERCADOPAGO.md).
