# Carlyfit Lab — estado al 3 de octubre de 2026

## Sitio publicado

La tienda está publicada en **https://carlyfitlab.com**. La versión pública `9eb9f53d-e506-456e-8fc1-4751e7882a22`, publicada el 3 de octubre, respondió `200` y muestra los productos actualizados y el paquete inicial de postres. Los cobros y el acceso público con Google siguen desactivados.

- Página adaptable a celular y computadora, con fotografía de Carla Judith Fernández Arzate y presentación de su experiencia como chef y sus dos certificaciones WABBA México, según la información proporcionada.
- Atención en línea y presencial en La Barca, Jalisco; planes de 90 días para distintos objetivos y disciplinas deportivas.
- Carrito con cantidades, eliminación de artículos, subtotal y borrador guardado en el navegador. Pedidos mediante WhatsApp +52 1 443 358 0280, con recolección o cotización de envío.
- Comunidad conectada a Supabase, testimonios moderados y promociones para miembros. Sin reseñas ficticias. El acceso con Google se probó en la vista local, pero aún no está habilitado en el dominio público.

## Catálogo publicado

| Artículo | Precio MXN | Presentación / alcance |
| --- | --- | --- |
| Activa tu fuerza | $1,490 | Rutina de 90 días; precio sugerido |
| Tu balance completo | $2,490 | Entrenamiento de 90 días y alimentación; precio sugerido |
| El lado dulce del plan | $2,990 | Plan integral y un paquete inicial de postres; precio sugerido |
| Psy Cookie | $59 | Una pieza de chocolate con adaptógenos y semillas de cáñamo por encima |
| Core Cookie | $55 | Una pieza de vainilla con centro firme de chocolate |
| Mermelada sin azúcar | $129 | 300 g; precio sugerido |
| Golden milk | $189 | 250 g; precio sugerido |

Los importes sugeridos se conservan por indicación del usuario y se identifican en la página. Las imágenes de productos son ilustrativas. Psy Cookie sustituye a la galleta de alulosa.

El plan con postres incluye **un paquete inicial** para probar los productos y decidir con Carly cuáles integrar a la alimentación. Su contenido y entrega se acuerdan con Carly; no implica entregas recurrentes. Los postres adicionales se compran por separado. Falta concretar el contenido de ese paquete.

## Publicación y datos

| Recurso | Sitio público | Pruebas |
| --- | --- | --- |
| URL | `https://carlyfitlab.com` | `https://carlyfit-lab-testing.carlyfitlab.workers.dev` |
| Worker | `carlyfit-lab` | `carlyfit-lab-testing` |
| Configuración | `wrangler.cloudflare.jsonc` | `wrangler.testing.jsonc` |
| Base D1 | `carlyfit-lab-orders` | `carlyfit-lab-testing-orders` |
| `MERCADOPAGO_MODE` | `live` | `test` |
| `PAYMENTS_ENABLED` / `CATALOG_CONFIRMED` | `false` / `false` | `true` / `true` |
| `GOOGLE_AUTH_ENABLED` | `false` | `false` |

Las migraciones `0000` y `0001_payment_update_timestamp.sql` están aplicadas en ambas bases. Pruebas usa `SITE_TESTING=true`, muestra **ENTORNO DE PRUEBA — No se realizan cobros reales** y declara `noindex`, `nofollow` y `noarchive`. No tiene rutas al dominio comercial. La aprobación del catálogo en pruebas solo permite ensayos.

La versión de pruebas actual es `878f9110-6af1-49c6-bcb0-03df3a3cfb2e`, publicada el 3 de octubre. Se comprobó su respuesta `200`, el catálogo actualizado y el aviso de pruebas; el despliegue conservó la firma corregida del vendedor de prueba.

