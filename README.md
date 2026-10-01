# Carlyfit Lab

Sitio de Carla Judith Fernández Arzate: entrenamiento, asesoría en nutrición deportiva y productos Carlyfit Lab. Incluye planes de 90 días, catálogo, carrito y pedidos por WhatsApp, además de comunidad con acceso mediante Google, testimonios moderados y promociones para miembros.

La atención es en línea y presencial en La Barca, Jalisco. Los productos pueden solicitarse por separado o junto con un plan; los envíos se cotizan antes de cobrar. Los precios y las imágenes de productos son provisionales.

## Estado de la integración

- El sitio y el carrito están implementados. Los pedidos por WhatsApp permiten solicitar recolección o cotización de envío.
- Supabase almacena cuentas, perfiles, testimonios y promociones. El acceso con Google se verificó en la vista local. Supabase y Google ya tienen guardadas las direcciones del dominio propio; faltan completar la configuración de marca y las pruebas de acceso público.
- Checkout Pro de Mercado Pago y su receptor de notificaciones están implementados. Los cobros permanecen desactivados y el modo predeterminado es de prueba.
- La dirección HTTPS pública, la base D1 de pedidos, las credenciales del vendedor de prueba y el secreto de Webhooks ya están configurados. Una notificación del simulador pasó la validación de firma el 1 de octubre de 2026; la consulta posterior devolvió `404` porque su ID ficticio no corresponde a un pago. Faltan confirmar el catálogo y completar una compra de extremo a extremo en pruebas antes de activar cobros reales.
- Publicación en Cloudflare con dominio propio: https://carlyfitlab.com. `www.carlyfitlab.com` y la dirección provisional de Cloudflare redirigen al dominio principal, conservando ruta y parámetros. Los pagos y el acceso público con Google permanecen desactivados.

Consulta [ACTIVACION.md](ACTIVACION.md) para el registro detallado de comprobaciones y pendientes, y [ACTIVAR-GOOGLE.md](ACTIVAR-GOOGLE.md) para la configuración de Google.

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
node --test tests/commerce.test.mjs tests/checkout.test.mjs tests/webhook.test.mjs tests/members.test.mjs
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

El sitio está desplegado como el Worker `carlyfit-lab`. La base D1 `carlyfit-lab-orders` está conectada a `DB` y tiene aplicada la migración inicial. `wrangler.cloudflare.jsonc` conserva la configuración de publicación; la vista local mantiene su configuración independiente. GitHub Pages no ejecuta las rutas de servidor que usa esta tienda.

El 1 de octubre de 2026 se verificó que `https://carlyfitlab.com` responde correctamente y que `www` y la dirección anterior de Cloudflare devuelven una redirección permanente `308`. `SITE_URL` utiliza `https://carlyfitlab.com`. Supabase tiene guardados ese **Site URL** y el retorno exacto `https://carlyfitlab.com/auth/callback`; conserva también el retorno local para desarrollo.

Para actualizarlo desde una sesión autorizada de Cloudflare:

```sh
npm run deploy:cloudflare
```

Este comando compila con el modo `cloudflare` y despliega el archivo generado `dist/server/wrangler.json`. La compilación de publicación no copia las claves del `.env` local. Los secretos se configuran en el servidor mediante Cloudflare; los valores de seguridad mantienen los pagos desactivados. La conexión automática entre GitHub y Cloudflare no está configurada: subir un commit no publica por sí solo una versión nueva.

Cuando se activen Google o los pagos, actualizar también los indicadores explícitos de `wrangler.cloudflare.jsonc`: `keep_vars` no conserva un valor del panel que contradiga esos indicadores al desplegar.

Si se añaden migraciones, aplicarlas antes del despliegue con `npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc`.

Pendientes de activación:

1. Completar la configuración de marca y audiencia de Google, y probar registro, cierre y nuevo acceso en el dominio propio. El origen `https://carlyfitlab.com` ya está guardado y verificado en Google.
2. Configurar las notificaciones de Mercado Pago como se indica debajo.
3. Confirmar catálogo, precios, entrega, ingredientes, alérgenos, conservación y aviso de privacidad antes de habilitar compras y registro público.

## Webhooks de Mercado Pago

La URL del receptor es **`https://carlyfitlab.com/api/payments/webhook`**. La tienda ya responde por HTTPS. No uses la dirección del repositorio de GitHub, la dirección provisional ni `localhost`.

Verificado el 1 de octubre de 2026: URL de prueba guardada en Mercado Pago y evento **Pagos (legacy)** seleccionado; el simulador lo denomina **Pagos** y envía `type=payment`. La URL de producción permanece vacía. La firma del simulador se validó con el secreto del Worker; su ID `123456` produjo `404` al consultar la API, por lo que la respuesta al simulador fue `503` y no se acreditó ningún pago. La compra completa con comprador de prueba sigue pendiente.

En Mercado Pago Developers:

1. Abre **Tus integraciones**, selecciona la aplicación de Carlyfit Lab y entra en **Webhooks → Configurar notificaciones**.
2. Configura la URL del entorno de pruebas y selecciona **Pagos**, cuyo tema es `payment`, para esta integración de Checkout Pro con Preferencias.
3. Guarda la configuración y copia la firma secreta directamente a `MERCADOPAGO_WEBHOOK_SECRET` en el alojamiento, dentro del mismo entorno que el Access Token.

Los nombres y pasos del panel se basan en la [documentación oficial de Webhooks](https://www.mercadopago.com.mx/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks). La integración también envía esta ruta al crear cada preferencia.

El receptor funciona independientemente de `PAYMENTS_ENABLED` y `CATALOG_CONFIRMED`, para poder conciliar pagos existentes aunque se suspendan nuevas compras. Devuelve `503` mientras falte configuración o D1, y `401` para firmas inválidas. Los errores al consultar Mercado Pago conservan `503` para permitir reintentos; los registros incluyen únicamente la etiqueta del error y el estado HTTP, nunca el token ni el cuerpo de la respuesta. Un identificador inventado del simulador no equivale a un pago de prueba existente.

Después de configurar el entorno y confirmar el catálogo, habilitar las pruebas de checkout con `CATALOG_CONFIRMED=true`, `PAYMENTS_ENABLED=true` y `MERCADOPAGO_MODE=test`. Verificar pagos aprobados, pendientes y rechazados, y una notificación repetida, con comprador y vendedor de prueba distintos. No cambiar a `live` hasta completar esas comprobaciones y preparar las credenciales de producción.

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
