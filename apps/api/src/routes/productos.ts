import { Router } from "express";
import { db, productos, TARIFAS_IVA, TIPOS_PRODUCTO } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";
import { ArchivoImportacionInvalido, leerFilasImportacion } from "../lib/spreadsheet-import.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// GET /api/productos/plantilla — descarga plantilla CSV (debe ir ANTES de /:id)
router.get("/plantilla", (_req, res) => {
  const csv = [
    "codigo,nombre,descripcion,tipo,precio_base,iva_pct",
    "PROD001,Producto ejemplo,Descripcion opcional,producto,50000,19",
    "SERV001,Servicio ejemplo,,servicio,80000,19",
  ].join("\r\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=plantilla_productos.csv");
  res.send(csv);
});

// GET /api/productos?page=1&limit=100
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(productos)
    .where(and(eq(productos.tenant_id, req.tenantId), eq(productos.activo, true)))
    .orderBy(productos.nombre)
    .limit(limit)
    .offset(offset);

  res.json({ data: rows, page, limit });
});

// GET /api/productos/:id
router.get("/:id", async (req, res) => {
  const [producto] = await db
    .select()
    .from(productos)
    .where(and(eq(productos.id, req.params.id), eq(productos.tenant_id, req.tenantId)))
    .limit(1);

  if (!producto) return res.status(404).json({ error: "Producto no encontrado." });
  res.json(producto);
});

