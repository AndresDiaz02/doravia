/**
 * Servicio Plemsi — integración con facturación electrónica DIAN Colombia
 * URL pruebas:    https://pruebas.plemsi.com
 * URL producción: configurar PLEMSI_URL en Railway
 * Auth: Authorization: Bearer {api_key} — el token es estático, lo da Plemsi por empresa
 */

const PLEMSI_BASE = process.env.PLEMSI_URL ?? "https://pruebas.plemsi.com";

function headersParaTenant(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/** Determina municipality_id desde ciudad. Fallback 149 = Bogotá */
function municipioId(ciudad?: string | null): number {
  if (!ciudad) return 149;
  const c = ciudad.toLowerCase().trim();
  const mapa: Record<string, number> = {
    bogota: 149, "bogotá": 149,
    medellin: 675, "medellín": 675,
    cali: 763,
    barranquilla: 20,
    cartagena: 13,
    bucaramanga: 809,
    pereira: 660,
    manizales: 534,
    cucuta: 228, "cúcuta": 228,
    ibague: 405, "ibagué": 405,
    villavicencio: 911,
  };
  return mapa[c] ?? 149;
}

/** Determina payment_method_id desde método de pago de Doravia */
export function metodoPagoId(metodo?: string | null): number {
  const m: Record<string, number> = {
    efectivo: 10,
    tarjeta: 30,
    tarjeta_credito: 30,
    tarjeta_debito: 42,
    transferencia: 48,
    nequi: 48,
    daviplata: 48,
    cheque: 20,
  };
  return m[(metodo ?? "efectivo").toLowerCase()] ?? 10;
}

/** Calcula dígito de verificación del NIT */
function calcularDV(nit: string): string {
  const primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = nit.replace(/\D/g, "").split("").reverse();
  const suma = digits.reduce((acc, d, i) => acc + parseInt(d) * (primos[i] ?? 1), 0);
  const residuo = suma % 11;
  return residuo < 2 ? String(residuo) : String(11 - residuo);
}

export interface PersonaDatos {
  nit: string;
  dv?: string | null;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  tipo_persona?: string | null;
  regimen?: string | null;
}

/** Construye objeto buyer/seller desde datos del tenant o cliente */
export function buildPersona(datos: PersonaDatos) {
  const nitLimpio = datos.nit.replace(/\D/g, "");
  return {
    identification_number: nitLimpio,
    dv: datos.dv ?? calcularDV(nitLimpio),
    name: datos.nombre,
    phone: datos.telefono ?? "0000000000",
    address: datos.direccion ?? "Sin dirección",
    postal_zone_code: "11001",
    email: datos.email ?? "facturacion@empresa.com",
    merchant_registration: "0000000-0",
    type_document_identification_id: 3, // NIT
    type_organization_id: datos.tipo_persona === "natural" ? 2 : 1,
    type_liability_id: datos.regimen === "simplificado" ? 118 : 117,
    municipality_id: municipioId(datos.ciudad),
    type_regime_id: datos.regimen === "simplificado" ? 1 : 2,
  };
}

export interface ItemInput {
  descripcion: string;
  codigo?: string | null;
  cantidad: number | string;
  precio_unitario: number | string;
  descuento?: number | string | null;
  iva_porcentaje?: number | string | null;
}

/** Construye items para Plemsi desde items de Doravia */
export function buildItems(items: ItemInput[]) {
  return items.map((item) => {
    const qty = Number(item.cantidad);
    const precio = Number(item.precio_unitario);
    const descPct = Number(item.descuento ?? 0);
    const ivaPct = Number(item.iva_porcentaje ?? 19);
    const baseItem = Math.round(precio * qty);
    const descMonto = Math.round(baseItem * descPct / 100);
    const baseGravable = baseItem - descMonto;
    const ivaMonto = Math.round(baseGravable * ivaPct / 100);

    return {
      unit_measure_id: 70,
      line_extension_amount: baseItem,
      free_of_charge_indicator: false,
      ...(descMonto > 0 ? {
        allowance_charges: [{
          charge_indicator: false,
          allowance_charge_reason: "Descuento",
          multiplier_factor_numeric: descPct / 100,
          amount: descMonto,
          base_amount: baseItem,
        }],
      } : {}),
      tax_totals: ivaPct > 0 ? [{
        tax_id: 1,
        percent: ivaPct,
        tax_amount: ivaMonto,
        taxable_amount: baseGravable,
      }] : [],
      description: item.descripcion,
      code: item.codigo ?? "GEN",
      type_item_identification_id: 4,
      price_amount: precio,
      base_quantity: qty,
      invoiced_quantity: qty,
    };
  });
}

export interface ResultadoPlemsi {
  ok: boolean;
  cufe?: string;
  plemsi_id?: string;
  error?: string;
}

type PlemsiItems = ReturnType<typeof buildItems>;
type PlemsiPersona = ReturnType<typeof buildPersona>;

interface TotalesPlemsi {
  invoiceBaseTotal: number;
  invoiceTaxExclusiveTotal: number;
  invoiceTaxInclusiveTotal: number;
  totalToPay: number;
  allTaxTotals: Array<{ tax_id: number; tax_amount: number; percent: number; taxable_amount: number }>;
}

/** Calcula totales a partir de los items construidos para Plemsi */
export function calcularTotalesPlemsi(items: PlemsiItems): TotalesPlemsi {
  let invoiceTaxExclusiveTotal = 0; // base gravable total
  let totalIva = 0;

  for (const item of items) {
    const baseItem = item.line_extension_amount;
    const descuento = item.allowance_charges?.[0]?.amount ?? 0;
    const baseGravable = baseItem - descuento;
    invoiceTaxExclusiveTotal += baseGravable;
    for (const t of item.tax_totals) {
      totalIva += t.tax_amount;
    }
  }

  const invoiceBaseTotal = invoiceTaxExclusiveTotal; // subtotal sin IVA
  const invoiceTaxInclusiveTotal = invoiceTaxExclusiveTotal + totalIva;
  const totalToPay = invoiceTaxInclusiveTotal;

  // Consolidar impuestos
  const mapaIva = new Map<number, { tax_id: number; tax_amount: number; percent: number; taxable_amount: number }>();
  for (const item of items) {
    for (const t of item.tax_totals) {
      const existing = mapaIva.get(t.percent);
      if (existing) {
        existing.tax_amount += t.tax_amount;
        existing.taxable_amount += t.taxable_amount;
      } else {
        mapaIva.set(t.percent, { tax_id: t.tax_id, percent: t.percent, tax_amount: t.tax_amount, taxable_amount: t.taxable_amount });
      }
    }
  }

  return {
    invoiceBaseTotal,
    invoiceTaxExclusiveTotal,
    invoiceTaxInclusiveTotal,
    totalToPay,
    allTaxTotals: Array.from(mapaIva.values()),
  };
}

/** Emite factura electrónica de venta */
export async function emitirFactura(params: {
  apiKey: string;
  prefix: string;
  number: number;
  resolution: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM:SS
  buyer: PlemsiPersona;
  items: PlemsiItems;
  payment_form_id?: number;
  payment_method_id?: number;
  payment_due_date?: string;
  invoiceBaseTotal: number;
  invoiceTaxExclusiveTotal: number;
  invoiceTaxInclusiveTotal: number;
  totalToPay: number;
  allTaxTotals: Array<{ tax_id: number; tax_amount: number; percent: number; taxable_amount: number }>;
  head_note?: string;
  foot_note?: string;
}): Promise<ResultadoPlemsi> {
  try {
    const body = {
      date: params.date,
      time: params.time ?? new Date().toTimeString().slice(0, 8),
      prefix: params.prefix,
      number: params.number,
      resolution: params.resolution,
      customer: params.buyer,
      payment: {
        payment_form_id: params.payment_form_id ?? 1,
        payment_method_id: params.payment_method_id ?? 10,
        payment_due_date: params.payment_due_date ?? params.date,
        duration_measure: "0",
      },
      items: params.items.map((item) => ({
        ...item,
        line_extension_amount: Number(item.line_extension_amount).toFixed(2),
        price_amount: Number(item.price_amount).toFixed(2),
        base_quantity: Number(item.base_quantity).toFixed(4),
        invoiced_quantity: Number(item.invoiced_quantity).toFixed(4),
        tax_totals: item.tax_totals.map((t) => ({
          ...t,
          tax_amount: Number(t.tax_amount).toFixed(2),
          percent: Number(t.percent).toFixed(2),
          taxable_amount: Number(t.taxable_amount).toFixed(2),
        })),
        ...(item.allowance_charges ? {
          allowance_charges: item.allowance_charges.map((a) => ({
            ...a,
            amount: Number(a.amount).toFixed(2),
            base_amount: Number(a.base_amount).toFixed(2),
          })),
        } : {}),
      })),
      generalAllowances: [],
      head_note: params.head_note ?? "",
      foot_note: params.foot_note ?? "",
      allowanceTotal: "0.00",
      invoiceBaseTotal: params.invoiceBaseTotal.toFixed(2),
      invoiceTaxExclusiveTotal: params.invoiceTaxExclusiveTotal.toFixed(2),
      invoiceTaxInclusiveTotal: params.invoiceTaxInclusiveTotal.toFixed(2),
      totalToPay: params.totalToPay.toFixed(2),
      allTaxTotals: params.allTaxTotals.map((t) => ({
        tax_id: t.tax_id,
        tax_amount: t.tax_amount.toFixed(2),
        percent: t.percent.toFixed(2),
        taxable_amount: t.taxable_amount.toFixed(2),
      })),
    };

    const res = await fetch(`${PLEMSI_BASE}/api/billing/invoice`, {
      method: "POST",
      headers: headersParaTenant(params.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const rawText = await res.text();
    console.log(`[PLEMSI] POST /api/billing/invoice → status=${res.status} body=${rawText.slice(0, 600)}`);

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return { ok: false, error: `Plemsi devolvió respuesta no-JSON (status ${res.status}): ${rawText.slice(0, 200)}` };
    }

    if (!res.ok) {
      return { ok: false, error: `Plemsi ${res.status}: ${JSON.stringify(json)}` };
    }

    // Plemsi puede devolver el CUFE en el nivel raíz o dentro de json.data
    const data = (typeof json.data === "object" && json.data !== null ? json.data : json) as Record<string, unknown>;
    return {
      ok: true,
      cufe: (data.cufe ?? data.uuid ?? data.XmlDocumentKey ?? json.cufe ?? json.uuid) as string | undefined,
      plemsi_id: (data.id ?? json.id ?? json.uuid) as string | undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de conexión con Plemsi" };
  }
}

/** Emite nota crédito */
export async function emitirNotaCredito(params: {
  apiKey: string;
  prefix: string;
  number: number;
  resolution: string;
  discrepancy_code: number;
  discrepancy_description: string;
  buyer: PlemsiPersona;
  items: PlemsiItems;
  invoice_reference: { cufe: string; number: string; date: string };
  invoiceBaseTotal: number;
  invoiceTaxExclusiveTotal: number;
  invoiceTaxInclusiveTotal: number;
  totalToPay: number;
  allTaxTotals: Array<{ tax_id: number; tax_amount: number; percent: number; taxable_amount: number }>;
}): Promise<ResultadoPlemsi> {
  try {
    const body = {
      prefix: params.prefix,
      number: params.number,
      resolution: params.resolution,
      discrepancy: { code: params.discrepancy_code, description: params.discrepancy_description },
      buyer: params.buyer,
      items: params.items,
      invoiceReference: {
        issue_date: params.invoice_reference.date,
        uuid: params.invoice_reference.cufe,
        number: params.invoice_reference.number,
      },
      generalAllowances: [],
      allowanceTotal: 0,
      invoiceBaseTotal: params.invoiceBaseTotal,
      invoiceTaxExclusiveTotal: params.invoiceTaxExclusiveTotal,
      invoiceTaxInclusiveTotal: params.invoiceTaxInclusiveTotal,
      totalToPay: params.totalToPay,
      allTaxTotals: params.allTaxTotals,
    };

    const res = await fetch(`${PLEMSI_BASE}/api/billing/credit`, {
      method: "POST",
      headers: headersParaTenant(params.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: (json.message as string) ?? `Error Plemsi ${res.status}` };
    return {
      ok: true,
      cufe: (json.cude ?? json.cufe ?? json.id) as string | undefined,
      plemsi_id: (json.id) as string | undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de conexión con Plemsi" };
  }
}

/** Emite documento equivalente POS */
export async function emitirDocumentoPOS(params: {
  apiKey: string;
  prefix: string;
  number: number;
  resolution: string;
  date: string;
  time?: string;
  items: PlemsiItems;
  payment_method_id?: number;
  invoiceBaseTotal: number;
  invoiceTaxExclusiveTotal: number;
  invoiceTaxInclusiveTotal: number;
  totalToPay: number;
  allTaxTotals: Array<{ tax_id: number; tax_amount: number; percent: number; taxable_amount: number }>;
  softwareManufacturer?: { ownerName: string; softwareName: string; companyName: string };
  cashierName?: string;
}): Promise<ResultadoPlemsi> {
  try {
    const body = {
      number: params.number,
      date: params.date,
      time: params.time ?? new Date().toTimeString().slice(0, 8),
      resolution: params.resolution,
      prefix: params.prefix,
      softwareManufacturer: params.softwareManufacturer ?? {
        ownerName: "Doravia", softwareName: "Doravia ERP", companyName: "Doravia S.A.S",
      },
      ...(params.cashierName ? { payPointInfo: { cashierName: params.cashierName, payPointType: "Caja" } } : {}),
      payment: {
        payment_form_id: 1,
        payment_method_id: params.payment_method_id ?? 10,
        payment_due_date: params.date,
        duration_measure: "1",
      },
      items: params.items,
      // POS espera strings según la documentación de Plemsi
      invoiceBaseTotal: String(params.invoiceBaseTotal),
      invoiceTaxExclusiveTotal: String(params.invoiceTaxExclusiveTotal),
      invoiceTaxInclusiveTotal: String(params.invoiceTaxInclusiveTotal),
      totalToPay: String(params.totalToPay),
      allTaxTotals: params.allTaxTotals,
    };

    const res = await fetch(`${PLEMSI_BASE}/api/equivalent/pos`, {
      method: "POST",
      headers: headersParaTenant(params.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: (json.message as string) ?? `Error Plemsi ${res.status}` };
    return {
      ok: true,
      cufe: (json.cude ?? json.uuid ?? json.id) as string | undefined,
      plemsi_id: (json.id) as string | undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de conexión con Plemsi" };
  }
}

/** Registra resolución en Plemsi */
export async function registrarResolucion(params: {
  apiKey: string;
  prefix: string;
  resolution: string;
  resolution_date: string;
  date_from: string;
  date_to: string;
  from: number;
  to: number;
  type_document_id?: number; // 1=Factura, 5=POS
}): Promise<ResultadoPlemsi> {
  try {
    const body = {
      date_from: params.date_from,
      date_to: params.date_to,
      prefix: params.prefix,
      from: params.from,
      to: params.to,
      resolution: params.resolution,
      resolution_date: params.resolution_date,
      type_resolution: 1,
      type_document_id: params.type_document_id ?? 1,
    };
    const res = await fetch(`${PLEMSI_BASE}/api/billing/resolution`, {
      method: "POST",
      headers: headersParaTenant(params.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: (json.message as string) ?? `Error Plemsi ${res.status}` };
    return { ok: true, plemsi_id: (json.id) as string | undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de conexión con Plemsi" };
  }
}

/** Consulta folios restantes */
export async function obtenerFoliosRestantes(apiKey: string, resolution?: string): Promise<number | null> {
  try {
    const url = resolution
      ? `${PLEMSI_BASE}/api/billing/resolution/remaining-numbers/${resolution}`
      : `${PLEMSI_BASE}/api/billing/resolution/remaining-numbers`;
    const res = await fetch(url, { headers: headersParaTenant(apiKey), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    return (json.remaining ?? json.folios_restantes) as number ?? null;
  } catch {
    return null;
  }
}
