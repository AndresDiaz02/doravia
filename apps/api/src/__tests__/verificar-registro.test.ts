import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const dbLimit = vi.fn();
const dbWhere = vi.fn(() => ({ limit: dbLimit }));
const dbFrom = vi.fn(() => ({ where: dbWhere }));
const dbSelect = vi.fn(() => ({ from: dbFrom }));
const signAccessToken = vi.fn();
const createRefreshToken = vi.fn();

vi.mock("@workspace/db", () => ({
  db: { select: dbSelect },
  users: {}, tenants: {}, plans: {}, pending_registrations: {},
  password_reset_tokens: {}, bold_payments: {}, contador_registrations: {},
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), ilike: vi.fn() }));

vi.mock("../services/auth.service.js", () => ({
  registrarTenant: vi.fn(), completarRegistroPendiente: vi.fn(),
  signAccessToken, createRefreshToken, login: vi.fn(), refreshAccessToken: vi.fn(),
  logout: vi.fn(), cambiarPassword: vi.fn(), selectEmpresa: vi.fn(),
  cambiarEmpresa: vi.fn(), getEmpresasUsuario: vi.fn(),
}));

vi.mock("../services/email.service.js", () => ({
  enviarResetPassword: vi.fn(), enviarEmailBienvenida: vi.fn(), enviarBienvenidaTrial: vi.fn(),
}));

const { default: authRouter } = await import("../routes/auth.js");
const verificarRegistro = authRouter.stack.find(
  (layer) => layer.route?.path === "/verificar-registro" && layer.route.methods.post,
)?.route?.stack[0]?.handle;

if (!verificarRegistro) throw new Error("Handler verificar-registro no encontrado.");

function responseMock() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("POST /api/auth/verificar-registro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve solo el estado cuando el registro está completado y no crea tokens", async () => {
    dbLimit.mockResolvedValueOnce([{ completed_at: new Date(), email: "cliente@example.com" }]);
    const res = responseMock();

    await verificarRegistro({ body: { wompi_reference: "DOR-REG-123" } } as Request, res);

    expect(res.json).toHaveBeenCalledWith({ completed: true });
    expect(signAccessToken).not.toHaveBeenCalled();
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it("informa pendiente sin crear tokens", async () => {
    dbLimit.mockResolvedValueOnce([{ completed_at: null }]);
    const res = responseMock();

    await verificarRegistro({ body: { wompi_reference: "DOR-REG-123" } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ completed: false, message: "Pago aún en proceso." });
    expect(signAccessToken).not.toHaveBeenCalled();
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it("rechaza una referencia inválida", async () => {
    dbLimit.mockResolvedValueOnce([]);
    const res = responseMock();

    await verificarRegistro({ body: { wompi_reference: "DOR-REG-INVALIDA" } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Registro no encontrado." });
  });

  it("requiere la referencia", async () => {
    const res = responseMock();

    await verificarRegistro({ body: {} } as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "wompi_reference es requerido." });
  });
});
