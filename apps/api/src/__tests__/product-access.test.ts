import { describe, expect, it } from "vitest";
import { tieneAccesoProducto } from "../middleware/product-access.js";

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
});
