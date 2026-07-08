import { Router } from "express";
import { db, retenciones_proveedor } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";

const router = Router();

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", minimumFractionDigits: 0,
});

const VERDE = "#16a34a";
const GRIS  = "#6b7280";
const NEGRO = "#111827";

// ── GET / — listar con filtros opcionales ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { proveedor_id, ano, mes, tipo } = req.query as {
      proveedor_id?: string;
      ano?: string;
      mes?: string;
      tipo?: string;
    };

    const conds = [eq(retenciones_proveedor.tenant_id, req.tenantId)];
    if (proveedor_id) conds.push(eq(retenciones_proveedor.proveedor_id, proveedor_id));
    if (ano) conds.push(eq(retenciones_proveedor.ano, Number(ano)));
    if (mes) conds.push(eq(retenciones_proveedor.mes, Number(mes)));
    if (tipo) conds.push(sql`${retenciones_proveedor.tipo} = ${tipo}`);

    const rows = await db
      .select()
      .from(retenciones_proveedor)
      .where(and(...conds))
      .orderBy(retenciones_proveedor.fecha);

    res.json(rows);
  } catch (err) {
    console.error("Error en GET /retenciones-proveedor:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── POST / — registrar retención ─────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "contador") {
      return res.status(403).json({ error: "Solo administradores o contadores pueden registrar retenciones." });
    }

    const {
      nombre_proveedor,
      nit_proveedor,
      proveedor_id,
      tipo,
      nombre_concepto,
      porcentaje,
      base,
      fecha,
      referencia_tipo,
      referencia_numero,
      observaciones,
    } = req.body as {
      nombre_proveedor?: string;
      nit_proveedor?: string;
      proveedor_id?: string;
      tipo?: string;
      nombre_concepto?: string;
      porcentaje?: number;
      base?: number;
      fecha?: string;
      referencia_tipo?: string;
      referencia_numero?: string;
      observaciones?: string;
    };

    if (!nombre_proveedor || !tipo || !nombre_concepto || porcentaje == null || base == null || !fecha) {
      return res.status(400).json({
        error: "Campos requeridos: nombre_proveedor, tipo, nombre_concepto, porcentaje, base, fecha.",
      });
    }

    if (!["retefuente", "reteiva", "reteica"].includes(tipo)) {
      return res.status(400).json({ error: "tipo debe ser: retefuente, reteiva, reteica." });
    }

    const baseNum = Number(base);
    const porcentajeNum = Number(porcentaje);
    const valor = Math.round(baseNum * porcentajeNum / 100);

    const fechaDate = new Date(fecha + "T12:00:00");
    const ano = fechaDate.getFullYear();
    const mes = fechaDate.getMonth() + 1;

    const [nueva] = await db
      .insert(retenciones_proveedor)
      .values({
        tenant_id: req.tenantId,
        proveedor_id: proveedor_id ?? null,
        nombre_proveedor,
        nit_proveedor: nit_proveedor ?? null,
        tipo: tipo as "retefuente" | "reteiva" | "reteica",
        nombre_concepto,
        porcentaje: String(porcentajeNum),
        base: String(baseNum),
        valor: String(valor),
        fecha,
        ano,
        mes,
        referencia_tipo: referencia_tipo ?? null,
        referencia_numero: referencia_numero ?? null,
        observaciones: observaciones ?? null,
      })
      .returning();

    res.status(201).json(nueva);
  } catch (err) {
    console.error("Error en POST /retenciones-proveedor:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── DELETE /:id — eliminar retención ─────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    if (req.userRole !== "admin") {
      return res.status(403).json({ error: "Solo el administrador puede eliminar retenciones." });
    }

    const [row] = await db
      .select({ id: retenciones_proveedor.id })
      .from(retenciones_proveedor)
      .where(and(eq(retenciones_proveedor.id, req.params.id), eq(retenciones_proveedor.tenant_id, req.tenantId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Retención no encontrada." });

    await db.delete(retenciones_proveedor).where(eq(retenciones_proveedor.id, row.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Error en DELETE /retenciones-proveedor/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ── GET /certificado — certificado de retención PDF ──────────────────────────
// Debe ir ANTES de /:id para no ser capturada como ID
router.get("/certificado", async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "contador") {
      return res.status(403).json({ error: "Solo administradores o contadores pueden generar certificados de retención." });
    }

    const { proveedor_id, nombre_proveedor, nit_proveedor, ano } = req.query as {
      proveedor_id?: string;
      nombre_proveedor?: string;
      nit_proveedor?: string;
      ano?: string;
    };

    if (!ano) return res.status(400).json({ error: "El parámetro ano es requerido." });
    if (!proveedor_id && !nit_proveedor && !nombre_proveedor) {
      return res.status(400).json({ error: "Se requiere proveedor_id, nit_proveedor o nombre_proveedor." });
    }

    const anoNum = Number(ano);
    const conds = [
      eq(retenciones_proveedor.tenant_id, req.tenantId),
      eq(retenciones_proveedor.ano, anoNum),
    ];

    if (proveedor_id) {
      conds.push(eq(retenciones_proveedor.proveedor_id, proveedor_id));
    } else if (nit_proveedor) {
      conds.push(sql`${retenciones_proveedor.nit_proveedor} = ${nit_proveedor}`);
    } else if (nombre_proveedor) {
      conds.push(sql`${retenciones_proveedor.nombre_proveedor} ILIKE ${"%" + nombre_proveedor + "%"}`);
    }

    const rows = await db
      .select()
      .from(retenciones_proveedor)
      .where(and(...conds))
      .orderBy(retenciones_proveedor.mes, retenciones_proveedor.fecha);

    if (rows.length === 0) {
      return res.status(404).json({ error: `No hay retenciones registradas para ${anoNum}.` });
    }

    const provNombre = rows[0].nombre_proveedor;
    const provNit = rows[0].nit_proveedor ?? "Sin NIT";
    const tenant = req.tenant as { nombre: string; nit: string; direccion?: string | null; ciudad?: string | null; telefono?: string | null; correo?: string | null };

    const totalRetefuente = rows.filter(r => r.tipo === "retefuente").reduce((s, r) => s + Number(r.valor), 0);
    const totalReteiva = rows.filter(r => r.tipo === "reteiva").reduce((s, r) => s + Number(r.valor), 0);
    const totalReteica = rows.filter(r => r.tipo === "reteica").reduce((s, r) => s + Number(r.valor), 0);
    const totalGeneral = totalRetefuente + totalReteiva + totalReteica;

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=certificado_retencion_${anoNum}_${provNit}.pdf`);
    doc.pipe(res);

    // Encabezado
    doc.fontSize(16).fillColor(VERDE).text(tenant.nombre, 50, 50);
    doc.fontSize(9).fillColor(GRIS).text(`NIT: ${tenant.nit}`, { continued: true });
    if (tenant.ciudad) doc.text(`  ·  ${tenant.ciudad}`);
    doc.moveDown(0.3);

    doc.fontSize(13).fillColor(NEGRO).text(`Certificado de Retenciones en la Fuente`, { align: "center" });
    doc.fontSize(10).fillColor(GRIS).text(`Año gravable ${anoNum}`, { align: "center" });
    doc.moveDown(1);

    // Datos del proveedor
    doc.fontSize(10).fillColor(NEGRO).text("Datos del beneficiario:");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(GRIS)
      .text(`Nombre / Razón social: ${provNombre}`)
      .text(`NIT / Cédula: ${provNit}`)
      .moveDown(1);

    // Tabla de retenciones
    const colX = [50, 90, 200, 310, 380, 450];
    const colW = [40, 110, 110, 70, 70, 90];

    // Encabezados de tabla
    doc.rect(50, doc.y, 495, 18).fill("#f3f4f6");
    doc.fillColor(NEGRO).fontSize(8);
    doc.text("Mes", colX[0], doc.y - 14, { width: colW[0] });
    doc.text("Concepto", colX[1], doc.y - 14, { width: colW[1] });
    doc.text("Tipo", colX[2], doc.y - 14, { width: colW[2] });
    doc.text("Base", colX[3], doc.y - 14, { width: colW[3], align: "right" });
    doc.text("Tarifa %", colX[4], doc.y - 14, { width: colW[4], align: "right" });
    doc.text("Valor retenido", colX[5], doc.y - 14, { width: colW[5], align: "right" });

    const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    let startY = doc.y + 6;
    for (const r of rows) {
      doc.fontSize(7.5).fillColor(NEGRO)
        .text(MESES[r.mes] ?? String(r.mes), colX[0], startY, { width: colW[0] })
        .text(r.nombre_concepto, colX[1], startY, { width: colW[1] })
        .text(r.tipo === "retefuente" ? "Rte. Fuente" : r.tipo === "reteiva" ? "Rte. IVA" : "Rte. ICA", colX[2], startY, { width: colW[2] })
        .text(COP.format(Number(r.base)), colX[3], startY, { width: colW[3], align: "right" })
        .text(`${Number(r.porcentaje).toFixed(2)}%`, colX[4], startY, { width: colW[4], align: "right" })
        .text(COP.format(Number(r.valor)), colX[5], startY, { width: colW[5], align: "right" });
      startY += 16;
      if (startY > 720) {
        doc.addPage();
        startY = 50;
      }
    }

    // Totales
    doc.moveTo(50, startY + 4).lineTo(545, startY + 4).stroke(GRIS);
    startY += 12;

    if (totalRetefuente > 0) {
      doc.fontSize(8.5).fillColor(NEGRO)
        .text("Total Retención en la Fuente:", colX[0], startY, { width: 350 })
        .text(COP.format(totalRetefuente), colX[5], startY, { width: colW[5], align: "right" });
      startY += 14;
    }
    if (totalReteiva > 0) {
      doc.fontSize(8.5).fillColor(NEGRO)
        .text("Total Retención de IVA:", colX[0], startY, { width: 350 })
        .text(COP.format(totalReteiva), colX[5], startY, { width: colW[5], align: "right" });
      startY += 14;
    }
    if (totalReteica > 0) {
      doc.fontSize(8.5).fillColor(NEGRO)
        .text("Total Retención de ICA:", colX[0], startY, { width: 350 })
        .text(COP.format(totalReteica), colX[5], startY, { width: colW[5], align: "right" });
      startY += 14;
    }

    doc.rect(50, startY, 495, 18).fill("#ecfdf5");
    doc.fontSize(9).fillColor(VERDE)
      .text("TOTAL RETENCIONES:", colX[0], startY + 5, { width: 350, continued: false })
      .text(COP.format(totalGeneral), colX[5], startY + 5, { width: colW[5], align: "right" });

    // Pie
    const pieY = Math.max(startY + 60, 680);
    doc.moveTo(50, pieY).lineTo(545, pieY).stroke(GRIS);
    doc.fontSize(7).fillColor(GRIS)
      .text(`Certificado generado el ${new Date().toLocaleDateString("es-CO")} por ${tenant.nombre}`, 50, pieY + 8, { align: "center" })
      .text("Este documento es válido para efectos tributarios según el Artículo 381 del Estatuto Tributario.", 50, pieY + 18, { align: "center" });

    doc.end();
  } catch (err) {
    console.error("Error en GET /retenciones-proveedor/certificado:", err);
    if (!res.headersSent) res.status(500).json({ error: "Error interno al generar el certificado." });
  }
});

export default router;
