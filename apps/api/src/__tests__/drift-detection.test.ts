import { describe, it, expect } from "vitest";

// Replica la función pura de comparación de migrate.ts para demostrar que
// el algoritmo detecta drift correctamente sin necesitar conexión a BD.
function buildDriftReport(
  expected: Map<string, Set<string>>,
  actual: Map<string, Set<string>>,
): string[] {
  const drift: string[] = [];
  for (const [tableName, expectedCols] of expected) {
    const actualCols = actual.get(tableName);
    if (!actualCols) {
      drift.push(`TABLA FALTANTE en BD: "${tableName}"`);
      continue;
    }
    for (const col of expectedCols) {
      if (!actualCols.has(col)) {
        drift.push(`COLUMNA FALTANTE en BD: "${tableName}.${col}"`);
      }
    }
  }
  return drift;
}

describe("drift-detection: buildDriftReport", () => {
  it("no reporta drift cuando schema y BD coinciden", () => {
    const expected = new Map([
      ["tenants", new Set(["id", "nombre", "trial_ends_at"])],
    ]);
    const actual = new Map([
      ["tenants", new Set(["id", "nombre", "trial_ends_at"])],
    ]);
    expect(buildDriftReport(expected, actual)).toEqual([]);
  });

  it("detecta columna faltante en BD (el bug de 2026-07-06)", () => {
    const expected = new Map([
      ["tenants", new Set(["id", "nombre", "trial_ends_at"])],
    ]);
    // BD sin trial_ends_at — exactamente el escenario que causó el fallo de producción
    const actual = new Map([
      ["tenants", new Set(["id", "nombre"])],
    ]);
    const drift = buildDriftReport(expected, actual);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('tenants.trial_ends_at');
  });

  it("detecta tabla faltante en BD", () => {
    const expected = new Map([
      ["tenants", new Set(["id"])],
      ["bold_payments", new Set(["id", "monto"])],
    ]);
    const actual = new Map([
      ["tenants", new Set(["id"])],
      // bold_payments ausente
    ]);
    const drift = buildDriftReport(expected, actual);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('"bold_payments"');
  });

  it("detecta múltiples columnas faltantes en múltiples tablas", () => {
    const expected = new Map([
      ["tenants", new Set(["id", "trial_ends_at", "facturacion_electronica"])],
      ["users", new Set(["id", "usuario_pos", "dark_mode"])],
    ]);
    const actual = new Map([
      ["tenants", new Set(["id"])],                // falta trial_ends_at y facturacion_electronica
      ["users", new Set(["id", "dark_mode"])],     // falta usuario_pos
    ]);
    const drift = buildDriftReport(expected, actual);
    expect(drift).toHaveLength(3);
    expect(drift.some((d) => d.includes("tenants.trial_ends_at"))).toBe(true);
    expect(drift.some((d) => d.includes("tenants.facturacion_electronica"))).toBe(true);
    expect(drift.some((d) => d.includes("users.usuario_pos"))).toBe(true);
  });

  it("ignora columnas extra en BD que no están en schema (sin falsos positivos)", () => {
    const expected = new Map([
      ["tenants", new Set(["id", "nombre"])],
    ]);
    // BD tiene columnas adicionales — no debe reportarlas como drift
    const actual = new Map([
      ["tenants", new Set(["id", "nombre", "columna_legacy", "otra_extra"])],
    ]);
    expect(buildDriftReport(expected, actual)).toEqual([]);
  });
});
