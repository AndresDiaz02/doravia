import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import {
  db,
  cuentas_bancarias,
  conciliaciones,
  movimientos_banco,
  lineas_asiento,
  asientos_contables,
  cuentas_contables,
} from "@workspace/db";
import { eq, and, between, sql } from "drizzle-orm";
import { requireNotContador } from "../middleware/require-plan-feature.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Cuentas bancarias ─────────────────────────────────────────────────────────

router.get("/cuentas", async (req, res) => {
  const cuentas = await db
    .select()
    .from(cuentas_bancarias)
    .where(eq(cuentas_bancarias.tenant_id, req.tenantId))
    .orderBy(cuentas_bancarias.nombre);
  res.json(cuentas);
});

router.post("/cuentas", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden crear cuentas bancarias." });
  const { nombre, banco, numero_cuenta, cuenta_contable_id } = req.body as {
    nombre: string; banco: string; numero_cuenta?: string; cuenta_contable_id?: string;
  };
  if (!nombre?.trim()) return res.status(400).json({ error: "El nombre de la cuenta es requerido." });
  if (!banco?.trim())  return res.status(400).json({ error: "El banco es requerido." });

  const [nueva] = await db.insert(cuentas_bancarias).values({
    tenant_id: req.tenantId,
    nombre: nombre.trim(),
    banco: banco.trim(),
    numero_cuenta: numero_cuenta?.trim() || null,
    cuenta_contable_id: cuenta_contable_id || null,
  }).returning();
  res.status(201).json(nueva);
});

router.patch("/cuentas/:id", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden editar cuentas bancarias." });
  const { nombre, banco, numero_cuenta, cuenta_contable_id, activa } = req.body as {
    nombre?: string; banco?: string; numero_cuenta?: string; cuenta_contable_id?: string; activa?: boolean;
  };

  const [existente] = await db.select({ id: cuentas_bancarias.id })
    .from(cuentas_bancarias)
    .where(and(eq(cuentas_bancarias.id, req.params.id), eq(cuentas_bancarias.tenant_id, req.tenantId)));
  if (!existente) return res.status(404).json({ error: "Cuenta bancaria no encontrada." });

  const updates: Partial<typeof cuentas_bancarias.$inferInsert> = {};
  if (nombre !== undefined) updates.nombre = nombre.trim();
  if (banco !== undefined) updates.banco = banco.trim();
  if (numero_cuenta !== undefined) updates.numero_cuenta = numero_cuenta?.trim() || null;
  if (cuenta_contable_id !== undefined) updates.cuenta_contable_id = cuenta_contable_id || null;
  if (activa !== undefined) updates.activa = activa;

  const [updated] = await db.update(cuentas_bancarias).set(updates)
    .where(eq(cuentas_bancarias.id, req.params.id)).returning();
  res.json(updated);
});

// ── Conciliaciones ────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const { cuenta_bancaria_id } = req.query as { cuenta_bancaria_id?: string };
  const filtros = [eq(conciliaciones.tenant_id, req.tenantId)];
  if (cuenta_bancaria_id) filtros.push(eq(conciliaciones.cuenta_bancaria_id, cuenta_bancaria_id));

  const lista = await db
    .select({ conciliacion: conciliaciones, cuenta: cuentas_bancarias })
    .from(conciliaciones)
    .innerJoin(cuentas_bancarias, eq(conciliaciones.cuenta_bancaria_id, cuentas_bancarias.id))
    .where(and(...filtros))
    .orderBy(sql`${conciliaciones.fecha_hasta} DESC`);
  res.json(lista);
});

