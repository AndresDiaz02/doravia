import { Router } from "express";
import {
  db, empleados, contratos_empleado, nominas_periodo, nominas_detalle,
  centros_costos, tenants, nomina_config_global, documentos_soporte_nomina, product_subscriptions, plans, nomina_plemsi_config,
} from "@workspace/db";
import { eq, and, desc, isNull, sql, inArray, gte } from "drizzle-orm";
import { requireRole } from "../middleware/require-plan-feature.js";
import { encrypt, decrypt } from "../services/encryption.js";
import { TIPOS_CONTRATO, ESTADOS_EMPLEADO } from "@workspace/db";
import { calcularPeriodo, aprobarPeriodo, emitirPeriodo, NominaEstadoError } from "../services/nomina.service.js";
import { generarPdfColillaConsolidada } from "../services/pdf.service.js";
import { listarNumeracionesNomina, registrarNumeracionNomina } from "../services/plemsi.service.js";

const router = Router();

// El modo de pruebas solo puede emitir contra la cuenta de pruebas configurada
// por empresa. Producción es una decisión separada de infraestructura.
const nominaModo = () => (process.env.NOMINA_MODO ?? "pruebas").trim().toLowerCase();

async function limiteEmpleadosNomina(tenantId: string) {
  const [subscription] = await db.select({ max_empleados: plans.max_empleados, addons: tenants.addons })
    .from(product_subscriptions)
    .innerJoin(plans, eq(product_subscriptions.plan_id, plans.id))
    .innerJoin(tenants, eq(product_subscriptions.tenant_id, tenants.id))
    .where(and(
      eq(product_subscriptions.tenant_id, tenantId),
      eq(product_subscriptions.product, "nomina"),
      eq(product_subscriptions.status, "active"),
      gte(product_subscriptions.ends_at, new Date()),
    ))
    .limit(1);
  if (!subscription?.max_empleados) return null;
  const addons = (subscription.addons ?? {}) as Record<string, unknown>;
  const adicionales = Math.max(0, Math.floor(Number(addons.nomina_empleados_adicionales ?? 0)));
  return subscription.max_empleados + adicionales;
}

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
  municipio_dian_id: empleados.municipio_dian_id,
  direccion: empleados.direccion,
  tipo_trabajador_plemsi_id: empleados.tipo_trabajador_plemsi_id,
  subtipo_trabajador_plemsi_id: empleados.subtipo_trabajador_plemsi_id,
  tipo_contrato_plemsi_id: empleados.tipo_contrato_plemsi_id,
  salario_integral: empleados.salario_integral,
  pension_alto_riesgo: empleados.pension_alto_riesgo,
  created_at: empleados.created_at,
  updated_at: empleados.updated_at,
};

// ── Alistamiento Plemsi (sin exponer el token) ───────────────────────────────
router.get("/alistamiento-plemsi", async (req, res) => {
  const [config] = await db.select().from(nomina_plemsi_config)
    .where(eq(nomina_plemsi_config.tenant_id, req.tenantId)).limit(1);
  const activos = await db.select({
    id: empleados.id, nombre: sql<string>`${empleados.nombres} || ' ' || ${empleados.apellidos}`,
    municipio: empleados.municipio_dian_id, direccion: empleados.direccion,
    tipoTrabajador: empleados.tipo_trabajador_plemsi_id, subtipoTrabajador: empleados.subtipo_trabajador_plemsi_id,
    tipoContrato: empleados.tipo_contrato_plemsi_id,
  }).from(empleados).where(and(eq(empleados.tenant_id, req.tenantId), eq(empleados.estado, "activo")));
  const empleadosIncompletos = activos.filter((e) => !e.municipio || !e.direccion || !e.tipoTrabajador || !e.subtipoTrabajador || !e.tipoContrato)
    .map((e) => ({ id: e.id, nombre: e.nombre }));
  res.json({
    ambiente: config?.ambiente ?? "pruebas",
    token_configurado: !!config?.api_key_encrypted,
    habilitado: config?.habilitado ?? false,
    numeracion_individual_configurada: !!(config?.resolucion_individual && config?.prefijo_individual),
    numeracion_ajuste_configurada: !!(config?.resolucion_ajuste && config?.prefijo_ajuste),
    resolucion_individual: config?.resolucion_individual ?? "",
    prefijo_individual: config?.prefijo_individual ?? "",
    siguiente_numero_individual: config?.siguiente_numero_individual ?? 1,
    resolucion_ajuste: config?.resolucion_ajuste ?? "",
    prefijo_ajuste: config?.prefijo_ajuste ?? "",
    siguiente_numero_ajuste: config?.siguiente_numero_ajuste ?? 1,
    empleados_incompletos: empleadosIncompletos,
    listo_para_prueba: !!config?.habilitado && !!config?.api_key_encrypted && !!config?.resolucion_individual && !!config?.prefijo_individual && empleadosIncompletos.length === 0,
  });
});

