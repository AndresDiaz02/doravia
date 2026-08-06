# Auditoría maestra de Doravia

**Estado:** Fase 0–1 iniciada el 2026-08-06. Este documento registra evidencia del repositorio actual; no presume que una integración externa haya sido verificada solo porque exista código.

## Arquitectura encontrada

- Monorepo `pnpm`: `apps/api` (Express/TypeScript), `apps/web` (React/Vite), `apps/pos` y `packages/db` (Drizzle/PostgreSQL).
- El aislamiento principal usa `tenant_id`; `authenticate` obtiene el tenant desde el JWT y las rutas suelen filtrar por ese valor.
- Facturación electrónica usa Plemsi con credenciales por tenant cifradas. POS, inventario, cartera, contabilidad y nómina son módulos del mismo API y base de datos.
- Render ejecuta el API y Neon PostgreSQL es la base de datos prevista.

## Estado por área

| Área | Nivel | Evidencia / estado |
| --- | --- | --- |
| Seguridad de secretos | **CRÍTICO** | `.env.example` contenía claves de terceros. Se reemplazaron por placeholders; las claves históricas deben rotarse fuera del repositorio. |
| DevOps / CI | **MEDIO** | El API ejecuta typecheck real durante su build y CI valida API, ERP y POS. Frontend/POS aún deben normalizar su propia línea base de tipos. |
| Facturación electrónica | **ALTO** | El flujo Plemsi por tenant y bloqueo de `stub` en producción existen. Aún falta historial/idempotencia de intentos y validación externa de todos los payloads. |
| POS | **ALTO** | Hay ventas, turnos e inventario. La emisión del documento equivalente y su estado real requieren verificación contra Plemsi antes de comercializar cumplimiento DIAN. |
| Multi-tenancy / RBAC | **MEDIO** | JWT, middleware de plan y roles existen. Debe completarse una auditoría ruta por ruta, en particular mutaciones que validan ownership antes de actualizar o borrar. |
| Base de datos / integridad | **MEDIO** | Se usan `numeric(14,2)` en importes principales y transacción con lock para consecutivo de factura. Faltan constraints únicos por tenant, FK e índices en varias entidades; revisar progresivamente. |
| Contabilidad | **MEDIO** | Hay asientos y líneas; se requiere probar invariantes con base real, cierres y reversos en flujos financieros. |
| Nómina electrónica | **ALTO** | Cálculo, UI y documentos fueron recuperados. La retención simplificada y el endpoint de Plemsi no pueden habilitarse para nómina real sin revisión legal y sandbox del proveedor. |
| Frontend / UX | **MEDIO** | Hay pantallas completas, pero sin revisión sistemática de paginación, accesibilidad y manejo de errores. |
| Testing | **MEDIO** | Existen pruebas unitarias y de RBAC (298 verdes al inicio). No se observan E2E ni tests de integración con PostgreSQL. |

## Hallazgos priorizados

### CRÍTICO — secretos publicados en el archivo de ejemplo

- **Módulo:** `.env.example`.
- **Impacto / riesgo:** claves reutilizables de pagos y facturación pueden dar acceso a proveedores externos.
- **Acción aplicada:** se eliminaron los valores y se sustituyeron por placeholders; `DIAN_MODO` obsoleto se sustituyó por `DIAN_PROVEEDOR`.
- **Estado:** código corregido. **Requiere acción externa:** revocar/rotar las claves que hayan aparecido en Git, chats o archivos compartidos.

### CRÍTICO — webhooks de pagos sin autenticidad comprobada

- **Módulos:** `apps/api/src/routes/pagos-cotizacion.ts`, `apps/api/src/routes/bold.ts`.
- **Impacto / riesgo:** un actor externo podía notificar un pago sin firma si faltaba la configuración; el webhook de suscripciones no tenía verificación de firma implementada.
- **Acción aplicada:** pagos de cotizaciones fallan cerrados en producción si no existe `event_secret`; el webhook de suscripciones se bloquea en producción hasta confirmar e implementar la firma oficial.
- **Estado:** mitigado. `PROVIDER_CONFIRMATION_REQUIRED` para reactivar suscripciones automáticas de forma segura.

### ALTO — compilación del API es un falso positivo

- **Módulo:** `apps/api/package.json`, `render.yaml`.
- **Impacto / riesgo:** errores TypeScript podían llegar a producción porque el comando `build` solo imprimía `ok`.
- **Acción aplicada:** `build` ahora ejecuta `typecheck` con `tsc --noEmit`; se corrigieron los errores API que bloqueaban la línea base.
- **Estado:** corregido para API; CI creado. Typecheck de frontend/POS permanece pendiente.

### ALTO — typecheck sin línea base verde

