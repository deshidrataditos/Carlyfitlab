# Revisión de Mercado Pago — 3 de octubre de 2026

## Resultado verificado

Después de la corrección del carrito, el usuario completó nuevas compras de prueba el 3 de octubre y confirmó su resultado. Se observó en Mercado Pago una Psy Cookie de **59 MXN**, operación `181274204659`, aprobada a las 17:58 del panel. Una carga nueva de `/pedido?order=eb88939c-ebdf-4772-9691-0104ff3ec607` mostró **Pago confirmado**, dato que la página consulta en D1. El carrito mostró **0 artículos**, también en otra pestaña abierta. Durante esta compra no se utilizó el simulador ni se modificó manualmente D1: la confirmación persistida acredita el recorrido automático del receptor. No se capturó el código HTTP de esa entrega en el historial de Mercado Pago.

Como antecedente, Checkout Pro de pruebas aprobó dos pagos de **149 MXN**. El vendedor y el comprador coincidieron con las cuentas de prueba previstas. La tienda los concilió después de enviar desde el simulador de Mercado Pago notificaciones firmadas con los identificadores reales de esos pagos: ambas respuestas fueron `200`, D1 guardó `approved` y la página del pedido mostró **Pago confirmado**. Esa evidencia inicial solo verificaba el receptor con pagos existentes.

El 3 de octubre se diagnosticó y corrigió el rechazo de las notificaciones automáticas del vendedor de prueba. Su historial registraba `401` para `payment.created` de los pagos `181981714212` y `180975532205`. El Worker de pruebas tenía la firma de la aplicación real. Se reemplazó por la firma de la aplicación del vendedor de prueba `1228080888276164` en el secreto existente `MERCADOPAGO_WEBHOOK_SECRET`; la firma real permanece en el Worker público. También se corrigió la URL del modo Productivo de la aplicación de prueba para que apunte a `https://carlyfit-lab-testing.carlyfitlab.workers.dev/api/payments/webhook`, igual que su modo Prueba.

El simulador de esa aplicación de prueba reenvió después el pago `180975532205` y mostró **`200 OK`**. Se verificó la aceptación del aviso con la firma correcta, pero no se volvió a verificar el estado de ese tercer pedido en D1. La compra nueva y la confirmación automática descritas arriba son una comprobación posterior e independiente de este reenvío.

El Access Token de producción y el identificador de la cuenta de Carla ya están guardados, con autorización, como secretos del Worker `carlyfit-lab`. Cloudflare registra el cambio del token en la versión `52454320-22b2-4675-956d-7dfa9557fcca` y el del identificador en `e8152fb7-609b-44e9-934f-56f84e72824f`. No se incorporaron credenciales ni capturas al repositorio.

El 3 de octubre se envió desde el simulador una notificación `payment` con el identificador ficticio `123456` a `https://carlyfitlab.com/api/payments/webhook`. El registro del Worker mostró el POST y `payment_notification_unavailable 404`. Según el flujo de la ruta, la consulta del pago solo ocurre después de validar HMAC y comprobar mediante `/users/me` el identificador esperado del vendedor, país `MLM` y ausencia de la etiqueta `test_user` en modo `live`. Esta evidencia verifica por el flujo ejecutado la firma, el token y la identidad real configurados. El `404` es la respuesta de la consulta de un pago ficticio, no un pago aprobado ni una notificación procesada con `200`. No se modificó ningún pedido ni se realizó una compra real.

**La activación de cobros comerciales está autorizada.** La configuración de esta activación tiene `MERCADOPAGO_MODE=live`, `PAYMENTS_ENABLED=true` y `CATALOG_CONFIRMED=true`; la publicación está confirmada en Cloudflare. La compra aprobada de prueba y su carrito ya se verificaron; no se ha realizado un cargo real.

## Correcciones y controles

- El carrito registra los artículos asociados a cada intento antes de crear el enlace de pago y lo vincula al identificador de pedido devuelto por el servidor. Solo la aprobación consultada en D1 monta la conciliación del carrito. Retira las cantidades pagadas una sola vez, conserva artículos añadidos después y sincroniza las pestañas abiertas. Un pedido antiguo sin vínculo local no vacía una selección nueva. Los carritos anteriores migran conservando sus artículos, sin inventar una asociación con pagos históricos.

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

La activación pública quedó publicada en `83eeda74-88cb-4dae-8fa3-1844f70c3266`: Cloudflare confirmó modo `live`, ambos indicadores `true`, secretos conservados y base de producción. El sitio respondió `200`; la página, el carrito y el resumen para WhatsApp muestran el paquete de cinco piezas y la preparación al inicio del plan. La versión de pruebas `ae8f11b8-a372-4060-8a1c-22512f0067fd` conserva modo `test` y su base independiente. El primer cobro real no se ejecutó. Una comprobación POST al checkout público fue bloqueada por la revisión automática antes de ejecutarse; se verificó la publicación mediante lecturas y la configuración desplegada.

