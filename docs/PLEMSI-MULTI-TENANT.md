# Plemsi Multi-Tenant — Guía técnica

## Modelo de datos

### Columnas nuevas en `tenants`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `plemsi_empresa_id` | `varchar(100)` | NULL | ID de la empresa en el panel de Plemsi |
| `plemsi_api_key_encrypted` | `text` | NULL | API Key cifrada con AES-256-GCM (ver sección de encriptación) |
| `plemsi_ambiente` | `varchar(20)` | `'pruebas'` | Ambiente activo: `pruebas` o `produccion` |
| `plemsi_habilitado` | `boolean` | `false` | Flag maestro — si false, no se intenta ninguna emisión DIAN |
| `dian_proveedor_anterior` | `varchar(50)` | NULL | Proveedor previo (siigo/alegra/loggro/otro) para auditoría de migración |
| `facturas_mes_actual` | `integer` | `0` | Contador de facturas emitidas exitosamente a la DIAN en el mes calendario |

### Columna nueva en `resoluciones_dian`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `consecutivo_inicial` | `integer` | `1` | Primer número emitido por Doravia. Diferente de `consecutivo_desde` cuando hay migración desde otro proveedor |

**Relación:** `consecutivo_actual` se inicializa en `consecutivo_inicial - 1` al crear la resolución, de forma que el primer número emitido sea exactamente `consecutivo_inicial`.

### Nueva tabla: `consumo_dian_mensual`

Historial de consumo DIAN por tenant y mes. Se popula el día 1 de cada mes antes del reset.

```sql
consumo_dian_mensual (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  ano integer NOT NULL,
  mes integer NOT NULL,  -- 1-12
  cantidad integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
)
-- índice único: (tenant_id, ano, mes)
```

---

## Flujo de emisión

1. Request llega al route handler (facturas, notas-credito, notas-debito)
2. `getPlemsiCredentials(tenantId)` — consulta tenant en DB, descifra la key en memoria
3. Si `!plemsi_habilitado` → lanza `PlemsiNotConfiguredError` → HTTP 400 con mensaje descriptivo para el usuario
4. Si no hay key → lanza `PlemsiNotConfiguredError` → HTTP 400
5. Si habilitado → llama al servicio Plemsi con `apiKey` + `ambiente`
6. Éxito → `UPDATE tenants SET facturas_mes_actual = facturas_mes_actual + 1`
7. Fallo Plemsi → guarda `estado_dian = 'error'`, `error_dian = <mensaje>` (no bloquea la operación en Doravia)

**Importante:** La API Key nunca se loguea. Los headers de Authorization se pasan directamente al `fetch` sin pasar por `console.log`.

---

## Cómo generar ENCRYPTION_KEY

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Añadir como variable de entorno `ENCRYPTION_KEY` en Railway (Settings → Variables).

La key debe ser exactamente 32 bytes (256 bits) en base64. Si el valor es inválido, el servidor arranca pero lanza error al primer intento de cifrar/descifrar.

---

## Configurar un tenant nuevo

1. Crear empresa en panel de Plemsi manualmente (https://app.plemsi.com o https://pruebas.plemsi.com)
2. Copiar API Key del menú "Autenticación" de Plemsi
3. En Doravia: **Ajustes → Facturación electrónica → Configuración Plemsi**
   - Pegar API Key
   - Seleccionar ambiente (Pruebas para habilitación DIAN, Producción después de aprobación)
   - Opcional: indicar Empresa ID de Plemsi y proveedor anterior
4. Clic en "Guardar configuración Plemsi" — la key se cifra inmediatamente con AES-256-GCM
5. Clic en "Probar conexión" → debe mostrar folios disponibles
6. Registrar resolución DIAN (menú Resoluciones)
7. Habilitar facturación electrónica en Ajustes si aún no está habilitada

---

## URLs Plemsi

- **Pruebas:** https://pruebas.plemsi.com
- **Producción:** https://app.plemsi.com

> Confirmar con Plemsi la URL de producción antes del go-live. La URL está en `PLEMSI_URL_PRODUCCION` env var (fallback: `https://app.plemsi.com`).

---

## Migración desde otro proveedor DIAN

La resolución existente se conserva tal cual (mismo número, mismo prefijo). Indicar `consecutivo_inicial` al registrar la resolución en Doravia:

- **Ejemplo:** venían en `FE010` con el proveedor anterior.
- `consecutivo_inicial = 11` → primera factura Doravia = `FE011`
- Internamente: `consecutivo_actual = 10` (el incremento ocurre antes de emitir)

```json
POST /api/resoluciones-dian
{
  "numero_resolucion": "18760000001",
  "prefijo": "FE",
  "consecutivo_desde": 1,
  "consecutivo_hasta": 5000,
  "consecutivo_inicial": 11,
  ...
}
```

---

## Estado post-migración one-shot

La migración SQL en `migrate.ts` copia la API key desde `pos_config->>'plemsi_api_key'` a `plemsi_api_key_encrypted` **en texto plano** (estado legacy). La próxima vez que el admin guarde la configuración desde el panel, el valor se reemplaza por el cifrado con AES-256-GCM.

El método `decrypt()` detecta automáticamente el formato legacy (valor sin `":"`) y lo devuelve tal cual. Una vez que el admin guarda desde el panel, el valor cifrado tiene el formato `iv_hex:tag_hex:ciphertext_hex` y se descifra normalmente.

---

## Panel fundador

- `GET /api/fundador/consumo-dian` — lista todos los tenants activos con su `facturas_mes_actual`, ordenados de mayor a menor. Incluye `total_mes` global.
- La tabla `consumo_dian_mensual` acumula el historial para análisis longitudinal.

---

## Cron de reset mensual

El job `apps/api/src/jobs/reset-consumo-dian.ts` corre el **día 1 de cada mes a las 00:05 UTC** (con `node-cron`):

1. Inserta en `consumo_dian_mensual` el conteo del mes que acaba de terminar (con `ON CONFLICT DO UPDATE`)
2. Hace `UPDATE tenants SET facturas_mes_actual = 0` en todos los tenants

El job se registra en `apps/api/src/index.ts` llamando `iniciarCronResetConsumoDian()`.
