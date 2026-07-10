import { Router } from "express";
import {
  db, citas_pos, sujetos_servicio, clientes, ventas_pos, tenants,
  profesionales_pos, horarios_profesional, bloqueos_profesional,
} from "@workspace/db";
import { eq, and, between, sql, desc, gte, lte, isNull, isNotNull, inArray } from "drizzle-orm";
import { requireNotContador } from "../middleware/require-plan-feature.js";

const router = Router();

// ── Tipos ─────────────────────────────────────────────────────────────────────

type EstadoCita =
  | "agendada" | "confirmada" | "en_atencion" | "lista_entrega"
  | "entregada_cobrada" | "no_show" | "cancelada";

// Transiciones válidas desde cada estado
const TRANSICIONES: Record<string, EstadoCita[]> = {
  agendada:           ["confirmada", "en_atencion", "no_show", "cancelada"],
  confirmada:         ["en_atencion", "no_show", "cancelada"],
  en_atencion:        ["lista_entrega", "cancelada"],
  lista_entrega:      ["entregada_cobrada", "cancelada"],
  entregada_cobrada:  [],
  no_show:            [],
  cancelada:          [],
  // compatibilidad estados legacy
  programada:         ["agendada", "en_atencion", "cancelada"],
  en_proceso:         ["lista_entrega", "cancelada"],
  completada:         [],
};

