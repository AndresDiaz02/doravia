# Pagos en cotizaciones — Guía de proveedores

## Arquitectura

El sistema usa un patrón provider idéntico al de DIAN/Plemsi. Cada tenant configura sus propias credenciales en la BD (cifradas con AES-256-GCM). Doravia no intermedia ni toca el dinero.

```
cotizacion (enviada|aceptada)
  → POST /api/cotizaciones/:id/link-pago
      → getTenantPagosConfig(tenantId)          — carga config de BD
          → PagoProvider.crearLinkPago(input)   — llama API del proveedor
  → INSERT pagos_cotizacion (estado=pendiente)
  → cliente paga en URL del proveedor
  → proveedor llama webhook Doravia
      → verifica firma HMAC (si event_secret configurado)
      → UPDATE pagos_cotizacion + cotizaciones.estado='pagada' (transaction)
      → notificarAdminPago (fire-and-forget)
```

## Proveedores actuales

| Provider | Archivo | Estado |
|---|---|---|
| `bold` | `apps/api/src/services/pagos/providers/bold.ts` | ✅ implementado |
| `stub` | `apps/api/src/services/pagos/providers/stub.ts` | ✅ dev/test only |
| `wompi` | — | 📋 slot documentado, pendiente |
| `payu` | — | 📋 slot documentado, pendiente |
| `mercadopago` | — | 📋 slot documentado, pendiente |

## Cómo agregar un nuevo proveedor

### 1. Crear el archivo del provider

```typescript
// apps/api/src/services/pagos/providers/wompi.ts
import type { PagoProvider, CrearLinkInput, CrearLinkResult, ... } from "../types.js";
import { decrypt } from "../../encryption.js";

export const wompiProvider: PagoProvider = {
  nombre: "wompi",

  async crearLinkPago(input: CrearLinkInput): Promise<CrearLinkResult> {
    const creds = parseCreds(input.credenciales); // decrypt + parse
    // llamar API Wompi...
    return { url_link_pago: "...", referencia_proveedor: "..." };
  },

  async verificarEstado(ref, creds) { /* ... */ },
  async procesarWebhook(payload, headers) { /* ... */ },
};
```

### 2. Registrar en el índice

En `apps/api/src/services/pagos/index.ts`:
```typescript
import { wompiProvider } from "./providers/wompi.js";

const PROVIDERS: Record<string, PagoProvider> = {
  bold: boldProvider,
  stub: stubProvider,
  wompi: wompiProvider,   // ← agregar aquí
};
```

### 3. Agregar al enum de BD

En `packages/db/src/schema/pagos_cotizacion.ts`:
```typescript
export const PROVEEDORES_PAGO = ["bold", "stub", "wompi"] as const;
```

### 4. Validar en la ruta de configuración

En `apps/api/src/routes/pagos-cotizacion.ts`, en el `PUT /configuracion`:
```typescript
if (!["bold", "stub", "wompi"].includes(proveedor)) { ... }

if (proveedor === "wompi") {
  const c = credenciales as Partial<WompiCredenciales>;
  if (!c.pub_key || !c.priv_key) {
    return res.status(400).json({ error: "Wompi requiere pub_key y priv_key." });
  }
}
```

### 5. Agregar webhook route si el proveedor la necesita

```typescript
// En pagos-cotizacion.ts
router.post("/wompi/webhook", async (req, res) => {
  // verificar firma Wompi (checksum SHA-256)
  // actualizar pagos_cotizacion + cotizaciones
});
```

En `apps/api/src/index.ts` el router ya está registrado en `/api/pagos/cotizaciones` — no requiere cambios.

### 6. Documentar URL de webhook para el tenant

El tenant debe configurar en el panel de Wompi:
```
https://app.doraviasoft.com/api/pagos/cotizaciones/wompi/webhook
```

## Formato de webhook esperado por proveedor

### Bold

Header de verificación: `bold-signature` o `x-bold-signature`  
Algoritmo: `HMAC-SHA256(payload_raw, event_secret)`

```json
{
  "data": {
    "payment_status": "APPROVED",
    "reference_id": "COT-{tenantId8}-{cotId8}-{ts}",
    "transaction_id": "txn_abc123"
  }
}
```

Estados Bold → EstadoPago Doravia:
| Bold | Doravia |
|---|---|
| APPROVED | pagado |
| REJECTED | fallido |
| FAILED | fallido |
| EXPIRED | expirado |
| REFUNDED | reembolsado |

### Stub (dev/test)

No hay webhook real. Usar:
```
POST /api/pagos/cotizaciones/stub/marcar-pagado
Body: { "referencia_externa": "COT-...", "tenant_id": "uuid" }
```
Este endpoint retorna 404 en producción.

## Seguridad

- **Credenciales**: cifradas con AES-256-GCM usando `ENCRYPTION_KEY` env var. La API key nunca se devuelve en claro — solo se muestra `****{últimos 4 chars}`.
- **Aislamiento**: cada tenant solo puede ver sus propios pagos. El webhook lookup por `referencia_externa` es único (constraint UNIQUE en BD), y el `tenant_id` se verifica en cada operación.
- **Webhook HMAC**: si el tenant configura `event_secret` en Bold, el webhook verifica la firma con comparación timing-safe antes de procesar. Si no hay `event_secret`, se acepta el webhook (equivalente al comportamiento de la integración de suscripciones existente).
- **Cross-tenant**: la referencia incluye los primeros 8 chars del `tenant_id`, lo que hace imposible que un tenant inyecte una referencia válida de otro.

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `ENCRYPTION_KEY` | Clave AES-256 (32 bytes hex). Compartida con Plemsi. |
| `APP_URL` o `FRONTEND_URL` | URL del frontend para construir redirect URLs de pago. |

No se requieren variables por proveedor — todo va en BD cifrado.
