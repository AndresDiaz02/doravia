import { describe, expect, it } from "vitest";
import { puedeAdministrarPOS, puedeOperarDianPOS, puedeOperarTurno } from "../lib/pos-access.js";

describe("acceso POS", () => {
  const turno = { usuario_id: "cajero-a" };

  it("no permite que un cajero tome el turno de otra persona", () => {
    expect(puedeOperarTurno({ userId: "cajero-b", userRole: "cajero" }, turno)).toBe(false);
  });

  it("permite a un cajero operar únicamente su propio turno", () => {
    expect(puedeOperarTurno({ userId: "cajero-a", userRole: "cajero" }, turno)).toBe(true);
  });

  it("mantiene la supervisión total para administración", () => {
    expect(puedeOperarTurno({ userId: "admin", userRole: "admin" }, turno)).toBe(true);
    expect(puedeAdministrarPOS({ userRole: "admin" })).toBe(true);
    expect(puedeAdministrarPOS({ userRole: "cajero" })).toBe(false);
  });

  it("no concede permisos DIAN a un cajero", () => {
    expect(puedeOperarDianPOS({ userRole: "cajero" })).toBe(false);
    expect(puedeOperarDianPOS({ userRole: "contador", userDian: true })).toBe(true);
  });
});
