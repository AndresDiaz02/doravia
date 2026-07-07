# REPORTE QA End-to-End — Simulación 11 Empresas Doravia

> Ejecutado: 2026-07-06
> Ambiente: local — `postgresql://postgres:postgres@localhost:5432/doravia`
> DIAN: `DIAN_MODO=pruebas_stub` (stub provider, nunca DIAN real)
> API: `http://localhost:3001`

---

## Estado verificado en BD antes de redactar este reporte

| Métrica | Valor en DB |
|---|---|
| Tenants simulados (NIT 800200xxx) | 10 de 11 (E7 ausente — nunca se registró) |
| Facturas totales simulación | 10 |
| Asientos contables | 10 |
| Notas crédito | 1 (E2) |
| Notas débito | 1 (E2) |
| Ventas POS | 0 |
| Turnos POS | 2 (E5 cerrado, E6 abierto) |
| Cajas POS | 4 (1 E5 + 2 E6 + 1 preexistente) |
| Centros de costos | 3 (E4) |
| Cotizaciones | 1 (E2) |
| Resoluciones DIAN | 4 (E1, E2, E3, E9) |
| Proveedores | 1 (E9: Laboratorios Bioveta S.A.) |
| Gastos | 2 (E9) |

---

## Empresa 1 — Ferretería Los Tornillos (semilla)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro `register-trial` | ✅ | NIT 800200001 registrado, trial_ends_at = 2026-07-21 |
| Activar FE | ✅ | `PATCH /api/empresa/facturacion-electronica` OK |
| Crear resolución DIAN (FV / 18760000001) | ✅ | DB confirma resolución activa |
| Crear clientes | ✅ | 3 clientes creados |
| Crear 5 productos IVA 19% | ✅ | Productos creados |
| Crear facturas con retefuente | ❌ | 0 facturas en DB — script abortado por NIT conflict en primera ejecución |
| Inventario / asientos | ❌ | No ejecutado |

**Bugs encontrados:**
- **BUG-1A:** Primer intento de registro devolvió HTTP 409 `"Ya existe una empresa registrada con ese NIT."` — la API no tiene endpoint de reset ni limpieza por NIT para entornos de desarrollo.
- **BUG-1B:** El campo `estado_dian` en modo stub devuelve `"no_aplica"` — no `"stub"`. El enum correcto es `"pendiente" | "emitida" | "error" | "no_aplica"`.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 2 — Consultora TechPymes SAS (raiz)

**Estado general:** ✅ PASA

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro `register-trial` | ✅ | NIT 800200002, plan Raíz |
| Activar FE + resolución (SV / 18760000002) | ✅ | OK |
| Crear clientes | ✅ | 2 empresas registradas |
| Crear cotización (2 ítems servicio) | ✅ | 1 cotización en DB |
| Convertir cotización a factura | ✅ | Factura SV0001 $11.067.000 aceptada |
| Crear segunda factura directa | ✅ | Factura SV0002 $4.284.000 aceptada |
| Nota crédito por devolución | ✅ | NC-0001 $595.000 |
| Nota débito por intereses | ✅ | ND-0001 $72.000 tipo `interes` |
| Asientos automáticos | ✅ | 2 asientos generados |
| `estado_dian` en facturas | ✅ | `"no_aplica"` en ambas (correcto para stub) |

**Bugs encontrados:**
- **BUG-2A:** La ruta `POST /api/notas-credito` devuelve HTTP 404. La correcta es `POST /api/notas-credito/factura/:facturaId`.
- **BUG-2B:** Tipo ND `"intereses"` → HTTP 400. Los tipos válidos son `"interes"`, `"gastos"`, `"ajuste"` (singular, sin 's').

**Contadores:** Facturas: 2 · Asientos: 2 · NC: 1 · ND: 1 · POS: 0

---

## Empresa 3 — Distribuidora Lácteos Andinos (brote)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro + resolución (LA / 18760000003) | ✅ | OK |
| Crear 10 facturas | ⚠️ | 7/10 aceptadas. 3 rechazadas con HTTP 422 |
| Cartera aging | ✅ | `GET /api/cartera/aging` retorna 200 con buckets |
| Reporte comparativo | ✅ | Feature `reportes_comparativos` activa en brote |
| Reporte IVA | ✅ | Totales por período correctos |
| Asientos | ✅ | 7 asientos generados |

