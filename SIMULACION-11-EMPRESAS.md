# Simulación QA End-to-End — 11 Empresas Doravia

> Documento de instrucciones para ejecución de QA completo del sistema.
> Generado para sesión de simulación 2026-07-06.

---

## Objetivo

Ejecutar una simulación realista de 11 tipos de empresa distintos, cubriendo todos los planes
disponibles y los flujos críticos del negocio. Detectar bugs, inconsistencias de datos y
fricciones de UX antes del lanzamiento comercial.

## Pre-requisitos

1. PostgreSQL local corriendo en `localhost:5432`, base de datos `doravia`
2. `pnpm db:push` — aplicar schema completo (incluye `trial_ends_at` y otros campos nuevos)
3. `pnpm db:seed` — sembrar planes y PUC (sin `SEED_DEMO=true`)
4. API corriendo en `http://localhost:3001` (puerto por defecto)
5. `DIAN_MODO=pruebas_stub` en `.env` — nunca tocar DIAN real

## Convenciones de la simulación

- **NIT de prueba**: usar rango `800200001`–`800200011`
- **Email base**: `qa-empresa{N}@doravia-sim.co`
- **Password uniforme**: `Simulacion2026!`
- **Fechas**: usar fecha actual del sistema
- **Montos**: realistas para el sector (no $1 ni $999999)

---

## Las 11 empresas

| # | Empresa | NIT | Plan | Sector | Foco del test |
|---|---|---|---|---|---|
| 1 | Ferretería Los Tornillos | 800200001 | semilla | Comercio | Facturación + inventario + retenciones |
| 2 | Consultora TechPymes SAS | 800200002 | raiz | Servicios | Cotizaciones → factura + nota crédito |
| 3 | Distribuidora Lácteos Andinos | 800200003 | brote | Alimentos | Reportes comparativos + IVA + cartera |
| 4 | Hotel Serranía del Viento | 800200004 | cosecha | Hospitalidad | Centros de costos + asientos manuales |
| 5 | Taquería El Sabor POS | 800200005 | semilla + punto | Restaurante | POS: venta + fiado + cierre turno |
| 6 | Minimercado Doña Esperanza | 800200006 | punto_plus | Retail | POS multi-caja + anulaciones + gastos caja |
| 7 | Estudio Contable Rivera | 800200007 | origen_60 | Servicios | Solo facturación, límite de documentos |
| 8 | Papelería & Manualidades | 800200008 | semilla | Retail | Ensamble BOM + exportar Excel |
| 9 | Clínica VetSalud | 800200009 | raiz | Salud | Notas débito + proveedores + CxP |
| 10 | Empresa en prueba gratuita | 800200010 | semilla (trial) | Servicios | Trial 15 días + flujo suspensión |
| 11 | Comercializadora Multi-plan | 800200011 | cosecha | Comercio | Multi-usuario + contabilidad avanzada |

---

## Flujos a probar por empresa

### Empresa 1 — Ferretería Los Tornillos (semilla)

**Registro y configuración:**
- `POST /api/auth/register-trial` con plan `semilla`
- Crear resolución DIAN stub: prefijo `FV`, resolución `18760000001`, rango 1–9999
- Crear 3 clientes (persona natural, empresa régimen común, empresa simplificado)
- Crear 5 productos con IVA 19%: tornillos M8, alambre galvanizado, pintura blanca, disco de corte, taladro

**Flujos principales:**
1. Crear factura con 3 ítems + retefuente 3.5% → verificar asiento contable generado
2. Crear factura con descuento 10% + IVA → verificar totales
3. Crear entrada de inventario → verificar stock actualizado
4. Crear ajuste negativo de inventario → verificar kardex
5. Marcar factura como pagada → verificar campo `pagada_at`
6. Exportar Excel de facturas y productos

**Verificaciones:**
- [ ] Asiento contable de factura tiene débito en 1305 (CxC) y crédito en 4135 (ventas) + 2408 (IVA)
- [ ] Kardex muestra saldo correcto después de movimientos
- [ ] Retefuente resta correctamente del neto a pagar

---

### Empresa 2 — Consultora TechPymes SAS (raiz)

**Registro y configuración:**
- `POST /api/auth/register-trial` con plan `raiz`
- Crear 2 clientes empresas

