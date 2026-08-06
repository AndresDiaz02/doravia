# Migracion de Railway a Render + Neon

Este archivo prepara el API de Doravia para un servicio web gratuito en Render y una base PostgreSQL gratuita en Neon. No contiene credenciales ni crea una base de datos vacia en produccion.

## Limites importantes

- Render Free suspende el servicio tras inactividad. Es util para recuperar una demo, no es una plataforma adecuada para operar facturacion electronica de forma continua.
- Neon Free tiene capacidad limitada. Activa sus alertas y conserva exportaciones periodicas fuera de la plataforma.
- La base de Railway debe recuperarse antes de publicar el API. Si Railway permanece suspendido y no existe un respaldo, no hay una forma segura de reconstruir facturas, usuarios, consecutivos ni configuraciones de Plemsi.

## 1. Recuperar los datos de Railway

Cuando Railway permita acceso temporalmente, desde la raiz del repositorio ejecutar:

```powershell
$env:DATABASE_URL = '<URL de conexion de Railway>'
node scripts/backup-db.mjs
```

El resultado queda bajo `backups/`, carpeta que Git ignora. Conserva ese archivo en un lugar privado y seguro. No lo subas al repositorio ni lo compartas en chats.

## 2. Crear Neon

1. Crear un proyecto gratuito de PostgreSQL en Neon.
2. Copiar la cadena de conexion con SSL que entrega Neon.
3. Guardarla como `DATABASE_URL` en Render. No incluirla en `render.yaml` ni en archivos versionados.

## 3. Restaurar antes de migrar

Con el respaldo de Railway y la URL de Neon:

```powershell
$env:PGPASSWORD = '<contrasena de Neon>'
pg_restore --clean --if-exists --no-owner --no-acl --dbname '<URL de conexion de Neon>' backups\doravia_FECHA.dump
```

Luego ejecutar una sola vez las migraciones de Doravia contra Neon:

```powershell
$env:DATABASE_URL = '<URL de conexion de Neon>'
pnpm db:migrate
```

No ejecutar `pnpm db:seed` sobre una base restaurada: puede introducir datos de prueba o alterar datos existentes. Tampoco ejecutar `pnpm db:migrate` contra una base nueva y vacia; el proceso actual presupone que ya existe el esquema base de Doravia.

### Instalacion nueva (solo si no se recuperaran datos)

Si no existe operacion ni respaldo que conservar, inicializar Neon una sola vez y en este orden:

```powershell
$env:DATABASE_URL = '<URL de conexion de Neon>'
pnpm db:push
pnpm db:seed
pnpm db:migrate
```

`db:push` crea el esquema base; `db:migrate` aplica los ajustes acumulados; y `db:seed` crea planes y el PUC base. No establecer `SEED_DEMO=true`, para no crear datos de simulacion. Nunca usar `db:push` como comando de inicio del servicio: es un paso controlado de inicializacion, no un reemplazo de migraciones.

## 4. Crear el servicio en Render

1. En Render, crear un **Blueprint** desde el repositorio de GitHub. Detectara `render.yaml` en la raiz.
2. Mantener el directorio raiz del repositorio: el monorepo necesita `apps/` y `packages/` durante la instalacion.
3. Elegir el plan Free solo como medida temporal.
4. En el panel de Render cargar las variables listadas con `sync: false` en `render.yaml`.
5. Tras el primer despliegue, establecer `APP_URL` con la URL final del frontend y `ALLOWED_ORIGINS` con los dominios exactos de las aplicaciones web/POS. Agregar el dominio temporal de Render solo si se usa desde el navegador.

## Variables que deben conservarse exactamente

| Variable | Motivo |
| --- | --- |
| `DATABASE_URL` | Conexion a la base restaurada en Neon. |
| `JWT_SECRET` | Mantiene validas las sesiones emitidas previamente. |
| `ENCRYPTION_KEY` | Descifra las credenciales de Plemsi y pagos almacenadas por tenant. No se debe regenerar. |
| `DIAN_PROVEEDOR=plemsi` | Hace que el arranque de produccion valide el proveedor fiscal correcto. |
| `RESEND_API_KEY` y `RESEND_FROM` | El correo usa Resend por HTTPS; no configurar SMTP en Render Free. |

Agregar solo las llaves de integraciones que esten realmente activas: Anthropic, Bold, Sentry y los correos de fundadores. Las credenciales de Plemsi se manejan por tenant y deben llegar desde la base restaurada cifradas con la misma `ENCRYPTION_KEY`.

## Verificacion posterior al despliegue

1. Abrir `https://<servicio-render>/health`; debe responder correctamente.
2. Iniciar sesion y comprobar lectura de clientes, productos y facturas con datos existentes.
3. Confirmar en `/api/empresa/dian-modo` que el proveedor sea `plemsi` y el modo sea produccion.
4. En un tenant de pruebas, emitir una factura de bajo valor y confirmar el resultado en Plemsi antes de facturar a clientes reales.
5. Revisar que los correos salientes lleguen por Resend.

## Enlaces oficiales

- [Render Free](https://render.com/docs/free)
- [Blueprints de Render](https://render.com/docs/blueprint-spec)
- [Neon pricing](https://neon.com/pricing)
