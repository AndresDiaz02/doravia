# Manual de Operaciones — Doravia

Procedimientos vigentes para Doravia sobre **Render, Neon y Cloudflare**. No
usar Railway: ya no es parte de la operación.

## 1. Servicios y responsabilidades

| Componente | Servicio | Comprobación |
| --- | --- | --- |
| API | Render (`doravia-api`) | `/live` confirma proceso; `/health` confirma proceso y Neon |
| Base de datos | Neon PostgreSQL | Consola Neon y `/health` |
| ERP y POS | Cloudflare Pages | `app.doraviasoft.com` y `pos.doraviasoft.com` |
| Facturación/Nómina electrónica | Plemsi | Panel de Plemsi y estados guardados por tenant |

`/live` no consulta la base y es el health check de Render. `/health` incluye
la conectividad de Neon para diagnóstico; no debe usarse como señal de reinicio.

## 2. Despliegue seguro

1. Ejecutar en local antes del push:

   ```powershell
   pnpm --filter @workspace/api typecheck
   pnpm --filter @workspace/api test
   pnpm --filter @workspace/web build
   pnpm --filter @workspace/pos build
   ```

2. Hacer push a `main`.
3. Verificar en GitHub Actions los builds de ERP, POS y landing.
4. En Render, abrir `doravia-api` y confirmar que el commit más reciente esté
   **Live**. Si los despliegues automáticos no aparecen, usar **Manual Deploy →
   Deploy latest commit**.
5. Validar públicamente:

   ```powershell
   Invoke-WebRequest https://doravia-api.onrender.com/live
   Invoke-WebRequest https://doravia-api.onrender.com/health
   ```

6. Confirmar el login y una ruta de ERP/POS con una cuenta de prueba.

El comando de Render aplica `pnpm db:migrate` antes de iniciar la API. Si una
migración detecta drift, el despliegue se detiene para no iniciar con un esquema
incompleto.

## 3. Variables de entorno de Render

Guardar secretos exclusivamente en el servicio `doravia-api`, nunca en Git ni
en el frontend.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Cadena SSL de Neon |
| `JWT_SECRET` | Firma de sesiones; no regenerar sin plan de cierre de sesión |
| `ENCRYPTION_KEY` | Descifra credenciales cifradas por tenant; no regenerar |
| `ALLOWED_ORIGINS` | Dominios exactos de ERP, POS y landing |
| `APP_URL` | URL pública del ERP para enlaces enviados por correo |
| `DIAN_PROVEEDOR=plemsi` | Proveedor tecnológico activo |
| `NOMINA_MODO=pruebas` | Mantener hasta completar la validación de nómina |
| `RESEND_API_KEY`, `RESEND_FROM` | Correo transaccional |
| `SENTRY_DSN` | Observabilidad, si se usa |

Los tokens de Plemsi son por empresa y se guardan cifrados desde la interfaz;
no se deben convertir en una variable global compartida.

## 4. Base de datos: backup y restauración

Programar y verificar backups en Neon. Antes de un cambio estructural, crear
un backup lógico con `pg_dump` y conservarlo fuera del repositorio.

```powershell
$env:DATABASE_URL = '<cadena SSL de Neon>'
node scripts/backup-db.mjs
```

Para restaurar, hacerlo primero en una base de pruebas. Una restauración en
producción es destructiva y requiere detener las operaciones y validar el
backup con el responsable técnico.

```powershell
pg_restore --clean --if-exists --no-owner --no-acl `
  --dbname '<cadena SSL de Neon>' backups\doravia_FECHA.dump
```

No ejecutar `db:push` sobre una base de producción existente. Para una base
nueva sin datos: `pnpm db:push`, luego `pnpm db:seed` y finalmente
`pnpm db:migrate`.

## 5. Runbook: API lenta o caída

1. Abrir `https://doravia-api.onrender.com/live`.
   - `200`: el proceso está disponible.
   - `503 hibernate-wake-error`: Render no logró reactivar la instancia.
2. Abrir `/health`.
   - `200` y `db: connected`: API y Neon disponibles.
   - `503` con respuesta JSON: revisar Neon y las variables de Render.
3. Si hay `hibernate-wake-error`, en Render usar **Manual Deploy → Deploy
   latest commit** y revisar los logs del arranque y de `pnpm db:migrate`.
4. Si el servicio despierta lento de forma recurrente, el plan gratuito de
   Render no es apto para clientes reales: mover la API a una instancia que no
   se suspenda.
5. Si la API funciona pero el ERP/POS no, revisar el último deploy de
   Cloudflare Pages y las variables `VITE_API_URL` antes de modificar DNS.

## 6. Plemsi y DIAN

- Facturación: confirmar empresa habilitada, resolución asociada y contrato de
  firma vigente en Plemsi.
- Nómina: usar `NOMINA_MODO=pruebas`, token propio por empresa, empleados
  completos y numeraciones de nómina antes de emitir pruebas.
- Una respuesta fallida de Plemsi deja el error guardado; no se debe reenviar
  de forma masiva sin revisar el documento, la numeración y la causa.
- Conservar documentos electrónicos y soportes según las obligaciones legales
  aplicables y las políticas vigentes de Plemsi/DIAN.

## 7. Contactos

| Servicio | Canal |
| --- | --- |
| Render | [dashboard.render.com](https://dashboard.render.com/) |
| Neon | [console.neon.tech](https://console.neon.tech/) |
| Cloudflare | [dash.cloudflare.com](https://dash.cloudflare.com/) |
| Plemsi | soporte y panel de aliados de Plemsi |
| Sentry | [sentry.io](https://sentry.io/) |
