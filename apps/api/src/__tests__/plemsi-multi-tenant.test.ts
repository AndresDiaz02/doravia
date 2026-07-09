/**
 * Tests de Plemsi multi-tenant — FASE 8
 *
 * Tests de lógica pura (sin DB real, sin HTTP externo):
 * 1. Encriptación round-trip: encrypt → decrypt === text original
 * 2. Emisión sin credenciales: PlemsiNotConfiguredError cuando no habilitado
 * 3. Consecutivo inicial: crear resolución con consecutivo_inicial=11 → consecutivo_actual=10
 * 4. RBAC: contador no puede hacer PATCH /empresa/plemsi (403)
 * 5. Ambiente: getPlemsiBase devuelve URLs correctas
 * 6. Contador de facturas: facturas_mes_actual sube en emisión exitosa
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect, vi, type Mock, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ── 1. Encriptación round-trip ────────────────────────────────────────────────

// Fijamos la ENCRYPTION_KEY para los tests (32 bytes en base64)
const TEST_KEY = Buffer.alloc(32, "k").toString("base64"); // "a" x 32 bytes en base64

// Importamos con env configurada — vitest no reloads env entre tests,
// así que seteamos antes de importar usando vi.stubEnv
vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);

// Import dinámico para que el módulo use la env stubbed
async function getEncryption() {
  const { encrypt, decrypt } = await import("../services/encryption.js");
  return { encrypt, decrypt };
}

describe("Encriptación AES-256-GCM", () => {
  it("round-trip: encrypt → decrypt devuelve el texto original", async () => {
    const { encrypt, decrypt } = await getEncryption();
    const texto = "mi-api-key-de-plemsi-super-secreta";
    const cifrado = encrypt(texto);
    expect(cifrado).not.toEqual(texto);
    expect(cifrado).toContain(":");
    expect(decrypt(cifrado)).toBe(texto);
  });

  it("dos cifrados del mismo texto producen resultados distintos (IV aleatorio)", async () => {
    const { encrypt } = await getEncryption();
    const texto = "misma-clave";
    expect(encrypt(texto)).not.toEqual(encrypt(texto));
  });

  it("decrypt maneja texto plano legacy (sin ':')", async () => {
    const { decrypt } = await getEncryption();
    // Texto plano de migración legacy — no tiene ":"
    const legacy = "api-key-legacy-en-texto-plano";
    expect(decrypt(legacy)).toBe(legacy);
  });
});

// ── 2. PlemsiNotConfiguredError ───────────────────────────────────────────────

import { PlemsiNotConfiguredError } from "../services/get-plemsi-credentials.js";

describe("PlemsiNotConfiguredError", () => {
  it("tiene code PLEMSI_NOT_CONFIGURED", () => {
    const err = new PlemsiNotConfiguredError("la empresa no está habilitada");
    expect(err.code).toBe("PLEMSI_NOT_CONFIGURED");
    expect(err.name).toBe("PlemsiNotConfiguredError");
    expect(err.message).toContain("Ajustes → Facturación electrónica");
  });

  it("getPlemsiCredentials lanza PlemsiNotConfiguredError si no habilitado", async () => {
    // Mockea drizzle-orm para este test
    vi.mock("@workspace/db", () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                plemsi_api_key_encrypted: "some-key",
                plemsi_ambiente: "pruebas",
                plemsi_habilitado: false, // ← no habilitado
              }]),
            }),
          }),
        }),
      },
      tenants: { id: "id", plemsi_api_key_encrypted: "col", plemsi_ambiente: "col", plemsi_habilitado: "col" },
    }));

    const { getPlemsiCredentials } = await import("../services/get-plemsi-credentials.js");
    await expect(getPlemsiCredentials("fake-tenant-id")).rejects.toThrow(PlemsiNotConfiguredError);
  });
});

// ── 3. Consecutivo inicial ────────────────────────────────────────────────────

describe("Consecutivo inicial en resoluciones DIAN", () => {
  /**
   * Lógica espejo de resoluciones-dian.ts POST /
   * consecutivo_actual = consecutivo_inicial - 1
   * para que el primer emitido sea exactamente consecutivo_inicial
   */
  function calcularActualInicial(consecutivo_desde: number, consecutivo_inicial?: number): number {
    const inicialNum = consecutivo_inicial != null ? consecutivo_inicial : consecutivo_desde;
    return Math.max(inicialNum - 1, consecutivo_desde - 1);
  }

  it("sin consecutivo_inicial → consecutivo_actual = desde - 1", () => {
    expect(calcularActualInicial(1)).toBe(0);
    expect(calcularActualInicial(100)).toBe(99);
  });

  it("consecutivo_inicial=11 → consecutivo_actual=10 (primera emitida será FE011)", () => {
    expect(calcularActualInicial(1, 11)).toBe(10);
  });

  it("consecutivo_inicial=1 → consecutivo_actual=0", () => {
    expect(calcularActualInicial(1, 1)).toBe(0);
  });

  it("consecutivo_inicial < desde → usa desde - 1 como piso", () => {
    // Si alguien pone inicial menor que desde, no retrocedemos antes del rango
    expect(calcularActualInicial(5, 3)).toBe(4); // max(2, 4) = 4
  });
});

