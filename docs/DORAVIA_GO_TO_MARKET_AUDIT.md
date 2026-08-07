# Auditoría go-to-market de Doravia

**Fecha:** 2026-08-07  
**Método:** revisión de código, esquemas, rutas, CI, configuración de despliegue y pruebas automatizadas. Una integración externa no se considera validada hasta probarse con el proveedor y una empresa de prueba.

## Resumen ejecutivo

Doravia tiene una base funcional amplia: ERP, facturación, POS, inventario, contabilidad, cartera, CRM de Fundadores, soporte y un módulo de nómina en acceso anticipado. La arquitectura multi-tenant, roles, límites de plan, cifrado de credenciales por tenant y pruebas unitarias son una base valiosa.

No está listo para venta comercial general. La recomendación actual es **DO NOT SELL** hasta cerrar los P0. Después, el objetivo realista es una **LIMITED BETA** con 3–5 empresas acompañadas, no un lanzamiento masivo.

## Scores iniciales

| Dimensión | Score | Evidencia resumida |
| --- | ---: | --- |
| Product readiness | 55 | Muchos módulos, pero flujos de extremo a extremo no probados. |
| Technical quality | 65 | Typecheck API, builds web/POS y 298 pruebas verdes; deuda en integración. |
| Security | 45 | Middleware y cifrado presentes; secretos expuestos requieren rotación externa. |
| UX | 58 | Interfaces completas; falta auditoría consistente de empty states, mobile y onboarding. |
| Reliability | 48 | Health check y cron existen; faltan E2E, reintentos trazables e incident response. |
| Performance | 52 | Bundles web/POS grandes; no hay medición de experiencia real. |
| Data integrity | 45 | Transacciones en flujos críticos; stock operativo y kardex pueden divergir. |
| Onboarding | 50 | Existe onboarding, pero debe demostrarse por entitlement y primer valor. |
| Sales readiness | 45 | Landing, CRM y propuestas existen; pago/proveedor y activación requieren validación. |
| Support readiness | 48 | Soporte, auditoría y Sentry presentes; faltan runbooks y contexto operacional. |
| Billing readiness | 40 | Abstracción de pagos y webhooks; firma/proveedor necesitan validación en ambiente real. |
| Scalability | 55 | PostgreSQL, índices y jobs básicos; sin prueba de carga ni cola para trabajo pesado. |
| Maintainability | 60 | Monorepo ordenado y CI; faltan E2E, migraciones automatizadas y límites de módulos. |
| Production readiness | 42 | Render/Neon y health presentes; no hay migración controlada ni smoke test de release. |

## Inventario de producto

| Área | Estado | Observación |
| --- | --- | --- |
| Landing, SEO y propuestas públicas | Funcional, incompleto | Landing y páginas de producto existen; lead capture directo a Fundadores no está comprobado. |
| Registro, login, recuperación y multiempresa | Funcional | JWT, refresh token y selección de empresa; falta prueba E2E y política de sesión documentada. |
| Usuarios, roles y permisos | Funcional | Roles y restricciones por ruta; requiere matriz endpoint/rol y pruebas cruzadas. |
| Empresas, planes y entitlements | Funcional, incompleto | Capa central de features; coexistencia de `plan_features` y fallback legado debe retirarse. |
| Clientes, productos y bodegas | Funcional | CRUD y búsquedas presentes; importación segura sigue pendiente. |
| Facturación y notas | Funcional, no validado externamente | Plemsi por tenant; contrato, idempotencia e historial de intentos pendientes. |
| POS, caja, fiados y devoluciones | Funcional | Recalcula importes en servidor; falta E2E real, offline recuperable y permisos finos. |
| Inventario y kardex | Riesgo de integridad | Dos representaciones de stock requieren reconciliación auditable. |
| Cartera, gastos, compras y proveedores | Funcional, incompleto | Operación base disponible; faltan importadores y conciliación de pagos completa. |
| Contabilidad y reportes | Funcional, incompleto | Asientos/reportes presentes; faltan invariantes contra PostgreSQL y reversos/cierres E2E. |
| Nómina | Acceso anticipado | Cálculo y UI; emisión real bloqueada. Requiere revisión legal y sandbox Plemsi. |
| Fundadores / CRM / cotizaciones | Funcional | Pipeline, actividades y propuestas públicas por token; falta automatización y prueba de cobro. |
| Pagos y suscripciones | No listo para venta | Webhooks protegidos parcialmente; confirmar firma, contrato y activación postpago. |
| IA | Experimental | Asesor y lectura de documentos; faltan límites de uso/costo por tenant. |
| Soporte, alertas y auditoría | Funcional, incompleto | Hay rutas y notificaciones; faltan playbooks, identificador de incidente y SLA decidido. |
| Observabilidad y despliegue | Funcional, incompleto | Sentry, health y CI; faltan migraciones, smoke tests y rollback documentado. |

