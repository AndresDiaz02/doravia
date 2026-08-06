# Fundadores: arquitectura y plan de implementacion

## Estado del repositorio al inicio

Doravia es un monorepo `pnpm` con Express (`apps/api`), React/Vite (`apps/web`), POS y PostgreSQL/Drizzle (`packages/db`). El panel existente bajo `/fundador` ya esta protegido en backend por `requireFundador`, que valida el usuario autenticado contra `FUNDADOR_EMAILS`; no depende solo de ocultar una opcion de menu.

Existe un panel de administracion/marketing con metricas de tenants activos, renovaciones, riesgo, consumo DIAN, features de planes y un CRUD sencillo de `leads_doravia`. Ese lead es una bandeja de captacion minima, no un CRM: no tiene cuentas, contactos multiples, oportunidades, actividades ni conversion transaccional.

## Entidades y capacidades reutilizables

| Dominio | Reutilizar | Decisión |
| --- | --- | --- |
| Cliente activo | `tenants` | Es la fuente de verdad tras activacion; no se usa para un prospecto aun sin cuenta. |
| Usuarios propietarios | `users` | Referencia para owner, creador y responsable. No se crean identidades comerciales duplicadas. |
| Catalogo y precios base | `plans`, `plan_features` | Los planes permanecen como precio maestro. Un descuento/override solo vive en una cotizacion. |
| Cotizaciones operativas de un tenant | `cotizaciones`, `items_cotizacion` | Se conservan para el ERP del cliente. No son adecuadas para una propuesta pre-venta porque exigen tenant y cliente existentes. |
| Pagos | `pagos_cotizacion`, proveedores de pago | Se reaprovechan patrones de proveedor, firma e idempotencia; la venta de Doravia requiere una sesion de pago independiente. |
| Onboarding | `tenants.onboarding_completado` y rutas existentes | La activacion comercial debe crear/coordinar el onboarding, no duplicar el estado de la cuenta. |
| Auditoria y notificaciones | `audit_log`, `notifications`, `notification_queue` | Se usan para eventos sensibles y avisos internos. |
| Captacion existente | `leads_doravia` | Se mantiene como origen legado. La migracion a cuenta/contacto sera explicita y no destructiva. |

## Nuevos limites de dominio

Fundadores requiere datos que no pertenecen al tenant hasta que exista una venta. Se agregara el prefijo `sales_`:

- `sales_accounts`: prospecto, cliente activo, ex-cliente o partner; opcionalmente enlaza a `tenant_id` despues de la conversion.
- `sales_contacts`: varios contactos por cuenta, con roles de compra.
- `sales_opportunities`: pipeline, ACV, pronostico, discovery estructurado y responsable.
- `sales_activities`: llamadas, demos, tareas y seguimientos; generan la proxima actividad.
- `sales_timeline_events`: trazabilidad inmutable de cambios relevantes.

Las siguientes fases agregaran cotizaciones comerciales versionadas, lineas, tokens publicos, sesiones de pago, suscripciones, onboarding comercial y aprobaciones de descuento. No se deben reutilizar las cotizaciones del ERP para prospectos porque hacerlo obligaria a crear un tenant antes del pago.

## Autorizacion

V1 mantiene el acceso real actual de fundador. Los roles ampliados (`sales_admin`, `sales_rep`, `customer_success`, `onboarding`, `finance`, `revenue_ops`) se modelaran en una asignacion interna separada, no en los roles de clientes (`admin`, `contador`, `vendedor`, etc.). Mientras no haya equipo interno configurado, no se concedera acceso por defecto.

## Decisiones de arquitectura

1. Los importes se guardan en `numeric`, nunca como flotantes.
2. Las etapas se validan en backend y cada cambio genera timeline/auditoria.
3. Discovery se conserva como JSON estructurado versionable en la oportunidad; sus campos varian mas rapido que el nucleo CRM.
4. Los pagos y conversiones seran transaccionales e idempotentes. Ningun webhook activara un tenant dos veces.
5. Email, WhatsApp y pagos se implementaran detras de proveedores. Un enlace `wa.me` se registrara como accion iniciada, no como entrega confirmada.
6. La pagina publica de propuesta se construira con token aleatorio, revocable y sin exponer IDs internos.

## Fases

1. CRM seguro: cuentas, contactos, oportunidades, pipeline, discovery, actividades y timeline.
2. Catalogo comercial, cotizacion versionada, propuesta publica, PDF, email y enlace WhatsApp.
3. Sesion de pago, conversion atomica a tenant/suscripcion, entitlements y onboarding.
4. Revenue intelligence: dashboard, renovaciones, customer success, expansion, alertas e importacion/exportacion.

## Riesgos y bloqueos actuales

- `PRODUCT_DECISION_REQUIRED`: politicas de descuento, condiciones contractuales, catalogo de add-ons y reglas de cuotas.
- `EXTERNAL_INTEGRATION_REQUIRED`: proveedor de correo transaccional para propuestas y contrato de webhooks de pagos de suscripciones.
- Las credenciales compartidas previamente deben rotarse; nunca se reutilizaran en este modulo.
- Nomina electronica queda separada y bloqueada hasta recibir el contrato API/sandbox de Plemsi.
