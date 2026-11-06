import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const dbLimit = vi.fn();
const dbWhere = vi.fn(() => ({ limit: dbLimit }));
const dbFrom = vi.fn(() => ({ where: dbWhere }));
const dbSelect = vi.fn(() => ({ from: dbFrom }));
const dbTransaction = vi.fn();
const signAccessToken = vi.fn(() => "access-token");
const createRefreshToken = vi.fn(async () => "refresh-token");

vi.mock("@workspace/db", () => ({
  db: { select: dbSelect, transaction: dbTransaction },
  users: {}, tenants: {}, plans: {}, pending_registrations: {}, password_reset_tokens: {},
  bold_payments: {}, contador_registrations: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), ilike: vi.fn(), gt: vi.fn(), isNull: vi.fn() }));
vi.mock("../services/auth.service.js", () => ({
  registrarTenant: vi.fn(), completarRegistroPendiente: vi.fn(), signAccessToken, createRefreshToken,
  login: vi.fn(), refreshAccessToken: vi.fn(), logout: vi.fn(), cambiarPassword: vi.fn(),
  selectEmpresa: vi.fn(), cambiarEmpresa: vi.fn(), getEmpresasUsuario: vi.fn(),
}));
vi.mock("../services/email.service.js", () => ({ enviarResetPassword: vi.fn(), enviarEmailBienvenida: vi.fn(async () => undefined), enviarBienvenidaTrial: vi.fn() }));
vi.mock("../lib/bold-monto.js", () => ({ resolverMontoBold: vi.fn(() => 590000) }));

const { default: authRouter } = await import("../routes/auth.js");
const handler = authRouter.stack.find((layer) => layer.route?.path === "/register-from-payment")?.route?.stack[0]?.handle;
if (!handler) throw new Error("Handler register-from-payment no encontrado.");

const secret = "secreto-seguro-de-registro";
const { hashRegistrationSecret } = await import("../services/registration-payment.service.js");

function responseMock() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function request(secretValue = secret) {
  return { body: { bold_reference: "DORAVIA-NEW-1", registration_secret: secretValue, tenant_nombre: "Empresa", nit: "900123", usuario_nombre: "Ana", email: "ana@example.com", password: "segura123" } } as Request;
}

function approvedPayment(overrides: Record<string, unknown> = {}) {
  return { id: "payment-1", tenant_id: null, estado: "APPROVED", registro_secret_used_at: null,
    registro_secret_expires_at: new Date(Date.now() + 60_000), registro_email: "ana@example.com",
    registro_secret_hash: hashRegistrationSecret(secret), plan_id: "semilla", ciclo_pago: "anual",
    monto: "590000", moneda: "COP", ...overrides };
}

function mockSuccessfulTransaction(claim: { id: string } | undefined = { id: "payment-1" }) {
  let updates = 0;
  let inserts = 0;
  const txUpdate = vi.fn(() => ({ set: () => ({ where: () => {
    updates += 1;
    return { returning: async () => updates === 1 ? claim : undefined };
  } }) }));
  const txInsert = vi.fn(() => ({ values: () => ({ returning: async () => (
    ++inserts === 1 ? [{ id: "tenant-1" }] : [{ id: "user-1", password_hash: "hash", email: "ana@example.com" }]
  ) }) }));
  dbTransaction.mockImplementation(async (callback) => callback({ update: txUpdate, insert: txInsert }));
}

describe("POST /api/auth/register-from-payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbLimit.mockReset();
    dbTransaction.mockReset();
  });

  it("rechaza una referencia robada sin el secreto del comprador", async () => {
    dbLimit.mockResolvedValueOnce([approvedPayment()]);
    const res = responseMock();
    await handler(request("secreto-ajeno"), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(signAccessToken).not.toHaveBeenCalled();
  });

  it("rechaza un pago ya consumido", async () => {
    dbLimit.mockResolvedValueOnce([approvedPayment({ registro_secret_used_at: new Date() })]);
    const res = responseMock();
    await handler(request(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(signAccessToken).not.toHaveBeenCalled();
  });

  it("rechaza al perdedor de una carrera cuando el consumo atómico no devuelve fila", async () => {
    dbLimit.mockResolvedValueOnce([approvedPayment()]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "plan-1", precio_anual_cop: 590000 }]);
    mockSuccessfulTransaction(undefined);
    const res = responseMock();
    await handler(request(), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(signAccessToken).not.toHaveBeenCalled();
  });

  it("acepta el secreto correcto del comprador legítimo", () => {
    expect(hashRegistrationSecret(secret)).toBe(approvedPayment().registro_secret_hash);
    expect(hashRegistrationSecret("otro-secreto")).not.toBe(approvedPayment().registro_secret_hash);
  });
});