**Bugs encontrados:**
- **BUG-3A:** 3 facturas rechazadas con HTTP 422 `"La fecha de vencimiento no puede ser anterior a hoy."` — la API no permite simular cartera vencida histórica. Para pruebas de aging real se necesita un mecanismo de backfill o ruta admin.

**Contadores:** Facturas: 7 · Asientos: 7 · NC/ND: 0 · POS: 0

---

## Empresa 4 — Hotel Serranía del Viento (cosecha)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro + 3 centros de costos | ✅ | Habitaciones, Restaurante, Servicios Generales en DB |
| Crear período contable | ✅ | 1 período creado |
| Asiento manual con centros de costos | ❌ | Rate limit 429 |
| Balance de prueba | ❌ | No ejecutado |
| Cerrar período | ❌ | No ejecutado |

**Bugs encontrados:**
- **BUG-4A:** Write rate limit global (60 req/min por IP) agotado durante E4–E11. HTTP 429 bloquea flujos críticos.
- **BUG-4B:** Ruta de balance `GET /api/contabilidad/balance` → 404. Correcta: `GET /api/contabilidad/balance-prueba`.
- **BUG-4C:** Ruta cierre de período `PATCH /api/contabilidad/periodos/:id` → 404. Correcta: `PATCH /api/contabilidad/periodos/:id/cerrar`.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 5 — Taquería El Sabor POS (semilla + punto)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro + caja "Caja Principal" | ✅ | DB confirma caja y turno |
| Abrir turno | ✅ | Turno abierto |
| Registrar 5 ventas POS | ❌ | HTTP 500 — payload incorrecto |
| Registrar fiado $150.000 | ❌ | HTTP 400 — faltaba `nombre_cliente` |
| Cerrar turno | ✅ | `PATCH /api/pos/turnos/:id/cerrar` con `monto_final_declarado` funciona |

**Bugs encontrados:**
- **BUG-5A (CRÍTICO):** `POST /api/pos/ventas` requiere `metodo_pago: string` (no array `pagos`) e items con `subtotal`, `iva_valor`, `total` pre-calculados. Un payload natural produce HTTP 500 genérico en lugar de HTTP 400 descriptivo.
- **BUG-5B:** Fiado requiere `nombre_cliente` en body pero el HTTP 400 no indica qué campo falta.
- **BUG-5C:** El campo de cierre es `monto_final_declarado`, no `monto_final_efectivo`.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 6 — Minimercado Doña Esperanza (punto_plus)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro + 2 cajas (multi_caja) | ✅ | "Caja 1 — Entrada" + "Caja 2 — Frutas" en DB |
| Abrir turno Caja 1 | ✅ | Turno en estado `abierto` |
| Registrar venta normal | ❌ | HTTP 500 (BUG-5A) |

**Bugs encontrados:**
- **BUG-6A:** Feature multi-caja funciona estructuralmente pero no pudo verificarse end-to-end porque ninguna venta POS pudo registrarse.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 7 — Estudio Contable Rivera (origen_60)

**Estado general:** ❌ FALLA

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro plan de pago | ❌ | HTTP 202 `payment_required` — empresa nunca activada |
| Todos los demás flujos | ❌ | No ejecutados |

**Bugs encontrados:**
- **BUG-7A:** Plan `origen_60` devuelve HTTP 202 con `pending_registration_id`. No hay flujo de activación sin pasarela de pago.
- **BUG-7B (ALTO):** No existe endpoint de activación stub/admin para planes de pago en local. Los planes FE pagados (origen_24/60/120/300) son imposibles de probar en ambiente local. Cobertura QA de esos SKUs = 0%.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 8 — Papelería & Manualidades (semilla)

**Estado general:** ❌ FALLA

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro + 3 productos | ✅ | DB confirma 3 productos para E8 |
| Crear orden de ensamble | ❌ | HTTP 403 `PLAN_FEATURE_NOT_INCLUDED` — `ensamble` no incluida en Semilla |

**Bugs encontrados:**
- **BUG-8A:** `ensamble` requiere `raiz` o superior. El HTTP 403 no indica qué plan es necesario para desbloquear la feature.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 9 — Clínica VetSalud (raiz)

