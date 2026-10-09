## Mercado Pago Integration Review

**Scope**: security — revisión local del alta de planes pagados, correo de instrucciones y confirmación administrativa de la ficha inicial.
**Fecha**: 2026-10-09.
**API detected**: Payments API, únicamente para consultar el pago confirmado; creación de preferencias de Checkout Pro. No se crean pagos de tarjeta ni órdenes mediante la API.
**Products detected**: Checkout Pro.
**Files analyzed**: `.gitignore`; `lib/payment.ts`; `lib/supabase-server.ts`; `lib/member-input.ts`; `lib/store-server.ts`; `lib/plan-onboarding.ts`; `lib/plan-email.ts`; `lib/plan-email-template.ts`; `app/api/checkout/route.ts`; `app/api/payments/webhook/route.ts`; `app/pedido/page.tsx`; rutas `app/api/store/{me,intake,material,admin}/route.ts`; `app/api/store/admin/intake/route.ts`; `app/member-store.tsx`; `app/store-admin.tsx`; `app/storefront.tsx`; `app/privacidad/page.tsx`; `drizzle/0006_plan_email.sql`; `drizzle/0007_plan_intake.sql`; `workers/store-worker.ts`; configuraciones `wrangler.cloudflare.jsonc` y `wrangler.testing.jsonc`; permisos de tienda en `supabase/migrations/202610080002_store_portal.sql`; pruebas de checkout, webhook, comercio, retorno, tienda, correo del plan y bienvenida.

### CRITICAL

- No se identificaron fallos críticos de seguridad en los cambios revisados.

### WARNINGS

- No se verificó una nueva compra completa ni la entrega de un correo real después del despliegue. Las pruebas automatizadas y de interfaz utilizaron datos de prueba; el HTML del correo se comprobó visualmente sin enviarlo.
- Se confirmó la presencia de `RESEND_API_KEY` y de los secretos existentes consultando únicamente sus nombres. Sus valores y la separación efectiva de credenciales desplegadas no se inspeccionaron; se verificaron las configuraciones locales y la comprobación del vendedor.

### PASS

- El servidor verifica la sesión con Supabase, exige una cuenta Google no anónima y un correo confirmado para comprar planes. El destinatario se obtiene de esa identidad y se guarda con el pedido; los campos enviados por el navegador no lo sustituyen: `app/api/checkout/route.ts:35`.
- El webhook comprueba firma, vendedor, identificador, importe y moneda con la respuesta de Mercado Pago. La cola consulta el estado aprobado persistido después de reconciliar el pago; el retorno del navegador no autoriza envíos: `app/api/payments/webhook/route.ts:8`, `lib/plan-email.ts:30`.
- Solo califican pedidos nuevos posteriores a la activación, vinculados con una cuenta, con un plan canónico y correo registrado al comprar. Invitados, productos sin plan y pedidos históricos quedan excluidos: `lib/plan-email.ts:30`.
- La cola guarda una única constancia por pedido, conserva el mismo destinatario y mensaje, toma una reserva atómica de envío y utiliza una clave de idempotencia estable. Reintenta durante un máximo de 23 horas desde el primer intento y elimina destinatario/contenido al terminar: `drizzle/0006_plan_email.sql:6`, `lib/plan-email.ts:75`, `lib/plan-email.ts:103`.
- Se comprueba de nuevo la aprobación antes de contactar al proveedor. Reembolsos, cancelaciones y contracargos cancelan los pendientes; los fallos del correo no revierten la confirmación del pago: `lib/plan-email.ts:53`, `lib/plan-email.ts:83`, `app/api/payments/webhook/route.ts:21`.
- La recepción de la ficha exige origen correcto, sesión verificada y permiso administrativo vigente. Actualiza solo un pedido aprobado y vinculado; revalida versión, propietario y artículos, con auditoría en la misma transacción: `app/api/store/admin/intake/route.ts:19`, `app/api/store/admin/intake/route.ts:33`.
- Cada miembro consulta únicamente sus pedidos. Su vista del pedido incluye el estado y fecha de recepción, sin el identificador de quien lo confirmó. El correo de compra para cotejo se expone solo al administrador: `app/api/store/me/route.ts:14`, `lib/store-server.ts:85`, `app/api/store/admin/route.ts:21`.
- Las respuestas clínicas permanecen en Google Forms. La tienda no importa respuestas ni considera que abrir el enlace confirme su recepción. La ruta administrativa rechaza campos de respuestas o de actor suministrados por el cliente: `app/api/store/admin/intake/route.ts:6`, `app/privacidad/page.tsx:52`.

