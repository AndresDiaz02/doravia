import { describe, expect, it } from "vitest";
import { calcularArqueoCiego } from "../services/pos-cash.service.js";

describe("arqueo ciego POS", () => {
  it("calcula efectivo esperado sin errores de punto flotante", () => {
    expect(calcularArqueoCiego({
      montoInicial: "100000.00", ventasEfectivo: ["19999.99", "0.01"], gastosCaja: ["2500.50"],
      devolucionesEfectivo: ["1000.00"], montoDeclarado: "116499.50",
    })).toEqual({ montoEsperado: "116499.50", montoDeclarado: "116499.50", diferencia: "0.00" });
  });

  it("conserva la diferencia negativa con dos decimales", () => {
    expect(calcularArqueoCiego({ montoInicial: 50000, ventasEfectivo: [10000], gastosCaja: [], devolucionesEfectivo: [], montoDeclarado: 59000 }).diferencia).toBe("-1000.00");
  });
});
