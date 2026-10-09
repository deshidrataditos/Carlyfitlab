# Planes pagados: ficha inicial y correo

El flujo está activo en [Carlyfit Lab](https://carlyfitlab.com/) desde `2026-10-09T07:22:40Z`. Para comprar un plan en línea, la persona inicia sesión con Google. Cuando Mercado Pago confirma el pago, recibe las instrucciones en el correo confirmado que quedó registrado al comprar. Cada pedido nuevo de un plan tiene su propia ficha y su propio correo.

## Para Carly

1. Revisa las respuestas en Google Forms. El formulario vigente es [Ficha inicial del plan de 90 días](https://docs.google.com/forms/d/e/1FAIpQLSe8R-2yU10L_5zJBHjDpXgMyGCO-_IliGGPNmdGFnoQyuIpuw/viewform). Incluye correo de compra, número de pedido, aviso y consentimiento obligatorio.
2. Entra con tu cuenta autorizada en [Mi cuenta](https://carlyfitlab.com/?account=1#comunidad). Abre **Administrar tienda y planes → Pedidos y planes** y localiza el pedido con pago aprobado.
3. En **Ficha inicial privada**, coteja el número completo del pedido y el **Correo registrado al comprar el plan** con la respuesta del formulario. Usa este correo de compra aunque el correo actual de la cuenta haya cambiado. Si hay una diferencia, aclárala con la persona antes de confirmar.
4. Después de revisar la respuesta, pulsa **Confirmar ficha recibida**. El miembro verá **Ficha recibida** y la fecha en **Mi plan**. Si te equivocas, usa **Corregir: marcar pendiente**; ambas acciones conservan un registro administrativo.
5. Prepara y publica los materiales mediante las herramientas habituales del pedido. Confirmar la recepción de la ficha no publica materiales ni significa que el plan esté listo.

Abrir o enviar el formulario no cambia automáticamente el estado de la ficha. Las respuestas clínicas permanecen en Google Forms: no las copies en notas del pedido, correos ni mensajes al asistente. Cada nuevo pedido requiere una ficha nueva; la confirmación pertenece a ese pedido.

## Para quien opera el sitio

| Ajuste | Producción | Testing |
|---|---|---|
| `PLAN_EMAIL_ENABLED` | `true` | `false` |
| `PLAN_EMAIL_START_AT` | `2026-10-09T07:22:40Z` | Vacío |
| Migraciones | `0006_plan_email.sql` y `0007_plan_intake.sql` aplicadas | Verificar antes de cualquier activación futura |

**No alteres la fecha de corte durante despliegues o reactivaciones.** Se compara con la fecha de creación del pedido y excluye compras anteriores. No se rellenan destinatarios de pedidos históricos. La versión publicada el 9 de octubre de 2026 es `8316361a-d72e-4966-b7cb-6a28d08905aa`.

La cola usa el `RESEND_API_KEY` ya configurado en el Worker. El remitente es **Carlyfit Lab <hola@correo.carlyfitlab.com>** y las respuestas llegan a **carlyfit.lab@gmail.com**. El correo de planes es un mensaje de servicio y no modifica preferencias de promociones.

### Recuperación y reintentos

- El webhook intenta iniciar el envío después de guardar el pago aprobado. Una tarea programada cada cinco minutos recupera pedidos elegibles que hayan quedado sin correo y procesa hasta cinco envíos de planes por ejecución.
- La recuperación examina hasta 25 candidatos por ejecución y continúa en las siguientes si hay más. Con cola acumulada, la entrega puede necesitar varios ciclos.
- Cada pedido conserva una única constancia de correo. Todos sus reintentos utilizan el mismo mensaje y clave de idempotencia, incluso después de un despliegue. No borres esa constancia para forzar un reenvío.
- Hay un máximo de ocho intentos y una ventana de 23 horas desde el primero. Las esperas previstas son de 1, 5 y 15 minutos, y 1, 3, 6 y 12 horas; un límite del proveedor puede ampliar la espera. Los pendientes sin ningún intento caducan después de siete días.
- Un pedido pendiente o rechazado espera una aprobación posterior. Un reembolso, cancelación o contracargo cancela el correo aún pendiente. Los correos ya aceptados por el proveedor no se pueden retirar.
- Al finalizar, fallar definitivamente o caducar, se eliminan el destinatario y el mensaje de la cola; permanece la constancia para evitar duplicados. `sent` indica que el proveedor aceptó el correo, no que la persona lo abrió.

Si falta un correo, verifica el pago aprobado, la fecha del pedido, que contenga un plan y esté vinculado con una cuenta, y que tenga correo de compra. Revisa después el estado de `plan_emails` y los errores del proveedor sin copiar direcciones, mensajes ni datos clínicos a registros compartidos. Un estado final `failed`, `expired` o `cancelled` requiere revisión manual; no se reactiva solo. La persona también puede abrir el formulario desde **Mi cuenta → Mi plan**.

### Pausar los correos

Establece `PLAN_EMAIL_ENABLED=false` en el Worker de producción y conserva `PLAN_EMAIL_START_AT` sin cambios. Actualiza también la configuración de despliegue para que una publicación posterior no deshaga la pausa. Esto detiene nuevos inicios de envío; un envío ya en curso puede terminar. Los pagos, la cuenta y la confirmación manual de fichas siguen disponibles, y la tarea programada mantiene la limpieza de pendientes vencidos.

Para reanudar, restaura `PLAN_EMAIL_ENABLED=true` con la misma fecha de corte. No hace falta recrear la cola ni borrar sus constancias; los pedidos elegibles sin constancia podrán recuperarse en los siguientes ciclos.

## Alcance de la comprobación

Se aprobaron 180 pruebas, TypeScript y el build de Cloudflare; se aplicaron las migraciones y se publicó el Worker. También se comprobaron acceso anónimo denegado, privacidad pública, interfaz con datos locales y HTML del correo en escritorio y móvil. Una consulta de conteos confirmó que la recuperación programada ya se inicializó: un registro de recuperación y cero constancias de correo al comprobarlo. **Todavía no se verificó una compra nueva con entrega de un correo real.** Solo se consultaron los nombres de los secretos, sin inspeccionar sus valores. Consulta el detalle en [PLAN-ONBOARDING-REVIEW.md](PLAN-ONBOARDING-REVIEW.md).
