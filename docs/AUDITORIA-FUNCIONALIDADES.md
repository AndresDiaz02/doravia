# Auditoría de Funcionalidades — Doravia

**Fecha**: 2026-07-07  
**Método**: Lectura directa del código fuente (rutas API, schemas Drizzle, frontend). Cero suposiciones.  
**Solo lectura — sin cambios al código.**

---

## 1. Tabla Resumen

| # | Funcionalidad | Estado | Evidencia principal | Esfuerzo |
|---|---|---|---|---|
| 1 | Impoconsumo (8%) | ❌ NO EXISTE | Sin campo en schemas ni en buildItems() | M |
| 2 | Régimen Simple (RST) | 🟡 PARCIAL | `tenants.regimen`, XML UBL, Plemsi — sin validaciones RST | M |
| 3 | Documento soporte (no obligados) | ❌ NO EXISTE | Sin tabla ni rutas | L |
| 4 | RADIAN / recepción facturas proveedores | ❌ NO EXISTE | Sin tabla ni rutas | XL |
| 5 | Certificados de retención PDF | ❌ NO EXISTE | Solo CRUD de config, sin PDF | M |
| 6 | Estado de Resultados (P&G) y Balance General | ✅ COMPLETA | `/contabilidad/estado-resultados`, `/balance-general` + Excel | S |
| 7 | Activos fijos y depreciación | ❌ NO EXISTE | Sin tabla ni rutas | L |
| 8 | Cierre de ejercicio anual | ❌ NO EXISTE | Solo cierre de períodos mensuales | M |
| 9 | Importación masiva Excel/CSV | 🟡 PARCIAL | Productos sí — clientes, proveedores, saldos no | M |
| 10 | Envío por WhatsApp | 🟡 PARCIAL | POS sí (wa.me link) — facturas ERP no | M |
| 11 | Link de pago Bold en facturas de tenants | ❌ NO EXISTE | Bold solo para suscripciones Doravia | L |
| 12 | Lector de código de barras POS | 🟡 PARCIAL | Keyboard wedge funciona — sin campo EAN dedicado | S |

**Resumen**: 1 completa · 4 parciales · 7 no existen

---

## 2. Detalle por Funcionalidad

---

### 1. Impoconsumo 8% — ❌ NO EXISTE · Esfuerzo: M

**Qué hay:**
- `productos.ts`: solo campo `iva_pct`. Sin `impoconsumo_pct`.
- `facturas.ts → items_factura`: solo `iva_pct`. Sin impoconsumo.
- `pos.ts → items_venta_pos`: solo `iva_pct`.
- `plemsi.service.ts → buildItems()`: crea `tax_totals` con `tax_id: 1` (IVA) únicamente.
- `dian/xml-ubl.ts`: TaxTypeCode fijo en `01` (IVA). Sin soporte para `05` (Consumo).
- Búsqueda `impoconsumo` en todo el proyecto: **sin resultados**.

**Qué falta para completarla:**
- Campo `impoconsumo_pct numeric` en `productos`, `items_factura`, `items_venta_pos`
- Lógica en `buildItems()` para añadir segundo `tax_total` con `tax_id: 5` (Consumo)
- XML UBL: bloque adicional `TaxTotal` con TaxTypeCode `05`
- Cálculo en rutas de facturas y POS
- UI en formulario de productos

**Archivos a tocar**: `pos.ts`, `facturas.ts`, `productos.ts`, `xml-ubl.ts`, `plemsi.service.ts`, `facturas.ts (ruta)`, `pos.ts (ruta)`

---

### 2. Régimen Simple de Tributación (RST) — 🟡 PARCIAL · Esfuerzo: M

