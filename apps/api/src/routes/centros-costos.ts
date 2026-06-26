import { Router } from "express";
import { db, centros_costos, lineas_asiento, gastos } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

// GET /api/centros-costos
router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(centros_costos)
    .where(eq(centros_costos.tenant_id, req.tenantId))
    .orderBy(centros_costos.codigo);
  res.json(rows);
});

// POST /api/centros-costos
router.post("/", async (req, res) => {
  const { codigo, nombre, descripcion } = req.body as {
    codigo?: string; nombre?: string; descripcion?: string;
  };
  if (!codigo || !nombre) {
    return res.status(400).json({ error: "codigo y nombre son requeridos." });
  }

  const [existente] = await db
    .select({ id: centros_costos.id })
    .from(centros_costos)
    .where(and(eq(centros_costos.tenant_id, req.tenantId), eq(centros_costos.codigo, codigo)))
    .limit(1);
  if (existente) return res.status(422).json({ error: `Ya existe un centro con código ${codigo}.` });

  const [nuevo] = await db
    .insert(centros_costos)
    .values({ tenant_id: req.tenantId, codigo, nombre, descripcion: descripcion ?? null })
    .returning();
  res.status(201).json(nuevo);
});

// PATCH /api/centros-costos/:id
router.patch("/:id", async (req, res) => {
  const [cc] = await db
    .select()
    .from(centros_costos)
    .where(and(eq(centros_costos.id, req.params.id), eq(centros_costos.tenant_id, req.tenantId)))
    .limit(1);
  if (!cc) return res.status(404).json({ error: "Centro de costo no encontrado." });

  const { nombre, descripcion, activo } = req.body as {
    nombre?: string; descripcion?: string; activo?: boolean;
  };
  const [actualizado] = await db
    .update(centros_costos)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(descripcion !== undefined && { descripcion }),
      ...(activo !== undefined && { activo }),
    })
    .where(eq(centros_costos.id, cc.id))
    .returning();
  res.json(actualizado);
});

// GET /api/centros-costos/:id/reporte
// Ingresos (credito) y gastos (debito) acumulados para este centro
router.get("/:id/reporte", async (req, res) => {
  const [cc] = await db
    .select()
    .from(centros_costos)
    .where(and(eq(centros_costos.id, req.params.id), eq(centros_costos.tenant_id, req.tenantId)))
    .limit(1);
  if (!cc) return res.status(404).json({ error: "Centro de costo no encontrado." });

  const [totalesLineas] = await db
    .select({
      total_debito:  sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`,
      total_credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)`,
    })
    .from(lineas_asiento)
    .where(eq(lineas_asiento.centro_costo_id, cc.id));

  const [totalesGastos] = await db
    .select({
      total_gastos: sql<string>`COALESCE(SUM(${gastos.total}), 0)`,
    })
    .from(gastos)
    .where(and(eq(gastos.centro_costo_id, cc.id), eq(gastos.tenant_id, req.tenantId)));

  const debito  = Number(totalesLineas?.total_debito  ?? 0);
  const credito = Number(totalesLineas?.total_credito ?? 0);
  const totalGastos = Number(totalesGastos?.total_gastos ?? 0);

  res.json({
    centro: cc,
    contabilidad: { debito, credito, neto: credito - debito },
    gastos_directos: totalGastos,
  });
});

export default router;