**Estado general:** ✅ PASA

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro + resolución (VS / 18760000009) | ✅ | OK |
| Crear proveedor "Laboratorios Bioveta S.A." | ✅ | DB confirma |
| Registrar 2 gastos vinculados al proveedor | ✅ | DB confirma |
| Crear factura VS0001 $833.000 | ✅ | Aceptada, estado_dian = `no_aplica` |
| Asiento | ✅ | 1 asiento generado |

**Bugs encontrados:**
- **BUG-9A:** Rate limit 429 impidió completar nota débito y más flujos.

**Contadores:** Facturas: 1 · Asientos: 1 · NC/ND: 0 · POS: 0

---

## Empresa 10 — Prueba de Trial (semilla)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro con trial | ✅ | NIT 800200010, `trial_ends_at = 2026-07-21` (15 días exactos) |
| Verificar `trial_ends_at` vía `/api/mi-plan` | ✅ | Campo devuelto correctamente |
| Crear factura durante trial | ❌ | Rate limit 429 |

**Bugs encontrados:**
- **BUG-10A:** No existe endpoint de admin para simular vencimiento de trial. El cron `trial-expiry` no puede verificarse sin UPDATE directo en BD o endpoint admin.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Empresa 11 — Comercializadora Multiplan SAS (cosecha)

**Estado general:** ⚠️ PASA CON ADVERTENCIAS

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro | ✅ | NIT 800200011, plan Cosecha |
| Crear usuarios adicionales | ❌ | Rate limit 429 |
| Crear facturas con retenciones | ❌ | Rate limit 429 |
| Audit log | ✅ | `GET /api/audit-log` retorna 200 (15 entradas en DB) |
| Panel fundador | ✅ | Retorna lista de tenants correctamente |

**Bugs encontrados:**
- **BUG-11A:** Rate limit acumulado imposibilitó flujos de E11.
- **BUG-11B:** Roles multi-usuario (contador, cajero) no pudieron verificarse.

**Contadores:** Facturas: 0 · Asientos: 0 · NC/ND: 0 · POS: 0

---

## Bugs críticos — Top 3

### 1. BUG-5A — Payload POS mal documentado, HTTP 500 silencioso (CRÍTICO)

**Endpoint:** `POST /api/pos/ventas`
**Impacto:** 0 ventas POS registradas en toda la simulación. Módulo POS no entregable en condiciones de integración estándar.
**Causa:** El endpoint espera `metodo_pago: string` (no array `pagos`) e items con `subtotal`, `iva_valor`, `total` pre-calculados. Un payload natural produce HTTP 500 genérico.
**Fix:** Validación con mensajes descriptivos en el controller; cambiar HTTP 500 → HTTP 400 con campo faltante.

### 2. BUG-4A — Rate limit global bloquea QA y batches (ALTO)

**Impacto:** E4, E5, E9, E10, E11 con flujos incompletos. Cualquier migración de datos históricos (200 facturas) queda bloqueada.
**Causa:** `writeRateLimit` = 60 req/min por IP global, sin bypass para tokens de servicio.
**Fix:** Rate limit por tenant (no por IP) o token de servicio con límite elevado.

### 3. BUG-7B — Planes FE pagados no probables en local (ALTO)

**Impacto:** Cobertura QA cero para planes `origen_24`, `origen_60`, `origen_120`, `origen_300`.
**Causa:** `POST /api/auth/register` con plan de pago requiere webhook Bold/Wompi para activar. No existe ruta admin de activación stub.
**Fix:** Endpoint `POST /api/fundador/activar-registro/:id` que confirme un `pending_registration` sin pago.

---

## Veredicto comercial

**Lo que funciona sólido:** Registro multi-tenant con trial, facturación electrónica stub, asientos automáticos, notas de crédito/débito, proveedores, gastos, cartera aging, reporte IVA, centros de costos (estructura), `trial_ends_at` con exactitud de 15 días, panel fundador, audit log.

**Bloqueadores antes de lanzamiento:**
1. **POS:** 0 ventas registradas — no entregable para restaurantes/minimercados sin fix de BUG-5A
2. **Rate limit:** Hace inviable incorporar clientes con datos históricos
3. **Planes FE pagados:** Sin cobertura QA local — bugs solo detectables en producción

**Condición:** Beta restringida para módulos de facturación y contabilidad. POS y migración de datos requieren corrección antes de abrir a clientes.
