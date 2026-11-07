# P0-INT-001 — preflight y reversión de migración

Esta entrega no ejecuta migraciones fuera del PostgreSQL efímero de CI.

## Preflight obligatorio

Ejecutar primero [p0-int-001-duplicate-audit.sql](./p0-int-001-duplicate-audit.sql) en una copia o entorno autorizado, sin modificar registros. Además, verificar el punto de partida del contador:

```sql
SELECT tenant_id, anio, ultimo_numero
FROM consecutivos_asientos
ORDER BY tenant_id, anio;
```

La migración detiene la creación de índices si encuentra consecutivos POS o asientos duplicados. No borra, fusiona ni renumera datos históricos. El nuevo contador se inicializa desde el máximo `AC-AAAA-NNNNN` por empresa y año.

## Reversión

La migración es aditiva y no tiene una reversión DDL automática: eliminar el contador o los índices después de que se hayan emitido asientos puede volver a permitir colisiones. Si se debe retirar la aplicación, se revierte primero el código y se conservan `consecutivos_asientos` e índices como protección de datos. Cualquier eliminación posterior de objetos requiere una revisión separada, respaldo verificable y aprobación explícita; nunca forma parte de un rollback automático.