router.patch("/alistamiento-plemsi", requireRole(["admin"]), async (req, res) => {
  const { token, ambiente } = req.body as Record<string, unknown>;
  if (ambiente !== undefined && ambiente !== "pruebas" && ambiente !== "produccion") return res.status(400).json({ error: "ambiente debe ser pruebas o produccion." });
  const values: Record<string, unknown> = { tenant_id: req.tenantId, updated_at: new Date() };
  if (typeof token === "string" && token.trim()) values.api_key_encrypted = encrypt(token.trim());
  for (const key of ["ambiente", "habilitado", "resolucion_individual", "prefijo_individual", "resolucion_ajuste", "prefijo_ajuste"] as const) {
    if (req.body[key] !== undefined) values[key] = req.body[key];
  }
  for (const key of ["siguiente_numero_individual", "siguiente_numero_ajuste"] as const) {
    if (req.body[key] !== undefined && Number.isInteger(Number(req.body[key])) && Number(req.body[key]) > 0) values[key] = Number(req.body[key]);
  }
  const [saved] = await db.insert(nomina_plemsi_config).values(values as typeof nomina_plemsi_config.$inferInsert)
    .onConflictDoUpdate({ target: nomina_plemsi_config.tenant_id, set: values })
    .returning();
  res.json({ ...saved, api_key_encrypted: saved.api_key_encrypted ? "configurado" : null });
});