function esTransicionValida(desde: string, hacia: EstadoCita): boolean {
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

function fechaInicio(fechaStr: string): Date {
  return new Date(`${fechaStr}T00:00:00`);
}
function fechaFin(fechaStr: string): Date {
  return new Date(`${fechaStr}T23:59:59`);
}

function formatFechaEs(d: Date): string {
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

function formatHoraEs(d: Date): string {
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

// ── Config del tenant (sujeto_label en pos_config) ───────────────────────────

// GET /api/agenda/config
router.get("/config", async (req, res) => {
  try {
    const [t] = await db.select({ pos_config: tenants.pos_config }).from(tenants).where(eq(tenants.id, req.tenantId));
    const cfg = (t?.pos_config ?? {}) as Record<string, unknown>;
    res.json({
      sujeto_label: (cfg.sujeto_label as string | null) ?? null,
      citas_visible: cfg.citas_visible === true,
    });
  } catch (err) {
    console.error("GET /agenda/config:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PATCH /api/agenda/config — solo admin
router.patch("/config", requireNotContador, async (req, res) => {
  try {
    if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden configurar la agenda." });
    const { sujeto_label, citas_visible } = req.body as { sujeto_label?: string | null; citas_visible?: boolean };
    const [t] = await db.select({ pos_config: tenants.pos_config }).from(tenants).where(eq(tenants.id, req.tenantId));
    const actual = (t?.pos_config ?? {}) as Record<string, unknown>;
    const nuevo: Record<string, unknown> = { ...actual };
    if (sujeto_label !== undefined) nuevo.sujeto_label = sujeto_label || null;
    if (citas_visible !== undefined) nuevo.citas_visible = citas_visible;
    const [updated] = await db.update(tenants).set({ pos_config: nuevo }).where(eq(tenants.id, req.tenantId)).returning({ pos_config: tenants.pos_config });
    res.json({ pos_config: updated.pos_config });
  } catch (err) {
    console.error("PATCH /agenda/config:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// ── Sujetos del servicio ──────────────────────────────────────────────────────

// GET /api/agenda/sujetos?cliente_id=
router.get("/sujetos", async (req, res) => {
  try {
    const { cliente_id } = req.query as { cliente_id?: string };
    const where = cliente_id
      ? and(eq(sujetos_servicio.tenant_id, req.tenantId), eq(sujetos_servicio.cliente_id, cliente_id), eq(sujetos_servicio.activo, true))
      : and(eq(sujetos_servicio.tenant_id, req.tenantId), eq(sujetos_servicio.activo, true));
    const rows = await db.select().from(sujetos_servicio).where(where).orderBy(sujetos_servicio.nombre);
    res.json(rows);
  } catch (err) {
    console.error("GET /agenda/sujetos:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// POST /api/agenda/sujetos
router.post("/sujetos", requireNotContador, async (req, res) => {
  try {
    const { nombre, cliente_id, tipo_notas } = req.body as {
      nombre: string; cliente_id?: string; tipo_notas?: string;
    };
    if (!nombre?.trim()) return res.status(400).json({ error: "El nombre del sujeto es requerido." });
    const [row] = await db.insert(sujetos_servicio).values({
      tenant_id: req.tenantId,
      nombre: nombre.trim(),
      cliente_id: cliente_id || null,
      tipo_notas: tipo_notas?.trim() || null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    console.error("POST /agenda/sujetos:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PATCH /api/agenda/sujetos/:id
router.patch("/sujetos/:id", requireNotContador, async (req, res) => {
  try {
    const { nombre, tipo_notas, activo, cliente_id } = req.body as {
      nombre?: string; tipo_notas?: string; activo?: boolean; cliente_id?: string | null;
    };
    const set: Record<string, unknown> = {};
    if (nombre !== undefined) set.nombre = nombre.trim();
    if (tipo_notas !== undefined) set.tipo_notas = tipo_notas?.trim() || null;
    if (activo !== undefined) set.activo = activo;
    if (cliente_id !== undefined) set.cliente_id = cliente_id || null;
    if (Object.keys(set).length === 0) return res.status(400).json({ error: "Nada que actualizar." });
    const [row] = await db.update(sujetos_servicio).set(set).where(
      and(eq(sujetos_servicio.id, req.params.id), eq(sujetos_servicio.tenant_id, req.tenantId))
    ).returning();
    if (!row) return res.status(404).json({ error: "Sujeto no encontrado." });
    res.json(row);
  } catch (err) {
    console.error("PATCH /agenda/sujetos/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// DELETE /api/agenda/sujetos/:id (soft delete)
router.delete("/sujetos/:id", requireNotContador, async (req, res) => {
  try {
    if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden eliminar sujetos." });
    const [row] = await db.update(sujetos_servicio).set({ activo: false }).where(
      and(eq(sujetos_servicio.id, req.params.id), eq(sujetos_servicio.tenant_id, req.tenantId))
    ).returning({ id: sujetos_servicio.id });
    if (!row) return res.status(404).json({ error: "Sujeto no encontrado." });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /agenda/sujetos/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// ── Citas ─────────────────────────────────────────────────────────────────────

// GET /api/agenda/citas?fecha=YYYY-MM-DD  (vista día — POS)
// GET /api/agenda/citas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD  (vista semana — ERP)
router.get("/citas", async (req, res) => {
  try {
    const { fecha, desde, hasta, cliente_id } = req.query as {
      fecha?: string; desde?: string; hasta?: string; cliente_id?: string;
    };

    let inicioBusq: Date, finBusq: Date;
    if (fecha) {
      inicioBusq = fechaInicio(fecha);
      finBusq = fechaFin(fecha);
    } else if (desde && hasta) {
      inicioBusq = fechaInicio(desde);
      finBusq = fechaFin(hasta);
    } else {
      const hoy = new Date().toISOString().slice(0, 10);
      inicioBusq = fechaInicio(hoy);
      finBusq = fechaFin(hoy);
    }

    const conditions = [
      eq(citas_pos.tenant_id, req.tenantId),
      between(citas_pos.fecha_hora, inicioBusq, finBusq),
    ];
    if (cliente_id) conditions.push(eq(citas_pos.cliente_id, cliente_id));

    const rows = await db
      .select({
        cita: citas_pos,
        sujeto_nombre: sujetos_servicio.nombre,
        sujeto_tipo_notas: sujetos_servicio.tipo_notas,
        cliente_doc: clientes.nombre,
      })
      .from(citas_pos)
      .leftJoin(sujetos_servicio, eq(citas_pos.sujeto_id, sujetos_servicio.id))
      .leftJoin(clientes, eq(citas_pos.cliente_id, clientes.id))
      .where(and(...conditions))
      .orderBy(citas_pos.fecha_hora);

    res.json(rows.map((r) => ({
      ...r.cita,
      sujeto_nombre: r.sujeto_nombre,
      sujeto_tipo_notas: r.sujeto_tipo_notas,
      cliente_nombre_crm: r.cliente_doc,
    })));
  } catch (err) {
    console.error("GET /agenda/citas:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// GET /api/agenda/citas/:id
router.get("/citas/:id", async (req, res) => {
  try {
    const [row] = await db
      .select({
        cita: citas_pos,
        sujeto_nombre: sujetos_servicio.nombre,
        sujeto_tipo_notas: sujetos_servicio.tipo_notas,
      })
      .from(citas_pos)
      .leftJoin(sujetos_servicio, eq(citas_pos.sujeto_id, sujetos_servicio.id))
      .where(and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId)));
    if (!row) return res.status(404).json({ error: "Cita no encontrada." });
    res.json({ ...row.cita, sujeto_nombre: row.sujeto_nombre, sujeto_tipo_notas: row.sujeto_tipo_notas });
  } catch (err) {
    console.error("GET /agenda/citas/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// POST /api/agenda/citas
router.post("/citas", requireNotContador, async (req, res) => {
  try {
    const {
      cliente_nombre, cliente_telefono, cliente_id,
      sujeto_id, fecha_hora, servicio, profesional, profesional_id, duracion_min, notas, caja_id,
    } = req.body as {
      cliente_nombre: string; cliente_telefono?: string; cliente_id?: string;
      sujeto_id?: string; fecha_hora: string; servicio: string;
      profesional?: string; profesional_id?: string; duracion_min?: number; notas?: string; caja_id?: string;
    };
    if (!cliente_nombre?.trim()) return res.status(400).json({ error: "Nombre del cliente requerido." });
    if (!servicio?.trim()) return res.status(400).json({ error: "Servicio requerido." });
    if (!fecha_hora) return res.status(400).json({ error: "Fecha y hora requeridas." });

    const [cita] = await db.insert(citas_pos).values({
      tenant_id: req.tenantId,
      caja_id: caja_id || null,
      cliente_id: cliente_id || null,
      cliente_nombre: cliente_nombre.trim(),
      cliente_telefono: cliente_telefono?.trim() || null,
      sujeto_id: sujeto_id || null,
      fecha_hora: new Date(fecha_hora),
      servicio: servicio.trim(),
      profesional: profesional?.trim() || null,
      profesional_id: profesional_id || null,
      duracion_min: duracion_min ?? 30,
      notas: notas?.trim() || null,
      estado: "agendada",
    }).returning();
    res.status(201).json(cita);
  } catch (err) {
    console.error("POST /agenda/citas:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PATCH /api/agenda/citas/:id — editar campos (no estado)
router.patch("/citas/:id", requireNotContador, async (req, res) => {
  try {
    const {
      cliente_nombre, cliente_telefono, cliente_id, sujeto_id,
      fecha_hora, servicio, profesional, profesional_id, duracion_min, notas,
    } = req.body as {
      cliente_nombre?: string; cliente_telefono?: string; cliente_id?: string | null;
      sujeto_id?: string | null; fecha_hora?: string; servicio?: string;
      profesional?: string; profesional_id?: string | null; duracion_min?: number; notas?: string;
    };
    const set: Record<string, unknown> = { updated_at: new Date() };
    if (cliente_nombre !== undefined) set.cliente_nombre = cliente_nombre.trim();
    if (cliente_telefono !== undefined) set.cliente_telefono = cliente_telefono?.trim() || null;
    if (cliente_id !== undefined) set.cliente_id = cliente_id || null;
    if (sujeto_id !== undefined) set.sujeto_id = sujeto_id || null;
    if (fecha_hora !== undefined) set.fecha_hora = new Date(fecha_hora);
    if (servicio !== undefined) set.servicio = servicio.trim();
    if (profesional !== undefined) set.profesional = profesional?.trim() || null;
    if (profesional_id !== undefined) set.profesional_id = profesional_id || null;
    if (duracion_min !== undefined) set.duracion_min = duracion_min;
    if (notas !== undefined) set.notas = notas?.trim() || null;

    const [row] = await db.update(citas_pos).set(set).where(
      and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId))
    ).returning();
    if (!row) return res.status(404).json({ error: "Cita no encontrada." });
    res.json(row);
  } catch (err) {
    console.error("PATCH /agenda/citas/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PATCH /api/agenda/citas/:id/estado — transición de estado
router.patch("/citas/:id/estado", requireNotContador, async (req, res) => {
  try {
    const { estado, venta_pos_id } = req.body as { estado: EstadoCita; venta_pos_id?: string };

    const [actual] = await db.select().from(citas_pos).where(
      and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId))
    );
    if (!actual) return res.status(404).json({ error: "Cita no encontrada." });

    if (!esTransicionValida(actual.estado, estado)) {
      return res.status(422).json({
        error: `No se puede pasar de "${actual.estado}" a "${estado}".`,
        estado_actual: actual.estado,
        transiciones_validas: TRANSICIONES[actual.estado] ?? [],
      });
    }

    const set: Record<string, unknown> = { estado, updated_at: new Date() };
    if (estado === "en_atencion") set.llegada_at = new Date();
    if (estado === "lista_entrega") set.listo_at = new Date();
    if (estado === "entregada_cobrada" && venta_pos_id) set.venta_pos_id = venta_pos_id;

    const [updated] = await db.update(citas_pos).set(set).where(
      and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId))
    ).returning();
    res.json(updated);
  } catch (err) {
    console.error("PATCH /agenda/citas/:id/estado:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// DELETE /api/agenda/citas/:id — solo admin puede eliminar citas históricas
router.delete("/citas/:id", requireNotContador, async (req, res) => {
  try {
    if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden eliminar citas." });
    const [row] = await db.delete(citas_pos).where(
      and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId))
    ).returning({ id: citas_pos.id });
    if (!row) return res.status(404).json({ error: "Cita no encontrada." });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /agenda/citas/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// ── WhatsApp links ────────────────────────────────────────────────────────────

async function getCitaConContexto(id: string, tenantId: string) {
  const [row] = await db
    .select({
      cita: citas_pos,
      sujeto_nombre: sujetos_servicio.nombre,
      tenant_nombre: tenants.nombre,
      pos_config: tenants.pos_config,
    })
    .from(citas_pos)
    .leftJoin(sujetos_servicio, eq(citas_pos.sujeto_id, sujetos_servicio.id))
    .innerJoin(tenants, eq(citas_pos.tenant_id, tenants.id))
    .where(and(eq(citas_pos.id, id), eq(citas_pos.tenant_id, tenantId)));
  return row ?? null;
}

// GET /api/agenda/citas/:id/recordatorio — genera link wa.me de recordatorio
router.get("/citas/:id/recordatorio", async (req, res) => {
  try {
    const ctx = await getCitaConContexto(req.params.id, req.tenantId);
    if (!ctx) return res.status(404).json({ error: "Cita no encontrada." });

    const { cita, sujeto_nombre, tenant_nombre } = ctx;
    const fechaHora = new Date(cita.fecha_hora);
    const fecha = formatFechaEs(fechaHora);
    const hora = formatHoraEs(fechaHora);
    const sujetoTexto = sujeto_nombre ? ` de ${sujeto_nombre}` : "";
    const telefono = (cita.cliente_telefono ?? "").replace(/\D/g, "");

    const mensaje = `Hola ${cita.cliente_nombre} 👋 Te recordamos tu cita en ${tenant_nombre} el ${fecha} a las ${hora} para ${cita.servicio}${sujetoTexto}. ¡Te esperamos!`;
    const url = telefono
      ? `https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

    // Marcar recordatorio como enviado
    await db.update(citas_pos).set({ recordatorio_enviado_at: new Date(), updated_at: new Date() }).where(
      and(eq(citas_pos.id, req.params.id), eq(citas_pos.tenant_id, req.tenantId))
    );

    res.json({ url, mensaje, telefono_destino: telefono ? `57${telefono}` : null });
  } catch (err) {
    console.error("GET /agenda/citas/:id/recordatorio:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// GET /api/agenda/citas/:id/entrega — genera link wa.me de "listo para recoger"
router.get("/citas/:id/entrega", async (req, res) => {
  try {
    const ctx = await getCitaConContexto(req.params.id, req.tenantId);
    if (!ctx) return res.status(404).json({ error: "Cita no encontrada." });

    const { cita, sujeto_nombre, tenant_nombre } = ctx;
    const telefono = (cita.cliente_telefono ?? "").replace(/\D/g, "");

    const sujeto = sujeto_nombre
      ? `¡${sujeto_nombre} ya está listo para recoger! 🐾`
      : `¡Tu servicio ya está listo! 🙌`;
    const mensaje = `${sujeto} Puedes venir cuando gustes a ${tenant_nombre}.`;
    const url = telefono
      ? `https://wa.me/57${telefono}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

    res.json({ url, mensaje, telefono_destino: telefono ? `57${telefono}` : null });
  } catch (err) {
    console.error("GET /agenda/citas/:id/entrega:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// ── Reportes ─────────────────────────────────────────────────────────────────

// GET /api/agenda/reportes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/reportes", async (req, res) => {
  try {
    // contador puede leer reportes, otros también — solo no-contador puede mutar
    const { desde, hasta, dias_sin_visita } = req.query as {
      desde?: string; hasta?: string; dias_sin_visita?: string;
    };

    const hoy = new Date().toISOString().slice(0, 10);
    const desdeStr = desde ?? hoy;
    const hastaStr = hasta ?? hoy;
    const inicio = fechaInicio(desdeStr);
    const fin = fechaFin(hastaStr);

    // Estadísticas del período
    const stats = await db
      .select({
        estado: citas_pos.estado,
        cantidad: sql<number>`COUNT(*)::int`,
      })
      .from(citas_pos)
      .where(and(eq(citas_pos.tenant_id, req.tenantId), between(citas_pos.fecha_hora, inicio, fin)))
      .groupBy(citas_pos.estado);

    const total = stats.reduce((s, r) => s + r.cantidad, 0);
    const atendidas = stats.filter((r) => r.estado === "entregada_cobrada").reduce((s, r) => s + r.cantidad, 0);
    const no_shows = stats.filter((r) => r.estado === "no_show").reduce((s, r) => s + r.cantidad, 0);
    const canceladas = stats.filter((r) => r.estado === "cancelada").reduce((s, r) => s + r.cantidad, 0);

    // Ingresos originados en citas (via venta_pos_id)
    const [ingresosRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${ventas_pos.total}), 0)` })
      .from(citas_pos)
      .innerJoin(ventas_pos, eq(citas_pos.venta_pos_id, ventas_pos.id))
      .where(
        and(
          eq(citas_pos.tenant_id, req.tenantId),
          between(citas_pos.fecha_hora, inicio, fin),
          isNotNull(citas_pos.venta_pos_id),
        )
      );

    // Sujetos sin visita hace más de N días (filtrado en JS para evitar HAVING dinámico)
    let sujetosSinVisita: { id: string; nombre: string; tipo_notas: string | null; ultima_visita: string | null; dias_sin_visita: number }[] = [];
    const nDias = parseInt(dias_sin_visita ?? "30");
    if (!isNaN(nDias) && nDias > 0) {
      const rows = await db
        .select({
          id: sujetos_servicio.id,
          nombre: sujetos_servicio.nombre,
          tipo_notas: sujetos_servicio.tipo_notas,
          ultima_visita: sql<string | null>`MAX(${citas_pos.fecha_hora})::text`,
        })
        .from(sujetos_servicio)
        .leftJoin(
          citas_pos,
          and(eq(citas_pos.sujeto_id, sujetos_servicio.id), eq(citas_pos.estado, "entregada_cobrada"))
        )
        .where(and(eq(sujetos_servicio.tenant_id, req.tenantId), eq(sujetos_servicio.activo, true)))
        .groupBy(sujetos_servicio.id, sujetos_servicio.nombre, sujetos_servicio.tipo_notas)
        .orderBy(sql`MAX(${citas_pos.fecha_hora}) ASC NULLS FIRST`);

      const ahora = Date.now();
      const corteMs = ahora - nDias * 86_400_000;
      sujetosSinVisita = rows
        .filter((r) => !r.ultima_visita || new Date(r.ultima_visita).getTime() < corteMs)
        .map((r) => ({
          id: r.id,
          nombre: r.nombre,
          tipo_notas: r.tipo_notas,
          ultima_visita: r.ultima_visita ?? null,
          dias_sin_visita: r.ultima_visita
            ? Math.floor((ahora - new Date(r.ultima_visita).getTime()) / 86_400_000)
            : -1,
        }));
    }

    res.json({
      periodo: { desde: desdeStr, hasta: hastaStr },
      total,
      atendidas,
      no_shows,
      canceladas,
      tasa_no_show: total > 0 ? Math.round((no_shows / total) * 100) : 0,
      ingresos_citas: Number(ingresosRow?.total ?? 0),
      por_estado: stats,
      sujetos_sin_visita: sujetosSinVisita,
    });
  } catch (err) {
    console.error("GET /agenda/reportes:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// ── Profesionales ─────────────────────────────────────────────────────────────

// GET /api/agenda/profesionales — lista activos del tenant
router.get("/profesionales", async (req, res) => {
  try {
    const rows = await db.select().from(profesionales_pos)
      .where(and(eq(profesionales_pos.tenant_id, req.tenantId), eq(profesionales_pos.activo, true)))
      .orderBy(profesionales_pos.nombre);
    res.json(rows);
  } catch (err) {
    console.error("GET /agenda/profesionales:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// POST /api/agenda/profesionales — crear
router.post("/profesionales", requireNotContador, async (req, res) => {
  try {
    const { nombre, especialidad, telefono, color } = req.body as {
      nombre: string; especialidad?: string; telefono?: string; color?: string;
    };
    if (!nombre?.trim()) return res.status(400).json({ error: "Nombre requerido." });
    const [prof] = await db.insert(profesionales_pos).values({
      tenant_id: req.tenantId,
      nombre: nombre.trim(),
      especialidad: especialidad?.trim() || null,
      telefono: telefono?.trim() || null,
      color: color ?? "#6366F1",
    }).returning();
    // Crear horario por defecto: lun–sab 08:00–18:00, domingo libre
    const diasDefecto = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      profesional_id: prof.id,
      dia_semana: dia,
      activo: dia !== 0, // domingo libre por defecto
      hora_inicio: "08:00",
      hora_fin: "18:00",
    }));
    await db.insert(horarios_profesional).values(diasDefecto);
    res.status(201).json(prof);
  } catch (err) {
    console.error("POST /agenda/profesionales:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PATCH /api/agenda/profesionales/:id — editar/desactivar
router.patch("/profesionales/:id", requireNotContador, async (req, res) => {
  try {
    const { nombre, especialidad, telefono, color, activo } = req.body as {
      nombre?: string; especialidad?: string; telefono?: string; color?: string; activo?: boolean;
    };
    const [updated] = await db.update(profesionales_pos)
      .set({
        ...(nombre !== undefined && { nombre: nombre.trim() }),
        ...(especialidad !== undefined && { especialidad: especialidad.trim() || null }),
        ...(telefono !== undefined && { telefono: telefono.trim() || null }),
        ...(color !== undefined && { color }),
        ...(activo !== undefined && { activo }),
      })
      .where(and(eq(profesionales_pos.id, req.params.id), eq(profesionales_pos.tenant_id, req.tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Profesional no encontrado." });
    res.json(updated);
  } catch (err) {
    console.error("PATCH /agenda/profesionales/:id:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// GET /api/agenda/profesionales/:id/horario — obtener horario semanal
router.get("/profesionales/:id/horario", async (req, res) => {
  try {
    const [prof] = await db.select({ id: profesionales_pos.id })
      .from(profesionales_pos)
      .where(and(eq(profesionales_pos.id, req.params.id), eq(profesionales_pos.tenant_id, req.tenantId)));
    if (!prof) return res.status(404).json({ error: "Profesional no encontrado." });
    const horarios = await db.select().from(horarios_profesional)
      .where(eq(horarios_profesional.profesional_id, req.params.id))
      .orderBy(horarios_profesional.dia_semana);
    res.json(horarios);
  } catch (err) {
    console.error("GET /agenda/profesionales/:id/horario:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// PUT /api/agenda/profesionales/:id/horario — guardar horario completo (7 días)
router.put("/profesionales/:id/horario", requireNotContador, async (req, res) => {
  try {
    const [prof] = await db.select({ id: profesionales_pos.id })
      .from(profesionales_pos)
      .where(and(eq(profesionales_pos.id, req.params.id), eq(profesionales_pos.tenant_id, req.tenantId)));
    if (!prof) return res.status(404).json({ error: "Profesional no encontrado." });
    const dias = req.body as Array<{ dia_semana: number; activo: boolean; hora_inicio: string; hora_fin: string }>;
    for (const dia of dias) {
      await db.insert(horarios_profesional)
        .values({ profesional_id: req.params.id, ...dia })
        .onConflictDoUpdate({
          target: [horarios_profesional.profesional_id, horarios_profesional.dia_semana],
          set: { activo: dia.activo, hora_inicio: dia.hora_inicio, hora_fin: dia.hora_fin },
        });
    }
    const horarios = await db.select().from(horarios_profesional)
      .where(eq(horarios_profesional.profesional_id, req.params.id))
      .orderBy(horarios_profesional.dia_semana);
    res.json(horarios);
  } catch (err) {
    console.error("PUT /agenda/profesionales/:id/horario:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// GET /api/agenda/profesionales/:id/bloqueos?mes=2026-07 — bloqueos del mes
router.get("/profesionales/:id/bloqueos", async (req, res) => {
  try {
    const [prof] = await db.select({ id: profesionales_pos.id })
      .from(profesionales_pos)
      .where(and(eq(profesionales_pos.id, req.params.id), eq(profesionales_pos.tenant_id, req.tenantId)));
    if (!prof) return res.status(404).json({ error: "Profesional no encontrado." });
    const mes = (req.query.mes as string | undefined) ?? new Date().toISOString().slice(0, 7);
    const rows = await db.select().from(bloqueos_profesional)
      .where(and(
        eq(bloqueos_profesional.profesional_id, req.params.id),
        sql`${bloqueos_profesional.fecha} LIKE ${mes + "%"}`,
      ))
      .orderBy(bloqueos_profesional.fecha);
    res.json(rows);
  } catch (err) {
    console.error("GET /agenda/profesionales/:id/bloqueos:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// POST /api/agenda/profesionales/:id/bloqueos — crear bloqueo
router.post("/profesionales/:id/bloqueos", requireNotContador, async (req, res) => {
  try {
    const [prof] = await db.select({ id: profesionales_pos.id })
      .from(profesionales_pos)
      .where(and(eq(profesionales_pos.id, req.params.id), eq(profesionales_pos.tenant_id, req.tenantId)));
    if (!prof) return res.status(404).json({ error: "Profesional no encontrado." });
    const { fecha, hora_inicio, hora_fin, motivo } = req.body as {
      fecha: string; hora_inicio?: string; hora_fin?: string; motivo?: string;
    };
    if (!fecha) return res.status(400).json({ error: "fecha requerida (YYYY-MM-DD)." });
    const [bloqueo] = await db.insert(bloqueos_profesional).values({
      profesional_id: req.params.id,
      fecha,
      hora_inicio: hora_inicio || null,
      hora_fin: hora_fin || null,
      motivo: motivo?.trim() || null,
    }).returning();
    res.status(201).json(bloqueo);
  } catch (err) {
    console.error("POST /agenda/profesionales/:id/bloqueos:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// DELETE /api/agenda/profesionales/:id/bloqueos/:bloqueoId
router.delete("/profesionales/:id/bloqueos/:bloqueoId", requireNotContador, async (req, res) => {
  try {
    await db.delete(bloqueos_profesional)
      .where(and(
        eq(bloqueos_profesional.id, req.params.bloqueoId),
        eq(bloqueos_profesional.profesional_id, req.params.id),
      ));
    res.status(204).end();
  } catch (err) {
    console.error("DELETE /agenda/profesionales/:id/bloqueos/:bloqueoId:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

// GET /api/agenda/disponibilidad?fecha=2026-07-15&duracion=30
// Retorna disponibilidad de todos los profesionales activos para la fecha dada
router.get("/disponibilidad", async (req, res) => {
  try {
    const fecha = (req.query.fecha as string) ?? new Date().toISOString().slice(0, 10);
    const duracion = Number(req.query.duracion ?? 30);
    const diaSemana = new Date(fecha + "T12:00:00").getDay(); // TZ-safe

    // Profesionales activos del tenant
    const profs = await db.select().from(profesionales_pos)
      .where(and(eq(profesionales_pos.tenant_id, req.tenantId), eq(profesionales_pos.activo, true)))
      .orderBy(profesionales_pos.nombre);

    if (profs.length === 0) return res.json([]);

    const profIds = profs.map((p) => p.id);

    // Horarios del día
    const horarios = await db.select().from(horarios_profesional)
      .where(and(
        inArray(horarios_profesional.profesional_id, profIds),
        eq(horarios_profesional.dia_semana, diaSemana),
      ));

    // Bloqueos del día
    const bloqueos = await db.select().from(bloqueos_profesional)
      .where(and(
        inArray(bloqueos_profesional.profesional_id, profIds),
        eq(bloqueos_profesional.fecha, fecha),
      ));

    // Citas existentes del día (agendadas o en progreso)
    const citasDelDia = await db.select({
      profesional_id: citas_pos.profesional_id,
      fecha_hora: citas_pos.fecha_hora,
      duracion_min: citas_pos.duracion_min,
    }).from(citas_pos).where(and(
      eq(citas_pos.tenant_id, req.tenantId),
      sql`DATE(${citas_pos.fecha_hora} AT TIME ZONE 'America/Bogota') = ${fecha}::date`,
      inArray(citas_pos.estado, ["agendada", "confirmada", "en_atencion"] as string[]),
    ));

    function minutosDesde(hora: string): number {
      const [h, m] = hora.split(":").map(Number);
      return h * 60 + m;
    }
    function minutosAHora(mins: number): string {
      return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    }

    const resultado = profs.map((prof) => {
      const horario = horarios.find((h) => h.profesional_id === prof.id);
      if (!horario || !horario.activo) {
        return { profesional: prof, libre: false, slots: [], motivo: "No trabaja este día" };
      }

      const inicio = minutosDesde(horario.hora_inicio);
      const fin = minutosDesde(horario.hora_fin);
      const slots: Array<{ hora: string; disponible: boolean }> = [];

      for (let t = inicio; t + duracion <= fin; t += duracion) {
        const horaFinSlot = minutosAHora(t + duracion);

        // Verificar bloqueos
        const bloqueado = bloqueos.some((b) => {
          if (b.profesional_id !== prof.id) return false;
          if (!b.hora_inicio) return true; // día completo bloqueado
          const bInicio = minutosDesde(b.hora_inicio);
          const bFin = minutosDesde(b.hora_fin!);
          return t < bFin && t + duracion > bInicio;
        });

        // Verificar citas existentes
        const ocupado = citasDelDia.some((c) => {
          if (c.profesional_id !== prof.id) return false;
          const citaHora = new Date(c.fecha_hora).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
          });
          const cInicio = minutosDesde(citaHora);
          const cFin = cInicio + (c.duracion_min ?? 30);
          return t < cFin && t + duracion > cInicio;
        });

        slots.push({ hora: minutosAHora(t), disponible: !bloqueado && !ocupado });
      }

      const hayDisponible = slots.some((s) => s.disponible);
      return { profesional: prof, libre: hayDisponible, slots };
    });

    res.json(resultado);
  } catch (err) {
    console.error("GET /agenda/disponibilidad:", err);
    res.status(500).json({ error: "Error interno." });
  }
});

export default router;