**Qué hay:**
- `tenants.ts:18` — `regimen: varchar` con default `"comun"`. Acepta `"simplificado"`.
- `empresa.ts` — endpoint PATCH `/api/empresa` permite actualizar `regimen`.
- `ConfiguracionEmpresa.tsx` — campo `regimen` en formulario de empresa.
- `xml-ubl.ts` — TaxLevelCode: `O-49` (simplificado) vs `O-13` (común). Diferenciación correcta.
- `plemsi.service.ts:87,89` — `type_liability_id: 118` (simplificado) / `117` (común); `type_regime_id: 1` / `2`.

**Qué hay exactamente**: configuración guardable + integración en XML y Plemsi para el tipo de régimen del emisor. La diferencia aparece en los documentos electrónicos.

**Qué falta:**
- Validaciones de negocio RST (retenciones no aplican, tabla de tarifas RST por actividad)
- Restricción de IVA en facturas RST (no cobran IVA en muchos casos)
- Aviso o bloqueo cuando un tenant RST intenta aplicar IVA normal
- Certificado de contador simplificado

**Archivos a tocar**: `facturas.ts (ruta)`, UI de advertencias, posiblemente `buildItems()`

---

### 3. Documento soporte en adquisiciones a no obligados — ❌ NO EXISTE · Esfuerzo: L

**Qué hay:** Nada. Búsqueda de `documento_soporte`, `soporte` en rutas y schemas: sin resultados.

**Qué falta para completarla:**
- Tabla `documentos_soporte` (proveedor NIT, descripción, monto, IVA asumido, fecha)
- Rutas CRUD `/api/gastos/documentos-soporte`
- Integración con asientos contables
- Validación: solo aplica para compras a personas no inscritas en RUT
- UI en módulo de gastos

---

### 4. Eventos RADIAN / recepción de facturas de proveedores — ❌ NO EXISTE · Esfuerzo: XL

**Qué hay:** Nada. Búsqueda de `radian`, `acuse_recibo`, `facturas_recibidas`, `evento_dian` en todo el proyecto: sin resultados.

**Qué falta:**
- Tabla `facturas_recibidas` (CUFE, proveedor, montos, estado RADIAN)
- Tabla `eventos_radian` (tipo evento, timestamp, respuesta DIAN)
- Endpoint de recepción de XMLs firmados vía Plemsi/PT
- Emisión de acuses de recibo, rechazo, aceptación
- UI de bandeja de facturas recibidas

---

### 5. Certificados de retención en PDF — ❌ NO EXISTE · Esfuerzo: M

**Qué hay:**
- `retenciones.ts` — solo CRUD de **configuración** (porcentajes y tipos). Sin endpoints de certificado ni PDF.
- No hay tabla `retenciones_aplicadas` que registre retenciones individuales hechas a proveedores.
- No hay endpoint `/retenciones/certificado` ni `/retenciones/pdf`.

**Qué falta:**
- Tabla `retenciones_aplicadas` (proveedor, tipo retención, base, valor, fecha, periodo)
- Registro automático al crear facturas de compra / gastos con retención
- Endpoint GET `/api/retenciones/certificado/:proveedor_id?year=2025` → PDF con pdfkit
- UI: botón "Descargar certificado" en módulo de proveedores/retenciones

---

### 6. Estado de Resultados (P&G) y Balance General clasificado — ✅ COMPLETA · Esfuerzo: S

**Qué hay:**
- `contabilidad.ts:191` — `GET /balance-general`: activos, pasivos, patrimonio clasificados.
- `contabilidad.ts:252` — `GET /estado-resultados`: ingresos, costos, gastos; calcula `utilidad_bruta` y `utilidad_neta`.
- `contabilidad.ts:515,524` — Exportación a Excel de ambos reportes.
- Filtros por fecha de inicio/fin.

**Veredicto**: implementación completa de punta a punta. Ningún gap identificado.

---

### 7. Activos fijos y depreciación — ❌ NO EXISTE · Esfuerzo: L

**Qué hay:** Nada. Búsqueda de `activos_fijos`, `deprecia`, `vida_util` en schemas y rutas: sin resultados.

