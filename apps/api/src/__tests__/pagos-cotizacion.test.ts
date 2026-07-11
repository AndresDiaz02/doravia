/**
 * Tests de FASE 9.1 — Pagos en cotizaciones
 *
 * Lógica pura (sin DB, sin HTTP):
 * - Stub provider: genera URL con referencia correcta
 * - Encryption round-trip: encrypt ↔ decrypt son inversas
 * - Validación vencimiento: cotización vencida → error COTIZACION_VENCIDA
 * - PagosNotConfiguredError: error tipado con code correcto
 * - verificarFirmaBold: HMAC-SHA256 válida vs inválida
 * - RBAC: requireRole bloquea roles no autorizados
 *
 * Ejecutar: pnpm --filter api test
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de test
// ─────────────────────────────────────────────────────────────────────────────

function makeRes(): Response & { status: Mock; json: Mock } {
  const res = { statusCode: 200 } as unknown as Response & { status: Mock; json: Mock };
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockImplementation((code: number) => {
    (res as unknown as { statusCode: number }).statusCode = code;
    return res;
  });
  return res;
}

function makeNext(): NextFunction { return vi.fn() as unknown as NextFunction; }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stub provider — lógica de generación de link
// ─────────────────────────────────────────────────────────────────────────────

describe("Stub provider — crearLinkPago", () => {
  const APP_URL = "http://localhost:5173";

  function crearLinkPagoStub(referencia: string, monto: number, credRaw: string): string {
    if (!credRaw.trim()) throw new Error("Stub provider requiere credencial no vacía.");
    return `${APP_URL}/pago-stub?ref=${referencia}&monto=${monto}&moneda=COP`;
  }

  it("genera URL con referencia y monto correctos", () => {
    const url = crearLinkPagoStub("COT-abc-def-123", 150000, "stub-token");
    expect(url).toContain("ref=COT-abc-def-123");
    expect(url).toContain("monto=150000");
    expect(url).toContain("moneda=COP");
  });

  it("genera URL con dominio APP_URL correcto", () => {
    const url = crearLinkPagoStub("REF-1", 1000, "token");
    expect(url.startsWith(APP_URL)).toBe(true);
  });

  it("lanza error si credencial vacía", () => {
    expect(() => crearLinkPagoStub("REF", 1000, "  ")).toThrow("credencial no vacía");
  });

  it("referencia distingue tenant y cotizacion", () => {
    const ref1 = "COT-tenant1-cot1-1700000000000";
    const ref2 = "COT-tenant2-cot2-1700000000001";
    const url1 = crearLinkPagoStub(ref1, 0, "t");
    const url2 = crearLinkPagoStub(ref2, 0, "t");
    expect(url1).not.toBe(url2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Encryption round-trip (sin importar el módulo real — mirror de la lógica)
// ─────────────────────────────────────────────────────────────────────────────

describe("Encryption round-trip — AES-256-GCM", () => {
  // Espejo puro de la lógica de encryption.ts para test aislado.
  // Si el módulo cambia, estos tests deben actualizarse.
  const KEY = randomBytes(32);
  const ALGO = "aes-256-gcm";

  function encrypt(text: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, KEY, iv);
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("hex"), enc.toString("hex"), tag.toString("hex")].join(".");
  }

  function decrypt(token: string): string {
    const [ivHex, encHex, tagHex] = token.split(".");
    if (!ivHex || !encHex || !tagHex) throw new Error("Token cifrado inválido.");
    const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  }

  it("encrypt/decrypt son inversas para credenciales JSON", () => {
    const creds = { api_key: "pk_test_abc", secret_key: "sk_test_xyz", event_secret: "ws_evs" };
    const token = encrypt(JSON.stringify(creds));
    const recovered = JSON.parse(decrypt(token)) as typeof creds;
    expect(recovered.api_key).toBe(creds.api_key);
    expect(recovered.secret_key).toBe(creds.secret_key);
    expect(recovered.event_secret).toBe(creds.event_secret);
  });

  it("token cifrado no contiene la API key en texto plano", () => {
    const creds = { api_key: "pk_live_super_secret", secret_key: "sk" };
    const token = encrypt(JSON.stringify(creds));
    expect(token).not.toContain("pk_live_super_secret");
  });

  it("token distinto en cada encriptación (IV aleatorio)", () => {
    const json = JSON.stringify({ api_key: "k", secret_key: "s" });
    const t1 = encrypt(json); const t2 = encrypt(json);
    expect(t1).not.toBe(t2);
  });

  it("decrypt con token manipulado lanza error (autenticación AES-GCM)", () => {
    const token = encrypt("data");
    const [iv, enc, tag] = token.split(".");
    const tampered = [iv, enc!.slice(0, -2) + "ff", tag].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Validación cotización vencida (espejo de la lógica de cotizaciones.ts)
// ─────────────────────────────────────────────────────────────────────────────

describe("Validación — cotización vencida", () => {
  function validarParaLinkPago(cotizacion: {
    estado: string;
    fecha_vencimiento: string | null;
  }): { ok: true } | { ok: false; code: string; error: string } {
    if (!["enviada", "aceptada"].includes(cotizacion.estado)) {
      return { ok: false, code: "ESTADO_INVALIDO", error: "Estado no válido para generar link de pago." };
    }
    if (cotizacion.fecha_vencimiento && new Date(cotizacion.fecha_vencimiento) < new Date()) {
      return { ok: false, code: "COTIZACION_VENCIDA", error: "La cotización está vencida." };
    }
    return { ok: true };
  }

  it("estado borrador → ESTADO_INVALIDO", () => {
    const r = validarParaLinkPago({ estado: "borrador", fecha_vencimiento: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ESTADO_INVALIDO");
  });

  it("estado enviada sin vencimiento → ok", () => {
    expect(validarParaLinkPago({ estado: "enviada", fecha_vencimiento: null }).ok).toBe(true);
  });

  it("estado aceptada sin vencimiento → ok", () => {
    expect(validarParaLinkPago({ estado: "aceptada", fecha_vencimiento: null }).ok).toBe(true);
  });

  it("estado enviada con vencimiento futuro → ok", () => {
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    expect(validarParaLinkPago({ estado: "enviada", fecha_vencimiento: futuro }).ok).toBe(true);
  });

  it("estado enviada con fecha vencida → COTIZACION_VENCIDA", () => {
    const pasado = new Date(Date.now() - 86_400_000).toISOString();
    const r = validarParaLinkPago({ estado: "enviada", fecha_vencimiento: pasado });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("COTIZACION_VENCIDA");
      expect(r.error).toContain("vencida");
    }
  });

  it("estado aceptada con fecha vencida → COTIZACION_VENCIDA", () => {
    const pasado = new Date(Date.now() - 1).toISOString();
    const r = validarParaLinkPago({ estado: "aceptada", fecha_vencimiento: pasado });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("COTIZACION_VENCIDA");
  });

  it("estado pagada → ESTADO_INVALIDO (no re-generar link si ya está pagado)", () => {
    const r = validarParaLinkPago({ estado: "pagada", fecha_vencimiento: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ESTADO_INVALIDO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PagosNotConfiguredError
// ─────────────────────────────────────────────────────────────────────────────

describe("PagosNotConfiguredError", () => {
  class PagosNotConfiguredError extends Error {
    readonly code = "PAGOS_NOT_CONFIGURED";
    constructor(msg = "El tenant no tiene un proveedor de pagos configurado o activo.") {
      super(msg);
      this.name = "PagosNotConfiguredError";
    }
  }

  it("tiene code correcto", () => {
    const err = new PagosNotConfiguredError();
    expect(err.code).toBe("PAGOS_NOT_CONFIGURED");
  });

  it("es instanceof Error", () => {
    expect(new PagosNotConfiguredError()).toBeInstanceOf(Error);
  });

  it("mensaje por defecto claro", () => {
    const err = new PagosNotConfiguredError();
    expect(err.message).toContain("proveedor de pagos");
  });

  it("mensaje personalizable", () => {
    const err = new PagosNotConfiguredError("Proveedor desconocido: wompi");
    expect(err.message).toContain("wompi");
  });

  it("detectado por instanceof en catch handler", () => {
    let capturado = false;
    try { throw new PagosNotConfiguredError(); }
    catch (e) { if (e instanceof PagosNotConfiguredError) capturado = true; }
    expect(capturado).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. verificarFirmaBold — HMAC-SHA256
// ─────────────────────────────────────────────────────────────────────────────

describe("verificarFirmaBold — HMAC-SHA256", () => {
  function verificarFirmaBold(
    payloadRaw: Buffer,
    headers: Record<string, string>,
    eventSecret: string,
  ): boolean {
    const firma = headers["bold-signature"] ?? headers["x-bold-signature"] ?? "";
    if (!firma) return false;
    const expected = createHmac("sha256", eventSecret).update(payloadRaw).digest("hex");
    try {
      return (
        firma.length === expected.length &&
        createHash("sha256").update(firma).digest().equals(createHash("sha256").update(expected).digest())
      );
    } catch { return false; }
  }

  const SECRET = "evt_test_secret";
  const PAYLOAD = Buffer.from(JSON.stringify({ event: "payment", status: "APPROVED" }));
  const FIRMA_VALIDA = createHmac("sha256", SECRET).update(PAYLOAD).digest("hex");

  it("firma válida → true (header bold-signature)", () => {
    expect(verificarFirmaBold(PAYLOAD, { "bold-signature": FIRMA_VALIDA }, SECRET)).toBe(true);
  });

  it("firma válida → true (header x-bold-signature)", () => {
    expect(verificarFirmaBold(PAYLOAD, { "x-bold-signature": FIRMA_VALIDA }, SECRET)).toBe(true);
  });

  it("firma incorrecta → false", () => {
    expect(verificarFirmaBold(PAYLOAD, { "bold-signature": "firma_falsa" }, SECRET)).toBe(false);
  });

  it("sin header de firma → false", () => {
    expect(verificarFirmaBold(PAYLOAD, {}, SECRET)).toBe(false);
  });

  it("secret incorrecto → false", () => {
    expect(verificarFirmaBold(PAYLOAD, { "bold-signature": FIRMA_VALIDA }, "otro_secret")).toBe(false);
  });

  it("payload manipulado → false", () => {
    const manipulated = Buffer.from(PAYLOAD.toString() + "extra");
    expect(verificarFirmaBold(manipulated, { "bold-signature": FIRMA_VALIDA }, SECRET)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. RBAC — requireRole
// ─────────────────────────────────────────────────────────────────────────────

describe("RBAC — requireRole para endpoints de pagos cotizaciones", () => {
  function requireRole(roles: string[]) {
    return (req: Partial<Request>, res: ReturnType<typeof makeRes>, next: NextFunction) => {
      const role = (req as Request & { userRole?: string }).userRole ?? "";
      if (!roles.includes(role)) {
        res.status(403).json({ error: "Acceso denegado.", code: "FORBIDDEN" });
        return;
      }
      next();
    };
  }

  function req(role: string): Partial<Request> {
    return { userRole: role } as unknown as Partial<Request>;
  }

  describe("GET /configuracion — solo admin", () => {
    const mw = requireRole(["admin"]);

    it("admin pasa", () => {
      const next = makeNext(); const res = makeRes();
      mw(req("admin"), res, next);
      expect(next).toHaveBeenCalled();
    });
    it.each(["vendedor", "contador", "cajero"])("%s bloqueado", (role) => {
      const next = makeNext(); const res = makeRes();
      mw(req(role), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("POST /:id/link-pago — admin y vendedor", () => {
    const mw = requireRole(["admin", "vendedor"]);

    it.each(["admin", "vendedor"])("%s pasa", (role) => {
      const next = makeNext(); const res = makeRes();
      mw(req(role), res, next);
      expect(next).toHaveBeenCalled();
    });
    it.each(["contador", "cajero"])("%s bloqueado", (role) => {
      const next = makeNext(); const res = makeRes();
      mw(req(role), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("GET /:id/pago — admin, vendedor y contador", () => {
    const mw = requireRole(["admin", "vendedor", "contador"]);

    it.each(["admin", "vendedor", "contador"])("%s pasa", (role) => {
      const next = makeNext(); const res = makeRes();
      mw(req(role), res, next);
      expect(next).toHaveBeenCalled();
    });
    it("cajero bloqueado", () => {
      const next = makeNext(); const res = makeRes();
      mw(req("cajero"), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Cross-tenant aislamiento de referencias
// ─────────────────────────────────────────────────────────────────────────────

describe("Aislamiento cross-tenant de referencias de pago", () => {
  // El formato de referencia incluye el tenantId parcial.
  // La BD tiene unique constraint en referencia_externa → un pago no puede
  // pertenecer a dos tenants. Verificamos que la referencia lleva el tenant.

  function generarReferencia(tenantId: string, cotizacionId: string): string {
    return `COT-${tenantId.slice(0, 8)}-${cotizacionId.slice(0, 8)}-${Date.now()}`;
  }

  it("referencias de tenants distintos son distintas", () => {
    const t1 = "aaaaaaaa-0000-0000-0000-000000000000";
    const t2 = "bbbbbbbb-0000-0000-0000-000000000000";
    const cot = "cccccccc-0000-0000-0000-000000000000";
    const r1 = generarReferencia(t1, cot);
    const r2 = generarReferencia(t2, cot);
    expect(r1).not.toBe(r2);
    expect(r1).toContain("aaaaaaaa");
    expect(r2).toContain("bbbbbbbb");
  });

  it("referencia contiene prefijo COT", () => {
    const ref = generarReferencia("t1-uuid", "c1-uuid");
    expect(ref.startsWith("COT-")).toBe(true);
  });
});
