import PDFDocument from "pdfkit";
type PDFDoc = InstanceType<typeof PDFDocument>;
import type { Readable } from "node:stream";
import type { Factura, ItemFactura, Cliente, Tenant, Cotizacion, ItemCotizacion } from "@workspace/db";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", minimumFractionDigits: 0,
});

function fmt(v: string | number | null | undefined) {
  return COP.format(Number(v ?? 0));
}

const VERDE = "#16a34a";
const GRIS  = "#6b7280";
const NEGRO = "#111827";
const CLARO = "#f9fafb";

function encabezado(doc: PDFDoc, tenant: Tenant, titulo: string, subtitulo: string) {
  const col2 = 350;

  if (tenant.logo_base64) {
    try {
      // Extraer solo el data base64 sin el prefijo data:image/...;base64,
      const base64Data = tenant.logo_base64.split(",")[1] ?? tenant.logo_base64;
      const imgBuffer = Buffer.from(base64Data, "base64");
      doc.image(imgBuffer, 50, 45, { height: 45, fit: [140, 45] });
    } catch {
      // Si falla la imagen, cae al texto
      doc.fontSize(20).fillColor(VERDE).text(tenant.nombre, 50, 50);
    }
  } else {
    doc.fontSize(20).fillColor(VERDE).text(tenant.nombre, 50, 50);
  }

  doc.fontSize(8).fillColor(GRIS).text(titulo, 50, 98);
  doc.fontSize(7).fillColor(GRIS).text(subtitulo, 50, 110);

  // Bloque emisor (derecha)
  doc.fontSize(11).fillColor(NEGRO).text(tenant.nombre, col2, 45, { width: 195, align: "right" });
  doc.fontSize(8).fillColor(GRIS)
    .text(`NIT: ${tenant.nit}${tenant.regimen ? `  ·  Régimen ${tenant.regimen === "simplificado" ? "Simplificado" : "Común"}` : ""}`, col2, doc.y, { width: 195, align: "right" });

  if (tenant.direccion || tenant.ciudad) {
    doc.fontSize(7).fillColor(GRIS)
      .text([tenant.direccion, tenant.ciudad].filter(Boolean).join(", "), col2, doc.y, { width: 195, align: "right" });
  }
  if (tenant.telefono || tenant.correo) {
    doc.fontSize(7).fillColor(GRIS)
      .text([tenant.telefono, tenant.correo].filter(Boolean).join("  ·  "), col2, doc.y, { width: 195, align: "right" });
  }
  if (tenant.representante_legal) {
    doc.fontSize(7).fillColor(GRIS)
      .text(`Rep. Legal: ${tenant.representante_legal}`, col2, doc.y, { width: 195, align: "right" });
  }

  doc.moveDown(1.5);
}

function bloqueCliente(doc: PDFDoc, cliente: Cliente) {
  doc.fontSize(9).fillColor(VERDE).text("ADQUIRIENTE", 50, doc.y);
  doc.moveDown(0.3);

  const yc = doc.y;
  const altura = 55 + (cliente.direccion ? 14 : 0);
  doc.roundedRect(50, yc, 495, altura, 4).fill(CLARO).stroke("#e5e7eb");
  doc.fillColor(NEGRO).fontSize(10).text(cliente.nombre, 65, yc + 8);
  doc.fontSize(8).fillColor(GRIS)
    .text(`${cliente.tipo_documento}: ${cliente.numero_documento}`, 65, yc + 24);

  const contactoLinea = [cliente.correo, cliente.telefono, cliente.municipio].filter(Boolean).join("  ·  ");
  if (contactoLinea) {
    doc.fontSize(7).fillColor(GRIS).text(contactoLinea, 65, yc + 38);
  }
  if (cliente.direccion) {
    doc.fontSize(7).fillColor(GRIS).text(cliente.direccion, 65, yc + 50);
  }

  doc.y = yc + altura + 12;
}