### Quality Standards

Not requested for this scope.

No se invocaron `quality_checklist`, `quality_evaluation` ni `form_homologation`. No se atribuyen puntuaciones oficiales ni certificación de producción a esta revisión.

### Security checklist (cross-cutting)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Token de acceso en entorno; nunca integrado en el código | Pass | `lib/payment.ts:19`; búsqueda en código versionado y fuentes nuevas, excluyendo entornos y fixtures, sin token de acceso incrustado. |
| 2 | `.env` ignorado y `.env.example` permitido | Pass | `.gitignore:32`; se verificaron reglas y nombres versionados, sin leer valores de entorno. |
| 3 | Firma del webhook HMAC-SHA256 | Pass | `lib/payment.ts:39`, `app/api/payments/webhook/route.ts:8`; se verifican `x-signature`, `x-request-id` e ID del pago. |
| 4 | HTTPS en retorno y notificación | Pass | `lib/payment.ts:21`, `app/api/checkout/route.ts:52`; el origen configurado debe ser HTTPS. |
| 5 | Estado de pago comprobado en servidor tras el retorno | Pass | `app/pedido/page.tsx:7` lee la base; su aprobación procede de la consulta autoritativa del webhook en `app/api/payments/webhook/route.ts:12`. Los parámetros de retorno no aprueban el pedido. |
| 6 | Idempotencia en creación de pagos/órdenes | N/A | `app/api/checkout/route.ts:52` crea una preferencia de Checkout Pro, sin ejecutar un cargo. No existe POST de creación de pagos/órdenes que requiera esa cabecera. La idempotencia del correo se comprueba por separado. |
| 7 | Referencia externa en cada preferencia/orden | Pass | `app/api/checkout/route.ts:52` establece `external_reference` con el ID generado por el servidor. |
| 8 | Credenciales de prueba separadas de producción | Partial | Workers, bases y modos distintos en `wrangler.cloudflare.jsonc:3` y `wrangler.testing.jsonc:3`; `lib/payment.ts:33` comprueba vendedor y cuenta de prueba. Los secretos efectivamente desplegados no se inspeccionaron. |
| 9 | No usar `sandbox_init_point` | Pass | El código de ejecución usa exclusivamente `init_point`: `app/api/checkout/route.ts:52`. La única coincidencia de `sandbox_init_point` es un valor sintético sin uso en `tests/checkout.test.mjs:40`, que prueba que no se selecciona ese campo. |

### Recommendations

- Mantener la fecha de corte fija `2026-10-09T07:22:40Z` en producción y el correo de planes desactivado en testing. Seguir la guía `docs/PLAN-ONBOARDING.md` para operación y pausa.
- Conservar el cotejo humano entre correo de compra, referencia del pedido y respuesta del formulario. El correo escrito en Google Forms ayuda al cotejo; no sustituye la autorización administrativa ni la aprobación del pago.
- Cuando se compruebe una nueva compra y su correo real, registrar ese resultado sin guardar datos del cliente ni respuestas clínicas en este informe. Esta revisión no creó pagos ni envió mensajes reales.

**Summary**: Official quality: not requested. 7/9 security checks pass; uno no aplica a Checkout Pro y uno conserva verificación parcial de configuración desplegada. No se detectó una regresión de seguridad que bloquee los cambios locales.

---

## Implementation Report

### Verified

