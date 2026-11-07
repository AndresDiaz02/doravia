# OPS-001A — Despliegues controlados

Este procedimiento separa la integración de código en `main` de la
publicación de ERP, POS y landing. No modifica configuraciones de Cloudflare,
Netlify, Render o Neon: esas condiciones deben quedar verificadas por un
propietario antes de fusionar OPS-001A.

## Controles incluidos en el repositorio

Los workflows `Deploy ERP (manual)`, `Deploy POS (manual)` y `Deploy Landing
(manual)` se inician exclusivamente con `workflow_dispatch`. Un `push` o merge
a `main` no los inicia.

Cada workflow tiene dos fases:

1. `verify-release` solo permite ejecuciones cuya definición fue iniciada desde
   `main`. Exige un SHA completo y comprueba que ese commit pertenece al
   historial de `origin/main`.
2. `deploy` descarga exactamente el SHA validado y usa el Environment de GitHub
   `production`. Los secretos de Cloudflare se referencian solo en este job.

El Environment debe configurarse fuera del repositorio para que realmente
solicite aprobación. Sin reglas de Environment, la referencia `production` no
crea una aprobación por sí sola.

## Configuración manual obligatoria antes del merge

### GitHub

1. Crear o actualizar el Environment `production`.
2. Exigir revisores de despliegue y restringir las ramas de despliegue a
   `main` o a ramas protegidas que incluyan solamente `main`.
3. Mover `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` y cualquier variable
   productiva usada por estos jobs al alcance de Environment `production`.
4. Crear un ruleset para `main` que exija pull request, revisión,
   conversaciones resueltas, checks de CI y bloquee force-push y borrado.
   Tras integrar QA-002 y P0-INT-001, los checks requeridos deben incluir
   `Typecheck, tests and builds` y `POS transactional integrity (ephemeral
PostgreSQL)`.
5. Activar en ese ruleset la revisión obligatoria de CODEOWNERS. El archivo
   `.github/CODEOWNERS` solo designa propietarios; no obliga revisiones sin esta
   regla. Sustituir `@AndresDiaz02` por un equipo de Operaciones cuando exista.

### Proveedores externos

Antes del primer merge protegido, un propietario debe conservar evidencia de
estas verificaciones:

| Proveedor        | Verificación necesaria                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Pages | ERP, POS y landing no tienen una integración Git que publique producción al recibir un push. La publicación debe quedar a cargo de los workflows manuales.                |
| Netlify          | Confirmar si cada sitio sigue conectado al repositorio. Desactivar deploy de producción y previews automáticos, o desconectarlo si Cloudflare es el proveedor definitivo. |
| Render           | Desactivar Auto Deploy de la integración Git. No cambiar `render.yaml` en OPS-001A.                                                                                       |
| Neon             | Confirmar que las migraciones productivas solo se ejecutan durante una publicación aprobada y que existe un respaldo restaurable.                                         |

## Publicar una versión

1. Confirmar que el PR fue integrado y que el SHA de release tiene CI verde.
2. En GitHub Actions, abrir el workflow del producto y elegir la rama `main`.
3. Ejecutar **Run workflow** e introducir el SHA completo de 40 caracteres del
   commit aprobado.
4. El job de validación rechaza SHA inexistente, no exacto o fuera de `main`.
5. El job de despliegue quedará pendiente hasta que los revisores del
   Environment `production` lo aprueben.
6. Revisar el resultado del proveedor y hacer el smoke test correspondiente.
   Registrar SHA, aprobadores, hora, URL y resultado en el ticket de release.

## Reversión

Para ERP, POS o landing, ejecutar el workflow manual otra vez desde `main` con
el SHA completo de la última versión sana que siga en el historial de `main`.
La validación y aprobación de Environment se repiten. No revertir una
migración de datos como parte de este proceso: las migraciones requieren un
plan específico, respaldo validado y aprobación contable.

## Auditoría de Render: migración y arranque

Actualmente `render.yaml` ejecuta `pnpm db:migrate` tanto en
`preDeployCommand` como en `startCommand`. Por tanto, cualquier despliegue de
Render que ocurra puede ejecutar migraciones contra la base configurada. OPS-001A
no lo altera para evitar cambiar el comportamiento productivo sin una ventana
de mantenimiento aprobada.

La propuesta para una entrega posterior es:

1. desactivar Auto Deploy en Render;
2. ejecutar migraciones como una etapa manual, bloqueada y registrada, antes
   de liberar la nueva aplicación;
3. iniciar la API sin volver a migrar en cada arranque;
4. exigir backup restaurable, comprobación de drift y plan de reversión antes
   de migraciones no aditivas.

Esa separación es OPS-001B y requiere revisión de compatibilidad de cada
migración; no se incluye en este cambio.