function tablaItems(
  doc: PDFDoc,
  items: Array<{
    descripcion: string | null;
    cantidad: string;
    precio_unitario: string;
    descuento_pct?: string | null;
    iva_pct?: string | null;
    total: string;
  }>,
) {
  doc.fontSize(9).fillColor(VERDE).text("ÍTEMS", 50, doc.y);
  doc.moveDown(0.4);

  const yt = doc.y;
  doc.rect(50, yt, 495, 20).fill(VERDE);
  doc.fillColor("white").fontSize(8)
    .text("Descripción",    60,  yt + 6, { width: 200 })
    .text("Cant.",          270, yt + 6, { width: 40,  align: "right" })
    .text("Precio unit.",   315, yt + 6, { width: 80,  align: "right" })
    .text("Desc. %",        400, yt + 6, { width: 40,  align: "right" })
    .text("IVA %",          445, yt + 6, { width: 30,  align: "right" })
    .text("Total",          478, yt + 6, { width: 62,  align: "right" });

  let yi = yt + 20;
  for (const [i, item] of items.entries()) {
    const bg = i % 2 === 0 ? "white" : CLARO;
    doc.rect(50, yi, 495, 18).fill(bg);
    doc.fillColor(NEGRO).fontSize(8)
      .text(item.descripcion ?? "", 60,  yi + 5, { width: 200, ellipsis: true })
      .text(String(Number(item.cantidad)),            270, yi + 5, { width: 40,  align: "right" })
      .text(fmt(item.precio_unitario),                315, yi + 5, { width: 80,  align: "right" })
      .text(`${Number(item.descuento_pct ?? 0)}%`,    400, yi + 5, { width: 40,  align: "right" })
      .text(`${Number(item.iva_pct ?? 0)}%`,          445, yi + 5, { width: 30,  align: "right" })
      .text(fmt(item.total),                          478, yi + 5, { width: 62,  align: "right" });
    yi += 18;
  }

  doc.rect(50, yt, 495, yi - yt).stroke("#e5e7eb");
  doc.y = yi + 10;
}

function tablaTotales(
  doc: PDFDoc,
  subtotal: string,
  descuento_total: string,
  iva_total: string,
  total: string,
  extras?: Array<{ label: string; valor: string; color?: string }>,
) {
  const xT = 350;
  const wT = 195;

  function filaTotal(label: string, valor: string, bold = false, color = NEGRO) {
    const yRow = doc.y;
    doc.fontSize(bold ? 10 : 8)
      .fillColor(bold ? color : GRIS)
      .text(label, xT, yRow, { width: 110 });
    doc.fontSize(bold ? 10 : 8)
      .fillColor(bold ? color : NEGRO)
      .text(valor, xT + 110, yRow, { width: 85, align: "right" });
    doc.moveDown(bold ? 0.5 : 0.4);
  }

  filaTotal("Subtotal",  fmt(subtotal));
  if (Number(descuento_total) > 0) filaTotal("Descuento", `- ${fmt(descuento_total)}`);
  filaTotal("IVA",       fmt(iva_total));

  if (extras) {
    for (const e of extras) {
      filaTotal(e.label, e.valor, false, e.color ?? GRIS);
    }
  }

  doc.moveTo(xT, doc.y).lineTo(xT + wT, doc.y).stroke("#d1d5db");
  doc.moveDown(0.3);
  filaTotal("TOTAL", fmt(total), true, VERDE);
}

