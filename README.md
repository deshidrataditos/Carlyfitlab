# Carlyfit Lab

Sitio de Carla Judith Fernández Arzate: entrenamiento, asesoría en nutrición deportiva y productos Carlyfit Lab. Incluye planes de 90 días, catálogo, carrito y pedidos por WhatsApp, además de comunidad con acceso mediante Google, testimonios moderados y promociones para miembros.

La atención es en línea y presencial en La Barca, Jalisco. Los productos pueden solicitarse por separado o junto con un plan; los envíos se cotizan antes de cobrar. Los precios y las imágenes de productos son provisionales.

## Estado de la integración

- El sitio y el carrito están implementados. Los pedidos por WhatsApp permiten solicitar recolección o cotización de envío.
- Supabase almacena cuentas, perfiles, testimonios y promociones. El acceso con Google se verificó en la vista local; debe configurarse y comprobarse de nuevo en la dirección pública.
- Checkout Pro de Mercado Pago y su receptor de notificaciones están implementados. Los cobros permanecen desactivados y el modo predeterminado es de prueba.
- La activación de pagos requiere una dirección HTTPS pública, la base D1 de pedidos, las credenciales del entorno y la firma de Webhooks. No se ha completado una compra de extremo a extremo.
- La dirección pública provisional y el dominio propio se definirán al publicar. Subir el código a GitHub no activa el alojamiento ni los pagos.

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
node --test tests/commerce.test.mjs tests/checkout.test.mjs tests/members.test.mjs
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

## Publicación provisional

El proyecto necesita un alojamiento compatible con Cloudflare Workers y D1, como el flujo de Sites preparado en `.openai/hosting.json`. GitHub Pages no ejecuta las rutas de servidor que usa esta tienda.

Para publicar, registrar o vincular el proyecto existente, compilar y desplegar el Worker, conectar el binding `DB` y aplicar la migración de pedidos. El identificador de D1 de la configuración local es un marcador; debe resolverse mediante el alojamiento. Mantener los cobros desactivados hasta completar la configuración y las pruebas.

Con la dirección pública confirmada:

1. Configurar las variables del servidor en el alojamiento y establecer `SITE_URL` con el origen HTTPS real.
2. Actualizar la Site URL de Supabase y permitir el retorno de la tienda en `/auth/callback`. Revisar la configuración de Google y probar registro, cierre y nuevo acceso en esa dirección.
3. Configurar las notificaciones de Mercado Pago como se indica debajo.
4. Confirmar catálogo, precios, entrega, ingredientes, alérgenos, conservación y aviso de privacidad antes de habilitar compras y registro público.

## Webhooks de Mercado Pago

El receptor de esta aplicación es **`/api/payments/webhook`**. La URL completa será la dirección HTTPS publicada de la tienda seguida de esa ruta. No uses la dirección del repositorio de GitHub ni `localhost`.

En Mercado Pago Developers:

1. Abre **Tus integraciones**, selecciona la aplicación de Carlyfit Lab y entra en **Webhooks → Configurar notificaciones**.
2. Configura la URL del entorno de pruebas y selecciona **Pagos**, cuyo tema es `payment`, para esta integración de Checkout Pro con Preferencias.
3. Guarda la configuración y copia la firma secreta directamente a `MERCADOPAGO_WEBHOOK_SECRET` en el alojamiento, dentro del mismo entorno que el Access Token.

Los nombres y pasos del panel se basan en la [documentación oficial de Webhooks](https://www.mercadopago.com.mx/developers/en/docs/checkout-pro-preferences/additional-content/notifications/webhooks). La integración también envía esta ruta al crear cada preferencia.

El receptor devuelve `503` mientras falte configuración o D1, y rechaza firmas inválidas. Después de configurar el entorno y confirmar el catálogo, habilitar las pruebas con `CATALOG_CONFIRMED=true`, `PAYMENTS_ENABLED=true` y `MERCADOPAGO_MODE=test`. Verificar pagos aprobados, pendientes y rechazados, y una notificación repetida, con comprador y vendedor de prueba distintos. No cambiar a `live` hasta completar esas comprobaciones y preparar las credenciales de producción.

El servidor valida la firma, consulta el pago en Mercado Pago y contrasta receptor, importe, moneda y modo antes de actualizar el pedido. Volver a la página de confirmación no acredita el cobro. Los productos físicos de esta primera integración se cobran para recolección; los envíos requieren cotización por WhatsApp.

## Archivos principales

| Ruta | Contenido |
| --- | --- |
| `app/storefront.tsx` y `app/globals.css` | Página y diseño |
| `lib/catalog.ts` | Productos, planes y precios del servidor |
| `public/images/` | Logo, fotografía y recursos de la tienda |
| `app/api/checkout/route.ts` | Creación de preferencias de pago |
| `app/api/payments/webhook/route.ts` | Recepción y conciliación de notificaciones |
| `supabase/` | Migración, políticas y administración de miembros |
| `drizzle/` | Migraciones de D1 |
| `tests/` | Comprobaciones de comercio, checkout y miembros |