// POST /api/productos
router.post("/", async (req, res) => {
  const { codigo, nombre, descripcion, categoria, imagen_url, tipo, precio_base, iva_pct, impoconsumo_pct, codigo_barras } = req.body;

  if (!codigo || !nombre || !tipo || precio_base == null) {
    return res.status(400).json({ error: "Campos requeridos: codigo, nombre, tipo, precio_base." });
  }

  if (!(TIPOS_PRODUCTO as readonly string[]).includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser: ${TIPOS_PRODUCTO.join(", ")}.` });
  }

  const ivaPctNum = Number(iva_pct ?? 19);
  if (!(TARIFAS_IVA as readonly number[]).includes(ivaPctNum)) {
    return res.status(400).json({ error: `iva_pct debe ser ${TARIFAS_IVA.join(", ")}.` });
  }

  const impoconsumoPctNum = Number(impoconsumo_pct ?? 0);
  if (imagen_url && !esUrlImagenValida(imagen_url)) {
    return res.status(400).json({ error: "La imagen debe ser una URL http o https válida." });
  }

  const [existente] = await db
    .select({ id: productos.id })
    .from(productos)
    .where(and(eq(productos.tenant_id, req.tenantId), eq(productos.codigo, codigo)))
    .limit(1);

  if (existente) return res.status(422).json({ error: `Ya existe un producto con el código ${codigo}.` });

  const [nuevo] = await db
    .insert(productos)
    .values({
      tenant_id: req.tenantId,
      codigo,
      nombre,
      descripcion: descripcion ?? null,
      categoria: categoria?.trim() || null,
      imagen_url: imagen_url?.trim() || null,
      tipo,
      precio_base: String(precio_base),
      iva_pct: String(ivaPctNum),
      impoconsumo_pct: String(impoconsumoPctNum),
      codigo_barras: codigo_barras ?? null,
    })
    .returning();

  res.status(201).json(nuevo);
});

// PATCH /api/productos/:id
router.patch("/:id", async (req, res) => {
  const [producto] = await db
    .select()
    .from(productos)
    .where(and(eq(productos.id, req.params.id), eq(productos.tenant_id, req.tenantId)))
    .limit(1);

  if (!producto) return res.status(404).json({ error: "Producto no encontrado." });

  const { nombre, descripcion, categoria, imagen_url, precio_base, iva_pct, impoconsumo_pct, codigo_barras, activo } = req.body;

  if (iva_pct !== undefined && !(TARIFAS_IVA as readonly number[]).includes(Number(iva_pct))) {
    return res.status(400).json({ error: `iva_pct debe ser ${TARIFAS_IVA.join(", ")}.` });
  }
  if (imagen_url && !esUrlImagenValida(imagen_url)) {
    return res.status(400).json({ error: "La imagen debe ser una URL http o https válida." });
  }

  const [actualizado] = await db
    .update(productos)
    .set({
      ...(nombre !== undefined && { nombre }),
      ...(descripcion !== undefined && { descripcion }),
      ...(categoria !== undefined && { categoria: categoria?.trim() || null }),
      ...(imagen_url !== undefined && { imagen_url: imagen_url?.trim() || null }),
      ...(precio_base !== undefined && { precio_base: String(precio_base) }),
      ...(iva_pct !== undefined && { iva_pct: String(iva_pct) }),
      ...(impoconsumo_pct !== undefined && { impoconsumo_pct: String(Number(impoconsumo_pct)) }),
      ...(codigo_barras !== undefined && { codigo_barras: codigo_barras ?? null }),
      ...(activo !== undefined && { activo }),
    })
    .where(eq(productos.id, producto.id))
    .returning();

  res.json(actualizado);
});

// POST /api/productos/importar — importa desde Excel o CSV
router.post("/importar", upload.single("archivo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Se requiere un archivo Excel o CSV." });

  let rows: Record<string, unknown>[];
  try {
    rows = leerFilasImportacion(req.file, 1000);
  } catch (err) {
    const error = err instanceof ArchivoImportacionInvalido
      ? err.message
      : "No se pudo leer el archivo. Asegúrate de que sea .xlsx o .csv válido.";
    return res.status(400).json({ error });
  }

  if (rows.length === 0) return res.status(400).json({ error: "El archivo está vacío." });
  if (rows.length > 1000) return res.status(400).json({ error: "Máximo 1000 productos por importación." });

  const COLUMNAS = ["codigo", "nombre", "tipo", "precio_base"];
  const primeraFila = Object.keys(rows[0]).map((k) => k.toLowerCase().trim());
  const faltantes = COLUMNAS.filter((c) => !primeraFila.includes(c));
  if (faltantes.length > 0) {
    return res.status(400).json({ error: `Columnas requeridas faltantes: ${faltantes.join(", ")}. Descarga la plantilla para ver el formato.` });
  }

  // Normalizar claves a minúsculas
  const filas = rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim()]))
  );

  let creados = 0;
  let actualizados = 0;
  const errores: { fila: number; mensaje: string }[] = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nFila = i + 2; // +2 porque fila 1 es encabezado

    const codigo = fila.codigo;
    const nombre = fila.nombre;
    const tipo = (fila.tipo || "producto").toLowerCase();
    const precio_base = Number(fila.precio_base);
    const iva_pct = fila.iva_pct ? Number(fila.iva_pct) : 19;
    const descripcion = fila.descripcion || null;

    if (!codigo) { errores.push({ fila: nFila, mensaje: "codigo vacío" }); continue; }
    if (!nombre) { errores.push({ fila: nFila, mensaje: "nombre vacío" }); continue; }
    if (!(TIPOS_PRODUCTO as readonly string[]).includes(tipo)) {
      errores.push({ fila: nFila, mensaje: `tipo inválido "${tipo}" — debe ser: ${TIPOS_PRODUCTO.join(", ")}` }); continue;
    }
    if (isNaN(precio_base) || precio_base < 0) {
      errores.push({ fila: nFila, mensaje: "precio_base inválido" }); continue;
    }
    if (!(TARIFAS_IVA as readonly number[]).includes(iva_pct)) {
      errores.push({ fila: nFila, mensaje: `iva_pct inválido ${iva_pct} — debe ser: ${TARIFAS_IVA.join(", ")}` }); continue;
    }

    const [existente] = await db
      .select({ id: productos.id })
      .from(productos)
      .where(and(eq(productos.tenant_id, req.tenantId), eq(productos.codigo, codigo)))
      .limit(1);

    if (existente) {
      await db
        .update(productos)
        .set({ nombre, descripcion, tipo: tipo as typeof TIPOS_PRODUCTO[number], precio_base: String(precio_base), iva_pct: String(iva_pct) })
        .where(eq(productos.id, existente.id));
      actualizados++;
    } else {
      await db.insert(productos).values({
        tenant_id: req.tenantId,
        codigo,
        nombre,
        descripcion,
        tipo: tipo as typeof TIPOS_PRODUCTO[number],
        precio_base: String(precio_base),
        iva_pct: String(iva_pct),
      });
      creados++;
    }
  }

  res.json({ creados, actualizados, errores, total: filas.length });
});

export default router;

function esUrlImagenValida(valor: unknown) {
  if (typeof valor !== "string") return false;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