router.post("/", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden crear conciliaciones." });
  const { cuenta_bancaria_id, fecha_desde, fecha_hasta, saldo_inicial_banco, saldo_final_banco } = req.body as {
    cuenta_bancaria_id: string; fecha_desde: string; fecha_hasta: string;
    saldo_inicial_banco: number; saldo_final_banco: number;
  };
  if (!cuenta_bancaria_id) return res.status(400).json({ error: "cuenta_bancaria_id es requerido." });
  if (!fecha_desde || !fecha_hasta) return res.status(400).json({ error: "fecha_desde y fecha_hasta son requeridas." });
  if (typeof saldo_inicial_banco !== "number") return res.status(400).json({ error: "saldo_inicial_banco debe ser número." });
  if (typeof saldo_final_banco !== "number")   return res.status(400).json({ error: "saldo_final_banco debe ser número." });

  const [cuenta] = await db.select({ id: cuentas_bancarias.id })
    .from(cuentas_bancarias)
    .where(and(eq(cuentas_bancarias.id, cuenta_bancaria_id), eq(cuentas_bancarias.tenant_id, req.tenantId)));
  if (!cuenta) return res.status(404).json({ error: "Cuenta bancaria no encontrada." });

  const [nueva] = await db.insert(conciliaciones).values({
    tenant_id: req.tenantId,
    cuenta_bancaria_id,
    fecha_desde,
    fecha_hasta,
    saldo_inicial_banco: String(saldo_inicial_banco),
    saldo_final_banco: String(saldo_final_banco),
  }).returning();
  res.status(201).json(nueva);
});

router.get("/:id", async (req, res) => {
  const [row] = await db
    .select({ conciliacion: conciliaciones, cuenta: cuentas_bancarias })
    .from(conciliaciones)
    .innerJoin(cuentas_bancarias, eq(conciliaciones.cuenta_bancaria_id, cuentas_bancarias.id))
    .where(and(eq(conciliaciones.id, req.params.id), eq(conciliaciones.tenant_id, req.tenantId)));
  if (!row) return res.status(404).json({ error: "Conciliación no encontrada." });
  res.json(row);
});

// ── Movimientos del extracto ──────────────────────────────────────────────────

router.get("/:id/movimientos", async (req, res) => {
  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });

  const movs = await db.select().from(movimientos_banco)
    .where(eq(movimientos_banco.conciliacion_id, req.params.id))
    .orderBy(movimientos_banco.fecha, movimientos_banco.created_at);
  res.json(movs);
});

// POST /api/conciliacion/:id/movimientos — agregar movimiento manual
router.post("/:id/movimientos", requireNotContador, async (req, res) => {
  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });
  if (conc.estado === "cerrada") return res.status(422).json({ error: "La conciliación está cerrada." });
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden agregar movimientos." });

  const { fecha, descripcion, monto, referencia } = req.body as {
    fecha: string; descripcion: string; monto: number; referencia?: string;
  };
  if (!fecha) return res.status(400).json({ error: "fecha es requerida." });
  if (!descripcion?.trim()) return res.status(400).json({ error: "descripcion es requerida." });
  if (typeof monto !== "number" || monto === 0) return res.status(400).json({ error: "monto debe ser número distinto de cero." });

  const [mov] = await db.insert(movimientos_banco).values({
    conciliacion_id: req.params.id,
    fecha,
    descripcion: descripcion.trim(),
    monto: String(monto),
    referencia: referencia?.trim() || null,
  }).returning();
  res.status(201).json(mov);
});

