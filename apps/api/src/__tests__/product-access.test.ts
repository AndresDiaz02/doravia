import { describe, expect, it } from "vitest";
import { tieneAccesoProducto } from "../middleware/product-access.js";
import { productosIncluidosPorPlan } from "../services/product-subscription.service.js";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("acceso a productos independientes", () => {
  it("permite un POS independiente con suscripcion activa", () => {
    expect(tieneAccesoProducto({ status: "active", ends_at: "2026-12-31" }, false, false, NOW)).toBe(true);
  });

  it("bloquea una suscripcion vencida aunque exista un addon antiguo", () => {
    expect(tieneAccesoProducto({ status: "active", ends_at: "2026-08-09" }, false, true, NOW)).toBe(false);
  });

  it("mantiene el acceso cuando el POS viene incluido en el plan principal", () => {
    expect(tieneAccesoProducto({ status: "cancelled", ends_at: "2026-01-01" }, true, false, NOW)).toBe(true);
  });

  it("mantiene compatibilidad con addons antiguos sin registro de suscripcion", () => {
    expect(tieneAccesoProducto(undefined, false, true, NOW)).toBe(true);
  });

  it("permite Facturacion y Nomina como productos independientes activos", () => {
    const facturacion = tieneAccesoProducto({ status: "active", ends_at: "2026-12-31" }, false, false, NOW);
    const nomina = tieneAccesoProducto({ status: "active", ends_at: "2026-12-31" }, false, false, NOW);
    expect(facturacion && nomina).toBe(true);
  });

  it("cubre Facturacion desde ERP sin mantener un plan duplicado", () => {
    expect(productosIncluidosPorPlan("erp", { facturacion_ilimitada: true })).toEqual(["facturacion"]);
    expect(tieneAccesoProducto({ status: "cancelled", ends_at: "2026-12-31" }, true, false, NOW)).toBe(true);
  });

  it("no confunde POS o Nomina con beneficios del ERP", () => {
    expect(productosIncluidosPorPlan("pos", { facturacion_ilimitada: true })).toEqual([]);
    expect(productosIncluidosPorPlan("erp", { facturacion_ilimitada: false })).toEqual([]);
  });
});
