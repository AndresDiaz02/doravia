import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { TenantWithPlan } from "../lib/tenant.js";

const databaseUrl = process.env.DATABASE_URL;
const parsedUrl = databaseUrl ? new URL(databaseUrl) : null;
const databaseName = parsedUrl?.pathname.replace(/^\//, "") ?? "";
const isLocalIntegrationDatabase = Boolean(
  parsedUrl &&
  ["127.0.0.1", "::1"].includes(parsedUrl.hostname.replace(/^\[|\]$/g, "")) &&
  /^doravia_test_[a-z0-9_]+$/i.test(databaseName),
);

type DbModule = typeof import("@workspace/db");
type PosRouter = typeof import("../routes/pos.js");
type AccountingModule = typeof import("../services/contabilidad.service.js");
type IdempotencyModule = typeof import("../services/idempotency.service.js");

// La suite no usa conexiones remotas. El workflow P0 la ejecuta contra su
// servicio PostgreSQL efímero; la suite unitaria normal no debe intentar
// conectarse a una URL de desarrollo, Neon ni producción.
describe.runIf(isLocalIntegrationDatabase)("P0-INT-001 POS transactional integrity (PostgreSQL)", () => {
  let database: DbModule;
  let posRouter: PosRouter["default"];
  let accounting: AccountingModule;
  let idempotency: IdempotencyModule;
  let server: Server;
  let baseUrl: string;
  let planId: string;
  let tenantAId: string;
  let tenantBId: string;
  let tenantCId: string;
  let userAId: string;
  let userBId: string;
  let userCId: string;
  let warehouseAId: string;
  let warehouseBId: string;
  let warehouseCId: string;
  let sequence = 0;
  let fidelizacionActiva = false;
  const pendingFailureTriggerCleanups = new Set<() => Promise<void>>();
  const runId = Math.floor(Date.now() / 1_000).toString(36);

  // Algunos campos de negocio (por ejemplo plans.slug y número de documento)
  // admiten como máximo 20 caracteres. Mantener las semillas únicas y dentro
  // de ese contrato evita que la infraestructura de prueba oculte el escenario
  // transaccional que queremos verificar.
  const next = (prefix: string) => `${prefix.slice(0, 8)}-${runId}-${++sequence}`;

  async function request(
    path: string,
    body: unknown,
    tenant: "a" | "b" | "c" = "a",
    idempotencyKey?: string,
    interruptResponse = false,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Tenant": tenant,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(interruptResponse ? { "X-Test-Interrupt-Response": "true" } : {}),
      },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() as Record<string, unknown> };
  }

  async function createProduct(tenantId: string, warehouseId: string, stock: number) {
    const { db, productos, movimientos_inventario } = database;
    const [product] = await db.insert(productos).values({
      tenant_id: tenantId,
      codigo: next("p0-product"),
      nombre: "Producto P0",
      precio_base: "10000",
      precio_venta: "10000",
      iva_pct: "0",
      stock_actual: String(stock),
    }).returning({ id: productos.id });
    await db.insert(movimientos_inventario).values({
      tenant_id: tenantId,
      bodega_id: warehouseId,
      producto_id: product.id,
      tipo: "entrada",
      cantidad: String(stock),
      costo_unitario: "10000",
      referencia_tipo: "p0_seed",
      referencia_id: null,
    });
    return product.id;
  }

  async function createCustomer(tenantId: string) {
    const { db, clientes } = database;
    const [customer] = await db.insert(clientes).values({
      tenant_id: tenantId,
      tipo_persona: "natural",
      tipo_documento: "CC",
      numero_documento: next("p0-customer"),
      nombre: "Cliente P0",
    }).returning({ id: clientes.id });
    return customer.id;
  }

  async function openTurn(tenant: "a" | "b" | "c", warehouseId: string) {
    const caja = await request("/api/pos/cajas", { nombre: next("Caja P0") }, tenant);
    expect(caja.response.status).toBe(201);
    const turno = await request("/api/pos/turnos", {
      caja_id: caja.body.id,
      bodega_id: warehouseId,
      monto_inicial: 0,
    }, tenant);
    expect(turno.response.status).toBe(201);
    return { cajaId: String(caja.body.id), turnoId: String(turno.body.id) };
  }

  function saleBody(turnoId: string, cajaId: string, productId: string, cantidad = 1) {
    return {
      turno_id: turnoId,
      caja_id: cajaId,
      metodo_pago: "efectivo",
      items: [{ producto_id: productId, cantidad }],
    };
  }

  async function tenantCounts(tenantId: string) {
    const { db, ventas_pos, asientos_contables, movimientos_inventario, pagos_venta_pos, items_venta_pos } = database;
    const [[ventas], [asientos], [movimientos], [pagos], [items]] = await Promise.all([
      db.select({ value: count() }).from(ventas_pos).where(eq(ventas_pos.tenant_id, tenantId)),
      db.select({ value: count() }).from(asientos_contables).where(eq(asientos_contables.tenant_id, tenantId)),
      db.select({ value: count() }).from(movimientos_inventario).where(eq(movimientos_inventario.tenant_id, tenantId)),
      db.select({ value: count() }).from(pagos_venta_pos).innerJoin(ventas_pos, eq(pagos_venta_pos.venta_id, ventas_pos.id)).where(eq(ventas_pos.tenant_id, tenantId)),
      db.select({ value: count() }).from(items_venta_pos).innerJoin(ventas_pos, eq(items_venta_pos.venta_id, ventas_pos.id)).where(eq(ventas_pos.tenant_id, tenantId)),
    ]);
    return {
      ventas: Number(ventas.value), asientos: Number(asientos.value), movimientos: Number(movimientos.value),
      pagos: Number(pagos.value), items: Number(items.value),
    };
  }

  async function turnTotal(turnId: string) {
    const [turn] = await database.db.select({ total: database.turnos_pos.total_ventas })
      .from(database.turnos_pos)
      .where(eq(database.turnos_pos.id, turnId));
    return Number(turn.total);
  }

  async function installFailureTrigger(table: "asientos_contables" | "lineas_asiento") {
    const { db } = database;
    const functionName = `p0_fail_${table}`;
    const triggerName = `p0_trigger_${table}`;
    await db.execute(sql.raw(`CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'P0 forced ${table} failure'; END; $$`));
    await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${functionName}()`));
    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      try {
        await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`));
        await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}()`));
        cleaned = true;
      } finally {
        if (cleaned) pendingFailureTriggerCleanups.delete(cleanup);
      }
    };
    pendingFailureTriggerCleanups.add(cleanup);
    return cleanup;
  }

  async function cleanupTestTenant(tenantId: string) {
    const {
      db, lineas_asiento, asientos_contables, pagos_venta_pos, items_venta_pos,
      movimientos_inventario, ventas_pos, turnos_pos, cajas_pos, productos,
      bodegas, cuentas_contables, idempotency_keys,
      clientes, users, tenants,
    } = database;
    // La aplicación conserva el FK restrictivo para empresas con historial.
    // La suite solo puede borrar los tenants que ella misma creó, en orden de
    // dependencias, sin tocar filas de otra empresa.
    await db.delete(lineas_asiento).where(sql`${lineas_asiento.asiento_id} IN (SELECT id FROM asientos_contables WHERE tenant_id = ${tenantId})`);
    await db.delete(pagos_venta_pos).where(sql`${pagos_venta_pos.venta_id} IN (SELECT id FROM ventas_pos WHERE tenant_id = ${tenantId})`);
    await db.delete(items_venta_pos).where(sql`${items_venta_pos.venta_id} IN (SELECT id FROM ventas_pos WHERE tenant_id = ${tenantId})`);
    await db.delete(movimientos_inventario).where(eq(movimientos_inventario.tenant_id, tenantId));
    await db.delete(ventas_pos).where(eq(ventas_pos.tenant_id, tenantId));
    await db.delete(asientos_contables).where(eq(asientos_contables.tenant_id, tenantId));
    await db.delete(turnos_pos).where(eq(turnos_pos.tenant_id, tenantId));
    await db.delete(cajas_pos).where(eq(cajas_pos.tenant_id, tenantId));
    await db.delete(cuentas_contables).where(eq(cuentas_contables.tenant_id, tenantId));
    await db.delete(productos).where(eq(productos.tenant_id, tenantId));
    await db.delete(bodegas).where(eq(bodegas.tenant_id, tenantId));
    await db.delete(idempotency_keys).where(eq(idempotency_keys.tenant_id, tenantId));
    await db.execute(sql`DELETE FROM consecutivos_asientos WHERE tenant_id = ${tenantId}`);
    await db.delete(clientes).where(eq(clientes.tenant_id, tenantId));
    await db.delete(users).where(eq(users.tenant_id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }

  beforeAll(async () => {
    if (!isLocalIntegrationDatabase) {
      throw new Error("P0-INT-001 requiere PostgreSQL local con DATABASE_URL doravia_test_*.");
    }
    database = await import("@workspace/db");
    ({ default: posRouter } = await import("../routes/pos.js"));
    accounting = await import("../services/contabilidad.service.js");
    idempotency = await import("../services/idempotency.service.js");
    const { db, plans, tenants, users, bodegas, cuentas_contables } = database;
    const planSlug = next("p0-pos");
    [planId] = (await db.insert(plans).values({
      slug: planSlug, nombre: "P0 POS", product: "pos", accounting_level: 1,
      features: { pos: true, inventario: true, pos_multi_caja: true }, precio_anual_cop: 0,
    }).returning({ id: plans.id })).map((row) => row.id);
    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000);
    const created = await db.insert(tenants).values([
      { nombre: "P0 A", nit: next("nit-a"), plan_id: planId, plan_starts_at: now, plan_ends_at: future, onboarding_completado: true },
      { nombre: "P0 B", nit: next("nit-b"), plan_id: planId, plan_starts_at: now, plan_ends_at: future, onboarding_completado: true },
      { nombre: "P0 sin cuentas", nit: next("nit-c"), plan_id: planId, plan_starts_at: now, plan_ends_at: future, onboarding_completado: true },
    ]).returning({ id: tenants.id });
    [tenantAId, tenantBId, tenantCId] = created.map((row) => row.id);
    const createdUsers = await db.insert(users).values([
      { tenant_id: tenantAId, email: `${next("a")}@example.test`, nombre: "Admin A", role: "admin", password_hash: "test" },
      { tenant_id: tenantBId, email: `${next("b")}@example.test`, nombre: "Admin B", role: "admin", password_hash: "test" },
      { tenant_id: tenantCId, email: `${next("c")}@example.test`, nombre: "Admin C", role: "admin", password_hash: "test" },
    ]).returning({ id: users.id });
    [userAId, userBId, userCId] = createdUsers.map((row) => row.id);
    const createdWarehouses = await db.insert(bodegas).values([
      { tenant_id: tenantAId, nombre: "Bodega A" },
      { tenant_id: tenantBId, nombre: "Bodega B" },
      { tenant_id: tenantCId, nombre: "Bodega C" },
    ]).returning({ id: bodegas.id });
    [warehouseAId, warehouseBId, warehouseCId] = createdWarehouses.map((row) => row.id);
    await db.insert(cuentas_contables).values([
      ...[tenantAId, tenantBId].flatMap((tenant_id) => [
        { tenant_id, codigo: "1105", nombre: "Caja P0", tipo: "activo" as const, naturaleza: "debito" as const, nivel: 4 },
        { tenant_id, codigo: "4135", nombre: "Ingresos P0", tipo: "ingreso" as const, naturaleza: "credito" as const, nivel: 4 },
        { tenant_id, codigo: "2408", nombre: "IVA P0", tipo: "pasivo" as const, naturaleza: "credito" as const, nivel: 4 },
      ]),
    ]);

    const app = express();
    app.use(express.json());
    app.use((req, res, nextMiddleware) => {
      if (req.header("X-Test-Interrupt-Response") === "true") {
        res.json = ((_: unknown) => {
          req.socket.destroy();
          return res;
        }) as typeof res.json;
      }
      nextMiddleware();
    });
    app.use((req, _res, nextMiddleware) => {
      const key = req.header("X-Test-Tenant") as "a" | "b" | "c" | undefined;
      const values = key === "b"
        ? { tenantId: tenantBId, userId: userBId }
        : key === "c"
          ? { tenantId: tenantCId, userId: userCId }
          : { tenantId: tenantAId, userId: userAId };
      req.tenantId = values.tenantId;
      req.userId = values.userId;
      req.userRole = "admin";
      req.userContable = true;
      req.userDian = false;
      req.tenant = {
        id: values.tenantId,
        pos_config: {
          permitir_inventario_negativo: false,
          fidelizacion_activa: fidelizacionActiva,
          fidelizacion_pesos_por_punto: 1_000,
        },
        plan: { features: { pos: true, inventario: true, pos_multi_caja: true } },
      } as unknown as TenantWithPlan;
      nextMiddleware();
    });
    app.use("/api/pos", posRouter);
    server = await new Promise<Server>((resolve) => {
      const createdServer = app.listen(0, "127.0.0.1", () => resolve(createdServer));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    try {
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
      try {
        // Cada escenario usa finally. Esta segunda barrera evita que un fallo de
        // infraestructura deje un trigger P0 instalado para otra suite.
        for (const cleanup of [...pendingFailureTriggerCleanups]) await cleanup();
      } finally {
        for (const tenantId of [tenantAId, tenantBId, tenantCId]) await cleanupTestTenant(tenantId);
        await database.db.delete(database.plans).where(eq(database.plans.id, planId));
      }
    }
  });

  it("asigna el consecutivo siguiente al máximo histórico aunque existan huecos", async () => {
    const { db, asientos_contables } = database;
    const year = new Date().getFullYear();
    await db.insert(asientos_contables).values([
      { tenant_id: tenantAId, numero: `AC-${year}-00001`, fecha: `${year}-01-01`, descripcion: "Histórico P0 1", origen: "manual" },
      { tenant_id: tenantAId, numero: `AC-${year}-00003`, fecha: `${year}-01-03`, descripcion: "Histórico P0 3", origen: "manual" },
    ]);
    await expect(accounting.siguienteNumeroAsiento(tenantAId, year)).resolves.toBe(`AC-${year}-00004`);
  });

  it("asigna dos asientos concurrentes distintos para la misma empresa", async () => {
    const { db, asientos_contables } = database;
    const year = new Date().getFullYear();
    const crear = (descripcion: string) => db.transaction(async (tx) => {
      const numero = await accounting.siguienteNumeroAsiento(tenantAId, year, tx);
      const [asiento] = await tx.insert(asientos_contables).values({
        tenant_id: tenantAId,
        numero,
        fecha: `${year}-02-01`,
        descripcion,
        origen: "manual",
      }).returning({ numero: asientos_contables.numero });
      return asiento.numero;
    });
    const numeros = await Promise.all([crear("Concurrente P0 A"), crear("Concurrente P0 B")]);
    expect(new Set(numeros).size).toBe(2);
    expect(numeros.every((numero) => numero.startsWith(`AC-${year}-`))).toBe(true);
  });

  it("revierte venta completa cuando falla antes de crear el asiento", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 2);
    const customerId = await createCustomer(tenantAId);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const before = await tenantCounts(tenantAId);
    const removeTrigger = await installFailureTrigger("asientos_contables");
    fidelizacionActiva = true;
    try {
      const result = await request(
        "/api/pos/ventas",
        { ...saleBody(turnoId, cajaId, productId), cliente_id: customerId },
        "a",
        next("rollback-before"),
      );
      expect(result.response.status).toBe(500);
      // La API no expone el detalle interno de un trigger/driver al cajero.
      expect(result.body.error).toMatch(/error al registrar la venta/i);
    } finally {
      fidelizacionActiva = false;
      await removeTrigger();
    }
    expect(await tenantCounts(tenantAId)).toEqual(before);
    const [product] = await database.db.select({ stock: database.productos.stock_actual }).from(database.productos).where(eq(database.productos.id, productId));
    expect(Number(product.stock)).toBe(2);
    const [customer] = await database.db.select({ points: database.clientes.puntos_fidelidad }).from(database.clientes).where(eq(database.clientes.id, customerId));
    expect(customer.points).toBe(0);
    expect(await turnTotal(turnoId)).toBe(0);
  });

  it("revierte cabecera y efectos cuando falla al insertar líneas del asiento", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 2);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const before = await tenantCounts(tenantAId);
    const removeTrigger = await installFailureTrigger("lineas_asiento");
    try {
      const result = await request("/api/pos/ventas", saleBody(turnoId, cajaId, productId), "a", next("rollback-lines"));
      expect(result.response.status).toBe(500);
    } finally {
      await removeTrigger();
    }
    expect(await tenantCounts(tenantAId)).toEqual(before);
    expect(await turnTotal(turnoId)).toBe(0);
  });

  it("no duplica una venta ante dos solicitudes simultáneas con la misma llave", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 3);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const key = next("same-key");
    const body = saleBody(turnoId, cajaId, productId);
    const [first, second] = await Promise.all([request("/api/pos/ventas", body, "a", key), request("/api/pos/ventas", body, "a", key)]);
    expect([first.response.status, second.response.status]).toContain(201);
    expect([first.response.status, second.response.status].filter((status) => status === 201)).toHaveLength(1);
    const retry = await request("/api/pos/ventas", body, "a", key);
    expect(retry.response.status).toBe(201);
    const { db, ventas_pos, asientos_contables } = database;
    const sales = await db.select().from(ventas_pos).where(eq(ventas_pos.tenant_id, tenantAId));
    const seats = await db.select().from(asientos_contables).where(eq(asientos_contables.tenant_id, tenantAId));
    expect(sales.filter((sale) => sale.id === retry.body.id)).toHaveLength(1);
    expect(seats.filter((seat) => seat.referencia_id === retry.body.id)).toHaveLength(1);
  });

  it("recupera una reserva abandonada y registra una sola venta", async () => {
    const { db, idempotency_keys, ventas_pos } = database;
    const productId = await createProduct(tenantAId, warehouseAId, 1);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const body = saleBody(turnoId, cajaId, productId);
    const key = next("abandoned");
    await db.insert(idempotency_keys).values({
      tenant_id: tenantAId,
      operacion: "pos.venta",
      clave: key,
      request_hash: idempotency.hashIdempotencyPayload(body),
      estado: "procesando",
      lease_token: "abandoned-owner",
      lease_expires_at: new Date(Date.now() - 60_000),
    });
    const result = await request("/api/pos/ventas", body, "a", key);
    expect(result.response.status).toBe(201);
    const sales = await db.select().from(ventas_pos).where(eq(ventas_pos.id, String(result.body.id)));
    expect(sales).toHaveLength(1);
  });

  it("reconcilia una reserva vencida con venta confirmada sin duplicarla", async () => {
    const { db, idempotency_keys, ventas_pos } = database;
    const productId = await createProduct(tenantAId, warehouseAId, 1);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const body = saleBody(turnoId, cajaId, productId);
    const key = next("reconcile");
    const first = await request("/api/pos/ventas", body, "a", key);
    expect(first.response.status).toBe(201);
    await db.update(idempotency_keys).set({
      estado: "procesando",
      respuesta: null,
      lease_token: "stale-owner",
      lease_expires_at: new Date(Date.now() - 60_000),
    }).where(and(
      eq(idempotency_keys.tenant_id, tenantAId),
      eq(idempotency_keys.operacion, "pos.venta"),
      eq(idempotency_keys.clave, key),
    ));
    const retry = await request("/api/pos/ventas", body, "a", key);
    expect(retry.response.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    const sales = await db.select().from(ventas_pos).where(eq(ventas_pos.id, String(first.body.id)));
    expect(sales).toHaveLength(1);
  });

  it("rechaza una llave de idempotencia reutilizada con payload distinto", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 2);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const key = next("payload-conflict");
    const body = saleBody(turnoId, cajaId, productId);
    expect((await request("/api/pos/ventas", body, "a", key)).response.status).toBe(201);
    const conflict = await request("/api/pos/ventas", { ...body, observaciones: "payload diferente" }, "a", key);
    expect(conflict.response.status).toBe(409);
    expect(conflict.body.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
  });

  it("evita saldos negativos con dos ventas concurrentes de stock limitado", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 1);
    const firstTurn = await openTurn("a", warehouseAId);
    const secondTurn = await openTurn("a", warehouseAId);
    const [first, second] = await Promise.all([
      request("/api/pos/ventas", saleBody(firstTurn.turnoId, firstTurn.cajaId, productId), "a", next("stock-a")),
      request("/api/pos/ventas", saleBody(secondTurn.turnoId, secondTurn.cajaId, productId), "a", next("stock-b")),
    ]);
    expect([first.response.status, second.response.status].sort()).toEqual([201, 422]);
    const [product] = await database.db.select({ stock: database.productos.stock_actual }).from(database.productos).where(eq(database.productos.id, productId));
    expect(Number(product.stock)).toBe(0);
  });

  it("aísla empresas incluso cuando procesan ventas en paralelo", async () => {
    const productA = await createProduct(tenantAId, warehouseAId, 1);
    const productB = await createProduct(tenantBId, warehouseBId, 1);
    const turnA = await openTurn("a", warehouseAId);
    const turnB = await openTurn("b", warehouseBId);
    const foreign = await request("/api/pos/ventas", saleBody(turnA.turnoId, turnA.cajaId, productB), "a", next("foreign"));
    expect(foreign.response.status).toBe(422);
    const [saleA, saleB] = await Promise.all([
      request("/api/pos/ventas", saleBody(turnA.turnoId, turnA.cajaId, productA), "a", next("tenant-a")),
      request("/api/pos/ventas", saleBody(turnB.turnoId, turnB.cajaId, productB), "b", next("tenant-b")),
    ]);
    expect(saleA.response.status).toBe(201);
    expect(saleB.response.status).toBe(201);
    const rowsA = await database.db.select().from(database.ventas_pos).where(eq(database.ventas_pos.tenant_id, tenantAId));
    const rowsB = await database.db.select().from(database.ventas_pos).where(eq(database.ventas_pos.tenant_id, tenantBId));
    expect(rowsA.every((row) => row.tenant_id === tenantAId)).toBe(true);
    expect(rowsB.every((row) => row.tenant_id === tenantBId)).toBe(true);
  });

  it("rechaza una venta sin configuración contable mínima y no persiste efectos", async () => {
    const { db, cuentas_contables, productos } = database;
    const productId = await createProduct(tenantCId, warehouseCId, 1);
    const { cajaId, turnoId } = await openTurn("c", warehouseCId);
    // Solo para esta base efímera: desactiva el PUC global de ingresos y prueba
    // que el tenant sin cuentas propias no puede crear una venta incompleta.
    await db.update(cuentas_contables).set({ activo: false }).where(and(eq(cuentas_contables.codigo, "4135"), isNull(cuentas_contables.tenant_id)));
    try {
      const result = await request("/api/pos/ventas", saleBody(turnoId, cajaId, productId), "c", next("missing-puc"));
      expect(result.response.status).toBe(422);
      expect(result.body.error).toMatch(/Configuración contable incompleta/);
    } finally {
      await db.update(cuentas_contables).set({ activo: true }).where(and(eq(cuentas_contables.codigo, "4135"), isNull(cuentas_contables.tenant_id)));
    }
    const [product] = await db.select({ stock: productos.stock_actual }).from(productos).where(eq(productos.id, productId));
    expect(Number(product.stock)).toBe(1);
    const sales = await db.select().from(database.ventas_pos).where(eq(database.ventas_pos.tenant_id, tenantCId));
    expect(sales).toHaveLength(0);
  });

  it("crea venta normal con asiento balanceado e inventario correcto en plan POS independiente", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 2);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const result = await request("/api/pos/ventas", saleBody(turnoId, cajaId, productId, 2), "a", next("normal"));
    expect(result.response.status).toBe(201);
    expect(result.body.asiento_id).toEqual(expect.any(String));
    const { db, ventas_pos, lineas_asiento, productos } = database;
    const [sale] = await db.select().from(ventas_pos).where(eq(ventas_pos.id, String(result.body.id)));
    const lines = await db.select().from(lineas_asiento).where(eq(lineas_asiento.asiento_id, sale.asiento_id!));
    expect(lines.reduce((sum, line) => sum + Number(line.debito), 0)).toBe(lines.reduce((sum, line) => sum + Number(line.credito), 0));
    const [product] = await db.select({ stock: productos.stock_actual }).from(productos).where(eq(productos.id, productId));
    expect(Number(product.stock)).toBe(0);
  });

  it("reintenta de forma segura después de interrumpir la respuesta HTTP", async () => {
    const productId = await createProduct(tenantAId, warehouseAId, 1);
    const { cajaId, turnoId } = await openTurn("a", warehouseAId);
    const key = next("interrupted");
    const body = saleBody(turnoId, cajaId, productId);
    await expect(request("/api/pos/ventas", body, "a", key, true)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const retry = await request("/api/pos/ventas", body, "a", key);
    expect(retry.response.status).toBe(201);
    const sales = await database.db.select().from(database.ventas_pos).where(eq(database.ventas_pos.id, String(retry.body.id)));
    expect(sales).toHaveLength(1);
  });
});
