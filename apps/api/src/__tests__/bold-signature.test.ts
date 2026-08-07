import { describe, expect, it } from "vitest";
import { generarFirmaBold } from "../services/bold.service.js";
import { verificarFirmaBold } from "../services/pagos/providers/bold.js";
import { createHmac } from "node:crypto";

describe("Bold: firma de integridad", () => {
  it("firma exactamente referencia, monto, moneda y llave secreta", () => {
    expect(generarFirmaBold("DORAVIA-123", 590000, "secret-test", "COP"))
      .toBe("834a6fe91f185c069c270ff5e78b396df04bc41b93b76d5fcc859c77433aae3e");
  });

  it("acepta un webhook HMAC válido y rechaza una firma distinta", () => {
    const payload = Buffer.from('{"reference_id":"COT-1","status":"APPROVED"}');
    const secret = "event-secret-test";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(verificarFirmaBold(payload, { "bold-signature": signature }, secret)).toBe(true);
    expect(verificarFirmaBold(payload, { "bold-signature": "firma-invalida" }, secret)).toBe(false);
  });
});
