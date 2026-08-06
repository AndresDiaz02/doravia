# Progreso de refactorización Doravia

## Completed

- Fase 0–1: inventario inicial de arquitectura, dominios, esquemas, rutas, jobs, pruebas y configuración.
- Recuperado el módulo de nómina previamente desarrollado e integrado con la versión actual.
- Eliminados secretos de `.env.example`; el archivo usa placeholders y el selector DIAN documentado es `DIAN_PROVEEDOR`.
- Corregido el generador de clave del rate limiter para usar la IP y no el objeto HTTP completo.
- Eliminado el fallback de resolución DIAN fija de notas crédito/débito; ahora se bloquea el envío si falta la resolución de la factura original.
- Reforzadas mutaciones de nómina y documento soporte con filtro de tenant y validación de centro de costos.
- El build del API dejó de ser un falso positivo: ahora ejecuta typecheck real y la línea base del API quedó corregida.
- Añadido CI para typecheck del API, pruebas y builds de ERP/POS en cada push a `main` y pull request.
- Webhooks de pagos endurecidos: producción exige firma por tenant para cotizaciones y bloquea suscripciones sin contrato de firma verificado.
- Suite API: 298 pruebas verdes; compilación de frontend y verificación actual del API completadas antes de esta auditoría.

- La vista web de detalle de nomina ahora expone por empleado el estado del documento electronico, CUDE y el error devuelto por el proveedor. Render ejecuta la migracion idempotente antes de publicar la API, de modo que el esquema y el codigo se despliegan juntos.

## In progress

- Auditoría de mutaciones por tenant, estados financieros y endpoints electrónicos.
- Endurecimiento de build/typecheck/CI.
- Reparación progresiva de la línea base de TypeScript: el chequeo inicial detectó errores de configuración compartida y componentes UI existentes.

## Pending

- Historial e idempotencia de documentos electrónicos y webhooks.
- Restricciones e índices de integridad de datos mediante migraciones seguras.
- E2E de venta, POS, cartera, inventario y nómina.
- Documentación de arquitectura, datos, seguridad y operación basada en estado real.

## Blocked

- Confirmación y sandbox de Plemsi para nómina electrónica.
- Rotación de todas las credenciales que fueron expuestas fuera del repositorio.
- Confirmación de Bold del esquema de firma de webhooks de suscripciones.

## Requires legal review

- Tabla de retención y parámetros de nómina vigentes.
- Política de retención, anonimización y protección de datos personales.

## Requires product decision

- Alcance comercial del POS mientras la emisión electrónica no esté verificada extremo a extremo.