function pie(doc: PDFDoc, tenant: Tenant) {
  const texto = tenant.pie_factura
    ?? `Documento generado electrónicamente por Doravia${tenant.sitio_web ? ` · ${tenant.sitio_web}` : ""}`;
  doc.fontSize(7).fillColor(GRIS)
    .text(texto, 50, 780, { width: 495, align: "center" });
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF FACTURA
// ──────────────────────────────────────────────────────────────────────────────
export function generarPdfFactura(
  factura: Factura,
  cliente: Cliente,
  items: ItemFactura[],
  tenant: Tenant,
): Readable {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  encabezado(doc, tenant, "Factura Electrónica de Venta", factura.cufe ? `CUFE: ${factura.cufe.slice(0, 24)}…` : "Factura Electrónica de Venta");

  // Bloque número + fechas
  const y0 = doc.y;
  doc.roundedRect(50, y0, 495, 60, 4).fill(CLARO).stroke("#e5e7eb");
  doc.fillColor(NEGRO).fontSize(14).text(factura.numero, 65, y0 + 10);
  doc.fontSize(8).fillColor(GRIS).text("Número de factura", 65, y0 + 28);

  const fechaEmision = new Date(factura.fecha_emision).toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const fechaVenc = factura.fecha_vencimiento
    ? new Date(factura.fecha_vencimiento).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  doc.fillColor(NEGRO).fontSize(9)
    .text(`Fecha emisión: ${fechaEmision}`,    200, y0 + 10)
    .text(`Fecha vencimiento: ${fechaVenc}`,   200, y0 + 26)
    .text(`Estado: ${factura.estado.toUpperCase()}`, 200, y0 + 42);

  if (factura.cufe) {
    doc.fontSize(7).fillColor(GRIS).text(`CUFE: ${factura.cufe}`, 350, y0 + 10, { width: 190 });
  }

  doc.y = y0 + 72;
  doc.moveDown(0.5);

  bloqueCliente(doc, cliente);
  tablaItems(doc, items);
  tablaTotales(doc, factura.subtotal, factura.descuento_total, factura.iva_total, factura.total);

  if (factura.observaciones) {
    doc.moveDown(1);
    doc.fontSize(8).fillColor(GRIS).text("Observaciones:", 50, doc.y);
    doc.fontSize(8).fillColor(NEGRO).text(factura.observaciones, 50, doc.y, { width: 280 });
  }

  pie(doc, tenant);
  doc.end();
  return doc as unknown as Readable;
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF COTIZACIÓN
// ──────────────────────────────────────────────────────────────────────────────
export function generarPdfCotizacion(
  cotizacion: Cotizacion,
  cliente: Cliente,
  items: ItemCotizacion[],
  tenant: Tenant,
): Readable {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  encabezado(doc, tenant, "Cotización / Oferta Comercial", `Válida hasta: ${cotizacion.fecha_vencimiento ? new Date(cotizacion.fecha_vencimiento).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : "—"}`);

  // Bloque número + fechas
  const y0 = doc.y;
  doc.roundedRect(50, y0, 495, 60, 4).fill(CLARO).stroke("#e5e7eb");
  doc.fillColor(NEGRO).fontSize(14).text(cotizacion.numero, 65, y0 + 10);
  doc.fontSize(8).fillColor(GRIS).text("Número de cotización", 65, y0 + 28);

  const fechaEmision = new Date(cotizacion.fecha_emision).toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const estadoLabel: Record<string, string> = {
    borrador: "BORRADOR",
    enviada: "ENVIADA",
    aceptada: "ACEPTADA",
    rechazada: "RECHAZADA",
    vencida: "VENCIDA",
    convertida: "CONVERTIDA A FACTURA",
  };

  doc.fillColor(NEGRO).fontSize(9)
    .text(`Fecha emisión: ${fechaEmision}`, 200, y0 + 10)
    .text(`Estado: ${estadoLabel[cotizacion.estado] ?? cotizacion.estado}`, 200, y0 + 26);

  doc.y = y0 + 72;
  doc.moveDown(0.5);

  bloqueCliente(doc, cliente);
  tablaItems(doc, items);
  tablaTotales(doc, cotizacion.subtotal, cotizacion.descuento_total, cotizacion.iva_total, cotizacion.total);

  if (cotizacion.observaciones) {
    doc.moveDown(1);
    doc.fontSize(8).fillColor(GRIS).text("Condiciones / Observaciones:", 50, doc.y);
    doc.fontSize(8).fillColor(NEGRO).text(cotizacion.observaciones, 50, doc.y, { width: 280 });
  }

  pie(doc, tenant);
  doc.end();
  return doc as unknown as Readable;
}

// ──────────────────────────────────────────────────────────────────────────────
// RECIBO DE CAJA (pago de factura)
// ──────────────────────────────────────────────────────────────────────────────
export function generarReciboCaja(
  factura: Factura,
  cliente: Cliente,
  tenant: Tenant,
): Readable {
  const doc = new PDFDocument({ margin: 50, size: "A4" });

  const fechaPago = factura.pagada_at ? new Date(factura.pagada_at) : new Date();
  const numRecibo = `RC-${factura.numero}`;

  encabezado(doc, tenant, "Recibo de Caja", numRecibo);

  const y0 = 140;
  const col2 = 350;

  doc.fontSize(9).fillColor(GRIS).text("Número de recibo", 50, y0);
  doc.fontSize(10).fillColor(NEGRO).text(numRecibo, 50, y0 + 12);

  doc.fontSize(9).fillColor(GRIS).text("Fecha de pago", col2, y0);
  doc.fontSize(10).fillColor(NEGRO).text(
    fechaPago.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }),
    col2, y0 + 12,
  );

  doc.moveTo(50, y0 + 32).lineTo(545, y0 + 32).strokeColor("#e5e7eb").stroke();

  const y1 = y0 + 48;
  doc.fontSize(9).fillColor(GRIS).text("Recibimos de", 50, y1);
  doc.fontSize(11).fillColor(NEGRO).font("Helvetica-Bold").text(cliente.nombre, 50, y1 + 12);
  doc.font("Helvetica");
  if (cliente.numero_documento) {
    doc.fontSize(9).fillColor(GRIS).text(`NIT / CC: ${cliente.numero_documento}`, 50, y1 + 26);
  }

  const y2 = y1 + 56;
  doc.moveTo(50, y2).lineTo(545, y2).strokeColor("#e5e7eb").stroke();
  doc.fontSize(9).fillColor(GRIS).text("Concepto", 50, y2 + 12);
  doc.fontSize(9).fillColor(GRIS).text("Valor", 450, y2 + 12, { align: "right", width: 95 });
  doc.moveTo(50, y2 + 26).lineTo(545, y2 + 26).strokeColor("#e5e7eb").stroke();

  const conceptoY = y2 + 36;
  doc.fontSize(10).fillColor(NEGRO).text(`Pago factura ${factura.numero}`, 50, conceptoY);
  doc.fontSize(10).fillColor(NEGRO).text(fmt(factura.total), 350, conceptoY, { align: "right", width: 195 });

  const formas: Record<string, string> = {
    efectivo: "Efectivo", transferencia: "Transferencia bancaria", cheque: "Cheque",
    tarjeta_credito: "Tarjeta crédito", tarjeta_debito: "Tarjeta débito",
    nequi: "Nequi", daviplata: "Daviplata",
  };
  doc.fontSize(9).fillColor(GRIS).text("Forma de pago", 50, conceptoY + 28);
  doc.fontSize(10).fillColor(NEGRO).text(formas[factura.forma_pago ?? "efectivo"] ?? "Efectivo", 50, conceptoY + 40);

  const totalY = conceptoY + 80;
  doc.roundedRect(50, totalY, 495, 52, 6).fill(CLARO);
  doc.fontSize(11).fillColor(GRIS).text("TOTAL RECIBIDO", 70, totalY + 10);
  doc.fontSize(18).fillColor(VERDE).font("Helvetica-Bold").text(fmt(factura.total), 70, totalY + 22, { align: "right", width: 455 });
  doc.font("Helvetica");

  const firmaY = totalY + 100;
  doc.moveTo(50, firmaY + 40).lineTo(220, firmaY + 40).strokeColor(GRIS).stroke();
  doc.fontSize(9).fillColor(GRIS).text("Firma y sello empresa", 50, firmaY + 46);
  doc.moveTo(330, firmaY + 40).lineTo(500, firmaY + 40).strokeColor(GRIS).stroke();
  doc.fontSize(9).fillColor(GRIS).text("Recibido por", 330, firmaY + 46);

  pie(doc, tenant);
  doc.end();
  return doc as unknown as Readable;
}
