import { Router } from "express";
import { db, activos_fijos, depreciaciones_activo, asientos_contables, lineas_asiento, cuentas_contables } from "@workspace/db";
import { eq, and, isNull, or, sql, count } from "drizzle-orm";

const router = Router();

// ── Helpers internos ──────────────────────────────────────────────────────────

async function getCuentaContable(tenantId: string, codigo: string) {
  const [cuenta] = await db
    .select()
    .from(cuentas_contables)
    .where(
      and(
        eq(cuentas_contables.codigo, codigo),
        or(eq(cuentas_contables.tenant_id, tenantId), isNull(cuentas_contables.tenant_id)),
      ),
    )
    .orderBy(cuentas_contables.tenant_id)
    .limit(1);
  return cuenta ?? null;
}

function primerDiaMesSiguiente(fechaStr: string): string {
  const d = new Date(fechaStr + "T12:00:00");
  const anio = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const mes = d.getMonth() === 11 ? 0 : d.getMonth() + 1;
  return `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
}

// ── GET / — listar activos del tenant ────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { estado } = req.query as { estado?: string };

    const condiciones = [eq(activos_fijos.tenant_id, req.tenantId), eq(activos_fijos.activo, true)];
    if (estado) condiciones.push(sql`${activos_fijos.estado} = ${estado}`);

    const rows = await db
      .select()
      .from(activos_fijos)
      .where(and(...condiciones))
      .orderBy(activos_fijos.descripcion);

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /activos-fijos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST / — crear activo (solo admin) ───────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede crear activos fijos." });
    }

    const {
      descripcion,
      categoria,
      valor_adquisicion,
      valor_residual,
      vida_util_meses,
      metodo,
      fecha_adquisicion,
      cuenta_activo,
      cuenta_depreciacion,
      cuenta_gasto,
      observaciones,
    } = req.body as {
      descripcion?: string;
      categoria?: string;
      valor_adquisicion?: number;
      valor_residual?: number;
      vida_util_meses?: number;
      metodo?: string;
      fecha_adquisicion?: string;
      cuenta_activo?: string;
      cuenta_depreciacion?: string;
      cuenta_gasto?: string;
      observaciones?: string;
    };

    if (!descripcion || valor_adquisicion == null || !vida_util_meses || !fecha_adquisicion) {
      return res.status(400).json({
        error: "Campos requeridos: descripcion, valor_adquisicion, vida_util_meses, fecha_adquisicion.",
      });
    }

    if (!["lineal", "reduccion_saldos"].includes(metodo ?? "lineal")) {
      return res.status(400).json({ error: "metodo debe ser 'lineal' o 'reduccion_saldos'." });
    }

    const valorAdq = Number(valor_adquisicion);
    const valorRes = Number(valor_residual ?? 0);
    const valorNeto = valorAdq - valorRes;

    const fechaInicioDepreciacion = primerDiaMesSiguiente(fecha_adquisicion);

    const [nuevo] = await db
      .insert(activos_fijos)
      .values({
        tenant_id: req.tenantId,
        descripcion,
        categoria: categoria ?? null,
        valor_adquisicion: String(valorAdq),
        valor_residual: String(valorRes),
        vida_util_meses: Number(vida_util_meses),
        metodo: (metodo ?? "lineal") as "lineal" | "reduccion_saldos",
        fecha_adquisicion,
        fecha_inicio_depreciacion: fechaInicioDepreciacion,
        valor_neto: String(valorNeto),
        depreciacion_acumulada: "0",
        cuenta_activo: cuenta_activo ?? null,
        cuenta_depreciacion: cuenta_depreciacion ?? null,
        cuenta_gasto: cuenta_gasto ?? null,
        estado: "activo",
        observaciones: observaciones ?? null,
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /activos-fijos:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /depreciaciones/pendientes — activos sin depreciación del mes actual ─
// IMPORTANTE: debe ir ANTES de /:id para que no lo capture como id
router.get("/depreciaciones/pendientes", async (req, res) => {
  try {
    const hoy = new Date();
    const anoActual = hoy.getFullYear();
    const mesActual = hoy.getMonth() + 1;

    // Obtener todos los activos activos del tenant
    const activosTodos = await db
      .select({ id: activos_fijos.id, descripcion: activos_fijos.descripcion, estado: activos_fijos.estado })
      .from(activos_fijos)
      .where(
        and(
          eq(activos_fijos.tenant_id, req.tenantId),
          eq(activos_fijos.activo, true),
          sql`${activos_fijos.estado} = 'activo'`,
        ),
      );

    if (activosTodos.length === 0) return res.json({ ano: anoActual, mes: mesActual, pendientes: [] });

    // Obtener los que ya tienen depreciación este mes
    const depreciacionesEsteMes = await db
      .select({ activo_id: depreciaciones_activo.activo_id })
      .from(depreciaciones_activo)
      .where(
        and(
          eq(depreciaciones_activo.tenant_id, req.tenantId),
          eq(depreciaciones_activo.ano, anoActual),
          eq(depreciaciones_activo.mes, mesActual),
        ),
      );

    const conDepreciacion = new Set(depreciacionesEsteMes.map((d) => d.activo_id));
    const pendientes = activosTodos.filter((a) => !conDepreciacion.has(a.id));

    res.json({ ano: anoActual, mes: mesActual, pendientes });
  } catch (err) {
    console.error("Error en GET /activos-fijos/depreciaciones/pendientes:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /:id — detalle con depreciaciones ────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [activo] = await db
      .select()
      .from(activos_fijos)
      .where(and(eq(activos_fijos.id, req.params.id), eq(activos_fijos.tenant_id, req.tenantId)))
      .limit(1);

    if (!activo) return res.status(404).json({ error: "Activo fijo no encontrado." });

    const depreciaciones = await db
      .select()
      .from(depreciaciones_activo)
      .where(eq(depreciaciones_activo.activo_id, activo.id))
      .orderBy(depreciaciones_activo.ano, depreciaciones_activo.mes);

    res.json({ ...activo, depreciaciones });
  } catch (err) {
    console.error("Error en GET /activos-fijos/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── PATCH /:id — editar campos básicos ───────────────────────────────────────
router.patch("/:id", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede editar activos fijos." });
    }

    const [activo] = await db
      .select()
      .from(activos_fijos)
      .where(and(eq(activos_fijos.id, req.params.id), eq(activos_fijos.tenant_id, req.tenantId)))
      .limit(1);

    if (!activo) return res.status(404).json({ error: "Activo fijo no encontrado." });

    // Verificar si tiene depreciaciones para restringir edición de valores
    const [tieneDepr] = await db
      .select({ id: depreciaciones_activo.id })
      .from(depreciaciones_activo)
      .where(eq(depreciaciones_activo.activo_id, activo.id))
      .limit(1);

    const { descripcion, categoria, observaciones } = req.body as {
      descripcion?: string;
      categoria?: string;
      observaciones?: string;
    };

    if (tieneDepr && (req.body.valor_adquisicion !== undefined || req.body.valor_residual !== undefined || req.body.vida_util_meses !== undefined)) {
      return res.status(422).json({
        error: "No se pueden modificar los valores financieros de un activo que ya tiene depreciaciones registradas.",
      });
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (descripcion !== undefined) updates.descripcion = descripcion;
    if (categoria !== undefined) updates.categoria = categoria;
    if (observaciones !== undefined) updates.observaciones = observaciones;

    if (Object.keys(updates).length === 1) {
      return res.status(400).json({ error: "No hay campos para actualizar." });
    }

    const [actualizado] = await db
      .update(activos_fijos)
      .set(updates)
      .where(eq(activos_fijos.id, activo.id))
      .returning();

    res.json(actualizado);
  } catch (err) {
    console.error("Error en PATCH /activos-fijos/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── DELETE /:id — dar de baja (solo si no tiene depreciaciones) ───────────────
router.delete("/:id", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede dar de baja activos fijos." });
    }

    const [activo] = await db
      .select()
      .from(activos_fijos)
      .where(and(eq(activos_fijos.id, req.params.id), eq(activos_fijos.tenant_id, req.tenantId)))
      .limit(1);

    if (!activo) return res.status(404).json({ error: "Activo fijo no encontrado." });

    const [tieneDepr] = await db
      .select({ id: depreciaciones_activo.id })
      .from(depreciaciones_activo)
      .where(eq(depreciaciones_activo.activo_id, activo.id))
      .limit(1);

    if (tieneDepr) {
      return res.status(422).json({
        error: "No se puede dar de baja un activo con depreciaciones registradas. Marque el estado como 'dado_de_baja' si desea inactivarlo.",
      });
    }

    const [actualizado] = await db
      .update(activos_fijos)
      .set({ estado: "dado_de_baja", activo: false, updated_at: new Date() })
      .where(eq(activos_fijos.id, activo.id))
      .returning();

    res.json({ ok: true, activo: actualizado });
  } catch (err) {
    console.error("Error en DELETE /activos-fijos/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST /:id/calcular-depreciacion — calcular y registrar depreciación del mes ──
router.post("/:id/calcular-depreciacion", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede registrar depreciaciones." });
    }

    const [activo] = await db
      .select()
      .from(activos_fijos)
      .where(and(eq(activos_fijos.id, req.params.id), eq(activos_fijos.tenant_id, req.tenantId)))
      .limit(1);

    if (!activo) return res.status(404).json({ error: "Activo fijo no encontrado." });

    const hoy = new Date();
    const anoCalculo = Number(req.body.ano ?? hoy.getFullYear());
    const mesCalculo = Number(req.body.mes ?? (hoy.getMonth() + 1));

    if (isNaN(anoCalculo) || anoCalculo < 2000 || isNaN(mesCalculo) || mesCalculo < 1 || mesCalculo > 12) {
      return res.status(400).json({ error: "ano y mes inválidos." });
    }

    // Verificar que no exista ya depreciación para este mes
    const [deprExistente] = await db
      .select({ id: depreciaciones_activo.id })
      .from(depreciaciones_activo)
      .where(
        and(
          eq(depreciaciones_activo.activo_id, activo.id),
          eq(depreciaciones_activo.ano, anoCalculo),
          eq(depreciaciones_activo.mes, mesCalculo),
        ),
      )
      .limit(1);

    if (deprExistente) {
      return res.status(409).json({
        error: `Ya existe una depreciación registrada para ${String(mesCalculo).padStart(2, "0")}/${anoCalculo}.`,
      });
    }

    const valorNeto = Number(activo.valor_neto);
    if (valorNeto <= 0) {
      return res.status(422).json({ error: "Activo completamente depreciado. El valor neto es 0." });
    }

    // Calcular valor de depreciación mensual
    const valorAdq = Number(activo.valor_adquisicion);
    const valorRes = Number(activo.valor_residual);
    const vidaUtil = Number(activo.vida_util_meses);
    let valorDeprMensual = 0;

    if (activo.metodo === "lineal") {
      valorDeprMensual = Math.round((valorAdq - valorRes) / vidaUtil);
    } else {
      // Reducción de saldos (tasa fija sobre valor neto)
      const tasa = 1 - Math.pow(valorRes / valorAdq, 1 / vidaUtil);
      valorDeprMensual = Math.round(valorNeto * tasa);
    }

    // No depreciar más allá del valor neto
    const valorDeprEfectivo = Math.min(valorDeprMensual, valorNeto);
    const nuevoValorNeto = valorNeto - valorDeprEfectivo;
    const nuevaDeprAcumulada = Number(activo.depreciacion_acumulada) + valorDeprEfectivo;

    // Crear asiento contable si el activo tiene cuentas configuradas
    let asientoId: string | null = null;
    if (activo.cuenta_gasto && activo.cuenta_depreciacion) {
      try {
        const [{ value: totalAsientos }] = await db
          .select({ value: count() })
          .from(asientos_contables)
          .where(eq(asientos_contables.tenant_id, req.tenantId));

        const seq = String(Number(totalAsientos) + 1).padStart(5, "0");
        const numeroAsiento = `AC-${anoCalculo}-${seq}`;
        const fechaAsiento = `${anoCalculo}-${String(mesCalculo).padStart(2, "0")}-${new Date(anoCalculo, mesCalculo, 0).getDate()}`;

        const cuentaGasto = await getCuentaContable(req.tenantId, activo.cuenta_gasto);
        const cuentaDeprAcum = await getCuentaContable(req.tenantId, activo.cuenta_depreciacion);

        if (cuentaGasto && cuentaDeprAcum) {
          const [asiento] = await db
            .insert(asientos_contables)
            .values({
              tenant_id: req.tenantId,
              numero: numeroAsiento,
              fecha: fechaAsiento,
              descripcion: `Depreciación ${activo.descripcion} ${String(mesCalculo).padStart(2, "0")}/${anoCalculo}`,
              origen: "ajuste",
              referencia_id: activo.id,
            })
            .returning();

          await db.insert(lineas_asiento).values([
            {
              asiento_id: asiento.id,
              cuenta_id: cuentaGasto.id,
              descripcion: `Gasto depreciación ${activo.descripcion}`,
              debito: String(valorDeprEfectivo),
              credito: "0",
            },
            {
              asiento_id: asiento.id,
              cuenta_id: cuentaDeprAcum.id,
              descripcion: `Depreciación acumulada ${activo.descripcion}`,
              debito: "0",
              credito: String(valorDeprEfectivo),
            },
          ]);

          asientoId = asiento.id;
        }
      } catch (errAsiento) {
        console.error("[ACTIVOS-FIJOS] Error creando asiento de depreciación:", errAsiento);
        // No bloquear la depreciación si falla el asiento
      }
    }

    // Insertar registro de depreciación
    const [depr] = await db
      .insert(depreciaciones_activo)
      .values({
        activo_id: activo.id,
        tenant_id: req.tenantId,
        ano: anoCalculo,
        mes: mesCalculo,
        valor: String(valorDeprEfectivo),
        valor_neto_al_final: String(nuevoValorNeto),
        asiento_id: asientoId ?? undefined,
      })
      .returning();

    // Actualizar valor neto y depreciación acumulada del activo
    const nuevoEstado = nuevoValorNeto <= 0 ? "depreciado" : "activo";
    await db
      .update(activos_fijos)
      .set({
        depreciacion_acumulada: String(nuevaDeprAcumulada),
        valor_neto: String(nuevoValorNeto),
        estado: nuevoEstado as "activo" | "depreciado",
        updated_at: new Date(),
      })
      .where(eq(activos_fijos.id, activo.id));

    res.status(201).json({
      depreciacion: depr,
      valor_depreciado: valorDeprEfectivo,
      valor_neto_anterior: valorNeto,
      valor_neto_nuevo: nuevoValorNeto,
      asiento_id: asientoId,
      estado_activo: nuevoEstado,
    });
  } catch (err) {
    console.error("Error en POST /activos-fijos/:id/calcular-depreciacion:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
