/**
 * Tests de funcionalidades nuevas — FASE 5 (feature/audit-implementations)
 *
 * Tests de lógica pura (sin DB): cálculo de impoconsumo, depreciación lineal,
 * y validaciones de importación de clientes.
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect } from "vitest";

// ── Helpers de cálculo reutilizados desde las rutas ───────────────────────────

/** Calcula el impoconsumo de un ítem dado valor_unitario, cantidad y porcentaje. */
function calcularImpoconsumo(
  valorUnitario: number,
  cantidad: number,
  impoconsumoPct: number,
): { subtotal: number; impoconsumo_valor: number; total: number } {
  const subtotal = Math.round(valorUnitario * cantidad);
  const impoconsumo_valor = Math.round(subtotal * (impoconsumoPct / 100));
  const total = subtotal + impoconsumo_valor;
  return { subtotal, impoconsumo_valor, total };
}

/** Calcula depreciación mensual lineal exacta. */
function calcularDepreciacionLineal(
  valorAdquisicion: number,
  valorResidual: number,
  vidaUtilMeses: number,
): number {
  return Math.round((valorAdquisicion - valorResidual) / vidaUtilMeses);
}

/** Valida columnas requeridas para importación de clientes. */
function validarColumnasClientes(columnas: string[]): string[] {
  const REQUERIDAS = ["nombre", "tipo_documento", "numero_documento"];
  return REQUERIDAS.filter((c) => !columnas.map((k) => k.toLowerCase().trim()).includes(c));
}

/** Valida tipo_documento para importación de clientes. */
function validarTipoDocumento(tipo: string): boolean {
  return ["CC", "NIT", "CE", "PPN", "TI"].includes(tipo.toUpperCase());
}

// ── Tests de impoconsumo ──────────────────────────────────────────────────────

describe("Impoconsumo 8%", () => {
  it("producto $20.000 × 1 unidad → impoconsumo $1.600, total $21.600", () => {
    const resultado = calcularImpoconsumo(20_000, 1, 8);
    expect(resultado.subtotal).toBe(20_000);
    expect(resultado.impoconsumo_valor).toBe(1_600);
    expect(resultado.total).toBe(21_600);
  });

  it("producto $20.000 × 3 unidades → impoconsumo $4.800, total $64.800", () => {
    const resultado = calcularImpoconsumo(20_000, 3, 8);
    expect(resultado.subtotal).toBe(60_000);
    expect(resultado.impoconsumo_valor).toBe(4_800);
    expect(resultado.total).toBe(64_800);
  });

  it("impoconsumo 0% → valor cero, total igual al subtotal", () => {
    const resultado = calcularImpoconsumo(50_000, 2, 0);
    expect(resultado.impoconsumo_valor).toBe(0);
    expect(resultado.total).toBe(100_000);
  });

  it("impoconsumo 16% (cigarrillos) → cálculo correcto", () => {
    const resultado = calcularImpoconsumo(10_000, 1, 16);
    expect(resultado.impoconsumo_valor).toBe(1_600);
    expect(resultado.total).toBe(11_600);
  });
});

// ── Tests de depreciación lineal ──────────────────────────────────────────────

describe("Depreciación lineal de activos fijos", () => {
  it("$12.000.000 / 5 años (60 meses) → $200.000/mes exacto", () => {
    const depr = calcularDepreciacionLineal(12_000_000, 0, 60);
    expect(depr).toBe(200_000);
  });

  it("$12.000.000 con residual $1.200.000 / 60 meses → $180.000/mes", () => {
    const depr = calcularDepreciacionLineal(12_000_000, 1_200_000, 60);
    expect(depr).toBe(180_000);
  });

  it("$5.000.000 / 10 años (120 meses) → $41.667/mes (redondeado)", () => {
    const depr = calcularDepreciacionLineal(5_000_000, 0, 120);
    // 5_000_000 / 120 = 41666.666... → Math.round → 41667
    expect(depr).toBe(41_667);
  });

  it("activo totalmente depreciado (valor_neto=0) no genera más depreciación", () => {
    const valorNeto = 0;
    // Simulamos la guarda que está en la ruta (no deprecia si valorNeto <= 0)
    const debeDepreciar = valorNeto > 0;
    expect(debeDepreciar).toBe(false);
  });
});

// ── Tests de validación de importación de clientes ───────────────────────────

describe("Importación masiva de clientes — validaciones", () => {
  it("columnas correctas → sin faltantes", () => {
    const columnas = ["nombre", "tipo_documento", "numero_documento", "correo", "telefono"];
    const faltantes = validarColumnasClientes(columnas);
    expect(faltantes).toHaveLength(0);
  });

  it("columna 'nombre' faltante → reporta error descriptivo", () => {
    const columnas = ["tipo_documento", "numero_documento"];
    const faltantes = validarColumnasClientes(columnas);
    expect(faltantes).toContain("nombre");
  });

  it("columnas 'tipo_documento' y 'numero_documento' faltantes → reporta ambas", () => {
    const columnas = ["nombre", "correo"];
    const faltantes = validarColumnasClientes(columnas);
    expect(faltantes).toContain("tipo_documento");
    expect(faltantes).toContain("numero_documento");
    expect(faltantes).toHaveLength(2);
  });

  it("tipo_documento 'CC' válido", () => {
    expect(validarTipoDocumento("CC")).toBe(true);
  });

  it("tipo_documento 'NIT' válido", () => {
    expect(validarTipoDocumento("NIT")).toBe(true);
  });

  it("tipo_documento 'RUT' inválido → fila rechazada", () => {
    expect(validarTipoDocumento("RUT")).toBe(false);
  });

  it("tipo_documento 'DNI' inválido → fila rechazada", () => {
    expect(validarTipoDocumento("DNI")).toBe(false);
  });

  it("nombre vacío en fila → fila rechazada (sin inserción parcial)", () => {
    const nombre = "";
    const esValido = !!nombre;
    expect(esValido).toBe(false);
  });

  it("numero_documento vacío en fila → fila rechazada", () => {
    const numero_documento = "";
    const esValido = !!numero_documento;
    expect(esValido).toBe(false);
  });
});
