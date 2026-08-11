import { describe, expect, it } from "vitest";
import { buildPersona } from "../services/plemsi.service.js";

describe("Plemsi: tipos de documento del adquirente", () => {
  it.each([
    ["CC", 3],
    ["NIT", 6],
    ["CE", 5],
    ["PPN", 7],
    ["TI", 2],
  ])("envía %s con el identificador esperado", (tipo_documento, esperado) => {
    const persona = buildPersona({
      nit: "900123456",
      nombre: "Cliente de prueba",
      tipo_documento,
    });

    expect(persona.type_document_identification_id).toBe(esperado);
  });

  it("mantiene CC como fallback seguro para una persona natural sin tipo legado", () => {
    expect(buildPersona({ nit: "12345678", nombre: "Persona natural", tipo_persona: "natural" }).type_document_identification_id).toBe(3);
  });
});
