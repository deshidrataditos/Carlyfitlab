# Revisión de Mercado Pago — 3 de octubre de 2026

## Resultado verificado

Checkout Pro de pruebas aprobó dos pagos de **149 MXN**. El vendedor y el comprador coincidieron con las cuentas de prueba previstas. La tienda los concilió después de enviar desde el simulador de Mercado Pago notificaciones firmadas con los identificadores reales de esos pagos: ambas respuestas fueron `200`, D1 guardó `approved` y la página del pedido mostró **Pago confirmado**. Esto verifica el receptor con pagos existentes; aún no demuestra la entrega automática de una compra nueva.

El Access Token de producción y el identificador de la cuenta de Carla ya están guardados, con autorización, como secretos del Worker `carlyfit-lab`. Cloudflare registra el cambio del token en la versión `52454320-22b2-4675-956d-7dfa9557fcca` y el del identificador en `e8152fb7-609b-44e9-934f-56f84e72824f`. No se incorporaron credenciales ni capturas al repositorio.

El 3 de octubre se envió desde el simulador una notificación `payment` con el identificador ficticio `123456` a `https://carlyfitlab.com/api/payments/webhook`. El registro del Worker mostró el POST y `payment_notification_unavailable 404`. Según el flujo de la ruta, la consulta del pago solo ocurre después de validar HMAC y comprobar mediante `/users/me` el identificador esperado del vendedor, país `MLM` y ausencia de la etiqueta `test_user` en modo `live`. Esta evidencia verifica por el flujo ejecutado la firma, el token y la identidad real configurados. El `404` es la respuesta de la consulta de un pago ficticio, no un pago aprobado ni una notificación procesada con `200`. No se modificó ningún pedido ni se realizó una compra real.

**Los cobros comerciales permanecen cerrados.** La configuración pública tiene `MERCADOPAGO_MODE=live`, `PAYMENTS_ENABLED=false` y `CATALOG_CONFIRMED=false`. Falta verificar una notificación automática de compra nueva.

## Correcciones y controles

- La actualización atómica guarda `date_last_updated` de Mercado Pago. Avisos antiguos o duplicados no reemplazan estados recientes; los reembolsos y contracargos posteriores siguen permitidos. Los pedidos migrados con fecha desconocida conservan los estados finales ante avisos previos.
- En los dos pagos de cuentas de prueba consultados, la API devolvió `live_mode=true`. No se asume que ese campo por sí solo distingue el entorno de Checkout Pro con APP_USR.
- Antes de crear una preferencia o conciliar un pago, el servidor consulta `/users/me`. Exige identificador de vendedor coincidente, país `MLM` y `tags` válidos. En modo `test` exige `test_user`; en modo `live` exige que no sea `test_user`. Cualquier error cierra la operación con `503`. Un modo distinto de `test` o `live` no produce configuración válida.
- En producción se exige además `live_mode=true` en el pago. En pruebas se admite cualquiera de sus dos valores booleanos únicamente después de verificar el vendedor de prueba.
- HMAC-SHA256 se comprueba antes de consultar cuentas, pagos o pedidos. No se acepta el estado recibido en el cuerpo del aviso ni en la URL de regreso.
- Se consulta el pago con autenticación y se comparan identificador, vendedor, importe, moneda MXN y referencia del pedido.
- Los precios se reconstruyen desde el catálogo del servidor y se validan las cantidades. Checkout no almacena tarjetas.
- Token y firma permanecen en secretos del servidor. El retorno y las notificaciones usan HTTPS; Checkout Pro utiliza `init_point`.
- Los avisos pueden procesarse aunque se desactive la creación de nuevos pagos. Los errores de consulta responden `503` para permitir reintentos y las firmas inválidas se rechazan con `401`.
- No se requiere `X-Idempotency-Key` para crear una preferencia: ese paso no ejecuta un cargo.

## Validación y publicación

Pasaron **26 pruebas** de comercio, checkout y webhook. Incluyen cuentas reales rechazadas en modo prueba, cuentas de prueba rechazadas en modo real, identidad/país/tags inválidos, errores de API sin escrituras, pagos de prueba con `live_mode=true`, pagos reales con `live_mode=false` rechazados, firmas inválidas y avisos duplicados o fuera de orden. Compilaron ambos destinos de Cloudflare. TypeScript volvió a pasar el 3 de octubre, sin emisión ni caché incremental.

La migración `0001_payment_update_timestamp.sql` está aplicada tanto a `carlyfit-lab-testing-orders` como a `carlyfit-lab-orders`. La versión de pruebas verificada es `a4aa2ebd-e8f0-47f7-b57b-3ff700b58e5c`. La versión pública actual es `be0e8bd1-ce74-46f6-b4c7-cd18feb55733`, publicada el 3 de octubre a las 12:58 UTC; respondió `200` y muestra Psy Cookie, Core Cookie y el paquete inicial del plan, con cobros cerrados.

## Pendiente para abrir cobros

1. Verificar la configuración y firma usadas por las notificaciones automáticas del vendedor de prueba y comprobar una compra nueva sin depender del simulador. La firma de la aplicación principal está validada con su simulador; no se presupone que ello demuestre la firma de la entrega automática del vendedor de prueba. Completar también los casos pendiente y rechazado en Checkout Pro.
2. Concretar con Carly el contenido y entrega del paquete inicial de postres. Los precios sugeridos se conservan por indicación del usuario.
3. Tras completar esas comprobaciones, habilitar `CATALOG_CONFIRMED=true` y `PAYMENTS_ENABLED=true` en el sitio público, que ya está en modo `live`. Verificar la conciliación del primer pago real autorizado. Conservar el Worker separado en modo `test` y con sus credenciales de prueba.

El catálogo publicado incluye Psy Cookie de chocolate con adaptógenos y semillas de cáñamo a **59 MXN por pieza** y Core Cookie de vainilla con centro firme de chocolate a **55 MXN por pieza**. La mermelada es de **300 g a 129 MXN sugeridos** y golden milk de **250 g a 189 MXN sugeridos**. Los planes conservan **1,490 / 2,490 / 2,990 MXN** como precios sugeridos. El último incluye un solo paquete inicial para probar los productos y elegir cuáles integrar a la alimentación; los postres adicionales se compran por separado. Los envíos requieren cotización previa por WhatsApp.

No se emitió una puntuación de calidad oficial ni se realizó homologación MCP. Las herramientas MCP de Mercado Pago no estaban disponibles; se utilizaron código, pruebas, API oficial y panel web. La revisión acredita los controles descritos, no una compra comercial completa ni la entrega automática pendiente.

## Fuentes

- [Mercado Pago: cuentas de prueba de Checkout Pro](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/test-accounts)
- [Mercado Pago: compras de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases)
- [Mercado Pago: notificaciones de pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/payment-notifications)
- [Consulta de usuarios y test_user](https://developers.mercadolibre.com.mx/consulta-usuarios)
- Skills locales `mp-review`, `mp-webhooks` y `mp-test-setup`. El valor `live_mode=true` se observó en los dos pagos consultados; no se presenta como garantía documental para todos los pagos de prueba.