**Qué falta:**
- Tabla `activos_fijos` (descripción, valor_adquisicion, vida_util_meses, metodo: lineal/reduccion_saldos, fecha_activacion, cuenta_contable)
- Tabla `depreciacion_mensual` (asiento generado, monto, acumulado)
- Cálculo automático al cerrar período
- Rutas CRUD + reporte de activos
- UI en ERP

---

### 8. Cierre de ejercicio anual — ❌ NO EXISTE · Esfuerzo: M

**Qué hay:**
- `contabilidad.ts:368` — `PATCH /periodos/:id/cerrar`: cierra períodos individuales (meses). Bien implementado.
- Sin endpoint de cierre anual. Sin lógica de cancelación de cuentas de resultado.
- Búsqueda de `cierre_anual`, `utilidad_ejercicio`, `cancelar_cuentas`: sin resultados.

**Qué falta:**
- Validación: todos los períodos del año deben estar cerrados
- Asiento de cierre: débito a cuentas 4xxx (ingresos), crédito a 5xxx (gastos), diferencia → cuenta `3605` (Utilidad del ejercicio)
- Asiento de apertura del ejercicio siguiente
- Endpoint POST `/api/contabilidad/cierre-anual`
- UI con confirmación y resumen antes de ejecutar

---

### 9. Importación masiva Excel/CSV — 🟡 PARCIAL · Esfuerzo: M

**Qué hay:**
- `productos.ts (ruta):4` — `import multer`.
- `productos.ts:126` — `POST /api/productos/importar`: importación de productos desde Excel con validación de columnas, upsert por código, límite de 1000 registros, plantilla descargable. **Bien implementado**.

**Qué falta:**
- Importación de **clientes** (crítico para onboarding)
- Importación de **proveedores**
- Importación de **saldos iniciales** de inventario
- Importación de **asientos de apertura** (saldos contables iniciales)

---

### 10. Envío por WhatsApp — 🟡 PARCIAL · Esfuerzo: M

**Qué hay:**
- `apps/pos/src/pages/Venta.tsx:155,156` — estado `showWhatsApp`, `whatsappPhone`.
- `Venta.tsx:380-385` — `enviarWhatsApp()`: genera link `wa.me/{phone}?text={resumen_venta}` y lo abre en nueva pestaña. Sin API de WhatsApp Business.
- `Venta.tsx:986-1001` — UI: input de teléfono + botón "Enviar por WhatsApp" en pantalla post-cobro.

**Qué falta:**
- Botón de WhatsApp en `FacturaDetalle.tsx` del ERP (actualmente solo email)
- Endpoint `/api/facturas/:id/enviar-whatsapp` en backend (con log de envío)
- Considerar integración con WhatsApp Business API o Twilio para envío real (el actual solo abre el teléfono del usuario)

---

### 11. Link de pago Bold en facturas de tenants — ❌ NO EXISTE · Esfuerzo: L

**Qué hay:**
- `apps/api/src/routes/bold.ts` — integración Bold completa, pero **exclusivamente para cobros de suscripción Doravia** (planes ERP/POS). No tiene nada relacionado con facturas de clientes del tenant.
- `facturas.ts (schema)` — sin campos `link_pago`, `bold_link`, `payment_url`.
- `FacturaDetalle.tsx` — botones: descarga PDF, envía email, crea NC/ND. Sin link de pago.

**Qué falta:**
- Campo `link_pago text` en `facturas`
- Endpoint POST `/api/facturas/:id/crear-link-pago` → llama Bold API con monto y referencia
- Webhook de Bold para marcar factura como pagada
- UI en FacturaDetalle.tsx: botón "Generar link de pago" + copia del link

---

### 12. Lector de código de barras POS — 🟡 PARCIAL · Esfuerzo: S