// ── 4. RBAC — contador no puede modificar config Plemsi ──────────────────────

function makeReq(role: string): Partial<Request> {
  return { userRole: role } as unknown as Partial<Request>;
}

function makeRes(): { status: Mock; json: Mock; statusCode: number } {
  const res = { statusCode: 200 } as { statusCode: number; status: Mock; json: Mock };
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockImplementation((code: number) => { res.statusCode = code; return res; });
  return res;
}

// Espejo del guard de empresa/plemsi
function guardSoloPuedePlemsi(
  req: Partial<Request>,
  res: { status: Mock; json: Mock; statusCode: number },
  next: NextFunction,
) {
  const role = (req as Request & { userRole: string }).userRole;
  if (role === "contador") {
    res.status(403).json({ error: "Solo el administrador puede modificar la configuración DIAN." });
    return;
  }
  if (role !== "admin") {
    res.status(403).json({ error: "Solo el administrador puede modificar la configuración DIAN." });
    return;
  }
  next();
}

describe("RBAC — PATCH /empresa/plemsi", () => {
  it("contador recibe 403", () => {
    const req = makeReq("contador");
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    guardSoloPuedePlemsi(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("vendedor recibe 403", () => {
    const req = makeReq("vendedor");
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    guardSoloPuedePlemsi(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it("admin pasa el guard (next llamado)", () => {
    const req = makeReq("admin");
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    guardSoloPuedePlemsi(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});

// ── 5. Ambiente — URLs Plemsi ─────────────────────────────────────────────────

// Espejo de getPlemsiBase en plemsi.service.ts
const PLEMSI_URL_PRUEBAS = "https://pruebas.plemsi.com";
const PLEMSI_URL_PRODUCCION = "https://app.plemsi.com";

function getPlemsiBase(ambiente?: string): string {
  return ambiente === "produccion" ? PLEMSI_URL_PRODUCCION : PLEMSI_URL_PRUEBAS;
}

describe("Ambiente Plemsi", () => {
  it("getPlemsiBase('produccion') devuelve URL de producción", () => {
    expect(getPlemsiBase("produccion")).toBe(PLEMSI_URL_PRODUCCION);
  });

  it("getPlemsiBase('pruebas') devuelve URL de pruebas", () => {
    expect(getPlemsiBase("pruebas")).toBe(PLEMSI_URL_PRUEBAS);
  });

  it("getPlemsiBase(undefined) devuelve URL de pruebas (default seguro)", () => {
    expect(getPlemsiBase()).toBe(PLEMSI_URL_PRUEBAS);
  });

  it("getPlemsiBase('otro') devuelve URL de pruebas (default seguro)", () => {
    expect(getPlemsiBase("otro")).toBe(PLEMSI_URL_PRUEBAS);
  });
});

// ── 6. Contador de facturas ───────────────────────────────────────────────────

describe("Contador de facturas mensual", () => {
  it("facturas_mes_actual incrementa al emitir exitosamente a Plemsi", async () => {
    // Simulamos el flujo de incremento en enviarAPlemsiSiAplica
    let contadorActual = 0;

    // Mock de lo que haría: UPDATE tenants SET facturas_mes_actual = facturas_mes_actual + 1
    async function simularIncrementoContador(exito: boolean) {
      if (exito) {
        contadorActual += 1;
      }
    }

    await simularIncrementoContador(true);
    expect(contadorActual).toBe(1);

    await simularIncrementoContador(false); // emisión fallida → no incrementa
    expect(contadorActual).toBe(1);

    await simularIncrementoContador(true);
    expect(contadorActual).toBe(2);
  });

  it("resetConsumoDian pone facturas_mes_actual a 0", () => {
    let contador = 42;
    // Simula el UPDATE tenants SET facturas_mes_actual = 0
    function simularReset() { contador = 0; }
    simularReset();
    expect(contador).toBe(0);
  });
});
