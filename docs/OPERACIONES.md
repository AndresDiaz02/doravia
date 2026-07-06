# Manual de Operaciones — Doravia

Procedimientos para backup, restauración, despliegue y contingencias.

---

## 1. Backups de base de datos

### 1.1 Backups automáticos en Railway

Railway hace backups automáticos del volumen de PostgreSQL. Para verificar:

1. Abre [railway.app](https://railway.app) → proyecto Doravia → servicio **Postgres**
2. Ve a la pestaña **Backups**
3. Confirma que el backup más reciente tenga menos de 24 h de antigüedad
4. Railway retiene backups por 7 días en el plan Starter y 30 días en planes superiores

### 1.2 Backup manual con script

Requiere `pg_dump` instalado localmente (incluido en PostgreSQL).

```bash
# Copia DATABASE_URL desde Railway (Settings → Variables)
export DATABASE_URL="postgres://usuario:clave@host:5432/railway"

node scripts/backup-db.mjs
```

El archivo queda en `backups/doravia_YYYY-MM-DD_HH-MM-SS.dump`.

### 1.3 Restaurar un backup

```bash
# Restaurar en una base local (para pruebas)
pg_restore --clean --no-acl --no-owner \
  -d "postgres://localhost:5432/doravia_local" \
  backups/doravia_2026-06-22_14-35-00.dump

# Restaurar en Railway (cuidado: sobreescribe producción)
pg_restore --clean --no-acl --no-owner \
  -d "$DATABASE_URL" \
  backups/doravia_2026-06-22_14-35-00.dump
```

> **Retención legal DIAN:** Plemsi almacena los documentos electrónicos (facturas, NC, ND) por **6 años** según exigencia DIAN. Aunque se pierda la base de datos local, los XML firmados y los CUFEs quedan en los servidores de Plemsi y pueden recuperarse vía su panel de administración.

---

## 2. Despliegue (Railway + Cloudflare)

### 2.1 API (Railway)

El deploy es automático al hacer push a `main`. Railway ejecuta:

```
pnpm db:push && pnpm db:seed && pnpm --filter @workspace/api run start
```

- `db:push` aplica el schema sin migraciones destructivas
- `db:seed` siembra planes y PUC. Solo siembra datos demo si `SEED_DEMO=true`
- Para un deploy manual forzado: Railway → proyecto → **Deploy** → "Trigger deploy"

### 2.2 Web (Cloudflare Pages)

El deploy es automático al hacer push a `main`. Para forzarlo:

```bash
cd apps/web
pnpm build
# Sube manualmente en Cloudflare Pages → proyecto → "Upload assets"
```

O via CLI:

```bash
npx wrangler pages deploy dist --project-name doravia
```

### 2.3 Variables de entorno requeridas en Railway

| Variable | Descripción | Obligatoria |
|---|---|---|
| `DATABASE_URL` | URL de PostgreSQL (Railway la inyecta automáticamente) | Sí |
| `JWT_SECRET` | Clave para firmar tokens | Sí |
| `ALLOWED_ORIGINS` | Dominios del frontend separados por coma | Sí |
| `RESEND_API_KEY` | API de Resend para emails | Sí |
| `PLEMSI_API_KEY` | Clave de API Plemsi | Sí |
| `PLEMSI_NIT` | NIT del emisor en Plemsi | Sí |
| `DIAN_AMBIENTE` | `1` = producción, otro = pruebas | Sí |
| `BOLD_SECRET_KEY` | Webhook secret de Bold | Sí |
| `ANTHROPIC_API_KEY` | Para el asistente IA | Sí |
| `SEED_DEMO` | `true` solo en entorno demo | No |
| `ROSE_SEED_PASSWORD` | Password de rose@doravia.com en seed | Solo si SEED_DEMO=true |
| `SENTRY_DSN` | DSN de Sentry para monitoreo de errores | No |

---

## 3. Runbook de caída de servicio

### 3.1 API caída (Railway)

1. Abre Railway → proyecto → servicio **api** → pestaña **Deployments**
2. Revisa los logs del último deploy fallido
3. Si es error de DB: verifica que el servicio Postgres esté activo
4. Si es error de código: revisar logs, hacer rollback al deploy anterior con "Redeploy" en el deploy previo
5. En caso extremo: Railway → Postgres → **Backups** → restaurar backup

### 3.2 Web caída (Cloudflare Pages)

1. Cloudflare Dashboard → Pages → doravia → pestaña **Deployments**
2. Si el último deploy falló, haz "Rollback" al deploy anterior (botón en la lista)
3. Si hay problema de DNS: Cloudflare → DNS → verificar que los registros CNAME apunten a `doravia.pages.dev`

### 3.3 DIAN / Plemsi no responde

- Las facturas quedan en estado `pendiente` en la DB — **no se pierden**
- Plemsi tiene SLA de disponibilidad; revisar su página de estado
- Si el problema persiste > 4 h, contactar soporte Plemsi
- Los documentos se pueden reenviar manualmente con:
  ```bash
  node scripts/reenviar-facturas-error.mjs
  node scripts/reenviar-nc-nd-dian.mjs
  ```

---

## 4. Habilitación DIAN (pendiente)

Para activar la facturación electrónica real ante la DIAN:

1. Cerrar acuerdo comercial con un agente Plemsi certificado
2. Recibir credenciales de producción (`PLEMSI_API_KEY` producción + `PLEMSI_NIT`)
3. Registrar resolución de facturación real ante la DIAN (Plemsi lo gestiona)
4. Actualizar en Railway:
   - `DIAN_AMBIENTE=1`
   - `PLEMSI_API_KEY` (producción)
5. El `TestSetId` de pruebas deja de usarse — el endpoint cambia a `api.plemsi.com`

> El NIT de habilitación y el TestSetId **no deben estar en el repositorio**. Guardarse únicamente en Railway (Variables de entorno).

---

## 5. Contactos de soporte

| Servicio | Canal |
|---|---|
| Railway | support.railway.app |
| Cloudflare | dash.cloudflare.com → Support |
| Plemsi | soporte@plemsi.com o su panel de administración |
| Resend | resend.com/support |
| Sentry | sentry.io/support |