Pasaron **35 pruebas** de comercio, checkout, webhook, carrito y página de retorno. Incluyen cuentas reales rechazadas en modo prueba, cuentas de prueba rechazadas en modo real, identidad/país/tags inválidos, errores de API sin escrituras, firmas inválidas, avisos fuera de orden, conservación de nuevas selecciones y rechazo de un estado aprobado inventado en los parámetros de regreso. Compilaron ambos destinos de Cloudflare y pasó TypeScript sin emisión ni caché incremental.

La migración `0001_payment_update_timestamp.sql` está aplicada en ambas bases. Las versiones anteriores a la activación, con la corrección del carrito y publicadas el 3 de octubre, fueron `878f9110-6af1-49c6-bcb0-03df3a3cfb2e` en pruebas y `9eb9f53d-e506-456e-8fc1-4751e7882a22` en el sitio público. Ambas respondieron `200` y sirvieron el catálogo y el código actualizado. Se conservaron los secretos, la separación de bases y, en ese momento, los cobros públicos cerrados.

## Activación autorizada y seguimiento

1. Activación autorizada publicada y verificada con `CATALOG_CONFIRMED=true` y `PAYMENTS_ENABLED=true`, conservando el sitio público en modo `live`. La compra aprobada y su confirmación automática ya se verificaron; el usuario confirmó el paquete y los precios temporales de cobro.
2. Verificar la conciliación del primer pago real cuando se realice. Conservar el Worker separado en modo `test` y con sus credenciales de prueba.
3. Como comprobación adicional, realizar los recorridos pendiente/rechazado en la interfaz de Checkout Pro. Ya están cubiertos por pruebas automatizadas y no bloquean esta activación. El acceso público con Google permanece apagado; es independiente de los pagos y no se requiere registro para comprar.

El catálogo incluye Psy Cookie de chocolate con adaptógenos y semillas de cáñamo a **59 MXN por pieza** y Core Cookie de vainilla con centro firme de chocolate a **55 MXN por pieza**. La mermelada es de **300 g a 129 MXN sugeridos** y golden milk de **250 g a 189 MXN sugeridos**. Los planes conservan **1,490 / 2,490 / 2,990 MXN** como precios sugeridos, autorizados por el usuario como importes vigentes para cobrar en línea. El último incluye **un paquete inicial de cinco piezas en total, a elegir entre los productos**, para probarlos y elegir cuáles integrar a la alimentación. El tiempo de preparación se acuerda con Carly al comenzar el plan; los postres adicionales se compran por separado. El total del carrito es el importe de productos y planes que se cobrará. Los envíos requieren cotización previa por WhatsApp.

No se emitió una puntuación de calidad oficial ni se realizó homologación MCP. Las herramientas MCP de Mercado Pago no estaban disponibles; se utilizaron código, pruebas, API oficial y panel web. La revisión acredita los controles y la compra de prueba descritos, no una compra comercial real.

## Revisión local para la activación

- **Verificado:** catálogo del servidor, validación de vendedor real, HTTPS, firma HMAC, consulta autenticada de pagos, comparación de importe/moneda/referencia y actualización persistida protegida contra avisos duplicados o antiguos. El carrito solo descuenta cantidades tras una aprobación confirmada.
- **Alcance acordado:** paquete de cinco piezas a elegir, preparación acordada al inicio del plan y precios temporales autorizados para cobrar. Los envíos conservan la cotización previa al pago.
- **Bloqueos técnicos encontrados:** ninguno adicional en la revisión local. Los textos de la tienda deben reflejar los cobros activados y el importe que se cobrará; su actualización forma parte de esta publicación.
- **Por verificar:** publicación de la activación y conciliación del primer pago real cuando ocurra. La revisión no emite certificación, homologación ni puntuación oficial de Mercado Pago.

## Fuentes

- [Mercado Pago: cuentas de prueba de Checkout Pro](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/test-accounts)
- [Mercado Pago: compras de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases)
- [Mercado Pago: notificaciones de pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/payment-notifications)
- [Consulta de usuarios y test_user](https://developers.mercadolibre.com.mx/consulta-usuarios)
- Skills locales `mp-review`, `mp-webhooks` y `mp-test-setup`. El valor `live_mode=true` se observó en los dos pagos consultados; no se presenta como garantía documental para todos los pagos de prueba.