// POST /api/conciliacion/:id/importar — CSV/Excel con mapeo de columnas
router.post("/:id/importar", requireNotContador, upload.single("archivo"), async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden importar extractos." });

  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });
  if (conc.estado === "cerrada") return res.status(422).json({ error: "La conciliación está cerrada." });
  if (!req.file) return res.status(400).json({ error: "Se requiere un archivo .xlsx o .csv." });

  // mapeo: columnas que el usuario indica en el body
  const mapeo = parsearMapeo(req.body);

  let filas: Record<string, string>[];
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) as Record<string, unknown>[];
    if (raw.length === 0) return res.status(400).json({ error: "El archivo está vacío." });
    if (raw.length > 5000) return res.status(400).json({ error: "Máximo 5000 movimientos por importación." });
    filas = raw.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => {
          let s: string;
          if (v instanceof Date) {
            // Fechas como Date objects: convertir a ISO en UTC para evitar offset de zona horaria
            s = v.toISOString().slice(0, 10);
          } else {
            s = String(v ?? "").trim();
          }
          return [k.toString().trim(), s];
        })
      )
    );
  } catch {
    return res.status(400).json({ error: "No se pudo leer el archivo. Verifica que sea .xlsx o .csv válido." });
  }

  // Auto-detección de formato si no hay mapeo
  const headers = Object.keys(filas[0] ?? {});
  const mapeoFinal = mapeo ?? detectarFormatoBanco(headers);
  if (!mapeoFinal) {
    return res.status(400).json({
      error: "No se pudo detectar el formato del extracto automáticamente. Envía el mapeo de columnas.",
      columnas_detectadas: headers,
      instrucciones: "Envía col_fecha, col_descripcion y (col_monto O col_debito+col_credito) en el body.",
    });
  }

  // Preview de primeras 5 filas si viene ?preview=1
  if (req.query.preview === "1") {
    const preview = filas.slice(0, 5).map((f) => extraerMovimiento(f, mapeoFinal));
    return res.json({ columnas_detectadas: headers, mapeo_aplicado: mapeoFinal, preview });
  }

  // Parsear y validar todas las filas (atomicidad: no insertar nada si hay error)
  const movsParsados: { fecha: string; descripcion: string; monto: string; referencia: string | null }[] = [];
  const errores: { fila: number; error: string }[] = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nFila = i + 2;
    const parsed = extraerMovimiento(fila, mapeoFinal);

    if (!parsed.fecha || isNaN(Date.parse(parsed.fecha))) {
      errores.push({ fila: nFila, error: `Fecha inválida: "${parsed.fecha_raw}"` });
      continue;
    }
    const monto = parsarMontoExtracto(parsed.monto_raw ?? "");
    if (monto === null || monto === 0) {
      errores.push({ fila: nFila, error: `Monto inválido: "${parsed.monto_raw}"` });
      continue;
    }
    movsParsados.push({
      fecha: parsed.fecha,
      descripcion: parsed.descripcion || "(sin descripción)",
      monto: String(monto!),
      referencia: parsed.referencia || null,
    });
  }

  if (errores.length > 0) {
    return res.status(400).json({
      error: `Se encontraron ${errores.length} filas con errores. No se importó ningún movimiento.`,
      errores: errores.slice(0, 20),
    });
  }

  // Insertar todos de una vez
  const insertados = await db.insert(movimientos_banco).values(
    movsParsados.map((m) => ({ conciliacion_id: req.params.id, ...m }))
  ).returning({ id: movimientos_banco.id });

  res.status(201).json({ importados: insertados.length, errores: [] });
});

// DELETE movimiento (solo si pendiente)
router.delete("/:id/movimientos/:movId", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden eliminar movimientos." });
  const [mov] = await db.select().from(movimientos_banco)
    .where(and(eq(movimientos_banco.id, req.params.movId), eq(movimientos_banco.conciliacion_id, req.params.id)));
  if (!mov) return res.status(404).json({ error: "Movimiento no encontrado." });
  if (mov.estado === "conciliado") return res.status(422).json({ error: "No se puede eliminar un movimiento ya conciliado. Deshaz el match primero." });
  await db.delete(movimientos_banco).where(eq(movimientos_banco.id, req.params.movId));
  res.json({ ok: true });
});

// ── Matching ──────────────────────────────────────────────────────────────────