**Qué hay:**
- `apps/pos/src/pages/Venta.tsx:73` — hook `useBarcodeScanner(productos, onProductoEscaneado)`.
- `Venta.tsx:94-109` — detección de entrada rápida de teclado (gap < 80ms entre teclas) seguida de Enter. Mapea al campo `producto.codigo`. Agrega al carrito automáticamente.
- `productos.ts (schema):13` — campo `codigo varchar` genérico (SKU interno, no específicamente EAN).

**Qué hay exactamente**: funciona para lectores keyboard wedge (el 90% del mercado). El campo `codigo` en el producto es el que se compara al escanear.

**Qué falta:**
- Campo específico `codigo_barras` (EAN-13, UPC-A) separado del SKU interno — hoy si el SKU y el EAN son distintos, el scanner no encuentra el producto
- Validación de checksum EAN
- Modo de ingreso manual cuando el scanner falla (input dedicado)

---

## 3. Hallazgos Inesperados

1. **P&G y Balance General ya están completos** (`contabilidad.ts:191,252`): no estaban claramente documentados como funcionalidades terminadas. Son reportes de calidad lista para producción.

2. **WhatsApp en POS ya existe** (`Venta.tsx:380`): funcional como link wa.me. No requiere integración de API externa.

3. **Scanner de código de barras ya funciona** (`Venta.tsx:73-109`): no documentado como feature. Funciona para el 90% de los lectores del mercado.

4. **Importación de productos ya existe** (`productos.ts:126`): completa con validación, upsert y plantilla descargable. No documentada en el reporte del sistema.

5. **RST ya tiene diferenciación en XML y Plemsi** (`xml-ubl.ts`, `plemsi.service.ts`): la parte técnica fiscal ya está implementada, solo faltan validaciones de negocio.

6. **`pos_config.fe_deshabilitada_en`** en `tenants.ts:36`: campo misterioso — parece registrar cuándo se deshabilitó la facturación electrónica del POS. No documentado ni usado de forma visible en rutas.

7. **`multer` importado en `empresa.ts`** pero sin endpoints de importación masiva de clientes/proveedores — el scaffolding estaba planeado pero nunca se implementó.

---

## 4. Orden de Implementación Recomendado

Criterio: **riesgo regulatorio > impacto en ventas > esfuerzo**

| Posición | # | Funcionalidad | Por qué aquí |
|---|---|---|---|
| 1 | 1 | **Impoconsumo** | Riesgo legal alto: restaurantes/bares que emitan facturas sin impoconsumo están en infracción DIAN. Esfuerzo M. |
| 2 | 5 | **Certificados de retención PDF** | Obligación legal anual. Sin esto el módulo de retenciones está incompleto. Esfuerzo M. |
| 3 | 8 | **Cierre de ejercicio anual** | Cierre contable es obligatorio; sin él, el ERP no puede cerrar un año fiscal completo. Esfuerzo M. |
| 4 | 2 | **RST — completar validaciones** | Ya existe la base técnica; completar reglas de negocio bloquea ventas a clientes RST. Esfuerzo M. |
| 5 | 12 | **Código de barras — campo EAN** | Quick win: S esfuerzo, diferenciador clave en POS frente a competencia. |
| 6 | 9 | **Importación masiva — clientes** | Bloquea onboarding de empresas con cientos de clientes. M esfuerzo, alto impacto en ventas. |
| 7 | 10 | **WhatsApp en facturas ERP** | El POS ya lo tiene; duplicar en ERP es rápido y es diferenciador comercial visible. |
| 8 | 3 | **Documento soporte** | Regulatorio para gastos a personas naturales no inscritas. Menor urgencia que impoconsumo. L. |
| 9 | 7 | **Activos fijos** | Completa el ERP para empresas medianas. Baja urgencia regulatoria. L. |
| 10 | 11 | **Link Bold en facturas** | Impacto en ventas alto a mediano plazo, pero requiere acuerdo comercial con Bold. L. |
| 11 | 4 | **RADIAN** | Regulatorio pero extremadamente complejo. Pocas PYMEs lo requieren hoy. XL. |