- **Módulos:** `apps/api`, `apps/web`, `packages/db`.
- **Impacto / riesgo:** errores de tipos quedan ocultos por el build no operativo; no es seguro convertir `tsc` en un gate hasta reparar los problemas de configuración y tipos existentes.
- **Evidencia inicial:** importaciones `.ts` en paquetes compartidos sin una configuración de proyectos consistente, incompatibilidades de componentes UI y errores de tipos en rutas API.
- **Acción aplicada:** corregido el uso de `ipKeyGenerator` del rate limiter (`req.ip`, no el objeto Request).
- **Estado:** pendiente de una fase dedicada de TypeScript/CI.

### ALTO — documentos electrónicos sin contrato externo verificado

- **Módulos:** `apps/api/src/services/plemsi.service.ts`, `apps/api/src/services/factura.service.ts`, nómina.
- **Impacto / riesgo:** una respuesta asumida de Plemsi no prueba validez DIAN.
- **Acción recomendada:** adaptar a una interfaz de proveedor, persistir intentos/idempotency key/respuesta y probar el flujo en sandbox de Plemsi.
- **Estado:** pendiente de proveedor.

### ALTO — fallback de resolución ajena en notas electrónicas

- **Módulos:** `apps/api/src/routes/notas-credito.ts`, `apps/api/src/routes/notas-debito.ts`.
- **Impacto / riesgo:** una nota podía enviarse con un número de resolución fijo no asociado a la factura ni al tenant.
- **Acción aplicada:** se eliminó el fallback. Si no existe la resolución de la factura original, la nota queda con error trazable o el reenvío responde 422; no se llama a Plemsi.
- **Estado:** corregido; requiere prueba de integración de proveedor antes de producción.

### ALTO — nómina real no habilitable todavía

- **Módulos:** `apps/api/src/services/nomina/deducciones.ts`, `docs/NOMINA-DEUDA-TECNICA.md`.
- **Impacto / riesgo:** la retención simplificada no sustituye la tabla progresiva aplicable; endpoint de nómina Plemsi no está confirmado.
- **Acción recomendada:** mantener el banner de configuración, versionar reglas vigentes y exigir revisión de contador + prueba sandbox antes de habilitar emisión.
- **Estado:** `LEGAL_REVIEW_REQUIRED` y proveedor pendiente.

### MEDIO — aislamiento y borrado deben verificarse sistemáticamente

- **Módulos:** rutas API y esquemas.
- **Impacto / riesgo:** filtros de tenant omitidos en una mutación futura pueden causar IDOR; borrar documentos financieros puede romper trazabilidad.
- **Acción recomendada:** matriz de autorización por endpoint, helpers de ownership, soft-delete/anulación para documentos financieros y pruebas de tenant cruzado.
- **Estado:** en auditoría.

### MEDIO — mutaciones críticas sin filtro repetido de tenant

- **Módulos:** `apps/api/src/routes/nomina.ts`, `apps/api/src/routes/documentos-soporte.ts`.
- **Impacto / riesgo:** aunque el recurso se comprobaba previamente, un refactor futuro podía convertir una actualización o anulación en un IDOR.
- **Acción aplicada:** las mutaciones repiten el filtro `tenant_id`; la edición de empleado verifica también que el centro de costos pertenezca al tenant.
- **Estado:** corregido en los puntos identificados; auditoría ruta por ruta continúa.

### MEDIO — precisión y restricciones financieras incompletas

- **Módulos:** `facturas`, `pos`, `contabilidad`, servicios de cálculo.
- **Impacto / riesgo:** aunque la base usa `numeric`, algunos cálculos convierten a `number`; faltan constraints que impidan duplicados y asientos inválidos a nivel de BD.
- **Acción recomendada:** encapsular redondeo decimal, validar importes/estado y añadir constraints no destructivos con migraciones.
- **Estado:** pendiente de diseño y pruebas de regresión.

## Decisiones y bloqueos

- `LEGAL_REVIEW_REQUIRED`: retención laboral/tributaria, parámetros vigentes de nómina y reglas de conservación de datos personales.
- `PRODUCT_DECISION_REQUIRED`: POS se debe vender como documento electrónico únicamente después de la verificación de emisión del proveedor; de lo contrario debe presentarse como operación interna.
- `PROVIDER_CONFIRMATION_REQUIRED`: endpoint, payload, idempotencia y respuesta de nómina electrónica de Plemsi.

## Próximo orden seguro

1. Rotar secretos expuestos y completar el endurecimiento de configuración.
2. Convertir la compilación del API en una validación real y crear CI.
3. Auditar y cubrir con pruebas las mutaciones cross-tenant y las operaciones financieras críticas.
4. Diseñar historial/idempotencia de documentos electrónicos antes de ampliar funcionalidades fiscales.
5. Validar Plemsi y la normativa con las partes responsables antes de activar emisión real.