**Flujos principales:**
1. Crear cotización con 2 ítems de servicio
2. Aprobar cotización → convertir a factura (feature `cotizacion_a_factura`)
3. Verificar que factura tiene los mismos ítems que la cotización
4. Crear nota crédito por devolución sobre esa factura
5. Crear nota débito por intereses sobre otra factura
6. Verificar estado_dian = "stub" en modo de pruebas

**Verificaciones:**
- [ ] Cotización convertida a factura mantiene ítems y totales
- [ ] Nota crédito reduce el valor contabilizado
- [ ] Consecutivos NC/ND son únicos y correlativos

---

### Empresa 3 — Distribuidora Lácteos Andinos (brote)

**Registro y configuración:**
- `POST /api/auth/register-trial` con plan `brote`

**Flujos principales:**
1. Crear 10 facturas distribuidas en 2 meses distintos
2. Marcar 3 facturas como vencidas (fecha_vencimiento en el pasado + estado enviada)
3. Consultar cartera: `GET /api/cartera/aging`
4. Consultar reporte comparativo: `GET /api/reportes/comparativo`
5. Consultar reporte IVA: `GET /api/reportes/iva?desde=&hasta=`
6. Crear gastos con IVA descontable → verificar reporte IVA

**Verificaciones:**
- [ ] Cartera aging muestra facturas en bucket correcto (30/60/90 días)
- [ ] Reporte comparativo disponible (feature `reportes_comparativos` en brote)
- [ ] IVA generado - IVA descontable = saldo correcto

---

### Empresa 4 — Hotel Serranía del Viento (cosecha)

**Registro y configuración:**
- `POST /api/auth/register-trial` con plan `cosecha`
- Crear 3 centros de costos: Habitaciones, Restaurante, Servicios

**Flujos principales:**
1. Crear período contable abierto
2. Crear asiento manual con centros de costos
3. Consultar balance de prueba
4. Crear asiento en período cerrado → debe fallar con error correcto
5. Verificar auxiliares por cuenta

**Verificaciones:**
- [ ] Asiento con centros de costos guardados correctamente
- [ ] Período cerrado bloquea nuevos asientos
- [ ] Balance de prueba cuadra (débitos = créditos)

---

### Empresa 5 — Taquería El Sabor POS (semilla + punto)

**Registro y configuración:**
- `POST /api/auth/register-trial` con plan `semilla`
- Crear add-on POS (o usar plan `punto` directamente)
- Crear caja "Caja Principal", crear cajero

**Flujos principales:**
1. Abrir turno
2. Registrar 5 ventas POS (efectivo + tarjeta)
3. Registrar 1 fiado con monto $150.000
4. Abonar $50.000 al fiado
5. Registrar gasto de caja $20.000 (café)
6. Cerrar turno con cuadre de caja
7. Verificar asientos contables de turno

**Verificaciones:**
- [ ] Cada venta POS genera asiento contable
- [ ] Fiado aparece en lista con saldo pendiente correcto ($100.000 después del abono)
- [ ] Cierre de turno registra diferencia (si efectivo contado ≠ esperado)

---

### Empresa 6 — Minimercado Doña Esperanza (punto_plus)

**Registro:**
- `POST /api/auth/register-trial` con plan `punto_plus`

**Flujos principales:**
1. Crear 2 cajas (feature multi_caja)
2. Abrir turno en Caja 1
3. Registrar venta normal
4. Anular la venta → verificar devolución_pos
5. Abrir turno en Caja 2 simultáneamente
6. Verificar que reportes POS separan por caja

**Verificaciones:**
- [ ] Plan punto_plus permite 2+ cajas sin error
- [ ] Anulación genera asiento de reverso
- [ ] Reporte separa ventas por caja correctamente

---

### Empresa 7 — Estudio Contable Rivera (origen_60)

**Registro:**
- `POST /api/auth/register` con plan `origen_60` (plan gratuito de pago)

**Flujos principales:**
1. Crear resolución DIAN
2. Crear 5 facturas → verificar límite anual (60)
3. Intentar crear factura de inventario → debe fallar (feature no incluida)
4. Exportar facturas en Excel

**Verificaciones:**
- [ ] Plan origen_60 no tiene feature `inventario`
- [ ] Límite de facturas anuales se respeta (no debería bloquear con 5 facturas)
- [ ] Estado DIAN stub aparece en cada factura

---

### Empresa 8 — Papelería & Manualidades (semilla)

**Registro:**
- `POST /api/auth/register-trial` con plan `semilla`