// GET /api/conciliacion/:id/sugerencias — propone parejas (no aplica cambios)
router.get("/:id/sugerencias", async (req, res) => {
  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });

  // Movimientos bancarios pendientes
  const movsBanco = await db.select().from(movimientos_banco)
    .where(and(eq(movimientos_banco.conciliacion_id, req.params.id), eq(movimientos_banco.estado, "pendiente")));

  if (movsBanco.length === 0) return res.json([]);

  // Obtener la cuenta contable asociada a esta cuenta bancaria
  const [cuentaB] = await db.select({ cuenta_contable_id: cuentas_bancarias.cuenta_contable_id })
    .from(cuentas_bancarias)
    .where(eq(cuentas_bancarias.id, conc.cuenta_bancaria_id));

  // Líneas de asiento disponibles (cuenta bancaria 1110xx, período ±7 días, no conciliadas aún)
  const margenDias = 7;
  const fechaDesde = offsetDate(conc.fecha_desde, -margenDias);
  const fechaHasta = offsetDate(conc.fecha_hasta,  margenDias);

  const lineasLibros = await db
    .select({
      linea: lineas_asiento,
      asiento: asientos_contables,
      cuenta: cuentas_contables,
    })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .innerJoin(cuentas_contables, eq(lineas_asiento.cuenta_id, cuentas_contables.id))
    .where(
      and(
        eq(asientos_contables.tenant_id, req.tenantId),
        between(asientos_contables.fecha, fechaDesde, fechaHasta),
        sql`${lineas_asiento.movimiento_banco_id} IS NULL`,
        // filtrar por la cuenta bancaria asociada, o por código 1110 si no hay asociación
        cuentaB?.cuenta_contable_id
          ? eq(lineas_asiento.cuenta_id, cuentaB.cuenta_contable_id)
          : sql`${cuentas_contables.codigo} LIKE '1110%'`
      )
    );

  const sugerencias: {
    movimiento_banco_id: string;
    linea_asiento_id: string;
    confianza: "fuerte" | "debil";
    motivo: string;
    mov_fecha: string;
    mov_monto: string;
    mov_descripcion: string;
    linea_fecha: string;
    linea_monto: string;
    linea_descripcion: string;
    asiento_numero: string;
  }[] = [];

  const TOLERANCIA_DIAS = 3;

  for (const mov of movsBanco) {
    const montoMov = Number(mov.monto); // positivo=ingreso, negativo=salida
    for (const { linea, asiento, cuenta: _ } of lineasLibros) {
      // El monto del libro: crédito en 1110 = salida (banco debita), débito en 1110 = ingreso
      const montoLinea = Number(linea.debito) - Number(linea.credito);
      if (Math.abs(montoMov - montoLinea) > 0.01) continue; // montos distintos

      const diffDias = Math.abs(daysBetween(mov.fecha, asiento.fecha));
      const confianza = diffDias <= TOLERANCIA_DIAS ? "fuerte" : "debil";

      sugerencias.push({
        movimiento_banco_id: mov.id,
        linea_asiento_id: linea.id,
        confianza,
        motivo: diffDias <= TOLERANCIA_DIAS
          ? `Monto exacto (${formatMonto(montoMov)}) y fecha con diferencia de ${diffDias} día(s)`
          : `Monto exacto (${formatMonto(montoMov)}) pero diferencia de ${diffDias} días (fuera de tolerancia)`,
        mov_fecha: mov.fecha,
        mov_monto: mov.monto,
        mov_descripcion: mov.descripcion,
        linea_fecha: asiento.fecha,
        linea_monto: String(montoLinea),
        linea_descripcion: linea.descripcion ?? asiento.descripcion,
        asiento_numero: asiento.numero,
      });
    }
  }

  // Ordenar: fuertes primero
  sugerencias.sort((a, b) => (a.confianza === "fuerte" ? -1 : 1) - (b.confianza === "fuerte" ? -1 : 1));
  res.json(sugerencias);
});

