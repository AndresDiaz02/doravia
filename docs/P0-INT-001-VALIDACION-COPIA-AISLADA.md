# P0-INT-001 — validación sobre copia aislada

Este procedimiento valida las migraciones y los duplicados históricos sin
conectarse a Neon, Render ni a la base productiva. No contiene credenciales.

## Precondiciones y bloqueo actual

- Debe existir un respaldo autorizado, cifrado y con una fecha conocida.
- El responsable de datos debe confirmar por escrito que el respaldo puede
  restaurarse para QA y que contiene una muestra representativa del historial.
- Las credenciales del entorno temporal se entregan mediante un gestor de
  secretos o variables de sesión; nunca se escriben en este repositorio.

Si falta cualquiera de estos elementos, **no se sustituye esta validación por
una base vacía**. Al momento de escribir este documento no hay un respaldo
autorizado disponible para esta ejecución; la validación queda pendiente.

## Crear y restringir el entorno temporal

1. Crear una instancia PostgreSQL independiente, por ejemplo
   `doravia_p0_eval_<fecha>`, sin réplica, peering, túnel ni usuario compartido
   con producción.
2. Desactivar acceso público. Autorizar solamente la IP o red del runner de QA
   y una cuenta temporal con privilegios mínimos para restaurar y migrar.
3. Configurar vencimiento y cifrado del volumen/respaldo según la política de
   seguridad. Registrar propietario, fecha de caducidad y ticket de aprobación.
4. Cargar la URL exclusivamente en la sesión autorizada:

   ```powershell
   $env:EVAL_DATABASE_URL = '<entregada por el gestor de secretos>'
   $env:AUTORIZADO_BACKUP_PATH = '<ruta privada al respaldo autorizado>'
   ```

## Restaurar, auditar y migrar

Ejecutar desde una estación controlada con PostgreSQL client instalado. El
comando falla ante el primer error y no escribe en el repositorio:

```powershell
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error `
  --dbname "$env:EVAL_DATABASE_URL" "$env:AUTORIZADO_BACKUP_PATH"

psql --set ON_ERROR_STOP=1 --dbname "$env:EVAL_DATABASE_URL" `
  --file docs/p0-int-001-duplicate-audit.sql |
  Tee-Object -FilePath '<ubicacion privada aprobada>\\p0-duplicate-audit.txt'

$env:DATABASE_URL = $env:EVAL_DATABASE_URL
pnpm db:migrate
```

- Conservar el resultado del reporte fuera de Git. Cualquier fila duplicada
  bloquea los índices únicos: no borrar, consolidar ni renumerar sin
  aprobación contable.
- La migración debe terminar con la comprobación de esquema sin drift. Si no lo
  hace, descartar la copia temporal y abrir una corrección; no ejecutar
  `db:push` contra la copia restaurada para ocultar diferencias.

## Finalización segura

Al terminar, revocar las credenciales temporales. El responsable decide y
documenta una de estas dos opciones: destruir la instancia y su backup
temporal al vencer el periodo autorizado, o conservarla cifrada con acceso
bloqueado para una investigación. Ninguna opción modifica producción.

## Fusión sin despliegue automático

Antes de cualquier merge, un propietario debe verificar y registrar estas
condiciones en GitHub, Cloudflare, Netlify y Render:

1. Los workflows `deploy-erp.yml`, `deploy-pos.yml` y
   `deploy-landing.yml` se activan con `push` a `main`; mientras sigan así, un
   merge a `main` desplegará Cloudflare Pages.
2. Los commits de PR pueden generar previews externos. Esta evaluación observó
   checks/previews automáticos de Cloudflare y Netlify al actualizar los PR.
3. Render no se despliega desde un workflow GitHub de este repositorio, pero el
   estado de *auto deploy* de su integración Git debe revisarse en Render.
4. Para fusionar sin publicar, el propietario debe desactivar o pausar los
   auto-deploys/previews de los proveedores, o moverlos a una aprobación manual
   mediante un Environment protegido. Confirmar el cambio con una captura o
   registro de auditoría antes del merge.

No aplicar esos cambios externos desde esta entrega sin autorización explícita.
