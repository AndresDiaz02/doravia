# Progreso hacia venta responsable

## P0

| ID | Módulo | Problema | Estado | Evidencia / siguiente paso |
| --- | --- | --- | --- | --- |
| P0-01 | Secretos | Credenciales compartidas fuera del gestor de secretos | Bloqueado externo | Rotar en Plemsi, Bold, correo, DB, JWT y Sentry; revocar las anteriores. |
| P0-02 | Inventario | Stock operativo y kardex pueden divergir | En progreso | Nuevas entradas/salidas/ajustes, recepciones, ensambles y salidas por factura actualizan ambas representaciones en transacción. Falta conciliación histórica auditable y cobertura E2E. |
| P0-03 | Pagos/DIAN | Proveedor real no validado end-to-end | Bloqueado externo | Validar sandbox, firma, payload e idempotencia. |
| P0-04 | Release | Render no aplica migraciones automáticamente | Pendiente | Crear procedimiento/migración controlada y smoke test. |

## P1

| ID | Módulo | Problema | Estado |
| --- | --- | --- | --- |
| P1-01 | Seguridad | Alta de fundador debe fallar cerrada y limitar intentos | Corregido en código; requiere variable `FUNDADOR_PIN`. |
| P1-02 | API | Health no debe revelar detalles internos en producción | Corregido en código. |
| P1-03 | QA | No existen E2E de journeys críticos | Pendiente. |
| P1-04 | Onboarding | Entitlements y primer valor no están validados E2E | Pendiente. |
| P1-05 | Observabilidad | Falta correlation ID y runbook de incidentes | Pendiente. |

## P2

| ID | Módulo | Problema | Estado |
| --- | --- | --- | --- |
| P2-01 | UX | Empty states, ayuda y errores requieren auditoría consistente | Pendiente. |
| P2-02 | Performance | Bundles iniciales grandes | Pendiente. |
| P2-03 | Datos | Importadores con preview/mapping/validación | Pendiente. |
| P2-04 | Fundadores | Automatización de follow-up y renovaciones | Pendiente. |

## P3

- Offline POS, command palette, analítica avanzada y automatizaciones no esenciales.