// POST /api/conciliacion/:id/match — confirmar pareja
router.post("/:id/match", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden confirmar matches." });

  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });
  if (conc.estado === "cerrada") return res.status(422).json({ error: "La conciliación está cerrada." });

  const { movimiento_banco_id, linea_asiento_id } = req.body as {
    movimiento_banco_id: string; linea_asiento_id: string;
  };
  if (!movimiento_banco_id) return res.status(400).json({ error: "movimiento_banco_id es requerido." });
  if (!linea_asiento_id)    return res.status(400).json({ error: "linea_asiento_id es requerido." });

  const [mov] = await db.select().from(movimientos_banco)
    .where(and(eq(movimientos_banco.id, movimiento_banco_id), eq(movimientos_banco.conciliacion_id, req.params.id)));
  if (!mov) return res.status(404).json({ error: "Movimiento bancario no encontrado en esta conciliación." });
  if (mov.estado === "conciliado") return res.status(422).json({ error: "Este movimiento ya está conciliado." });

  const [linea] = await db
    .select({ linea: lineas_asiento, asiento: asientos_contables })
    .from(lineas_asiento)
    .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
    .where(and(eq(lineas_asiento.id, linea_asiento_id), eq(asientos_contables.tenant_id, req.tenantId)));
  if (!linea) return res.status(404).json({ error: "Línea de asiento no encontrada." });
  if (linea.linea.movimiento_banco_id) return res.status(422).json({ error: "Esta línea de asiento ya está conciliada con otro movimiento." });

  // Aplicar match en transacción
  await db.transaction(async (tx) => {
    await tx.update(movimientos_banco)
      .set({ estado: "conciliado", linea_asiento_id })
      .where(eq(movimientos_banco.id, movimiento_banco_id));
    await tx.update(lineas_asiento)
      .set({ movimiento_banco_id })
      .where(eq(lineas_asiento.id, linea_asiento_id));
  });

  res.json({ ok: true, movimiento_banco_id, linea_asiento_id });
});

// DELETE /api/conciliacion/:id/match/:movId — deshacer match
router.delete("/:id/match/:movId", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden deshacer matches." });

  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });
  if (conc.estado === "cerrada") return res.status(422).json({ error: "La conciliación está cerrada." });

  const [mov] = await db.select().from(movimientos_banco)
    .where(and(eq(movimientos_banco.id, req.params.movId), eq(movimientos_banco.conciliacion_id, req.params.id)));
  if (!mov) return res.status(404).json({ error: "Movimiento no encontrado." });
  if (mov.estado !== "conciliado" || !mov.linea_asiento_id)
    return res.status(422).json({ error: "Este movimiento no está conciliado." });

  await db.transaction(async (tx) => {
    await tx.update(lineas_asiento)
      .set({ movimiento_banco_id: null })
      .where(eq(lineas_asiento.id, mov.linea_asiento_id!));
    await tx.update(movimientos_banco)
      .set({ estado: "pendiente", linea_asiento_id: null })
      .where(eq(movimientos_banco.id, req.params.movId));
  });

  res.json({ ok: true });
});

// ── Resumen ───────────────────────────────────────────────────────────────────

