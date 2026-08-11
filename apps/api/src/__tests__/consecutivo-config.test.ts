import { describe, expect, it } from "vitest";
import { validarConfiguracionConsecutivo } from "../services/consecutivo.service.js";

describe("configuración de consecutivos", () => {
  it("acepta únicamente las tablas y columna autorizadas", () => {
    expect(() => validarConfiguracionConsecutivo("ventas_pos", "consecutivo")).not.toThrow();
    expect(() => validarConfiguracionConsecutivo("users; DROP TABLE users", "consecutivo")).toThrow();
    expect(() => validarConfiguracionConsecutivo("ventas_pos", "id")).toThrow();
  });
});