## Journeys críticos

| Journey | Estado | Fricción / riesgo |
| --- | --- | --- |
| Prospecto → propuesta → pago → activación | Parcial | Pago y webhook requieren confirmación del proveedor; no hay E2E completo. |
| Primera factura | Parcial | UI y proveedor existen; falta prueba sandbox e idempotencia visible. |
| POS: abrir caja → vender → cerrar | Parcial | Server-side totals ya protegidos; falta prueba de operación real y recuperación offline. |
| Inventario: entrada → venta → kardex | Riesgo | Se debe resolver fuente de verdad antes de confiar en saldos. |
| ERP: venta → cartera → pago → reportes | Parcial | Requiere suite de integración con Postgres. |
| Nómina | Solo pruebas | Emisión electrónica intencionalmente bloqueada. |
| Administración y upsell | Parcial | Planes y Fundadores existen; activación y copy por entitlement requieren validación. |

## Hallazgos prioritarios

### P0 — bloqueadores de venta

1. **Rotación de secretos expuestos.** Las credenciales compartidas fuera del gestor de secretos se deben revocar y regenerar. `EXTERNAL_INTEGRATION_REQUIRED`.
2. **Inventario sin fuente única de verdad.** `productos.stock_actual` y kardex pueden diferir. No vender control de inventario como exacto hasta reconciliar y transaccionar todas las mutaciones.
3. **Pagos y documentos electrónicos sin prueba contractual real.** No promocionar automatización de cobro ni cumplimiento electrónico hasta validar firmas, payloads, idempotencia y sandbox de Bold/Plemsi.
4. **Release sin migración controlada ni pruebas E2E.** El comando de Render inicia API, pero no aplica migraciones. Un release puede quedar con código y esquema incompatibles.

### P1 — críticos para beta

- Matriz tenant/rol y pruebas de mutaciones cross-tenant.
- Historial de intentos, reintentos idempotentes y panel de error para Plemsi.
- E2E de registro, login, factura, POS, cierre, inventario y webhook.
- Onboarding guiado según módulos contratados y primer valor verificable.
- Alertas operativas: desfase stock, turno abierto, documento fallido, pago fallido.
- Runbook de release, migración, rollback y smoke test.

### P2 — alto impacto

- Importadores validados de clientes, productos, proveedores y saldos.
- Carga diferida por ruta para ERP y POS.
- Empty states accionables, copy de error consistente y ayuda contextual.
- Seguimiento automático de prospectos/propuestas sin actividad.

### P3 — después de primeras ventas

- Command palette, personalización avanzada de reportes, cola offline POS y analítica de producto completa.

## Decisiones requeridas

- `FOUNDER_DECISION_REQUIRED`: catálogo final, precios, límites, política de trial, criterios de beta y qué módulos se venden primero.
- `LEGAL_REVIEW_REQUIRED`: nómina electrónica, retención laboral/tributaria, conservación de datos y textos comerciales de cumplimiento DIAN.
- `EXTERNAL_INTEGRATION_REQUIRED`: rotación de secretos, configuración de firma de Bold, sandbox/contrato técnico de Plemsi, SPF/DKIM/DMARC y backups verificados.

## Recomendación de lanzamiento

**DO NOT SELL** de forma abierta todavía. Cerrar P0, completar los smoke tests y ejecutar una prueba de empresa ficticia. Después: **LIMITED BETA** con alcance explícito, soporte cercano y módulos no regulados o validados.
