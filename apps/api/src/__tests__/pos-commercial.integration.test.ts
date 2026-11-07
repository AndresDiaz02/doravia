import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { TenantWithPlan } from "../lib/tenant.js";

const databaseUrl = process.env.DATABASE_URL;
const parsedUrl = databaseUrl ? new URL(databaseUrl) : null;
const databaseName = parsedUrl?.pathname.replace(/^\//, "") ?? "";
const isLocalIntegrationDatabase = Boolean(
  parsedUrl &&
  ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) &&
  databaseName.startsWith("doravia_test_"),
);

type DbModule = typeof import("@workspace/db");
type PosRouter = typeof import("../routes/pos.js");

describe("POS commercial flow (PostgreSQL)", () => {
  let database: DbModule;
  let posRouter: PosRouter["default"];
  let server: Server;
  let baseUrl: string;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let productAId: string;
  let productBId: string;
  let warehouseAId: string;
  let planId: string;

  async function request(path: string, body?: unknown, tenant = "a", idempotencyKey?: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Tenant": tenant,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, body: await response.json() as Record<string, unknown> };
  }

  beforeAll(async () => {
    if (!isLocalIntegrationDatabase) {
      throw new Error("QA-002 requiere DATABASE_URL de PostgreSQL local con base doravia_test_*.");
    }
    database = await import("@workspace/db");
    ({ default: posRouter } = await import("../routes/pos.js"));
    const { db, plans, tenants, users, bodegas, productos, movimientos_inventario, cuentas_contables } = database;
    const unique = `qa-${Date.now()}`;

    [planId] = (await db.insert(plans).values({
      slug: unique,
      nombre: "QA integration",
      product: "pos",
      accounting_level: 1,
      features: { pos: true, inventario: true, pos_multi_caja: true },
      precio_anual_cop: 0,
    }).returning({ id: plans.id })).map((row) => row.id);

    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000);
    const [tenantA, tenantB] = await db.insert(tenants).values([
      { nombre: "QA A", nit: `${unique}-a`, plan_id: planId, plan_starts_at: now, plan_ends_at: future, onboarding_completado: true },
      { nombre: "QA B", nit: `${unique}-b`, plan_id: planId, plan_starts_at: now, plan_ends_at: future, onboarding_completado: true },
    ]).returning({ id: tenants.id });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    [userAId] = (await db.insert(users).values({
      tenant_id: tenantAId, email: `${unique}@example.test`, nombre: "Cajero QA", role: "admin", password_hash: "test-only",
    }).returning({ id: users.id })).map((row) => row.id);
    const [warehouseA] = await db.insert(bodegas).values({ tenant_id: tenantAId, nombre: "Principal QA" }).returning({ id: bodegas.id });
    warehouseAId = warehouseA.id;
    const [productA, productB] = await db.insert(productos).values([
      { tenant_id: tenantAId, codigo: `${unique}-a`, nombre: "Producto QA", precio_base: "10000", precio_venta: "10000", iva_pct: "0", stock_actual: "5" },
      { tenant_id: tenantBId, codigo: `${unique}-b`, nombre: "Producto ajeno", precio_base: "10000", precio_venta: "10000", iva_pct: "0", stock_actual: "5" },
    ]).returning({ id: productos.id });
    productAId = productA.id;
    productBId = productB.id;
    await db.insert(movimientos_inventario).values({ tenant_id: tenantAId, bodega_id: warehouseAId, producto_id: productAId, tipo: "entrada", cantidad: "5", costo_unitario: "10000" });
    await db.insert(cuentas_contables).values([
      { tenant_id: tenantAId, codigo: "1105", nombre: "Caja QA", tipo: "activo", naturaleza: "debito", nivel: 4 },
      { tenant_id: tenantAId, codigo: "4135", nombre: "Ingresos QA", tipo: "ingreso", naturaleza: "credito", nivel: 4 },
      { tenant_id: tenantAId, codigo: "2408", nombre: "IVA QA", tipo: "pasivo", naturaleza: "credito", nivel: 4 },
    ]);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const useTenantB = req.header("X-Test-Tenant") === "b";
      const tenantId = useTenantB ? tenantBId : tenantAId;
      req.tenantId = tenantId;
      req.userId = userAId;
      req.userRole = "admin";
      req.userContable = false;
      req.userDian = false;
      req.tenant = {
        id: tenantId,
        pos_config: {},
        plan: { features: { pos: true, inventario: true, pos_multi_caja: true } },
      } as unknown as TenantWithPlan;
      next();
    });
    app.use("/api/pos", posRouter);
    server = await new Promise<Server>((resolve) => {
      const created = app.listen(0, "127.0.0.1", () => resolve(created));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    const { db, lineas_asiento, asientos_contables, pagos_venta_pos, items_venta_pos, movimientos_inventario, ventas_pos, turnos_pos, cajas_pos, productos, bodegas, cuentas_contables, idempotency_keys, users, tenants, plans } = database;
    try {
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
      // La aplicación no elimina empresas con historial contable: conserva
      // el FK restrictivo. Esta limpieza se limita explícitamente a los dos
      // tenants efímeros creados por esta suite, incluidos sus contadores.
      await db.delete(lineas_asiento).where(sql`${lineas_asiento.asiento_id} IN (SELECT id FROM asientos_contables WHERE tenant_id = ${tenantAId})`);
      await db.delete(pagos_venta_pos).where(sql`${pagos_venta_pos.venta_id} IN (SELECT id FROM ventas_pos WHERE tenant_id = ${tenantAId})`);
      await db.delete(items_venta_pos).where(sql`${items_venta_pos.venta_id} IN (SELECT id FROM ventas_pos WHERE tenant_id = ${tenantAId})`);
      await db.delete(movimientos_inventario).where(eq(movimientos_inventario.tenant_id, tenantAId));
      await db.delete(ventas_pos).where(eq(ventas_pos.tenant_id, tenantAId));
      await db.delete(asientos_contables).where(eq(asientos_contables.tenant_id, tenantAId));
      await db.delete(turnos_pos).where(eq(turnos_pos.tenant_id, tenantAId));
      await db.delete(cajas_pos).where(eq(cajas_pos.tenant_id, tenantAId));
      await db.delete(cuentas_contables).where(eq(cuentas_contables.tenant_id, tenantAId));
      await db.delete(productos).where(eq(productos.tenant_id, tenantAId));
      await db.delete(bodegas).where(eq(bodegas.tenant_id, tenantAId));
      await db.delete(idempotency_keys).where(eq(idempotency_keys.tenant_id, tenantAId));
      await db.execute(sql`DELETE FROM consecutivos_asientos WHERE tenant_id IN (${tenantAId}, ${tenantBId})`);
      await db.delete(users).where(eq(users.tenant_id, tenantAId));
      await db.delete(tenants).where(eq(tenants.id, tenantAId));
      await db.delete(productos).where(eq(productos.tenant_id, tenantBId));
      await db.delete(tenants).where(eq(tenants.id, tenantBId));
      await db.delete(plans).where(eq(plans.id, planId));
    }
  });

  it("registra una venta, conserva el pago, descuenta stock, crea asiento y cierra caja", async () => {
    const caja = await request("/api/pos/cajas", { nombre: "Caja QA" });
    expect(caja.response.status).toBe(201);
    const turno = await request("/api/pos/turnos", { caja_id: caja.body.id, monto_inicial: 50000, bodega_id: warehouseAId });
    expect(turno.response.status).toBe(201);

    const ventaBody = { turno_id: turno.body.id, caja_id: caja.body.id, metodo_pago: "efectivo", monto_recibido: 25000, items: [{ producto_id: productAId, cantidad: 2 }] };
    const venta = await request("/api/pos/ventas", ventaBody, "a", "qa-sale-key-0001");
    expect(venta.response.status).toBe(201);
    expect(Number(venta.body.total)).toBe(20000);
    expect(venta.body.asiento_id).toEqual(expect.any(String));

    const retry = await request("/api/pos/ventas", ventaBody, "a", "qa-sale-key-0001");
    expect(retry.response.status).toBe(201);
    expect(retry.body.id).toBe(venta.body.id);

    const { db, productos, pagos_venta_pos, ventas_pos, lineas_asiento } = database;
    const [product] = await db.select({ stock: productos.stock_actual }).from(productos).where(eq(productos.id, productAId));
    expect(product.stock).toBe("3.0000");
    const [storedSale] = await db.select().from(ventas_pos).where(eq(ventas_pos.id, String(venta.body.id)));
    const payments = await db.select().from(pagos_venta_pos).where(eq(pagos_venta_pos.venta_id, storedSale.id));
    expect(payments).toHaveLength(1);
    expect(payments[0].monto).toBe("20000.00");
    const lines = await db.select().from(lineas_asiento).where(eq(lineas_asiento.asiento_id, storedSale.asiento_id!));
    expect(lines.reduce((sum, line) => sum + Number(line.debito), 0)).toBe(lines.reduce((sum, line) => sum + Number(line.credito), 0));

    const close = await fetch(`${baseUrl}/api/pos/turnos/${String(turno.body.id)}/cerrar`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Test-Tenant": "a" }, body: JSON.stringify({ monto_final_declarado: 70000 }) });
    expect(close.status).toBe(200);
  });

  it("aísla tenants y rechaza stock insuficiente sin crear una venta", async () => {
    const foreign = await request(`/api/pos/productos?ids=${productBId}`);
    expect(foreign.body).toEqual([]);
    const caja = await request("/api/pos/cajas", { nombre: "Caja insuficiente QA" });
    expect(caja.response.status).toBe(201);
    const turno = await request("/api/pos/turnos", { caja_id: caja.body.id, bodega_id: warehouseAId });
    expect(turno.response.status).toBe(201);
    const rejected = await request("/api/pos/ventas", { turno_id: turno.body.id, caja_id: caja.body.id, metodo_pago: "efectivo", items: [{ producto_id: productAId, cantidad: 99 }] }, "a", "qa-sale-key-0002");
    expect(rejected.response.status).toBe(422);
    expect(rejected.body.error).toMatch(/Stock insuficiente/);
    const { db, ventas_pos } = database;
    const rows = await db.select({ id: ventas_pos.id }).from(ventas_pos).where(and(eq(ventas_pos.tenant_id, tenantAId), eq(ventas_pos.consecutivo, 2)));
    expect(rows).toHaveLength(0);
  });
});