// GET /api/conciliacion/:id/resumen — las 3 cifras + desgloses
router.get("/:id/resumen", async (req, res) => {
  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });

  // Saldo según banco (del extracto importado)
  const saldoBanco = Number(conc.saldo_final_banco);

  // Movimientos del banco pendientes (en banco pero sin registro en libros)
  const [resBancoPendiente] = await db
    .select({ total: sql<string>`COALESCE(SUM(${movimientos_banco.monto}), 0)` })
    .from(movimientos_banco)
    .where(and(eq(movimientos_banco.conciliacion_id, req.params.id), eq(movimientos_banco.estado, "pendiente")));
  const bancoPendienteDetalle = await db.select().from(movimientos_banco)
    .where(and(eq(movimientos_banco.conciliacion_id, req.params.id), eq(movimientos_banco.estado, "pendiente")));

  // Saldo según libros para la cuenta bancaria en el período
  const [cuentaB] = await db.select({ cuenta_contable_id: cuentas_bancarias.cuenta_contable_id })
    .from(cuentas_bancarias).where(eq(cuentas_bancarias.id, conc.cuenta_bancaria_id));

  let saldoLibros = 0;
  let librosPendienteDetalle: { id: string; debito: string; credito: string; descripcion: string | null; fecha: string }[] = [];

  if (cuentaB?.cuenta_contable_id) {
    // Saldo acumulado de la cuenta hasta fecha_hasta
    const [resSaldo] = await db
      .select({ debito: sql<string>`COALESCE(SUM(${lineas_asiento.debito}), 0)`, credito: sql<string>`COALESCE(SUM(${lineas_asiento.credito}), 0)` })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          eq(lineas_asiento.cuenta_id, cuentaB.cuenta_contable_id),
          sql`${asientos_contables.fecha} <= ${conc.fecha_hasta}`
        )
      );
    saldoLibros = Number(resSaldo.debito) - Number(resSaldo.credito);

    // Líneas en libros dentro del período no conciliadas (en libros pero sin match bancario)
    librosPendienteDetalle = await db
      .select({
        id: lineas_asiento.id,
        debito: lineas_asiento.debito,
        credito: lineas_asiento.credito,
        descripcion: lineas_asiento.descripcion,
        fecha: asientos_contables.fecha,
      })
      .from(lineas_asiento)
      .innerJoin(asientos_contables, eq(lineas_asiento.asiento_id, asientos_contables.id))
      .where(
        and(
          eq(asientos_contables.tenant_id, req.tenantId),
          eq(lineas_asiento.cuenta_id, cuentaB.cuenta_contable_id),
          between(asientos_contables.fecha, conc.fecha_desde, conc.fecha_hasta),
          sql`${lineas_asiento.movimiento_banco_id} IS NULL`
        )
      );
  }

  const diferencia = saldoBanco - saldoLibros;

  res.json({
    saldo_banco: saldoBanco,
    saldo_libros: saldoLibros,
    diferencia,
    diferencia_abs: Math.abs(diferencia),
    cuadrado: Math.abs(diferencia) < 0.01,
    // Movimientos en banco sin registro en libros (típico: comisiones, GMF 4x1000)
    banco_sin_libro: {
      cantidad: bancoPendienteDetalle.length,
      total: Number(resBancoPendiente.total),
      detalle: bancoPendienteDetalle,
    },
    // Movimientos en libros sin reflejo en banco (típico: cheques en tránsito, depósitos no acreditados)
    libro_sin_banco: {
      cantidad: librosPendienteDetalle.length,
      total: librosPendienteDetalle.reduce((s, l) => s + Number(l.debito) - Number(l.credito), 0),
      detalle: librosPendienteDetalle,
    },
  });
});