// Crea únicamente las numeraciones que no aparezcan aún en la cuenta de pruebas.
// Este endpoint solo se invoca tras la confirmación explícita del administrador.
router.post("/alistamiento-plemsi/sincronizar-numeraciones", requireRole(["admin"]), async (req, res) => {
  const [config] = await db.select().from(nomina_plemsi_config)
    .where(eq(nomina_plemsi_config.tenant_id, req.tenantId)).limit(1);
  if (!config?.api_key_encrypted || !config.resolucion_individual || !config.prefijo_individual || !config.resolucion_ajuste || !config.prefijo_ajuste) {
    return res.status(422).json({ error: "Configura token, resolución y prefijos individual/ajuste antes de sincronizar." });
  }
  if (config.ambiente !== "pruebas") return res.status(403).json({ error: "La creación automática de numeraciones solo está habilitada para el entorno de pruebas." });
  const token = decrypt(config.api_key_encrypted);
  const listado = await listarNumeracionesNomina(token, config.ambiente);
  if (!listado.ok) return res.status(502).json({ error: listado.error ?? "No fue posible consultar numeraciones en Plemsi." });
  const posibles = [listado.respuesta?.data, listado.respuesta?.results, listado.respuesta?.items, listado.respuesta].flatMap((item) => Array.isArray(item) ? item : []);
  const existe = (prefijo: string) => posibles.some((item) => typeof item === "object" && item !== null && ((item as Record<string, unknown>).prefix === prefijo));
  const creadas: string[] = [];
  for (const item of [
    { tipo: 9 as const, resolucion: config.resolucion_individual, prefijo: config.prefijo_individual, nombre: "individual" },
    { tipo: 10 as const, resolucion: config.resolucion_ajuste, prefijo: config.prefijo_ajuste, nombre: "ajuste" },
  ]) {
    if (existe(item.prefijo)) continue;
    const resultado = await registrarNumeracionNomina({ apiKey: token, ambiente: config.ambiente, tipoDocumentoId: item.tipo, resolucion: item.resolucion, prefijo: item.prefijo, desde: 1, hasta: 5_000_000 });
    if (!resultado.ok) return res.status(502).json({ error: `No se pudo crear la numeración de ${item.nombre}: ${resultado.error}` });
    creadas.push(item.nombre);
  }
  res.json({ ok: true, creadas, mensaje: creadas.length ? "Numeraciones sincronizadas con Plemsi." : "Las numeraciones ya existían en Plemsi." });
});

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
router.post("/empleados", requireRole(["admin"]), async (req, res) => {
  try {
    const {
      cedula, nombres, apellidos, cargo, fecha_ingreso,
      salario_base, tipo_contrato, centro_costos_id, datos_bancarios, municipio_dian_id, direccion,
      tipo_trabajador_plemsi_id, subtipo_trabajador_plemsi_id, tipo_contrato_plemsi_id,
      salario_integral, pension_alto_riesgo,
    } = req.body as {
      cedula?: string; nombres?: string; apellidos?: string; cargo?: string;
      fecha_ingreso?: string; salario_base?: number; tipo_contrato?: string;
      centro_costos_id?: string; datos_bancarios?: Record<string, unknown>; municipio_dian_id?: number;
      direccion?: string; tipo_trabajador_plemsi_id?: number; subtipo_trabajador_plemsi_id?: number;
      tipo_contrato_plemsi_id?: number; salario_integral?: boolean; pension_alto_riesgo?: boolean;
    };

    if (!cedula || !nombres || !apellidos || !fecha_ingreso || salario_base == null || !tipo_contrato) {
      return res.status(400).json({
        error: "Campos requeridos: cedula, nombres, apellidos, fecha_ingreso, salario_base, tipo_contrato.",
      });
    }
    if (!TIPOS_CONTRATO.includes(tipo_contrato as (typeof TIPOS_CONTRATO)[number])) {
      return res.status(400).json({ error: `tipo_contrato debe ser: ${TIPOS_CONTRATO.join(", ")}.` });
    }
    if (!Number.isFinite(salario_base) || salario_base <= 0) {
      return res.status(400).json({ error: "salario_base debe ser un número mayor que cero." });
    }

    const limite = await limiteEmpleadosNomina(req.tenantId);
    if (limite !== null) {
      const [actuales] = await db.select({ total: sql<number>`count(*)::int` }).from(empleados)
        .where(and(eq(empleados.tenant_id, req.tenantId), eq(empleados.estado, "activo")));
      if ((actuales?.total ?? 0) >= limite) {
        return res.status(403).json({ error: `Tu plan de Nómina admite hasta ${limite} empleados activos. Mejora tu plan para agregar otro empleado.` });
      }
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
        municipio_dian_id: Number.isInteger(municipio_dian_id) ? municipio_dian_id : null,
        direccion: direccion?.trim() || null,
        tipo_trabajador_plemsi_id: Number.isInteger(tipo_trabajador_plemsi_id) ? tipo_trabajador_plemsi_id : null,
        subtipo_trabajador_plemsi_id: Number.isInteger(subtipo_trabajador_plemsi_id) ? subtipo_trabajador_plemsi_id : null,
        tipo_contrato_plemsi_id: Number.isInteger(tipo_contrato_plemsi_id) ? tipo_contrato_plemsi_id : null,
        salario_integral: salario_integral === true,
        pension_alto_riesgo: pension_alto_riesgo === true,
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
router.patch("/empleados/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const [row] = await db.select({ id: empleados.id }).from(empleados)
      .where(and(eq(empleados.id, req.params.id), eq(empleados.tenant_id, req.tenantId))).limit(1);
    if (!row) return res.status(404).json({ error: "Empleado no encontrado." });

    const {
      nombres, apellidos, cargo, centro_costos_id, datos_bancarios, municipio_dian_id, direccion,
      tipo_trabajador_plemsi_id, subtipo_trabajador_plemsi_id, tipo_contrato_plemsi_id,
      salario_integral, pension_alto_riesgo,
    } = req.body as {
      nombres?: string; apellidos?: string; cargo?: string;
      centro_costos_id?: string | null; datos_bancarios?: Record<string, unknown>; municipio_dian_id?: number | null;
      direccion?: string | null; tipo_trabajador_plemsi_id?: number | null; subtipo_trabajador_plemsi_id?: number | null;
      tipo_contrato_plemsi_id?: number | null; salario_integral?: boolean; pension_alto_riesgo?: boolean;
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
    if (municipio_dian_id !== undefined) patch.municipio_dian_id = municipio_dian_id;
    if (direccion !== undefined) patch.direccion = direccion;
    if (tipo_trabajador_plemsi_id !== undefined) patch.tipo_trabajador_plemsi_id = tipo_trabajador_plemsi_id;
    if (subtipo_trabajador_plemsi_id !== undefined) patch.subtipo_trabajador_plemsi_id = subtipo_trabajador_plemsi_id;
    if (tipo_contrato_plemsi_id !== undefined) patch.tipo_contrato_plemsi_id = tipo_contrato_plemsi_id;
    if (salario_integral !== undefined) patch.salario_integral = salario_integral;
    if (pension_alto_riesgo !== undefined) patch.pension_alto_riesgo = pension_alto_riesgo;

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
router.patch("/empleados/:id/retirar", requireRole(["admin"]), async (req, res) => {
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
router.delete("/empleados/:id", requireRole(["admin"]), async (req, res) => {
  try {
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
router.post("/empleados/:empleadoId/contratos", requireRole(["admin"]), async (req, res) => {
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
    if (!Number.isFinite(salario) || salario <= 0) {
      return res.status(400).json({ error: "salario debe ser un número mayor que cero." });
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

    res.json({ ...periodo, empleados: detalle, modo_nomina: nominaModo() });
  } catch (err) {
    console.error("Error en GET /nomina/periodos/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// POST /api/nomina/periodos — crea el período en borrador
router.post("/periodos", requireRole(["admin"]), async (req, res) => {
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
router.post("/periodos/:id/calcular", requireRole(["admin"]), async (req, res) => {
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
router.post("/periodos/:id/aprobar", requireRole(["admin"]), async (req, res) => {
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
    if (nominaModo() !== "pruebas" && nominaModo() !== "produccion") {
      return res.status(403).json({
        error: "Nómina no está habilitada para emisión. Configura NOMINA_MODO como pruebas o produccion.",
        code: "NOMINA_EMISSION_DISABLED",
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