`www.carlyfitlab.com` y la dirección provisional de Cloudflare redirigen al dominio principal, conservando ruta y parámetros; sus respuestas `308` se verificaron el 1 de octubre. El código está en [GitHub](https://github.com/deshidrataditos/Carlyfitlab). Subir commits no publica automáticamente: no hay despliegue continuo configurado.

Los secretos permanecen en cada Worker, fuera del repositorio y de la compilación. Los indicadores explícitos del archivo correspondiente prevalecen sobre valores distintos guardados en el panel durante el siguiente despliegue, aunque se use `keep_vars`.

## Mercado Pago: comprobado y pendiente

### Configuración de producción

El usuario activó las credenciales de producción y autorizó guardar el Access Token y el identificador de Carla como secretos de **`carlyfit-lab`**. El registro de versiones de Cloudflare confirma el guardado:

| Cambio | Versión registrada |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` de producción | `52454320-22b2-4675-956d-7dfa9557fcca` |
| `MERCADOPAGO_COLLECTOR_ID` de Carla | `e8152fb7-609b-44e9-934f-56f84e72824f` |

El 3 de octubre el simulador de Mercado Pago envió una notificación `payment` con `data.id=123456` al receptor público. El registro del Worker mostró el POST y `payment_notification_unavailable 404`. La ruta solo consulta el pago después de validar HMAC y de comprobar con `/users/me` el identificador de vendedor esperado, país `MLM` y ausencia de la etiqueta `test_user` en modo `live`. Por ese flujo ejecutado, la comprobación acredita la firma, el token y la identidad real configurados. El `404` corresponde al pago ficticio; no se obtuvo una respuesta de pago aprobado, no se modificó ningún pedido y no se realizó una compra real.

El modo público es `live`, pero `PAYMENTS_ENABLED=false` y `CATALOG_CONFIRMED=false` mantienen cerrados los cobros. La compra de prueba aprobada, su confirmación automática y el carrito actualizado se verificaron el 3 de octubre; aún no se ha realizado un cargo real.

### Compras de prueba

El 2 de octubre el usuario completó dos compras de **149 MXN** con la cuenta de comprador de prueba. La API confirmó ambas como `approved/accredited`, con comprador y vendedor esperados. Después se enviaron desde el simulador notificaciones firmadas con los identificadores reales de esos pagos. El receptor respondió `200`, D1 guardó `approved` y la página del pedido mostró **Pago confirmado**. No se modificó manualmente el estado de los pedidos.

Esa evidencia inicial acreditó el receptor con pagos existentes. El 3 de octubre, después de corregir firma y carrito, el usuario completó nuevas compras de Psy Cookie de 59 MXN. Mercado Pago mostró la operación `181274204659` aprobada a las 17:58 del panel. La página del pedido nuevo `eb88939c-ebdf-4772-9691-0104ff3ec607` mostró Pago confirmado tras consultar D1; el carrito quedó en cero en ambas pestañas de la tienda. No se usó el simulador ni se modificó D1 durante esa compra: quedó verificado el recorrido automático. El código HTTP de ese aviso no se capturó en el historial de Mercado Pago.

El carrito vincula cada intento con el identificador de pedido del servidor. Solo una aprobación consultada en D1 retira las cantidades pagadas; conserva artículos añadidos después y no repite la eliminación al abrir un pedido antiguo. Los carritos anteriores conservan sus artículos sin asociarlos automáticamente a pagos históricos. Los cuatro intentos previos guardados sin `payment_id` no equivalen a pagos pendientes en Mercado Pago.

En los dos pagos aprobados la API devolvió `live_mode=true` aunque el vendedor tenía la etiqueta `test_user`. Por ello, el servidor consulta `/users/me` y comprueba identificador, país y tipo de cuenta antes de crear preferencias o conciliar pagos. En producción exige además `live_mode=true`. La actualización atómica compara `date_last_updated` para impedir que avisos antiguos o duplicados sobrescriban estados posteriores; permite reembolsos y contracargos más recientes.

Pasaron **35 pruebas automatizadas** de comercio, checkout, webhooks, carrito y retorno, además de las compilaciones de ambos destinos en la validación de la corrección de pagos. TypeScript volvió a pasar el 3 de octubre. La corrección inicial se verificó en `a4aa2ebd-e8f0-47f7-b57b-3ff700b58e5c`; la versión de pruebas actual es `878f9110-6af1-49c6-bcb0-03df3a3cfb2e`. La compra nueva con confirmación automática y carrito vacío se verificó después, como se describe arriba.

### Notificaciones

| Aplicación / campo en Mercado Pago | URL guardada |
| --- | --- |
| Aplicación real `7979217160634504`, modo Prueba | `https://carlyfit-lab-testing.carlyfitlab.workers.dev/api/payments/webhook` |
| Aplicación real `7979217160634504`, modo Productivo | `https://carlyfitlab.com/api/payments/webhook` |
| Aplicación del vendedor de prueba `1228080888276164`, modos Prueba y Productivo | `https://carlyfit-lab-testing.carlyfitlab.workers.dev/api/payments/webhook` |

El receptor procesa el tema `payment`, denominado **Pagos (legacy)** en la configuración y **Pagos** en el simulador. El 3 de octubre se identificó la causa del fallo automático en el historial del vendedor de prueba: las notificaciones `payment.created` de los pagos `181981714212` y `180975532205` habían recibido `401`. El Worker de pruebas tenía guardada la firma de la aplicación real.

Se guardó la firma de la aplicación del vendedor de prueba `1228080888276164` en el secreto existente `MERCADOPAGO_WEBHOOK_SECRET` de `carlyfit-lab-testing`. La firma real permanece en `carlyfit-lab`. También se corrigió el modo Productivo de la aplicación de prueba: apuntaba al dominio comercial y ahora apunta al receptor de pruebas, igual que su modo Prueba. Los pagos consultados de estas cuentas de prueba aparecen en el filtro Productivo del panel.

Tras guardar la configuración, el simulador de la aplicación del vendedor de prueba reenvió el pago `180975532205` y mostró **«200 OK»**. Esto confirmó la firma correcta. No se verificó de nuevo el estado de ese tercer pedido en D1; la compra automática de 59 MXN descrita arriba es una comprobación posterior independiente. Los avisos de prueba deben proceder de la aplicación del vendedor de prueba, cuya firma es distinta de la aplicación real.

El receptor verifica HMAC-SHA256 antes de consultar el pago y contrasta identificador, vendedor, referencia del pedido, importe, MXN y modo. Los importes proceden del catálogo del servidor. El retorno del navegador no acredita un cobro. El receptor puede conciliar pagos existentes aunque se desactive la creación de compras nuevas. Los errores de consulta responden `503` para permitir reintentos; las firmas inválidas se rechazan con `401`.

### Pasos para habilitar cobros

1. La compra aprobada automática y su carrito ya están verificados. Quedan los recorridos completos pendiente/rechazado en la interfaz de Checkout Pro; esos estados están cubiertos por las pruebas automatizadas del servidor y carrito.
2. Concretar con Carly el contenido y entrega del paquete inicial. Los cuatro productos y sus presentaciones ya están definidos; los precios sugeridos se conservan como indicó el usuario.
3. Cuando esas verificaciones estén completas, habilitar `CATALOG_CONFIRMED=true` y `PAYMENTS_ENABLED=true` en `wrangler.cloudflare.jsonc`, conservar `MERCADOPAGO_MODE=live` y publicar. Comprobar el primer pago real autorizado mediante su conciliación, no solo por el retorno al sitio.

Los productos físicos se cobran para recolección en esta integración. Los envíos requieren cotización previa por WhatsApp. Las pruebas de compra se realizan únicamente en el Worker separado con comprador y vendedor de prueba distintos.

## Registro con Google, testimonios y promociones

Implementado con Supabase Auth y Postgres del proyecto Carlyfit lab. La migración de miembros ya está aplicada; no repetirla en esa base. El usuario guardó el secreto OAuth de Google directamente en Supabase. El cliente usa `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`; no necesita `service_role` ni contraseña de la base en el navegador.

Supabase tiene guardados **Site URL** `https://carlyfitlab.com`, el retorno `https://carlyfitlab.com/auth/callback` y el retorno local `http://localhost:5173/auth/callback`. Los orígenes JavaScript local y público se verificaron en Google el 1 de octubre. El retorno de Google a Supabase no cambia.

El acceso real desde la vista local se verificó el 29 de septiembre: creación del usuario y perfil, sesión tras recargar, cierre y nuevo inicio, persistencia de nombre y preferencias y reseña del usuario en revisión. El asistente no envió ni aprobó testimonios ni cambió el consentimiento de comunicaciones.

La identidad se verifica en el servidor; las cookies de sesión son HttpOnly. Los perfiles solo permiten modificar nombre y consentimiento. Los testimonios se crean pendientes y el listado público no revela correos. Las promociones requieren sesión verificada y fechas vigentes.

Pendiente: completar la información de marca y audiencia de Google, el aviso de privacidad y la prueba de registro, cierre y nuevo acceso en el dominio propio. `GOOGLE_AUTH_ENABLED=false` sigue en el sitio público. Detalles en [ACTIVAR-GOOGLE.md](ACTIVAR-GOOGLE.md).

Administración en Supabase: **Authentication → Users** muestra registros y **Table Editor → profiles** muestra perfiles. Los testimonios se moderan en `testimonials` y las promociones se administran en `promotions`. La página no incluye un panel administrativo.

## Comandos de mantenimiento

Comprobaciones locales:

```sh
node --test tests/cart-state.test.mjs tests/order-return.test.mjs tests/commerce.test.mjs tests/checkout.test.mjs tests/webhook.test.mjs tests/members.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Publicación de pruebas desde una sesión autorizada de Cloudflare:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.testing.jsonc
npm run deploy:testing
```

Publicación comercial:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.cloudflare.jsonc
npm run deploy:cloudflare
```

Cada comando de despliegue compila con su modo y publica `dist/server/wrangler.json`. Ese archivo se reemplaza en cada compilación; no reutilizar una compilación de otro destino. La compilación de Cloudflare no incorpora las claves del `.env` local.

El catálogo está en `lib/catalog.ts`, la página en `app/storefront.tsx`, el diseño en `app/globals.css` y las imágenes en `public/images`. Los originales generados y el manifiesto de prompts se conservan en `../carlyfit-assets`.

Consulta [README.md](README.md) para ejecutar la vista local e [INFORME-MERCADOPAGO.md](INFORME-MERCADOPAGO.md) para los controles y límites de la validación de pagos.