- [x] Identidad y correo de compra tomados de una sesión Google confirmada; compra de planes como invitado rechazada antes de crear la preferencia.
- [x] Aprobación obtenida de Mercado Pago en servidor; firma y correspondencia de pago verificadas; redirecciones y campos del cliente no habilitan instrucciones.
- [x] Correo por pedido con reserva atómica, payload estable, idempotencia, reintentos acotados y eliminación de datos personales de la cola al finalizar.
- [x] Recuperación programada de pedidos aprobados sin constancia de correo, acotada y con exclusión de invitados, pedidos anteriores y compras sin plan.
- [x] Confirmación de ficha restringida a administradores, aislada por pedido, con comprobación de concurrencia y auditoría transaccional sin respuestas clínicas.
- [x] Ejecuciones independientes de esta revisión: 25/25 pruebas de tienda y 38/38 pruebas de correo del plan, plantilla y regresión de bienvenida.
- [x] Validación integrada final informada por la tarea principal: 180/180 pruebas y TypeScript `--noEmit` aprobados. Lint de cambios sin errores nuevos; la página de privacidad conserva observaciones previas de reglas Next sobre enlaces HTML e imagen.
- [x] La tarea principal informó la corrección del formulario publicado: un solo correo de compra obligatorio, referencia de pedido obligatoria, aviso y consentimiento explícito obligatorio. Este revisor comprobó el enlace final compartido en el código; no inspeccionó respuestas de clientes.
- [x] Despliegue informado por la tarea principal: build Cloudflare aprobado; migraciones `0006` y `0007` aplicadas en D1 de producción; Worker `8316361a-d72e-4966-b7cb-6a28d08905aa` publicado en `carlyfitlab.com`.
- [x] Producción activa con `PLAN_EMAIL_ENABLED=true` y `PLAN_EMAIL_START_AT=2026-10-09T07:22:40Z`; testing conserva `false` y fecha vacía. La configuración final del repositorio coincide con estos valores.
- [x] Comprobaciones posteriores al despliegue informadas por la tarea principal: privacidad devuelve `200`; `/api/store/me` anónimo devuelve `401`; nombres de los secretos existentes, incluido `RESEND_API_KEY`, presentes sin leer sus valores.
- [x] Comprobaciones de producción adicionales informadas por la tarea principal: `d1_migrations` confirma `0006`/`0007`; `plan_emails` tiene cero constancias y `plan_email_recovery` un registro, evidencia de que la recuperación programada ya se inicializó. Solo se consultaron conteos, sin datos de clientes. El aviso publicado muestra el párrafo completo del correo de planes.
- [x] Validación visual informada por la tarea principal con datos de prueba locales: enlace del formulario correcto, confirmación administrativa y estado del miembro actualizados, vista de 390 px sin desbordamiento y acceso con Google exigido antes de pagar un plan. HTML del correo validado en escritorio y móvil sin envío real.

### Needs attention

- [ ] No se ha comprobado una nueva compra con entrega de correo real después del despliegue. No debe presentarse la validación con datos locales como esa comprobación.
- [ ] La separación real de secretos permanece fuera de la evidencia local: `wrangler.cloudflare.jsonc:28`, `wrangler.testing.jsonc:22`. No se deben interpretar los controles locales como inspección de los valores desplegados.

### Blockers (must fix before production)

- Ningún fallo de seguridad identificado en el código revisado. Compilación, migraciones, despliegue y activación completados según la tarea principal; la revisión no constituye certificación oficial de Mercado Pago.

### Next steps

1. Operar el flujo con `docs/PLAN-ONBOARDING.md`, conservando la fecha de corte, el cotejo manual de la ficha y el aislamiento entre entornos.
2. Registrar el resultado de una nueva compra y su correo real cuando se comprueben; esa validación todavía no se realizó.
3. Re-run the `mp-review` skill after fixes to confirm the report, si se modifican estos controles de seguridad.

### Resources used

- Local: codebase inspection + cross-cutting security floor; pruebas locales con límites externos simulados.
- Validación integrada, estado del formulario, despliegue y comprobaciones visuales/HTTP: resultados proporcionados por la tarea principal el 2026-10-09.
- Skill: `mp-review` v1.0.0.
- MCP: no utilizado; calidad oficial, evaluación de pagos y homologación fuera del alcance solicitado.

**Scores**: official quality: N/A, 7/9 security; 1 N/A y 1 parcial. **Verdict**: Partial — MCP checks not verified. Revisión local sin hallazgos bloqueantes; despliegue y activación completados. Nueva compra con correo real y valores de secretos no comprobados.
