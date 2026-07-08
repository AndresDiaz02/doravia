import { Router } from "express";
import { db, clientes, facturas } from "@workspace/db";
import { eq, and, desc, inArray, or, isNull } from "drizzle-orm";
import { audit } from "../services/audit.service.js";
import multer from "multer";
import * as XLSX from "xlsx";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.tenant_id, req.tenantId), eq(clientes.activo, true)))
      .orderBy(clientes.nombre)
      .limit(limit)
      .offset(offset);

    res.json({ data: rows, page, limit });
  } catch (err) {
    console.error("Error en GET /clientes:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// GET /api/clientes/plantilla-importacion — ANTES de /:id para evitar conflicto de ruta
router.get("/plantilla-importacion", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const datos = [
    {
      nombre: "Empresa Ejemplo S.A.S",
      tipo_documento: "NIT",
      numero_documento: "900123456",
      correo: "contacto@empresa.com",
      telefono: "3001234567",
      direccion: "Calle 1 # 2-3",
      municipio: "Bogotá",
      regimen: "", // opcional, no se usa en el insert
    },
    {
      nombre: "Juan Pérez",
      tipo_documento: "CC", // valores válidos: CC, NIT, CE, PPN, TI
      numero_documento: "1234567890",
      correo: "juan@ejemplo.com",
      telefono: "",
      direccion: "",
      municipio: "",
      regimen: "",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(datos);
  ws["!cols"] = [30, 15, 20, 30, 15, 30, 20, 15].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=plantilla_clientes.xlsx");
  res.send(buf);
});

// POST /api/clientes/importar — ANTES de /:id (POST no conflicta con GET /:id pero se mantiene consistente)
router.post("/importar", upload.single("archivo"), async (req, res) => {
  try {
    if (req.userRole !== "admin" && req.userRole !== "vendedor") {
      return res.status(403).json({ error: "Solo administradores o vendedores pueden importar clientes." });
    }

    if (!req.file) return res.status(400).json({ error: "Se requiere un archivo Excel." });

    let rows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
    } catch {
      return res.status(400).json({ error: "No se pudo leer el archivo. Asegúrate de que sea .xlsx o .csv válido." });
    }

    if (rows.length === 0) return res.status(400).json({ error: "El archivo está vacío." });
    if (rows.length > 1000) return res.status(400).json({ error: "Máximo 1000 clientes por importación." });

    const COLUMNAS_REQUERIDAS = ["nombre", "tipo_documento", "numero_documento"];
    const primeraFila = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
    const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !primeraFila.includes(c));
    if (faltantes.length > 0) {
      return res.status(400).json({
        error: `Columnas requeridas faltantes: ${faltantes.join(", ")}. Descarga la plantilla para ver el formato.`,
      });
    }

    // Normalizar claves a minúsculas
    const filas = rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim()]))
    );

    let importados = 0;
    let actualizados = 0;
    const errores: { fila: number; error: string }[] = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const nFila = i + 2; // +2 porque fila 1 es encabezado

      const nombre = fila.nombre;
      const tipo_documento = (fila.tipo_documento ?? "CC").toUpperCase();
      const numero_documento = fila.numero_documento;

      if (!nombre) { errores.push({ fila: nFila, error: "nombre vacío" }); continue; }
      if (!numero_documento) { errores.push({ fila: nFila, error: "numero_documento vacío" }); continue; }

      const TIPOS_VALIDOS = ["CC", "NIT", "CE", "PPN", "TI"];
      if (!TIPOS_VALIDOS.includes(tipo_documento)) {
        errores.push({ fila: nFila, error: `tipo_documento inválido "${tipo_documento}" — debe ser: ${TIPOS_VALIDOS.join(", ")}` });
        continue;
      }

      try {
        // Upsert por (tenant_id, numero_documento)
        const [existente] = await db
          .select({ id: clientes.id })
          .from(clientes)
          .where(and(eq(clientes.tenant_id, req.tenantId), eq(clientes.numero_documento, numero_documento)))
          .limit(1);

        if (existente) {
          await db
            .update(clientes)
            .set({
              nombre,
              correo: fila.correo || null,
              telefono: fila.telefono || null,
            })
            .where(eq(clientes.id, existente.id));
          actualizados++;
        } else {
          await db.insert(clientes).values({
            tenant_id: req.tenantId,
            tipo_persona: tipo_documento === "NIT" ? "juridica" : "natural",
            tipo_documento,
            numero_documento,
            nombre,
            correo: fila.correo || null,
            telefono: fila.telefono || null,
            direccion: fila.direccion || null,
            municipio: fila.municipio || null,
          });
          importados++;
        }
      } catch {
        errores.push({ fila: nFila, error: "Error al guardar el registro" });
      }
    }

    res.json({ importados, actualizados, errores, total: filas.length });
  } catch (err) {
    console.error("Error en POST /clientes/importar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, req.params.id), eq(clientes.tenant_id, req.tenantId)))
      .limit(1);

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

    const historial = await db
      .select({
        id: facturas.id,
        numero: facturas.numero,
        fecha_emision: facturas.fecha_emision,
        estado: facturas.estado,
        total: facturas.total,
      })
      .from(facturas)
      .where(and(eq(facturas.cliente_id, cliente.id), eq(facturas.tenant_id, req.tenantId)))
      .orderBy(desc(facturas.fecha_emision))
      .limit(50);

    res.json({ ...cliente, historial });
  } catch (err) {
    console.error("Error en GET /clientes/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { tipo_persona, tipo_documento, numero_documento, nombre, correo, telefono, direccion, municipio, departamento, digito_verificacion } = req.body;

    if (!tipo_persona || !tipo_documento || !numero_documento || !nombre) {
      return res.status(400).json({ error: "Campos requeridos: tipo_persona, tipo_documento, numero_documento, nombre." });
    }

    const [nuevo] = await db
      .insert(clientes)
      .values({
        tenant_id: req.tenantId,
        tipo_persona,
        tipo_documento,
        numero_documento,
        digito_verificacion: digito_verificacion ?? null,
        nombre,
        correo: correo ?? null,
        telefono: telefono ?? null,
        direccion: direccion ?? null,
        municipio: municipio ?? null,
        departamento: departamento ?? null,
      })
      .returning();

    res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error en POST /clientes:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, req.params.id), eq(clientes.tenant_id, req.tenantId)))
      .limit(1);

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

    const { nombre, correo, telefono, direccion, municipio, departamento } = req.body;

    const [actualizado] = await db
      .update(clientes)
      .set({ nombre, correo, telefono, direccion, municipio, departamento })
      .where(eq(clientes.id, cliente.id))
      .returning();

    res.json(actualizado);
  } catch (err) {
    console.error("Error en PATCH /clientes/:id:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// DELETE /api/clientes/:id/anonimizar — Ley 1581 derecho al olvido
// Anonimiza los datos personales del cliente manteniendo el registro fiscal obligatorio.
// Rechaza si tiene facturas pendientes de pago (obligación tributaria vigente).
router.delete("/:id/anonimizar", async (req, res) => {
  try {
    const [cliente] = await db
      .select()
      .from(clientes)
      .where(and(eq(clientes.id, req.params.id), eq(clientes.tenant_id, req.tenantId)))
      .limit(1);

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado." });

    // Bloquear si hay facturas en borrador/enviadas o aceptadas pero sin pago registrado
    const facturasPendientes = await db
      .select({ id: facturas.id })
      .from(facturas)
      .where(and(
        eq(facturas.cliente_id, cliente.id),
        eq(facturas.tenant_id, req.tenantId),
        or(
          inArray(facturas.estado, ["borrador", "enviada"]),
          and(eq(facturas.estado, "aceptada"), isNull(facturas.pagada_at)),
        ),
      ))
      .limit(1);

    if (facturasPendientes.length > 0) {
      return res.status(422).json({
        error: "No se pueden anonimizar los datos de un cliente con facturas activas o pendientes de pago. Resuelve las facturas primero.",
        code: "FACTURAS_PENDIENTES",
      });
    }

    const [anonimizado] = await db
      .update(clientes)
      .set({
        nombre: "DATOS ELIMINADOS",
        correo: null,
        telefono: null,
        direccion: null,
        municipio: null,
        departamento: null,
        activo: false,
      })
      .where(eq(clientes.id, cliente.id))
      .returning();

    void audit({ tenantId: req.tenantId, userId: req.userId, accion: "cliente.anonimizado", entidadTipo: "cliente", entidadId: cliente.id, detalle: { numero_documento: cliente.numero_documento }, ip: req.ip });
    res.json({ ok: true, id: anonimizado.id });
  } catch (err) {
    console.error("Error en DELETE /clientes/:id/anonimizar:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

export default router;
