import { Router } from "express";
import {
  db, empleados, contratos_empleado, nominas_periodo, nominas_detalle,
  centros_costos, tenants, nomina_config_global, documentos_soporte_nomina,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, inArray } from "drizzle-orm";
import { requireContableOperativo } from "../middleware/require-plan-feature.js";
import { encrypt, decrypt } from "../services/encryption.js";
import { TIPOS_CONTRATO, ESTADOS_EMPLEADO } from "@workspace/db";
import { calcularPeriodo, aprobarPeriodo, emitirPeriodo, NominaEstadoError } from "../services/nomina.service.js";
import { generarPdfColillaConsolidada } from "../services/pdf.service.js";

const router = Router();

// La nómina se habilita inicialmente para preparación y validación interna. Hasta
// que se configure explícitamente producción, ningún período puede emitirse ni
// consumir documentos. El cálculo, la revisión y la generación de borradores sí
// permanecen disponibles para el entorno de pruebas.
const nominaModo = () => (process.env.NOMINA_MODO ?? "pruebas").trim().toLowerCase();

// Columnas seguras para listados (nunca datos_bancarios_encrypted)
const EMPLEADO_COLUMNAS_LISTADO = {
  id: empleados.id,
  cedula: empleados.cedula,
  nombres: empleados.nombres,
  apellidos: empleados.apellidos,
  cargo: empleados.cargo,
  fecha_ingreso: empleados.fecha_ingreso,
  salario_base: empleados.salario_base,
  tipo_contrato: empleados.tipo_contrato,
  estado: empleados.estado,
  fecha_retiro: empleados.fecha_retiro,
  centro_costos_id: empleados.centro_costos_id,
  created_at: empleados.created_at,
  updated_at: empleados.updated_at,
};

// ── Empleados ────────────────────────────────────────────────────────────────

