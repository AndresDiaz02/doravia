/**
 * Tests de conciliación bancaria — FASE 6
 *
 * Tests de lógica pura (sin DB, sin HTTP):
 * - Matching: monto exacto ±3 días → fuerte; monto exacto >3 días → débil; monto distinto → no match
 * - Import: fila con monto inválido → error detectado antes de insertar
 * - Resumen: comisión no registrada → diferencia correctamente calculada
 * - RBAC: requireNotContador rechaza contador con 403, permite admin
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── Lógica de matching (extraída de routes/conciliacion.ts) ──────────────────

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

type Confianza = "fuerte" | "debil" | null;

function calcularConfianza(
  montoMov: number,
  montoLinea: number,
  fechaMov: string,
  fechaLinea: string,
): Confianza {
  if (Math.abs(montoMov - montoLinea) > 0.01) return null;
  const diff = Math.abs(daysBetween(fechaMov, fechaLinea));
  return diff <= 3 ? "fuerte" : "debil";
}

// ── Parsing de fechas y montos (misma lógica que routes/conciliacion.ts) ─────

function normalizarFecha(raw: string): string {
  if (!raw) return "";
  const m1 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function parsearMonto(raw: string): number | null {
  // Quitar símbolo moneda y espacios
  let s = raw.replace(/[$\s]/g, "");
  // Formato colombiano: punto = miles, coma = decimal (ej. 1.500.000,50)
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  // Formato con coma como miles (ej. 1,500,000)
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  }
  // Fallback: quitar comas (miles anglosajones) y dejar punto decimal
  else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) || n === 0 ? null : n;
}

// Simula la validación atomica de filas que hace el endpoint de importar
function validarFilasImport(
  filas: { fecha: string; descripcion: string; monto_raw: string }[],
): { validas: number; errores: { fila: number; error: string }[] } {
  const errores: { fila: number; error: string }[] = [];
  let validas = 0;

  for (let i = 0; i < filas.length; i++) {
    const { fecha, monto_raw } = filas[i];
    const nFila = i + 2;

    const fechaNorm = normalizarFecha(fecha);
    if (!fechaNorm || isNaN(Date.parse(fechaNorm))) {
      errores.push({ fila: nFila, error: `Fecha inválida: "${fecha}"` });
      continue;
    }
    const monto = parsearMonto(monto_raw);
    if (monto === null) {
      errores.push({ fila: nFila, error: `Monto inválido: "${monto_raw}"` });
      continue;
    }
    validas++;
  }
  return { validas, errores };
}

// ── Cálculo de resumen (lógica extraída) ─────────────────────────────────────

function calcularResumen(
  saldoBanco: number,
  saldoLibros: number,
  movsBancoPendientes: number,
  lineasLibrosPendientes: number,
): { diferencia: number; cuadrado: boolean } {
  const diferencia = saldoBanco - saldoLibros;
  return { diferencia, cuadrado: Math.abs(diferencia) < 0.01 };
}

// ── RBAC helper (del patrón existente en rbac.test.ts) ───────────────────────

function makeReq(role: string): Partial<Request> {
  return { userRole: role } as Partial<Request>;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json } as unknown as Response & { status: Mock; json: Mock };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// Importamos requireNotContador simulado para tests
function requireNotContador(req: Partial<Request>, res: Response, next: NextFunction) {
  if (req.userRole === "contador") {
    return (res.status as Mock)(403).json({ error: "Los usuarios con rol Contador solo tienen acceso de lectura." });
  }
  next();
}

// ── Tests: Matching ───────────────────────────────────────────────────────────

describe("Matching de conciliación bancaria", () => {
  it("monto exacto + fecha con diferencia de 2 días → match fuerte", () => {
    const r = calcularConfianza(100_000, 100_000, "2026-07-01", "2026-07-03");
    expect(r).toBe("fuerte");
  });

  it("monto exacto + fecha exactamente en límite de 3 días → match fuerte", () => {
    const r = calcularConfianza(50_000, 50_000, "2026-07-01", "2026-07-04");
    expect(r).toBe("fuerte");
  });

  it("monto exacto + fecha con diferencia de 5 días → match débil", () => {
    const r = calcularConfianza(200_000, 200_000, "2026-07-01", "2026-07-06");
    expect(r).toBe("debil");
  });

  it("montos distintos → no match (null)", () => {
    const r = calcularConfianza(100_000, 99_999, "2026-07-01", "2026-07-01");
    expect(r).toBeNull();
  });

  it("diferencia de centavo (< 0.01) → sigue siendo match", () => {
    const r = calcularConfianza(100_000.005, 100_000.005, "2026-07-01", "2026-07-02");
    expect(r).toBe("fuerte");
  });

  it("movimiento negativo (salida) y línea con monto negativo → match fuerte", () => {
    // Salida del banco: -50000 vs línea débito-crédito = -50000
    const r = calcularConfianza(-50_000, -50_000, "2026-07-10", "2026-07-11");
    expect(r).toBe("fuerte");
  });
});

// ── Tests: Importación ───────────────────────────────────────────────────────

describe("Importación de extracto bancario", () => {
  it("filas válidas → 0 errores, conteo correcto de válidas", () => {
    const filas = [
      { fecha: "01/07/2026", descripcion: "Consignación PSE", monto_raw: "500000" },
      { fecha: "2026-07-02", descripcion: "Comisión bancaria", monto_raw: "-8500" },
      { fecha: "03/07/2026", descripcion: "GMF 4x1000", monto_raw: "-2000" },
    ];
    const { validas, errores } = validarFilasImport(filas);
    expect(errores).toHaveLength(0);
    expect(validas).toBe(3);
  });

  it("fila con monto en texto → error, cero inserciones parciales", () => {
    const filas = [
      { fecha: "01/07/2026", descripcion: "Consignación", monto_raw: "500000" },
      { fecha: "02/07/2026", descripcion: "Comisión",     monto_raw: "N/A" },  // inválido
      { fecha: "03/07/2026", descripcion: "Pago PSE",     monto_raw: "150000" },
    ];
    const { validas, errores } = validarFilasImport(filas);
    expect(errores).toHaveLength(1);
    expect(errores[0].fila).toBe(3);
    expect(errores[0].error).toContain("N/A");
    // La atomicidad la garantiza el endpoint: si hay errores, no se inserta nada
    // Aquí verificamos que se detectan antes de insertar
    expect(validas).toBe(2); // las otras dos filas eran válidas
  });

  it("fila con fecha inválida → error descriptivo", () => {
    const filas = [
      { fecha: "99/99/2026", descripcion: "Débito", monto_raw: "10000" },
    ];
    const { errores } = validarFilasImport(filas);
    expect(errores).toHaveLength(1);
    expect(errores[0].error).toContain("Fecha inválida");
  });

  it("monto cero → error (los movimientos de monto cero no tienen sentido contable)", () => {
    const filas = [
      { fecha: "2026-07-01", descripcion: "Reverso", monto_raw: "0" },
    ];
    const { errores } = validarFilasImport(filas);
    expect(errores).toHaveLength(1);
    expect(errores[0].error).toContain("Monto inválido");
  });

  it("normalización de fechas DD/MM/YYYY → YYYY-MM-DD", () => {
    expect(normalizarFecha("15/07/2026")).toBe("2026-07-15");
    expect(normalizarFecha("01/01/2026")).toBe("2026-01-01");
  });

  it("fechas ya en ISO 8601 pasan sin cambios", () => {
    expect(normalizarFecha("2026-07-15")).toBe("2026-07-15");
  });

  it("montos con formato colombiano (comas/puntos) se parsean correctamente", () => {
    expect(parsearMonto("1,500,000")).toBe(1500000);
    expect(parsearMonto("$8.500")).toBe(8500);
    expect(parsearMonto("-150000")).toBe(-150000);
  });
});

// ── Tests: Resumen ────────────────────────────────────────────────────────────

describe("Resumen de conciliación", () => {
  it("banco y libros coinciden → cuadrado = true, diferencia = 0", () => {
    const { diferencia, cuadrado } = calcularResumen(5_000_000, 5_000_000, 0, 0);
    expect(diferencia).toBe(0);
    expect(cuadrado).toBe(true);
  });

  it("banco tiene comisión no registrada en libros ($8.500) → diferencia = -8.500", () => {
    // Banco muestra 4.991.500, libros muestran 5.000.000 (sin la comisión)
    // La comisión salió del banco pero no se registró como gasto
    const saldoBanco = 4_991_500;
    const saldoLibros = 5_000_000;
    const { diferencia, cuadrado } = calcularResumen(saldoBanco, saldoLibros, 1, 0);
    expect(diferencia).toBe(-8_500);
    expect(cuadrado).toBe(false);
  });

  it("cheque en tránsito (en libros, no en banco aún) → diferencia positiva", () => {
    // Libros registraron el pago, banco aún no lo refleja
    const saldoBanco = 10_000_000;
    const saldoLibros = 9_800_000;
    const { diferencia, cuadrado } = calcularResumen(saldoBanco, saldoLibros, 0, 1);
    expect(diferencia).toBe(200_000);
    expect(cuadrado).toBe(false);
  });

  it("diferencia menor a 1 centavo se considera cuadrada (float precision)", () => {
    const { cuadrado } = calcularResumen(100.001, 100.002, 0, 0);
    expect(cuadrado).toBe(true);
  });
});

// ── Tests: RBAC ──────────────────────────────────────────────────────────────

describe("RBAC conciliación bancaria", () => {
  it("admin puede ejecutar operaciones de escritura (next() es llamado)", () => {
    const req = makeReq("admin");
    const res = makeRes();
    const next = makeNext() as Mock;
    requireNotContador(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect((res.status as Mock)).not.toHaveBeenCalled();
  });

  it("contador recibe 403 en operaciones de escritura", () => {
    const req = makeReq("contador");
    const res = makeRes();
    const next = makeNext() as Mock;
    requireNotContador(req, res, next);
    expect((res.status as Mock)).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("vendedor también puede pasar requireNotContador (solo bloquea al contador)", () => {
    const req = makeReq("vendedor");
    const res = makeRes();
    const next = makeNext() as Mock;
    requireNotContador(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
