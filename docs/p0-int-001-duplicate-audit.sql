-- P0-INT-001 — auditoría SOLO LECTURA antes de instalar índices únicos.
-- No ejecuta DELETE, UPDATE, MERGE ni consolidaciones. Guardar el resultado
-- como evidencia y solicitar aprobación antes de cualquier corrección manual.

-- Consecutivos POS que impedirían confirmar el índice único.
SELECT
  tenant_id,
  consecutivo,
  COUNT(*) AS cantidad,
  ARRAY_AGG(id ORDER BY created_at) AS venta_ids,
  MIN(created_at) AS primera_venta,
  MAX(created_at) AS ultima_venta
FROM ventas_pos
GROUP BY tenant_id, consecutivo
HAVING COUNT(*) > 1
ORDER BY cantidad DESC, tenant_id, consecutivo;

-- Números de asiento duplicados dentro de la misma empresa.
SELECT
  tenant_id,
  numero,
  COUNT(*) AS cantidad,
  ARRAY_AGG(id ORDER BY created_at) AS asiento_ids,
  MIN(created_at) AS primer_asiento,
  MAX(created_at) AS ultimo_asiento
FROM asientos_contables
GROUP BY tenant_id, numero
HAVING COUNT(*) > 1
ORDER BY cantidad DESC, tenant_id, numero;

-- Asientos automáticos duplicados que apuntan al mismo documento origen.
SELECT
  tenant_id,
  origen,
  referencia_id,
  COUNT(*) AS cantidad,
  ARRAY_AGG(id ORDER BY created_at) AS asiento_ids,
  MIN(created_at) AS primer_asiento,
  MAX(created_at) AS ultimo_asiento
FROM asientos_contables
WHERE referencia_id IS NOT NULL
GROUP BY tenant_id, origen, referencia_id
HAVING COUNT(*) > 1
ORDER BY cantidad DESC, tenant_id, origen, referencia_id;