// PATCH /api/conciliacion/:id/cerrar — bloquea cambios
router.patch("/:id/cerrar", requireNotContador, async (req, res) => {
  if (req.userRole !== "admin") return res.status(403).json({ error: "Solo administradores pueden cerrar conciliaciones." });

  const conc = await getConciliacion(req.params.id, req.tenantId);
  if (!conc) return res.status(404).json({ error: "Conciliación no encontrada." });
  if (conc.estado === "cerrada") return res.status(422).json({ error: "La conciliación ya está cerrada." });

  const [updated] = await db.update(conciliaciones)
    .set({ estado: "cerrada", cerrada_at: new Date() })
    .where(eq(conciliaciones.id, req.params.id))
    .returning();
  res.json(updated);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getConciliacion(id: string, tenantId: string) {
  const [row] = await db.select().from(conciliaciones)
    .where(and(eq(conciliaciones.id, id), eq(conciliaciones.tenant_id, tenantId)));
  return row ?? null;
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMonto(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// Mapeo de columnas: puede venir como col_fecha=Fecha, col_descripcion=Descripción, col_monto=Valor
// O como col_debito=Débitos, col_credito=Créditos (dos columnas separadas)
interface MapeoColumnas {
  fecha: string;
  descripcion: string;
  monto?: string;        // columna única con monto (positivo/negativo)
  debito?: string;       // columna de salidas (se convierte a negativo)
  credito?: string;      // columna de entradas (positivo)
  referencia?: string;
}

function parsearMapeo(body: Record<string, string>): MapeoColumnas | null {
  const f = body.col_fecha?.trim();
  const d = body.col_descripcion?.trim();
  const m = body.col_monto?.trim();
  const deb = body.col_debito?.trim();
  const cred = body.col_credito?.trim();
  const ref = body.col_referencia?.trim();
  if (!f || !d) return null;
  if (!m && !deb && !cred) return null;
  return { fecha: f, descripcion: d, monto: m || undefined, debito: deb || undefined, credito: cred || undefined, referencia: ref || undefined };
}

// Detecta formatos comunes de extractos bancarios colombianos
function detectarFormatoBanco(headers: string[]): MapeoColumnas | null {
  const h = headers.map((s) => s.toLowerCase().trim());

  // Bancolombia: "Fecha", "Descripción", "Referencia", "Débito", "Crédito", "Saldo"
  if (h.some((c) => c.includes("débito") || c.includes("debito")) && h.some((c) => c.includes("crédito") || c.includes("credito"))) {
    const hOrig = headers;
    return {
      fecha: hOrig.find((c) => /^fecha$/i.test(c.trim())) ?? hOrig[0],
      descripcion: hOrig.find((c) => /descripci/i.test(c)) ?? hOrig[1],
      debito:  hOrig.find((c) => /d[eé]bito/i.test(c)) ?? "",
      credito: hOrig.find((c) => /cr[eé]dito/i.test(c)) ?? "",
      referencia: hOrig.find((c) => /referencia|ref\b/i.test(c)),
    };
  }

  // Davivienda / BBVA: "Fecha", "Descripción", "Valor"
  if (h.some((c) => /^valor$/.test(c)) || h.some((c) => /^monto$/.test(c)) || h.some((c) => /^importe$/.test(c))) {
    const hOrig = headers;
    return {
      fecha: hOrig.find((c) => /^fecha$/i.test(c.trim())) ?? hOrig[0],
      descripcion: hOrig.find((c) => /descripci/i.test(c)) ?? hOrig[1],
      monto: hOrig.find((c) => /^(valor|monto|importe)$/i.test(c.trim())) ?? hOrig[2],
      referencia: hOrig.find((c) => /referencia|ref\b/i.test(c)),
    };
  }

  return null;
}

interface FilaParsed {
  fecha: string;
  fecha_raw: string;
  descripcion: string;
  monto_raw: string;
  referencia: string | null;
}

function extraerMovimiento(fila: Record<string, string>, mapeo: MapeoColumnas): FilaParsed {
  const fechaRaw = fila[mapeo.fecha] ?? "";
  const fecha = normalizarFecha(fechaRaw);

  let montoRaw: string;
  if (mapeo.monto) {
    montoRaw = fila[mapeo.monto] ?? "0";
  } else {
    // débito = salida (negativo), crédito = entrada (positivo)
    const deb = parsarMontoExtracto(fila[mapeo.debito ?? ""] ?? "") ?? 0;
    const cred = parsarMontoExtracto(fila[mapeo.credito ?? ""] ?? "") ?? 0;
    montoRaw = String(cred - deb);
  }

  return {
    fecha,
    fecha_raw: fechaRaw,
    descripcion: fila[mapeo.descripcion] ?? "",
    monto_raw: montoRaw,
    referencia: mapeo.referencia ? (fila[mapeo.referencia] || null) : null,
  };
}

function parsarMontoExtracto(raw: string): number | null {
  let s = raw.replace(/[$\s]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) || n === 0 ? null : n;
}

function normalizarFecha(raw: string): string {
  if (!raw) return "";
  // DD/MM/YYYY → YYYY-MM-DD
  const m1 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  // YYYY-MM-DD (ya correcto)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // JS Date parse como fallback
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

export default router;