**Flujos principales:**
1. Crear 2 productos componentes y 1 producto terminado
2. Crear orden de ensamble: producto terminado con componentes
3. Ejecutar ensamble → verificar reducción stock componentes + aumento stock terminado
4. Exportar kardex del producto terminado
5. Exportar inventario completo en Excel

**Verificaciones:**
- [ ] Stock de componentes reduce según cantidad usada
- [ ] Stock de terminado aumenta correctamente
- [ ] Kardex muestra movimiento de ensamble

---

### Empresa 9 — Clínica VetSalud (raiz)

**Registro:**
- `POST /api/auth/register-trial` con plan `raiz`

**Flujos principales:**
1. Crear proveedor: "Laboratorios Bioveta S.A."
2. Registrar gasto (compra de vacunas) vinculado al proveedor
3. Crear nota débito sobre factura existente (cargos adicionales)
4. Consultar detalle proveedor → historial de compras
5. Verificar CxP en detalle proveedor

**Verificaciones:**
- [ ] Proveedor detalle muestra historial de gastos vinculados
- [ ] Nota débito tiene ítems propios (no copia ítems de la factura)
- [ ] Consecutivo ND es único y correlativo

---

### Empresa 10 — Prueba de Trial (semilla)

**Registro:**
- `POST /api/auth/register-trial` con plan `semilla`
- Verificar que `trial_ends_at` está 15 días en el futuro

**Flujos principales:**
1. Crear 1 factura normal → debe funcionar
2. Consultar `GET /api/mi-plan` → verificar `trial_ends_at`
3. Simular vencimiento: actualizar `trial_ends_at` en BD a ayer
4. Intentar crear factura → debe fallar o advertir
5. Verificar notificaciones de vencimiento de plan

**Verificaciones:**
- [ ] `trial_ends_at` calculado correctamente (ahora + 15 días)
- [ ] Notificación de vencimiento aparece cuando quedan ≤7 días
- [ ] Dashboard muestra alerta de vencimiento

---

### Empresa 11 — Comercializadora Multi-plan (cosecha)

**Registro:**
- `POST /api/auth/register-trial` con plan `cosecha`
- Crear 3 usuarios: admin, contador (en hub), cajero

**Flujos principales:**
1. Login con usuario cajero → verificar acceso limitado
2. Login con usuario admin → acceso completo
3. Crear 5 facturas con retenciones variadas (retefuente + reteICA)
4. Consultar audit log de acciones
5. Consultar dashboard fundador con el email del fundador
6. Exportar datos de empresa (portabilidad Ley 1581)

**Verificaciones:**
- [ ] Roles limitan acceso correctamente
- [ ] Audit log registra todas las acciones críticas
- [ ] Panel fundador muestra el nuevo tenant
- [ ] Exportar datos completa sin error

---

## Formato del reporte de salida

El archivo de salida es `REPORTE-SIMULACION-11-EMPRESAS.md`. Se actualiza después de cada empresa.

### Template por empresa:

```
## Empresa N — Nombre (plan)

**Estado general:** ✅ PASA / ⚠️ PASA CON ADVERTENCIAS / ❌ FALLA

| Flujo | Resultado | Detalle |
|---|---|---|
| Registro | ✅/❌ | Descripción |
| Flujo 1 | ✅/❌ | Descripción |
| ... | | |

**Bugs encontrados:**
- BUG-N: [descripción exacta, endpoint, error HTTP, mensaje]

**Contadores:**
- Facturas creadas: N
- Asientos generados: N
- NC/ND creadas: N
- Ventas POS: N
```

---

## Resumen final esperado

Al terminar las 11 empresas, el reporte debe incluir:

```
## Resumen total

| Métrica | Total |
|---|---|
| Tenants creados | 11 |
| Facturas | N |
| Notas crédito/débito | N |
| Ventas POS | N |
| Asientos contables | N |

## Bugs críticos (top 3)
1. ...
2. ...
3. ...

## Veredicto comercial
[1-2 párrafos honestos sobre la madurez del sistema]
```

---

## Notas de ejecución

- Ejecutar flujos via API REST directamente con `curl` o script de node
- Si la API falla, documentar: endpoint, body enviado, HTTP status, body de error
- No omitir errores ni "suavizarlos" — el objetivo es encontrar bugs reales
- Si un flujo requiere datos previos (ej. cliente para la factura), crearlos en orden
- Verificar siempre asientos contables con `GET /api/contabilidad/asientos?limit=5`
- Verificar siempre que `/api/health` retorna 200 antes de continuar
