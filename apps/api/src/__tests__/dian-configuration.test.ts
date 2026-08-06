import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDianConfiguration,
  DianConfigurationError,
  getDianConfigurationStatus,
  getDianProvider,
} from "../services/dian/index.js";

afterEach(() => vi.unstubAllEnvs());

describe("configuración del proveedor DIAN", () => {
  it("mantiene stub disponible fuera de producción", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DIAN_AMBIENTE", "0");
    vi.stubEnv("DIAN_PROVEEDOR", "stub");

    expect(getDianConfigurationStatus()).toEqual({ modo: "stub", proveedor: "stub" });
    expect(() => assertDianConfiguration()).not.toThrow();
  });

  it("rechaza el stub al arrancar en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DIAN_PROVEEDOR", "stub");

    expect(() => assertDianConfiguration()).toThrow(DianConfigurationError);
  });

  it("rechaza un proveedor desconocido sin sustituirlo por stub", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DIAN_PROVEEDOR", "proveedor-desconocido");

    expect(getDianConfigurationStatus()).toEqual({ modo: "invalido", proveedor: "proveedor-desconocido" });
    expect(() => getDianProvider()).toThrow('DIAN_PROVEEDOR="proveedor-desconocido" no es válido');
  });

  it("acepta un proveedor DIAN real cuando DIAN_AMBIENTE es producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DIAN_AMBIENTE", "1");
    vi.stubEnv("DIAN_PROVEEDOR", "plemsi");

    expect(getDianConfigurationStatus()).toEqual({ modo: "produccion", proveedor: "plemsi" });
    expect(() => assertDianConfiguration()).not.toThrow();
  });
});
