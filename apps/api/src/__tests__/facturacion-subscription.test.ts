import { describe, expect, it } from "vitest";
import { suscripcionFacturacionVigente } from "../guards/plan-limits.js";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("vigencia de facturacion independiente", () => {
  it("acepta una suscripcion activa y vigente", () => {
    expect(suscripcionFacturacionVigente({ status: "active", ends_at: "2026-12-31" }, NOW)).toBe(true);
  });

  it("rechaza una suscripcion vencida", () => {
    expect(suscripcionFacturacionVigente({ status: "active", ends_at: "2026-08-09" }, NOW)).toBe(false);
  });

  it("rechaza una suscripcion cancelada aunque su fecha no haya llegado", () => {
    expect(suscripcionFacturacionVigente({ status: "cancelled", ends_at: "2026-12-31" }, NOW)).toBe(false);
  });
});