// GET /api/nomina/empleados?estado=activo
router.get("/empleados", async (req, res) => {
  try {
    const { estado } = req.query as { estado?: string };
    const conds = [eq(empleados.tenant_id, req.tenantId)];
    if (estado) conds.push(eq(empleados.estado, estado as (typeof ESTADOS_EMPLEADO)[number]));

    const rows = await db
      .select(EMPLEADO_COLUMNAS_LISTADO)
      .from(empleados)
      .where(and(...conds))
      .orderBy(empleados.nombres);

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /nomina/empleados:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/nomina/empleados/:id — incluye datos bancarios descifrados solo para admin
router.get("/empleados/:id", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(empleados)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Empleado no encontrado." });

    const { datos_bancarios_encrypted, ...safe } = row;
    const datos_bancarios =
      req.userRole === "admin" && datos_bancarios_encrypted
        ? JSON.parse(decrypt(datos_bancarios_encrypted))
        : null;

    res.json({ ...safe, datos_bancarios });
  } catch (err) {
    console.error("Error en GET /nomina/empleados/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/nomina/empleados
router.post("/empleados", requireContableOperativo, async (req, res) => {
  try {
    const {
      cedula, nombres, apellidos, cargo, fecha_ingreso,
      salario_base, tipo_contrato, centro_costos_id, datos_bancarios,
    } = req.body as {
      cedula?: string; nombres?: string; apellidos?: string; cargo?: string;
      fecha_ingreso?: string; salario_base?: number; tipo_contrato?: string;
      centro_costos_id?: string; datos_bancarios?: Record<string, unknown>;
    };

    if (!cedula || !nombres || !apellidos || !fecha_ingreso || salario_base == null || !tipo_contrato) {
      return res.status(400).json({
        error: "Campos requeridos: cedula, nombres, apellidos, fecha_ingreso, salario_base, tipo_contrato.",
      });
    }
    if (!TIPOS_CONTRATO.includes(tipo_contrato as (typeof TIPOS_CONTRATO)[number])) {
      return res.status(400).json({ error: `tipo_contrato debe ser: ${TIPOS_CONTRATO.join(", ")}.` });
    }

    if (centro_costos_id) {
      const [cc] = await db.select({ id: centros_costos.id }).from(centros_costos)
        .where(and(eq(centros_costos.id, centro_costos_id), eq(centros_costos.tenant_id, req.tenantId))).limit(1);
      if (!cc) return res.status(400).json({ error: "centro_costos_id no existe para este tenant." });
    }

    const [nuevo] = await db
      .insert(empleados)
      .values({
        tenant_id: req.tenantId,
        cedula,
        nombres,
        apellidos,
        cargo: cargo ?? null,
        fecha_ingreso,
        salario_base: String(salario_base),
        tipo_contrato: tipo_contrato as (typeof TIPOS_CONTRATO)[number],
        centro_costos_id: centro_costos_id ?? null,
        datos_bancarios_encrypted: datos_bancarios ? encrypt(JSON.stringify(datos_bancarios)) : null,
      })
      .returning(EMPLEADO_COLUMNAS_LISTADO);

    // Contrato inicial — el alta de un empleado siempre abre su primer contrato
    await db.insert(contratos_empleado).values({
      empleado_id: nuevo.id,
      fecha_inicio: fecha_ingreso,
      tipo: tipo_contrato as (typeof TIPOS_CONTRATO)[number],
      salario: String(salario_base),
    });

    res.status(201).json(nuevo);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un empleado con esa cédula en esta empresa." });
    }
    console.error("Error en POST /nomina/empleados:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/nomina/empleados/:id
router.patch("/empleados/:id", requireContableOperativo, async (req, res) => {
  try {
    const [row] = await db.select({ id: empleados.id }).from(empleados)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Empleado no encontrado." });

    const {
      nombres, apellidos, cargo, centro_costos_id, datos_bancarios,
    } = req.body as {
      nombres?: string; apellidos?: string; cargo?: string;
      centro_costos_id?: string | null; datos_bancarios?: Record<string, unknown>;
    };

    const patch: Partial<typeof empleados.$inferInsert> = { updated_at: new Date() };
    if (nombres !== undefined) patch.nombres = nombres;
    if (apellidos !== undefined) patch.apellidos = apellidos;
    if (cargo !== undefined) patch.cargo = cargo;
    if (centro_costos_id !== undefined) {
      if (centro_costos_id !== null) {
        const [centroCosto] = await db.select({ id: centros_costos.id }).from(centros_costos)
          .where(and(eq(centros_costos.id, centro_costos_id), eq(centros_costos.tenant_id, req.tenantId)))
          .limit(1);
        if (!centroCosto) return res.status(400).json({ error: "centro_costos_id no existe para este tenant." });
      }
      patch.centro_costos_id = centro_costos_id;
    }
    if (datos_bancarios !== undefined) patch.datos_bancarios_encrypted = encrypt(JSON.stringify(datos_bancarios));

    const [updated] = await db.update(empleados).set(patch)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId)))
      .returning(EMPLEADO_COLUMNAS_LISTADO);

    res.json(updated);
  } catch (err) {
    console.error("Error en PATCH /nomina/empleados/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// PATCH /api/nomina/empleados/:id/retirar
router.patch("/empleados/:id/retirar", requireContableOperativo, async (req, res) => {
  try {
    const { fecha_retiro } = req.body as { fecha_retiro?: string };
    if (!fecha_retiro) return res.status(400).json({ error: "fecha_retiro es requerida." });

    const [row] = await db.select({ id: empleados.id }).from(empleados)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Empleado no encontrado." });

    const [updated] = await db.update(empleados)
      .set({ estado: "retirado", fecha_retiro, updated_at: new Date() })
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId)))
      .returning(EMPLEADO_COLUMNAS_LISTADO);

    // Cierra el contrato vigente (fecha_fin null) a la fecha de retiro
    await db.update(contratos_empleado)
      .set({ fecha_fin: fecha_retiro })
      .where(and(eq(contratos_empleado.empleado_id, req.params.id), isNull(contratos_empleado.fecha_fin)));

    res.json(updated);
  } catch (err) {
    console.error("Error en PATCH /nomina/empleados/:id/retirar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// DELETE /api/nomina/empleados/:id — solo si no tiene nóminas procesadas
router.delete("/empleados/:id", requireContableOperativo, async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede eliminar empleados." });
    }

    const [row] = await db.select({ id: empleados.id }).from(empleados)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Empleado no encontrado." });

    const [conNomina] = await db.select({ id: nominas_detalle.id }).from(nominas_detalle)
      .where(eq(nominas_detalle.empleado_id, req.params.id)).limit(1);
    if (conNomina) {
      return res.status(409).json({
        error: "No se puede eliminar: el empleado tiene nóminas procesadas. Márcalo como retirado en su lugar.",
      });
    }

    await db.delete(contratos_empleado).where(eq(contratos_empleado.empleado_id, req.params.id));
    await db.delete(empleados)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId)));
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /nomina/empleados/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Contratos (historial por empleado) ────────────────────────────────────────

// GET /api/nomina/empleados/:empleadoId/contratos
router.get("/empleados/:empleadoId/contratos", async (req, res) => {
  try {
    const [emp] = await db.select({ id: empleados.id }).from(empleados)
      .where(and(eq(empleados.id, req.params.empleadoId), eq(empleados.tenant_id, req.tenantId))).limit(1);
    if (!emp) return res.status(404).json({ error: "Empleado no encontrado." });

    const rows = await db.select().from(contratos_empleado)
      .where(eq(contratos_empleado.empleado_id, req.params.empleadoId))
      .orderBy(desc(contratos_empleado.fecha_inicio));

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /nomina/empleados/:empleadoId/contratos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/nomina/empleados/:empleadoId/contratos — nuevo contrato, cierra el vigente
router.post("/empleados/:empleadoId/contratos", requireContableOperativo, async (req, res) => {
  try {
    const [emp] = await db.select({ id: empleados.id }).from(empleados)
      .where(and(eq(empleados.id, req.params.empleadoId), eq(empleados.tenant_id, req.tenantId))).limit(1);
    if (!emp) return res.status(404).json({ error: "Empleado no encontrado." });

    const { fecha_inicio, tipo, salario, observaciones } = req.body as {
      fecha_inicio?: string; tipo?: string; salario?: number; observaciones?: string;
    };
    if (!fecha_inicio || !tipo || salario == null) {
      return res.status(400).json({ error: "Campos requeridos: fecha_inicio, tipo, salario." });
    }
    if (!TIPOS_CONTRATO.includes(tipo as (typeof TIPOS_CONTRATO)[number])) {
      return res.status(400).json({ error: `tipo debe ser: ${TIPOS_CONTRATO.join(", ")}.` });
    }

    // Cierra el contrato vigente el día anterior al nuevo inicio
    const diaAnterior = new Date(fecha_inicio + "T12:00:00");
    diaAnterior.setDate(diaAnterior.getDate() - 1);
    await db.update(contratos_empleado)
      .set({ fecha_fin: diaAnterior.toISOString().slice(0, 10) })
      .where(and(eq(contratos_empleado.empleado_id, req.params.empleadoId), isNull(contratos_empleado.fecha_fin)));

    const [nuevo] = await db.insert(contratos_empleado).values({
      empleado_id: req.params.empleadoId,
      fecha_inicio,
      tipo: tipo as (typeof TIPOS_CONTRATO)[number],
      salario: String(salario),
      observaciones: observaciones ?? null,
    }).returning();

    // El contrato nuevo pasa a ser la condición vigente del empleado
    await db.update(empleados)
      .set({ tipo_contrato: tipo as (typeof TIPOS_CONTRATO)[number], salario_base: String(salario), updated_at: new Date() })
      .where(and(eq(empleados.id, req.params.empleadoId), eq(empleados.tenant_id, req.tenantId)));

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /nomina/empleados/:empleadoId/contratos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── Períodos de nómina ─────────────────────────────────────────────────────────

// GET /api/nomina/periodos?ano=2026&mes=7
router.get("/periodos", async (req, res) => {
  try {
    const { ano, mes } = req.query as { ano?: string; mes?: string };
    const conds = [eq(nominas_periodo.tenant_id, req.tenantId)];
    if (ano) conds.push(eq(nominas_periodo.ano, Number(ano)));
    if (mes) conds.push(eq(nominas_periodo.mes, Number(mes)));

    const rows = await db.select().from(nominas_periodo)
      .where(and(...conds))
      .orderBy(desc(nominas_periodo.ano), desc(nominas_periodo.mes), desc(nominas_periodo.quincena));

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /nomina/periodos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/nomina/periodos/:id — detalle con empleados incluidos
router.get("/periodos/:id", async (req, res) => {
  try {
    const [periodo] = await db.select().from(nominas_periodo)
      .where(and(eq(nominas_periodo.id, req.params.id), eq(nominas_periodo.tenant_id, req.tenantId))).limit(1);
    if (!periodo) return res.status(404).json({ error: "Período no encontrado." });

    const detalle = await db
      .select({
        id: nominas_detalle.id,
        empleado_id: nominas_detalle.empleado_id,
        nombres: empleados.nombres,
        apellidos: empleados.apellidos,
        salario_base: nominas_detalle.salario_base,
        horas_extras_valor: nominas_detalle.horas_extras_valor,
        recargos_valor: nominas_detalle.recargos_valor,
        comisiones_valor: nominas_detalle.comisiones_valor,
        auxilio_transporte: nominas_detalle.auxilio_transporte,
        salud_empleado: nominas_detalle.salud_empleado,
        pension_empleado: nominas_detalle.pension_empleado,
        retencion_fuente: nominas_detalle.retencion_fuente,
        otras_deducciones: nominas_detalle.otras_deducciones,
        deducciones_totales: nominas_detalle.deducciones_totales,
        aportes_parafiscales: nominas_detalle.aportes_parafiscales,
        neto_pagar: nominas_detalle.neto_pagar,
        documento_soporte_id: nominas_detalle.documento_soporte_id,
        documento_electronico_id: documentos_soporte_nomina.id,
        estado_dian: documentos_soporte_nomina.estado_dian,
        cude: documentos_soporte_nomina.cude,
        error_dian: documentos_soporte_nomina.error_dian,
      })
      .from(nominas_detalle)
      .innerJoin(empleados, eq(empleados.id, nominas_detalle.empleado_id))
      .leftJoin(documentos_soporte_nomina, eq(documentos_soporte_nomina.nomina_detalle_id, nominas_detalle.id))
      .where(eq(nominas_detalle.nomina_periodo_id, periodo.id));

    res.json({ ...periodo, empleados: detalle });
  } catch (err) {
    console.error("Error en GET /nomina/periodos/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/nomina/periodos — crea el período en borrador
router.post("/periodos", requireContableOperativo, async (req, res) => {
  try {
    const { ano, mes, quincena } = req.body as { ano?: number; mes?: number; quincena?: number | null };
    if (!ano || !mes) return res.status(400).json({ error: "Campos requeridos: ano, mes." });
    if (mes < 1 || mes > 12) return res.status(400).json({ error: "mes debe estar entre 1 y 12." });
    if (quincena != null && quincena !== 1 && quincena !== 2) {
      return res.status(400).json({ error: "quincena debe ser 1, 2, o null (mensual)." });
    }

    const [existente] = await db.select({ id: nominas_periodo.id }).from(nominas_periodo).where(
      and(
        eq(nominas_periodo.tenant_id, req.tenantId),
        eq(nominas_periodo.ano, ano),
        eq(nominas_periodo.mes, mes),
        quincena == null ? isNull(nominas_periodo.quincena) : eq(nominas_periodo.quincena, quincena),
      ),
    ).limit(1);
    if (existente) return res.status(409).json({ error: "Ya existe un período de nómina para ese ciclo." });

    const [nuevo] = await db.insert(nominas_periodo).values({
      tenant_id: req.tenantId,
      ano,
      mes,
      quincena: quincena ?? null,
    }).returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /nomina/periodos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

function manejarErrorEstado(err: unknown, res: import("express").Response): boolean {
  if (err instanceof NominaEstadoError) {
    const status = err.code === "PERIODO_NO_ENCONTRADO" ? 404 : err.code === "POOL_INSUFICIENTE" ? 409 : 422;
    res.status(status).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

// POST /api/nomina/periodos/:id/calcular — calcula/recalcula la nómina de todos los
// empleados activos del período. No consume pool (chequeo de saldo es solo en /emitir).
router.post("/periodos/:id/calcular", requireContableOperativo, async (req, res) => {
  try {
    const { ajustes } = req.body as { ajustes?: Record<string, {
      horas_extras_valor?: number; recargos_valor?: number; comisiones_valor?: number; otras_deducciones?: number;
    }> };

    const [periodoCheck] = await db.select({ id: nominas_periodo.id }).from(nominas_periodo)
      .where(and(eq(nominas_periodo.id, req.params.id), eq(nominas_periodo.tenant_id, req.tenantId))).limit(1);
    if (!periodoCheck) return res.status(404).json({ error: "Período no encontrado." });

    const resultado = await calcularPeriodo(req.tenantId, req.params.id, ajustes ?? {});
    res.json(resultado);
  } catch (err) {
    if (manejarErrorEstado(err, res)) return;
    console.error("Error en POST /nomina/periodos/:id/calcular:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/nomina/periodos/:id/aprobar
router.post("/periodos/:id/aprobar", requireContableOperativo, async (req, res) => {
  try {
    const [periodoCheck] = await db.select({ id: nominas_periodo.id }).from(nominas_periodo)
      .where(and(eq(nominas_periodo.id, req.params.id), eq(nominas_periodo.tenant_id, req.tenantId))).limit(1);
    if (!periodoCheck) return res.status(404).json({ error: "Período no encontrado." });

    const periodo = await aprobarPeriodo(req.tenantId, req.params.id);
    res.json(periodo);
  } catch (err) {
    if (manejarErrorEstado(err, res)) return;
    console.error("Error en POST /nomina/periodos/:id/aprobar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/nomina/periodos/:id/emitir — único punto donde se valida saldo del pool.
// Solo admin (no requireNotContador — DELETE-equivalente en impacto, restringido explícitamente).
router.post("/periodos/:id/emitir", async (req, res) => {
  try {
    if (nominaModo() !== "produccion") {
      return res.status(403).json({
        error: "Nómina está en modo de pruebas. Puedes calcular y revisar períodos, pero la emisión electrónica está deshabilitada.",
        code: "NOMINA_TEST_MODE",
      });
    }
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede emitir nómina." });
    }
    const [periodoCheck] = await db.select({ id: nominas_periodo.id }).from(nominas_periodo)
      .where(and(eq(nominas_periodo.id, req.params.id), eq(nominas_periodo.tenant_id, req.tenantId))).limit(1);
    if (!periodoCheck) return res.status(404).json({ error: "Período no encontrado." });

    const resultado = await emitirPeriodo(req.tenantId, req.params.id);
    res.json(resultado);
  } catch (err) {
    if (manejarErrorEstado(err, res)) return;
    console.error("Error en POST /nomina/periodos/:id/emitir:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/nomina/periodos/:id/pdf — colilla de pago consolidada del período
router.get("/periodos/:id/pdf", async (req, res) => {
  try {
    const [periodo] = await db.select().from(nominas_periodo)
      .where(and(eq(nominas_periodo.id, req.params.id), eq(nominas_periodo.tenant_id, req.tenantId))).limit(1);
    if (!periodo) return res.status(404).json({ error: "Período no encontrado." });

    const detalles = await db.select().from(nominas_detalle).where(eq(nominas_detalle.nomina_periodo_id, periodo.id));
    if (detalles.length === 0) return res.status(400).json({ error: "El período no tiene nómina calculada." });

    const empleadosIds = [...new Set(detalles.map((d) => d.empleado_id))];
    const empleadosRows = await db.select({ id: empleados.id, nombres: empleados.nombres, apellidos: empleados.apellidos, cedula: empleados.cedula })
      .from(empleados).where(inArray(empleados.id, empleadosIds));
    const empleadosPorId = new Map(empleadosRows.map((e) => [e.id, e]));

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.tenantId)).limit(1);

    const pdfStream = generarPdfColillaConsolidada(periodo, detalles, empleadosPorId, tenant);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=nomina_${periodo.ano}_${periodo.mes}${periodo.quincena ? `_q${periodo.quincena}` : ""}.pdf`);
    pdfStream.pipe(res);
  } catch (err) {
    console.error("Error en GET /nomina/periodos/:id/pdf:", err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno al generar el PDF." });
  }
});

// ── Pool de documentos de nómina ───────────────────────────────────────────────

// GET /api/nomina/pool — estado del pool del tenant (requireNominaActivo ya cargó req.nominaPool)
router.get("/pool", async (req, res) => {
  const pool = req.nominaPool!;
  const disponibles =
    pool.documentos_incluidos +
    pool.documentos_acumulados_previos +
    pool.documentos_adicionales_comprados -
    pool.documentos_consumidos_ciclo;

  res.json({
    ...pool,
    documentos_disponibles: Math.max(0, disponibles),
  });
});

// ── Config global del módulo (banner de advertencia) ──────────────────────────

// GET /api/nomina/config-global — visible a cualquier rol con acceso al módulo,
// el toggle solo lo puede tocar el fundador (POST /api/fundador/nomina/config-global).
router.get("/config-global", async (_req, res) => {
  try {
    const [config] = await db.select().from(nomina_config_global).where(eq(nomina_config_global.id, "global")).limit(1);
    res.json(config ?? { id: "global", banner_activo: true, banner_mensaje: "MÓDULO EN CONFIGURACIÓN — No emitir nómina real hasta que se validen parámetros tributarios" });
  } catch (err) {
    console.error("Error en GET /nomina/config-global:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
