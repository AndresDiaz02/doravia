# Documento Equivalente POS Electrónico — Fase 4

**Rama**: `feature/doc-equivalente-pos`  
**Estado**: Etapa 0 completada — pendiente aprobación para continuar con Etapas 1-5

---

## Etapa 0 — Investigación

### Fuentes consultadas

- Código existente: `apps/api/src/services/plemsi.service.ts`
- Schema POS: `packages/db/src/schema/pos.ts`
- Schema tenants: `packages/db/src/schema/tenants.ts`
- Schema resoluciones: `packages/db/src/schema/resoluciones_dian.ts`
- Ruta POS: `apps/api/src/routes/pos.ts`
- Postman collection de Plemsi: `https://documenter.getpostman.com/view/15737545/UVJbJHv7` (inaccesible vía fetch — devuelve página sin contenido)
- Documentación Plemsi staging (`https://pruebas.plemsi.com/api/documentation`): 404
- Documentación emision.co: 404

### Lo que ya existe en el código

#### `emitirDocumentoPOS()` — `plemsi.service.ts:452-513`

La función ya está implementada. Contrato deducido del código:

| Campo | Valor / observación |
|---|---|
| Endpoint | `POST /api/equivalent/pos` en `PLEMSI_BASE` |
| Autenticación | `Bearer {api_key}` — token estático por tenant, guardado en `tenants.pos_config.plemsi_api_key` |
| Campo `customer` | **Ausente** — consumidor final, sin datos del comprador |
| `softwareManufacturer` | `{ ownerName, softwareName, companyName }` — identifica a Doravia |
| `payPointInfo` | Opcional — `{ cashierName, payPointType: "Caja" }` |
| `payment.duration_measure` | `"1"` (distinto de facturas que usan `"0"`) |
| Totales | Pasados como `String()`, no como `toFixed(2)` (diferencia vs `emitirFactura`) |
| Respuesta esperada | `json.cude ?? json.uuid ?? json.id` |
| CUDE | Código Único del Documento Equivalente (no CUFE) |

#### Estado actual en el schema POS (`pos.ts`)

`ventas_pos` ya tiene:
- `tipo_documento`: `"factura_electronica" | "tiquete_pos"` ✓
- `estado_dian`: `"pendiente_envio" | "enviado" | "anulado"` ✓ (pero le falta `"error"` y `"no_aplica"`)
- `enviado_en` timestamp ✓
- `fecha_limite_envio` timestamp ✓

Le **falta**:
- `cude` varchar — el CUDE que retorna Plemsi
- `qr_data` text — QR si Plemsi lo devuelve
- `error_dian` text — mensaje de error para reintentos

#### `cajas_pos` — sin `responsable_fe`

El campo no existe ni en `cajas_pos` ni en `tenants`. Hay `tenants.facturacion_electronica` (boolean) pero es para FV, no para DE-POS.

#### `resoluciones_dian` — sin `tipo_documento`

No hay forma de distinguir si una resolución es de FV, NC, ND o DE-POS. La función `registrarResolucion()` ya soporta `type_document_id: 5` (POS) al llamar a Plemsi, pero el schema no lo persiste.

#### `POST /api/pos/ventas` — sin llamada a Plemsi

La ruta registra la venta y crea el asiento contable, pero nunca llama a `emitirDocumentoPOS()`.

### Ambigüedades que quedan pendientes de confirmar con Plemsi

| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | ¿Los totales en el payload POS deben ir como `String()` o como `"N.NN"` (toFixed)? | El código actual usa `String()` (puede ser `"12345"` sin decimales), mientras que `emitirFactura` usa `.toFixed(2)`. Si Plemsi valida formato, puede rechazar. |
| 2 | ¿El campo exacto del CUDE en la respuesta es `cude`, `uuid`, o `id`? | Necesitamos persistirlo correctamente en BD. |
| 3 | ¿Cómo se anula un documento equivalente ante la DIAN? ¿Plemsi tiene un endpoint de anulación POS? | Impacta diseño del flujo de devolución. |
| 4 | ¿El `type_document_id` para resolución POS es `5`? | El comentario en el código dice `5=POS` pero no ha sido verificado con una llamada real. |
| 5 | ¿"Consumidor final" requiere enviar NIT 222222222222 en algún campo, o se omite `customer` completamente? | Si Plemsi valida la ausencia del campo podría rechazar. |

### Decisiones de diseño (Etapa 1 en adelante)

- **`responsable_fe`**: va en `tenants` (columna propia), no en `cajas_pos`. Justificación: es un atributo fiscal de la empresa, no de la caja. Todas las cajas de un mismo tenant responsable emitirán DE-POS.
- **Consecutivo**: separado del consecutivo de facturas — usar `siguienteConsecutivo("ventas_pos", "consecutivo", tenantId)` que ya existe, diferenciado por resolución activa de tipo DE-POS.
- **Fallos DIAN**: la venta NUNCA se pierde. Si `emitirDocumentoPOS()` falla → `estado_dian = "error"`, `error_dian = mensaje`. Reintento manual vía `POST /api/pos/ventas/:id/reenviar-dian`.
- **Anulación**: por ahora solo flag local `requiere_ajuste_dian: true` en `ventas_pos`. Flujo ante DIAN queda pendiente hasta confirmar endpoint de Plemsi.

---

## Etapas 1-5 — PENDIENTES

Trabajo interrumpido para ejecutar auditoría de funcionalidades. Continuar desde Etapa 1 (schema + migración) una vez el usuario lo autorice.

### Checklist de Etapa 1 (para cuando se retome)

- [ ] Agregar `responsable_fe boolean` a `tenants` — migración Drizzle
- [ ] Agregar `tipo_documento varchar(30)` a `resoluciones_dian` — migración Drizzle  
- [ ] Agregar `cude`, `qr_data`, `error_dian` a `ventas_pos` — migración Drizzle
- [ ] Ampliar `ESTADOS_DIAN_POS` con `"error"` y `"no_aplica"`
- [ ] Actualizar CRUD de `ResolucionesDian.tsx` para crear resoluciones tipo DE-POS
- [ ] Agregar toggle `responsable_fe` en `AdminCajas.tsx` o `ConfiguracionEmpresa.tsx`
