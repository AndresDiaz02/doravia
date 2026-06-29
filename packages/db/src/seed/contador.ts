/**
 * Entorno de simulación contable para revisión por contador externo.
 *
 * Empresa Demo Contador SAS — Régimen Ordinario — CIIU 4719
 * Plan: raíz (accounting_level=2 → balance general + estado de resultados)
 *
 * Credenciales:
 *   Admin:    admin@demo-contador.doraviasoft.com   / Contador.2026!
 *   Contador: contador.externo@doraviasoft.com      / Contador.2026!
 *
 * Ejecución:
 *   pnpm --filter @workspace/db exec tsx src/seed/contador.ts
 */

import bcrypt from "bcryptjs";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  asientos_contables,
  bodegas,
  cuentas_contables,
  db,
  facturas,
  gastos,
  items_factura,
  items_nota_credito,
  lineas_asiento,
  movimientos_inventario,
  notas_credito,
  clientes,
  plans,
  productos,
  proveedores,
  resoluciones_dian,
  retenciones_config,
  retenciones_factura,
  tenants,
  users,
} from "../index.js";

// ── Credenciales ──────────────────────────────────────────────────────────────

const ADMIN_EMAIL    = "admin@demo-contador.doraviasoft.com";
const CONTADOR_EMAIL = "contador.externo@doraviasoft.com";
const PASSWORD       = "Contador.2026!";

// ── Precios y tasas IVA de los 11 productos (índice 0–10) ────────────────────

const PROD_PRICES: number[] = [12500, 5200, 15800, 8500, 12000, 8500, 45000, 38000, 25000, 18000, 35000];
const PROD_IVAS: number[]   = [0,     0,    0,     5,    5,     19,   19,    19,    19,    19,    19   ];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCuenta(tenantId: string, codigo: string) {
  const [c] = await db
    .select({ id: cuentas_contables.id })
    .from(cuentas_contables)
    .where(
      and(
        eq(cuentas_contables.codigo, codigo),
        or(eq(cuentas_contables.tenant_id, tenantId), isNull(cuentas_contables.tenant_id)),
      ),
    )
    .orderBy(cuentas_contables.tenant_id)
    .limit(1);
  if (!c) throw new Error(`Cuenta PUC ${codigo} no encontrada. Ejecuta el seed principal primero.`);
  return c;
}

let asientoSeq = 0;
function nextAsientoNum(anio: number) {
  return `AC-${anio}-${String(++asientoSeq).padStart(5, "0")}`;
}

function calcItemTotals(qty: number, price: number, ivaPct: number) {
  const sub = Number((qty * price).toFixed(2));
  const ivaV = Number((sub * ivaPct / 100).toFixed(2));
  return { subtotal: sub, iva_valor: ivaV, total: sub + ivaV };
}

// ── Spec de facturas ──────────────────────────────────────────────────────────
//
// [cidx, fecha, condicion_pago, fecha_vencimiento|null, items[[pidx,qty]...], reteConfigIdx[], pagada_at|null, extra]
// extra: "anulada" | "nc_devolucion" | "nc_descuento" | undefined

type FacturaSpec = {
  cidx:   number;
  fecha:  string;
  cond:   "contado" | "credito";
  vcto:   string | null;
  items:  [number, number][];    // [pidx, qty]
  retes:  number[];              // índices en RC[]
  pagada: string | null;         // fecha pagada_at o null
  extra?: "anulada" | "nc_dev" | "nc_desc";
};

const SPECS: FacturaSpec[] = [
  // ── ABRIL 2026 ────────────────────────────────────────────────────────────
  { cidx:7,  fecha:"2026-04-02", cond:"contado", vcto:null,         items:[[0,10],[5,5],[6,3]],     retes:[],  pagada:"2026-04-02" },
  { cidx:0,  fecha:"2026-04-03", cond:"credito", vcto:"2026-05-03", items:[[0,20],[3,10]],           retes:[0,2], pagada:"2026-05-05" },
  { cidx:2,  fecha:"2026-04-05", cond:"contado", vcto:null,         items:[[6,2],[7,1]],             retes:[],  pagada:"2026-04-05" },
  { cidx:1,  fecha:"2026-04-07", cond:"contado", vcto:null,         items:[[0,50],[1,20]],           retes:[],  pagada:"2026-04-08" },
  { cidx:5,  fecha:"2026-04-09", cond:"credito", vcto:"2026-05-09", items:[[2,15],[4,10]],           retes:[],  pagada:null },
  { cidx:10, fecha:"2026-04-10", cond:"contado", vcto:null,         items:[[6,5],[9,10]],            retes:[0,2], pagada:"2026-04-10" },
  { cidx:4,  fecha:"2026-04-12", cond:"contado", vcto:null,         items:[[0,3],[1,5],[3,2]],       retes:[],  pagada:"2026-04-14" },
  { cidx:12, fecha:"2026-04-14", cond:"credito", vcto:"2026-05-14", items:[[5,30],[8,15]],           retes:[],  pagada:null },
  { cidx:3,  fecha:"2026-04-15", cond:"credito", vcto:"2026-05-15", items:[[0,100],[3,50]],          retes:[0,2], pagada:null },
  { cidx:6,  fecha:"2026-04-16", cond:"contado", vcto:null,         items:[[7,1],[9,2]],             retes:[],  pagada:"2026-04-17" },
  { cidx:8,  fecha:"2026-04-18", cond:"contado", vcto:null,         items:[[4,20],[3,30]],           retes:[],  pagada:"2026-04-20" },
  { cidx:11, fecha:"2026-04-20", cond:"contado", vcto:null,         items:[[6,1]],                   retes:[],  pagada:"2026-04-20" },
  { cidx:1,  fecha:"2026-04-22", cond:"credito", vcto:"2026-05-22", items:[[5,30],[7,5],[10,1]],     retes:[],  pagada:null, extra:"anulada" },
  { cidx:9,  fecha:"2026-04-24", cond:"contado", vcto:null,         items:[[0,5],[1,2]],             retes:[],  pagada:"2026-04-25" },
  { cidx:0,  fecha:"2026-04-26", cond:"credito", vcto:"2026-06-10", items:[[5,15],[9,20]],           retes:[0,2], pagada:null },
  { cidx:2,  fecha:"2026-04-28", cond:"contado", vcto:null,         items:[[2,4],[4,2]],             retes:[],  pagada:null },
  // ── MAYO 2026 ─────────────────────────────────────────────────────────────
  { cidx:7,  fecha:"2026-05-02", cond:"contado", vcto:null,         items:[[0,25],[5,10],[6,5]],     retes:[],  pagada:"2026-05-02" },
  { cidx:5,  fecha:"2026-05-04", cond:"credito", vcto:"2026-06-03", items:[[2,30],[4,15]],           retes:[],  pagada:null },
  { cidx:10, fecha:"2026-05-06", cond:"contado", vcto:null,         items:[[6,10],[7,5]],            retes:[0,2], pagada:"2026-05-08" },
  { cidx:4,  fecha:"2026-05-08", cond:"contado", vcto:null,         items:[[0,5],[1,3],[3,4]],       retes:[],  pagada:"2026-05-09" },
  { cidx:3,  fecha:"2026-05-09", cond:"credito", vcto:"2026-06-08", items:[[5,50],[8,20]],           retes:[0,2], pagada:null },
  { cidx:12, fecha:"2026-05-11", cond:"contado", vcto:null,         items:[[9,10],[10,5]],           retes:[],  pagada:"2026-05-11" },
  { cidx:1,  fecha:"2026-05-13", cond:"contado", vcto:null,         items:[[0,40],[1,25]],           retes:[],  pagada:"2026-05-14" },
  { cidx:6,  fecha:"2026-05-14", cond:"contado", vcto:null,         items:[[8,2],[9,3]],             retes:[],  pagada:"2026-05-15" },
  { cidx:8,  fecha:"2026-05-16", cond:"credito", vcto:"2026-06-15", items:[[3,25],[4,20]],           retes:[],  pagada:null },
  { cidx:11, fecha:"2026-05-18", cond:"contado", vcto:null,         items:[[6,2],[7,1]],             retes:[],  pagada:null },
  { cidx:0,  fecha:"2026-05-20", cond:"credito", vcto:"2026-07-19", items:[[0,30],[5,15]],           retes:[0,2], pagada:"2026-07-20" },
  { cidx:9,  fecha:"2026-05-21", cond:"contado", vcto:null,         items:[[1,10],[2,3]],            retes:[],  pagada:"2026-05-22" },
  { cidx:2,  fecha:"2026-05-22", cond:"contado", vcto:null,         items:[[6,3],[8,2]],             retes:[],  pagada:null },
  { cidx:7,  fecha:"2026-05-23", cond:"contado", vcto:null,         items:[[5,20],[9,15]],           retes:[],  pagada:"2026-05-24" },
  { cidx:5,  fecha:"2026-05-26", cond:"contado", vcto:null,         items:[[2,20],[3,10]],           retes:[],  pagada:"2026-05-28", extra:"nc_dev" },
  { cidx:10, fecha:"2026-05-27", cond:"credito", vcto:"2026-07-26", items:[[7,8],[8,5]],             retes:[0,2], pagada:null, extra:"anulada" },
  { cidx:4,  fecha:"2026-05-28", cond:"contado", vcto:null,         items:[[7,2],[9,4]],             retes:[],  pagada:"2026-05-30" },
  { cidx:3,  fecha:"2026-05-29", cond:"credito", vcto:"2026-07-28", items:[[5,15],[6,10]],           retes:[0,2], pagada:null },
  { cidx:12, fecha:"2026-05-30", cond:"contado", vcto:null,         items:[[10,5]],                  retes:[],  pagada:"2026-05-30" },
  // ── JUNIO 2026 ────────────────────────────────────────────────────────────
  { cidx:1,  fecha:"2026-06-02", cond:"contado", vcto:null,         items:[[0,20],[5,15]],           retes:[],  pagada:null },
  { cidx:0,  fecha:"2026-06-03", cond:"credito", vcto:"2026-08-02", items:[[6,10],[7,8]],            retes:[0,2], pagada:null },
  { cidx:8,  fecha:"2026-06-05", cond:"contado", vcto:null,         items:[[3,30],[4,15]],           retes:[],  pagada:"2026-06-06" },
  { cidx:7,  fecha:"2026-06-07", cond:"contado", vcto:null,         items:[[0,10],[2,5]],            retes:[],  pagada:null },
  { cidx:4,  fecha:"2026-06-09", cond:"contado", vcto:null,         items:[[6,1],[9,2]],             retes:[],  pagada:null },
  { cidx:2,  fecha:"2026-06-10", cond:"contado", vcto:null,         items:[[0,5],[3,3]],             retes:[],  pagada:null },
  { cidx:5,  fecha:"2026-06-11", cond:"credito", vcto:"2026-07-11", items:[[2,25],[4,15]],           retes:[],  pagada:null },
  { cidx:10, fecha:"2026-06-13", cond:"contado", vcto:null,         items:[[6,5],[10,3]],            retes:[0,2], pagada:"2026-06-13" },
  { cidx:6,  fecha:"2026-06-16", cond:"contado", vcto:null,         items:[[5,3],[8,1]],             retes:[],  pagada:null },
  { cidx:12, fecha:"2026-06-17", cond:"contado", vcto:null,         items:[[5,10],[9,8]],            retes:[],  pagada:null },
  { cidx:9,  fecha:"2026-06-18", cond:"contado", vcto:null,         items:[[1,5],[2,2]],             retes:[],  pagada:null },
  { cidx:3,  fecha:"2026-06-19", cond:"credito", vcto:"2026-08-18", items:[[5,20],[6,15]],           retes:[0,2], pagada:null, extra:"nc_desc" },
  { cidx:11, fecha:"2026-06-21", cond:"contado", vcto:null,         items:[[7,2]],                   retes:[],  pagada:null },
  { cidx:0,  fecha:"2026-06-23", cond:"credito", vcto:"2026-08-22", items:[[0,50],[5,30]],           retes:[0,2], pagada:null, extra:"anulada" },
  { cidx:1,  fecha:"2026-06-25", cond:"contado", vcto:null,         items:[[5,20],[8,10]],           retes:[],  pagada:null },
];

// ── Gastos spec ───────────────────────────────────────────────────────────────

type GastoSpec = {
  fecha:    string;
  prov_idx: number | null;
  cat:      string;
  desc:     string;
  monto:    number;
  iva:      number;
  vcto:     string | null;
  aprobado: boolean;
  pagado:   string | null;  // fecha pagado_at
};

const GASTOS_SPECS: GastoSpec[] = [
  // Arrendamiento mensual (3 meses)
  { fecha:"2026-04-01", prov_idx:0, cat:"arrendamiento", desc:"Arriendo local comercial Calle 72 — Abril 2026",    monto:3200000, iva:0,      vcto:"2026-04-05", aprobado:true, pagado:"2026-04-04" },
  { fecha:"2026-05-01", prov_idx:0, cat:"arrendamiento", desc:"Arriendo local comercial Calle 72 — Mayo 2026",     monto:3200000, iva:0,      vcto:"2026-05-05", aprobado:true, pagado:"2026-05-03" },
  { fecha:"2026-06-01", prov_idx:0, cat:"arrendamiento", desc:"Arriendo local comercial Calle 72 — Junio 2026",    monto:3200000, iva:0,      vcto:"2026-06-05", aprobado:true, pagado:"2026-06-04" },
  // Servicios públicos
  { fecha:"2026-04-10", prov_idx:1, cat:"servicios_publicos", desc:"Energía eléctrica — Abril 2026",               monto:380000,  iva:72200,  vcto:"2026-04-20", aprobado:true, pagado:"2026-04-18" },
  { fecha:"2026-05-10", prov_idx:1, cat:"servicios_publicos", desc:"Energía eléctrica — Mayo 2026",                monto:412000,  iva:78280,  vcto:"2026-05-20", aprobado:true, pagado:"2026-05-19" },
  { fecha:"2026-06-10", prov_idx:1, cat:"servicios_publicos", desc:"Energía eléctrica — Junio 2026",               monto:395000,  iva:75050,  vcto:"2026-06-20", aprobado:true, pagado:null },
  // Telefonía / internet
  { fecha:"2026-04-05", prov_idx:2, cat:"tecnologia", desc:"Plan internet fibra óptica + telefonía — Abril",       monto:150000,  iva:28500,  vcto:"2026-04-15", aprobado:true, pagado:"2026-04-14" },
  { fecha:"2026-05-05", prov_idx:2, cat:"tecnologia", desc:"Plan internet fibra óptica + telefonía — Mayo",        monto:150000,  iva:28500,  vcto:"2026-05-15", aprobado:true, pagado:"2026-05-13" },
  { fecha:"2026-06-05", prov_idx:2, cat:"tecnologia", desc:"Plan internet fibra óptica + telefonía — Junio",       monto:150000,  iva:28500,  vcto:"2026-06-15", aprobado:false, pagado:null },
  // Transporte
  { fecha:"2026-04-18", prov_idx:3, cat:"transporte", desc:"Fletes entrega clientes Bogotá — quincena abril 1",   monto:280000,  iva:0,      vcto:null,          aprobado:true, pagado:"2026-04-25" },
  { fecha:"2026-05-02", prov_idx:3, cat:"transporte", desc:"Fletes entrega clientes Bogotá — abril 2",            monto:310000,  iva:0,      vcto:null,          aprobado:true, pagado:"2026-05-10" },
  { fecha:"2026-05-19", prov_idx:3, cat:"transporte", desc:"Fletes entrega clientes Bogotá — quincena mayo 1",    monto:295000,  iva:0,      vcto:null,          aprobado:true, pagado:"2026-05-26" },
  { fecha:"2026-06-08", prov_idx:3, cat:"transporte", desc:"Fletes entrega clientes Bogotá — mayo 2",             monto:320000,  iva:0,      vcto:null,          aprobado:true, pagado:"2026-06-15" },
  // Honorarios contador externo
  { fecha:"2026-04-30", prov_idx:4, cat:"honorarios", desc:"Honorarios asesoría contable y tributaria — Abril",   monto:850000,  iva:0,      vcto:"2026-05-10", aprobado:true, pagado:"2026-05-08" },
  { fecha:"2026-05-31", prov_idx:4, cat:"honorarios", desc:"Honorarios asesoría contable y tributaria — Mayo",    monto:850000,  iva:0,      vcto:"2026-06-10", aprobado:true, pagado:"2026-06-09" },
  { fecha:"2026-06-28", prov_idx:4, cat:"honorarios", desc:"Honorarios asesoría contable y tributaria — Junio",   monto:850000,  iva:0,      vcto:"2026-07-10", aprobado:false, pagado:null },
  // Compra mercancía (reabastecimiento)
  { fecha:"2026-04-06", prov_idx:5, cat:"compra_mercancia", desc:"Compra papelería y suministros — proveedor",    monto:1850000, iva:351500, vcto:"2026-04-21", aprobado:true, pagado:"2026-04-20" },
  { fecha:"2026-05-07", prov_idx:5, cat:"compra_mercancia", desc:"Compra papelería y suministros — proveedor",    monto:2100000, iva:399000, vcto:"2026-05-22", aprobado:true, pagado:"2026-05-21" },
  { fecha:"2026-06-06", prov_idx:5, cat:"compra_mercancia", desc:"Compra papelería y suministros — proveedor",    monto:1950000, iva:370500, vcto:"2026-06-21", aprobado:false, pagado:null },
  // Papelería / varios
  { fecha:"2026-05-15", prov_idx:null, cat:"papeleria", desc:"Materiales de oficina internos",                     monto:85000,   iva:0,      vcto:null,          aprobado:true, pagado:"2026-05-15" },
];

// ── Función principal ─────────────────────────────────────────────────────────

export async function seedContador() {
  const [existe] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existe) {
    console.log("✓ Entorno contador ya existe. Para recrearlo elimina el tenant manualmente.");
    return;
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Creando entorno de simulación para contador externo...");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Plan raíz (accounting_level = 2) ──────────────────────────────────────
  const [plan] = await db.select().from(plans).where(eq(plans.slug, "raiz")).limit(1);
  if (!plan) throw new Error("Plan 'raiz' no encontrado. Ejecuta primero: pnpm db:seed");

  // ── Tenant ─────────────────────────────────────────────────────────────────
  const [tenant] = await db
    .insert(tenants)
    .values({
      nombre: "Empresa Demo Contador SAS",
      nit: "901234567",                    // NIT ficticio — DV 7 → 901234567-7
      plan_id: plan.id,
      plan_starts_at: new Date("2026-01-01"),
      plan_ends_at:   new Date("2027-12-31"),
      activo: true,
      direccion: "Calle 72 # 10-34 Of. 501",
      ciudad: "Bogotá D.C.",
      telefono: "6012345678",
      correo: "info@democontador.doraviasoft.com",
      regimen: "comun",                    // Régimen Ordinario (responsable de IVA)
      representante_legal: "Roberto Andrés Palacios Ortiz",
      actividad_economica: "4719",         // Comercio al por menor no especializado
      pie_factura: "⚠️  EMPRESA DEMO — Datos ficticios para revisión contable. No válido ante la DIAN.",
      onboarding_completado: true,
    })
    .returning();

  const TID = tenant.id;
  console.log(`✓ Tenant creado: ${tenant.nombre} (${TID})`);

  // ── Usuarios ───────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10);
  await db.insert(users).values([
    { tenant_id: TID, email: ADMIN_EMAIL,    nombre: "Roberto Palacios (Admin)",          role: "admin",    password_hash: hash },
    { tenant_id: TID, email: CONTADOR_EMAIL, nombre: "Contador Externo (Solo Lectura)",   role: "contador", password_hash: hash },
  ]);
  console.log(`✓ Usuarios creados: admin + contador`);

  // ── Bodega ─────────────────────────────────────────────────────────────────
  const [bodega] = await db
    .insert(bodegas)
    .values({ tenant_id: TID, nombre: "Bodega Principal", descripcion: "Calle 72 #10-34", activo: true })
    .returning();
  const BID = bodega.id;

  // ── Resolución DIAN ────────────────────────────────────────────────────────
  const [resolucion] = await db
    .insert(resoluciones_dian)
    .values({
      tenant_id: TID,
      numero_resolucion: "18764000001234",
      fecha_resolucion:  "2025-01-15",
      prefijo:           "FE",
      consecutivo_desde: 1,
      consecutivo_hasta: 5000,
      consecutivo_actual: 51,   // 50 facturas ya emitidas
      fecha_desde: "2025-01-01",
      fecha_hasta: "2027-12-31",
      activa: true,
    })
    .returning();
  console.log(`✓ Resolución DIAN: ${resolucion.numero_resolucion} (FE-0001 a FE-0050)`);

  // ── Productos (11) ─────────────────────────────────────────────────────────
  const prodsData = [
    { codigo:"PP-001", nombre:"Resma papel bond carta 500 hojas",        tipo:"producto", unidad:"UN",  precio:"12500",  iva:"0",  stock:"250" },
    { codigo:"PP-002", nombre:"Cuaderno universitario 100 hojas",         tipo:"producto", unidad:"UN",  precio:"5200",   iva:"0",  stock:"400" },
    { codigo:"PP-003", nombre:"Café molido 500g Sello Rojo",              tipo:"producto", unidad:"UN",  precio:"15800",  iva:"0",  stock:"100" },
    { codigo:"AS-001", nombre:"Jabón antibacterial líquido 500ml",        tipo:"producto", unidad:"UN",  precio:"8500",   iva:"5",  stock:"200" },
    { codigo:"AS-002", nombre:"Desinfectante multiusos 1L",               tipo:"producto", unidad:"UN",  precio:"12000",  iva:"5",  stock:"150" },
    { codigo:"OP-001", nombre:"Bolígrafo BIC punta fina caja x12",       tipo:"producto", unidad:"CJA", precio:"8500",   iva:"19", stock:"300" },
    { codigo:"OP-002", nombre:"Agenda ejecutiva 2026",                     tipo:"producto", unidad:"UN",  precio:"45000",  iva:"19", stock:"80"  },
    { codigo:"OP-003", nombre:"Calculadora científica Casio FX-82MS",    tipo:"producto", unidad:"UN",  precio:"38000",  iva:"19", stock:"60"  },
    { codigo:"OP-004", nombre:"Perforadora metálica 20 hojas",            tipo:"producto", unidad:"UN",  precio:"25000",  iva:"19", stock:"70"  },
    { codigo:"OP-005", nombre:"Cinta adhesiva transparente paquete x12", tipo:"producto", unidad:"PAR", precio:"18000",  iva:"19", stock:"180" },
    { codigo:"SV-001", nombre:"Servicio mensajería urbana",               tipo:"servicio", unidad:"UN",  precio:"35000",  iva:"19", stock:null  },
  ] as const;

  const prodsInserted = await db
    .insert(productos)
    .values(
      prodsData.map((p) => ({
        tenant_id:    TID,
        codigo:       p.codigo,
        nombre:       p.nombre,
        tipo:         p.tipo as "producto" | "servicio",
        unidad:       p.unidad as "UN" | "CJA" | "PAR",
        precio_base:  String(Number(p.precio) * 0.8),
        precio_venta: p.precio,
        iva_pct:      p.iva,
        stock_actual: p.stock ?? null,
        activo:       true,
      })),
    )
    .returning();

  const P = prodsInserted.map((p) => p.id);
  console.log(`✓ Productos creados: ${prodsInserted.length}`);

  // ── Clientes (13) ──────────────────────────────────────────────────────────
  const clientesInserted = await db
    .insert(clientes)
    .values([
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"900456123", digito_verificacion:"5", nombre:"Constructora Los Pinos S.A.S",      correo:"compras@lospinos.com",      telefono:"3112345678", direccion:"Av. 68 # 15-20",         municipio:"Bogotá D.C.",  departamento:"Cundinamarca" },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"800234789", digito_verificacion:"3", nombre:"Distribuidora El Surtido Ltda",     correo:"pedidos@elsurtido.com",     telefono:"4444567890",                               municipio:"Medellín",     departamento:"Antioquia"   },
      { tenant_id:TID, tipo_persona:"natural",   tipo_documento:"CC",  numero_documento:"71234567",                           nombre:"Luis Alberto Pérez Quintero",       correo:"lperez@gmail.com",          telefono:"3154321098",                               municipio:"Barranquilla", departamento:"Atlántico"   },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"900789456", digito_verificacion:"2", nombre:"Comercial El Éxito S.A.S",          correo:"finanzas@elexitosas.com",   telefono:"6023456789", direccion:"Cra 100 # 5-20",         municipio:"Cali",         departamento:"Valle del Cauca" },
      { tenant_id:TID, tipo_persona:"natural",   tipo_documento:"CC",  numero_documento:"52678901",                           nombre:"María Elena Suárez Vargas",         correo:"mesuarez@hotmail.com",      telefono:"3178901234",                               municipio:"Bogotá D.C.",  departamento:"Cundinamarca" },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"800567890", digito_verificacion:"1", nombre:"Supermercado La Canasta Ltda",      correo:"admin@lacanasta.co",        telefono:"6063456789",                               municipio:"Pereira",      departamento:"Risaralda"   },
      { tenant_id:TID, tipo_persona:"natural",   tipo_documento:"CC",  numero_documento:"80456789",                           nombre:"Carlos Eduardo Ramírez Ríos",       correo:"ceramirez@outlook.com",     telefono:"3209876543",                               municipio:"Bogotá D.C.",  departamento:"Cundinamarca" },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"901234890", digito_verificacion:"6", nombre:"Papelería Escolar del Norte SAS",   correo:"info@papeleranorte.com",    telefono:"6075678901",                               municipio:"Bucaramanga",  departamento:"Santander"   },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"800890123", digito_verificacion:"4", nombre:"Droguería Bienestar Ltda",          correo:"compras@bienestar.co",      telefono:"6012678901",                               municipio:"Bogotá D.C.",  departamento:"Cundinamarca" },
      { tenant_id:TID, tipo_persona:"natural",   tipo_documento:"CC",  numero_documento:"43789012",                           nombre:"Ana Lucía Torres Mendoza",          correo:"altorres@yahoo.com",        telefono:"3175678901",                               municipio:"Manizales",    departamento:"Caldas"      },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"900012345", digito_verificacion:"8", nombre:"Industria Metal-Mecánica SAS",      correo:"pagos@metalmec.com",        telefono:"6082345678",                               municipio:"Ibagué",       departamento:"Tolima"      },
      { tenant_id:TID, tipo_persona:"natural",   tipo_documento:"CC",  numero_documento:"17890234",                           nombre:"Diego Hernán Castro López",         correo:"dhcastro@gmail.com",        telefono:"3003456789",                               municipio:"Bogotá D.C.",  departamento:"Cundinamarca" },
      { tenant_id:TID, tipo_persona:"juridica",  tipo_documento:"NIT", numero_documento:"891234567", digito_verificacion:"3", nombre:"Cooperativa San Jorge",             correo:"gerencia@sanjorge.coop",    telefono:"6012341234",                               municipio:"Bogotá D.C.",  departamento:"Cundinamarca" },
    ])
    .returning();

  const C = clientesInserted.map((c) => c.id);
  console.log(`✓ Clientes creados: ${clientesInserted.length}`);

  // ── Retenciones config (3) ─────────────────────────────────────────────────
  const retInserted = await db
    .insert(retenciones_config)
    .values([
      { tenant_id:TID, nombre:"ReteFuente Compras 2.5%",   tipo:"retefuente", porcentaje:"2.5"   },
      { tenant_id:TID, nombre:"ReteFuente Servicios 4%",   tipo:"retefuente", porcentaje:"4"     },
      { tenant_id:TID, nombre:"ReteICA Bogotá 4.14‰",      tipo:"reteica",    porcentaje:"0.414" },
    ])
    .returning();

  const RC = retInserted.map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, porcentaje: Number(r.porcentaje) }));

  // ── Proveedores (6) ────────────────────────────────────────────────────────
  const provsInserted = await db
    .insert(proveedores)
    .values([
      { tenant_id:TID, nombre:"Arrendamientos Fontibón Ltda",       nit:"830456789", activo:true },
      { tenant_id:TID, nombre:"Empresa de Energía de Bogotá",       nit:"860029026", activo:true },
      { tenant_id:TID, nombre:"ETB Telecomunicaciones",             nit:"899999097", activo:true },
      { tenant_id:TID, nombre:"TransSub SAS (Transporte)",          nit:"900234567", activo:true },
      { tenant_id:TID, nombre:"Torres & Asociados (Contadores)",    nit:"52890123",  activo:true },
      { tenant_id:TID, nombre:"Papeles y Suministros SAS",          nit:"901123456", activo:true },
    ])
    .returning();

  const PRV = provsInserted.map((p) => p.id);
  console.log(`✓ Proveedores creados: ${provsInserted.length}`);

  // ── Cuentas PUC ────────────────────────────────────────────────────────────
  const [c1305, c4135, c4175, c2408, c1110, c2205, c2365, c2368] = await Promise.all([
    getCuenta(TID, "1305"),
    getCuenta(TID, "4135"),
    getCuenta(TID, "4175"),
    getCuenta(TID, "2408"),
    getCuenta(TID, "1110"),
    getCuenta(TID, "2205"),
    getCuenta(TID, "2365"),
    getCuenta(TID, "2368"),
  ]);

  const GASTO_PUC: Record<string, string> = {
    nomina:            "5105",
    honorarios:        "5110",
    impuestos:         "5115",
    servicios_publicos:"5135",
    mantenimiento:     "5145",
    arrendamiento:     "5195",
    transporte:        "5195",
    publicidad:        "5195",
    papeleria:         "5195",
    tecnologia:        "5195",
    compra_mercancia:  "6135",
    otros:             "5195",
  };

  const cGasto: Record<string, string> = {};
  for (const cod of [...new Set(Object.values(GASTO_PUC))]) {
    try { cGasto[cod] = (await getCuenta(TID, cod)).id; } catch { cGasto[cod] = c4175.id; }
  }

  // ── Facturas (50) ──────────────────────────────────────────────────────────
  console.log("\nInsertando 50 facturas con asientos contables...");

  const facturaIds: string[] = [];
  const facturaNumeros: string[] = [];

  for (let i = 0; i < SPECS.length; i++) {
    const sp = SPECS[i];
    const num = i + 1;
    const numero = `FE-${String(num).padStart(4, "0")}`;
    const fechaEmision = new Date(sp.fecha + "T08:00:00-05:00");
    const anio = fechaEmision.getFullYear();

    // Calcular totales
    let subtotal = 0;
    let ivaTot = 0;
    const itemsCalc = sp.items.map(([pidx, qty]) => {
      const price = PROD_PRICES[pidx];
      const ivaPct = PROD_IVAS[pidx];
      const c = calcItemTotals(qty, price, ivaPct);
      subtotal += c.subtotal;
      ivaTot += c.iva_valor;
      return { pidx, qty, price, ivaPct, ...c };
    });
    subtotal = Number(subtotal.toFixed(2));
    ivaTot   = Number(ivaTot.toFixed(2));
    const total = Number((subtotal + ivaTot).toFixed(2));

    // Retenciones
    const retsCalc = sp.retes.map((rcidx) => {
      const rc = RC[rcidx];
      const base = subtotal;
      const valor = Number((base * rc.porcentaje / 100).toFixed(2));
      return { config_id: rc.id, nombre: rc.nombre, tipo: rc.tipo, porcentaje: rc.porcentaje, base, valor };
    });
    const totalRets = Number(retsCalc.reduce((s, r) => s + r.valor, 0).toFixed(2));
    const netoAPagar = Number((total - totalRets).toFixed(2));

    // Insertar factura
    const [factura] = await db
      .insert(facturas)
      .values({
        tenant_id: TID,
        cliente_id: C[sp.cidx],
        resolucion_id: resolucion.id,
        prefijo: "FE",
        consecutivo: num,
        numero,
        estado: sp.extra === "anulada" ? "anulada" : "aceptada",
        cufe: `STUB-SEED-${num}-DEMO-CONTABLE`,
        fecha_emision: fechaEmision,
        fecha_vencimiento: sp.vcto ? new Date(sp.vcto + "T23:59:59-05:00") : null,
        subtotal: String(subtotal),
        descuento_total: "0",
        iva_total: String(ivaTot),
        total: String(total),
        total_retenciones: String(totalRets),
        neto_a_pagar: String(netoAPagar),
        condicion_pago: sp.cond,
        forma_pago: "transferencia",
        pagada_at: sp.pagada ? new Date(sp.pagada + "T10:00:00-05:00") : null,
      })
      .returning();

    facturaIds.push(factura.id);
    facturaNumeros.push(numero);

    // Items factura
    await db.insert(items_factura).values(
      itemsCalc.map((item) => ({
        factura_id: factura.id,
        producto_id: P[item.pidx],
        descripcion: prodsData[item.pidx].nombre,
        cantidad: String(item.qty),
        precio_unitario: String(item.price),
        descuento_pct: "0",
        iva_pct: String(item.ivaPct),
        unidad_medida: "UN" as const,
        subtotal: String(item.subtotal),
        iva_valor: String(item.iva_valor),
        total: String(item.total),
      })),
    );

    // Retenciones factura
    if (retsCalc.length > 0) {
      await db.insert(retenciones_factura).values(
        retsCalc.map((r) => ({
          factura_id: factura.id,
          config_id: r.config_id,
          nombre: r.nombre,
          tipo: r.tipo as "retefuente" | "reteica",
          porcentaje: String(r.porcentaje),
          base: String(r.base),
          valor: String(r.valor),
        })),
      );
    }

    // Asiento contable (siempre — para anuladas, la NC creará la partida inversa)
    {
      const asientoNum = nextAsientoNum(anio);
      const [asiento] = await db
        .insert(asientos_contables)
        .values({
          tenant_id: TID,
          numero: asientoNum,
          fecha: sp.fecha,
          descripcion: `Factura de venta ${numero}`,
          origen: "factura",
          referencia_id: factura.id,
        })
        .returning();

      const lineas: {
        asiento_id: string;
        cuenta_id:  string;
        descripcion: string;
        debito:  string;
        credito: string;
      }[] = [
        { asiento_id: asiento.id, cuenta_id: c1305.id, descripcion: "CxC Clientes", debito: String(total), credito: "0" },
        { asiento_id: asiento.id, cuenta_id: c4135.id, descripcion: "Ingresos por venta", debito: "0", credito: String(subtotal) },
      ];
      if (ivaTot > 0) {
        lineas.push({ asiento_id: asiento.id, cuenta_id: c2408.id, descripcion: "IVA generado", debito: "0", credito: String(ivaTot) });
      }
      await db.insert(lineas_asiento).values(lineas);
      await db.update(facturas).set({ asiento_id: asiento.id }).where(eq(facturas.id, factura.id));
    }
  }

  console.log(`✓ 50 facturas insertadas (FE-0001 a FE-0050)`);

  // ── Notas crédito (6) ─────────────────────────────────────────────────────
  console.log("Creando notas crédito...");

  let ncConsec = 0;

  async function criarNC(
    facturaIdx: number,
    tipo: "anulacion" | "devolucion" | "descuento",
    motivo: string,
    itemsNC: { desc: string; qty: number; price: number; iva: number }[],
    fechaNC: string,
  ) {
    ncConsec++;
    const ncNumero = `NC-${String(ncConsec).padStart(4, "0")}`;
    const fid = facturaIds[facturaIdx];
    const cid = C[SPECS[facturaIdx].cidx];

    const itemsCalc = itemsNC.map((item) => {
      const sub = Number((item.qty * item.price).toFixed(2));
      const ivaV = Number((sub * item.iva / 100).toFixed(2));
      return { ...item, subtotal: sub, iva_valor: ivaV, total: sub + ivaV };
    });
    const sub = Number(itemsCalc.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const ivaT = Number(itemsCalc.reduce((s, i) => s + i.iva_valor, 0).toFixed(2));
    const tot = Number((sub + ivaT).toFixed(2));

    const [nc] = await db
      .insert(notas_credito)
      .values({
        tenant_id: TID,
        factura_id: fid,
        cliente_id: cid,
        numero: ncNumero,
        consecutivo: ncConsec,
        tipo,
        motivo,
        estado: "aceptada",
        subtotal: String(sub),
        iva_total: String(ivaT),
        total: String(tot),
        fecha_emision: new Date(fechaNC + "T09:00:00-05:00"),
      })
      .returning();

    await db.insert(items_nota_credito).values(
      itemsCalc.map((item) => ({
        nota_credito_id: nc.id,
        descripcion: item.desc,
        cantidad: String(item.qty),
        precio_unitario: String(item.price),
        iva_pct: String(item.iva),
        subtotal: String(item.subtotal),
        iva_valor: String(item.iva_valor),
        total: String(item.total),
      })),
    );

    // Asiento de reversa
    const anio = new Date(fechaNC).getFullYear();
    const asientoNum = nextAsientoNum(anio);
    const [asiento] = await db
      .insert(asientos_contables)
      .values({
        tenant_id: TID,
        numero: asientoNum,
        fecha: fechaNC,
        descripcion: `Nota crédito ${ncNumero} — ${tipo}`,
        origen: "ajuste",
      })
      .returning();

    const lineas = [
      { asiento_id: asiento.id, cuenta_id: c4135.id, descripcion: `NC ${ncNumero}`, debito: String(sub),  credito: "0" },
      { asiento_id: asiento.id, cuenta_id: c1305.id, descripcion: `NC ${ncNumero}`, debito: "0",          credito: String(tot) },
    ];
    if (ivaT > 0) {
      lineas.push({ asiento_id: asiento.id, cuenta_id: c2408.id, descripcion: `IVA NC ${ncNumero}`, debito: String(ivaT), credito: "0" });
    }
    await db.insert(lineas_asiento).values(lineas);
    await db.update(notas_credito).set({ asiento_id: asiento.id }).where(eq(notas_credito.id, nc.id));

    return nc;
  }

  // NC de anulación (3 facturas)
  // FE-0013 idx=12 — Distribuidora — 30×bolígrafo + 5×agenda + 1×mensajería
  await criarNC(12, "anulacion",
    "Pedido cancelado por el cliente antes del despacho.",
    [
      { desc: "Bolígrafo BIC punta fina caja x12",  qty: 30, price: PROD_PRICES[5], iva: PROD_IVAS[5] },
      { desc: "Agenda ejecutiva 2026",               qty: 5,  price: PROD_PRICES[6], iva: PROD_IVAS[6] },
      { desc: "Servicio mensajería urbana",          qty: 1,  price: PROD_PRICES[10], iva: PROD_IVAS[10] },
    ],
    "2026-04-23",
  );

  // FE-0032 idx=31 — Industria Metal-Mecánica — 8×calculadora + 5×perforadora
  await criarNC(31, "anulacion",
    "Factura emitida con datos del cliente incorrectos — se anula y re-factura.",
    [
      { desc: "Calculadora científica Casio FX-82MS", qty: 8, price: PROD_PRICES[7], iva: PROD_IVAS[7] },
      { desc: "Perforadora metálica 20 hojas",        qty: 5, price: PROD_PRICES[8], iva: PROD_IVAS[8] },
    ],
    "2026-05-28",
  );

  // FE-0049 idx=48 — Constructora Los Pinos — 50×papel + 30×bolígrafo
  await criarNC(48, "anulacion",
    "Mercancía devuelta en su totalidad por defecto en el empaque.",
    [
      { desc: "Resma papel bond carta 500 hojas",  qty: 50, price: PROD_PRICES[0], iva: PROD_IVAS[0] },
      { desc: "Bolígrafo BIC punta fina caja x12", qty: 30, price: PROD_PRICES[5], iva: PROD_IVAS[5] },
    ],
    "2026-06-24",
  );

  // NC de devolución parcial
  // FE-0031 idx=30 — Supermercado La Canasta — devolución de 5 cafés (recibidos en mal estado)
  await criarNC(30, "devolucion",
    "5 unidades de café molido recibidas con empaque dañado — devolución parcial.",
    [{ desc: "Café molido 500g Sello Rojo", qty: 5, price: PROD_PRICES[2], iva: PROD_IVAS[2] }],
    "2026-05-29",
  );

  // NC de descuento (pronto pago)
  // FE-0047 idx=46 — Comercial El Éxito — descuento 5% sobre bolígrafos
  await criarNC(46, "descuento",
    "Descuento por pronto pago acordado con el cliente (5% sobre subtotal bolígrafos).",
    [{ desc: "Descuento por pronto pago — bolígrafos", qty: 1, price: 8500, iva: 19 }],
    "2026-06-20",
  );

  console.log(`✓ 5 notas crédito creadas (3 anulación, 1 devolución, 1 descuento)`);

  // ── Gastos (20) ────────────────────────────────────────────────────────────
  console.log("Insertando 20 gastos...");

  let gastosAprobados = 0;
  let gastosPendientes = 0;

  for (const gs of GASTOS_SPECS) {
    const montoNum = gs.monto;
    const ivaNum   = gs.iva;
    const totalG   = Number((montoNum + ivaNum).toFixed(2));
    const provId   = gs.prov_idx !== null ? PRV[gs.prov_idx] : null;

    const [gasto] = await db
      .insert(gastos)
      .values({
        tenant_id:        TID,
        proveedor_id:     provId,
        categoria:        gs.cat as "arrendamiento" | "servicios_publicos" | "tecnologia" | "transporte" | "honorarios" | "compra_mercancia" | "papeleria",
        descripcion:      gs.desc,
        monto:            String(montoNum),
        iva:              String(ivaNum),
        total:            String(totalG),
        fecha:            gs.fecha,
        fecha_vencimiento: gs.vcto ?? null,
        estado:           "borrador",
        pagado_at:        gs.pagado ? new Date(gs.pagado + "T10:00:00-05:00") : null,
      })
      .returning();

    if (gs.aprobado) {
      // Crear asiento de gasto
      const pucCod = GASTO_PUC[gs.cat] ?? "5195";
      const cGastoId = cGasto[pucCod] ?? cGasto["5195"];
      const asientoNum = nextAsientoNum(new Date(gs.fecha).getFullYear());

      const [asiento] = await db
        .insert(asientos_contables)
        .values({
          tenant_id:   TID,
          numero:      asientoNum,
          fecha:       gs.fecha,
          descripcion: `Gasto: ${gs.desc.slice(0, 80)}`,
          origen:      "compra",
          referencia_id: gasto.id,
        })
        .returning();

      const lineasG: { asiento_id: string; cuenta_id: string; descripcion: string; debito: string; credito: string }[] = [
        { asiento_id: asiento.id, cuenta_id: cGastoId,  descripcion: gs.desc.slice(0, 80), debito: String(montoNum), credito: "0" },
      ];
      if (ivaNum > 0) {
        lineasG.push({ asiento_id: asiento.id, cuenta_id: c2408.id, descripcion: "IVA descontable", debito: String(ivaNum), credito: "0" });
      }
      lineasG.push({
        asiento_id: asiento.id,
        cuenta_id:  provId ? c2205.id : c1110.id,
        descripcion: provId ? "Proveedor — cuenta por pagar" : "Pago directo banco",
        debito: "0",
        credito: String(totalG),
      });

      await db.insert(lineas_asiento).values(lineasG);

      // Actualizar gasto: aprobado + asiento_id
      const nuevoEstado = gs.pagado ? "pagado" : "aprobado";
      await db.update(gastos)
        .set({ estado: nuevoEstado, asiento_id: asiento.id })
        .where(eq(gastos.id, gasto.id));

      gastosAprobados++;
    } else {
      gastosPendientes++;
    }
  }

  console.log(`✓ Gastos: ${gastosAprobados} aprobados/pagados, ${gastosPendientes} pendientes`);

  // ── Movimientos inventario (30 entradas + salidas coherentes) ─────────────
  console.log("Registrando movimientos de inventario...");

  // Entradas de mercancía (reabastecimiento)
  const entradas: { fecha: string; pidx: number; qty: number; costo: number }[] = [
    { fecha:"2026-04-01", pidx:0, qty:300, costo:10000 },
    { fecha:"2026-04-01", pidx:1, qty:500, costo:4000  },
    { fecha:"2026-04-01", pidx:2, qty:120, costo:12000 },
    { fecha:"2026-04-01", pidx:3, qty:250, costo:6500  },
    { fecha:"2026-04-01", pidx:4, qty:200, costo:9000  },
    { fecha:"2026-04-01", pidx:5, qty:400, costo:6500  },
    { fecha:"2026-04-01", pidx:6, qty:100, costo:34000 },
    { fecha:"2026-04-01", pidx:7, qty:80,  costo:28000 },
    { fecha:"2026-04-01", pidx:8, qty:100, costo:18000 },
    { fecha:"2026-04-01", pidx:9, qty:250, costo:13000 },
    { fecha:"2026-05-01", pidx:0, qty:200, costo:10000 },
    { fecha:"2026-05-01", pidx:1, qty:300, costo:4000  },
    { fecha:"2026-05-01", pidx:2, qty:80,  costo:12000 },
    { fecha:"2026-05-01", pidx:5, qty:300, costo:6500  },
    { fecha:"2026-06-01", pidx:0, qty:150, costo:10000 },
    { fecha:"2026-06-01", pidx:3, qty:150, costo:6500  },
    { fecha:"2026-06-01", pidx:4, qty:100, costo:9000  },
    { fecha:"2026-06-01", pidx:6, qty:60,  costo:34000 },
  ];

  await db.insert(movimientos_inventario).values(
    entradas.map((e) => ({
      tenant_id:       TID,
      bodega_id:       BID,
      producto_id:     P[e.pidx],
      tipo:            "entrada" as const,
      cantidad:        String(e.qty),
      costo_unitario:  String(e.costo),
      referencia_tipo: "compra",
      observaciones:   "Reabastecimiento periódico",
    })),
  );

  // Salidas coherentes con las facturas no anuladas
  const salidas: { fecha: string; pidx: number; qty: number; factIdx: number }[] = [
    { fecha:"2026-04-02", pidx:0, qty:10, factIdx:0  },
    { fecha:"2026-04-02", pidx:5, qty:5,  factIdx:0  },
    { fecha:"2026-04-02", pidx:6, qty:3,  factIdx:0  },
    { fecha:"2026-04-10", pidx:6, qty:5,  factIdx:5  },
    { fecha:"2026-04-10", pidx:9, qty:10, factIdx:5  },
    { fecha:"2026-05-06", pidx:6, qty:10, factIdx:18 },
    { fecha:"2026-05-06", pidx:7, qty:5,  factIdx:18 },
    { fecha:"2026-05-13", pidx:0, qty:40, factIdx:22 },
    { fecha:"2026-05-13", pidx:1, qty:25, factIdx:22 },
    { fecha:"2026-05-23", pidx:5, qty:20, factIdx:29 },
    { fecha:"2026-05-23", pidx:9, qty:15, factIdx:29 },
    { fecha:"2026-06-13", pidx:6, qty:5,  factIdx:42 },
  ];

  await db.insert(movimientos_inventario).values(
    salidas.map((s) => ({
      tenant_id:       TID,
      bodega_id:       BID,
      producto_id:     P[s.pidx],
      tipo:            "salida" as const,
      cantidad:        String(s.qty),
      costo_unitario:  null,
      referencia_tipo: "factura",
      referencia_id:   facturaIds[s.factIdx],
      observaciones:   `Despacho ${facturaNumeros[s.factIdx]}`,
    })),
  );

  console.log(`✓ Movimientos inventario: ${entradas.length} entradas, ${salidas.length} salidas`);

  // ── Resumen final ──────────────────────────────────────────────────────────
  const totalFacturado = SPECS.filter((s) => s.extra !== "anulada").reduce((sum, sp) => {
    let sub = 0; let iva = 0;
    sp.items.forEach(([pidx, qty]) => {
      sub += qty * PROD_PRICES[pidx];
      iva += qty * PROD_PRICES[pidx] * PROD_IVAS[pidx] / 100;
    });
    return sum + sub + iva;
  }, 0);

  const facturasAnuladas  = SPECS.filter((s) => s.extra === "anulada").length;
  const facturasPagadas   = SPECS.filter((s) => s.pagada !== null && s.extra !== "anulada").length;
  const facturasVencidas  = SPECS.filter((s) => s.vcto && s.pagada === null && new Date(s.vcto) < new Date("2026-06-29")).length;
  const facturasConRetes  = SPECS.filter((s) => s.retes.length > 0).length;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ENTORNO DE SIMULACIÓN CREADO EXITOSAMENTE");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("  Empresa:     Empresa Demo Contador SAS");
  console.log("  NIT:         901.234.567-7");
  console.log("  Régimen:     Ordinario (Responsable de IVA)");
  console.log("  CIIU:        4719 — Comercio al por menor no especializado");
  console.log("  Plan:        Raíz (balance general + estado de resultados)\n");
  console.log("  CREDENCIALES CONTADOR:");
  console.log(`  Email:       ${CONTADOR_EMAIL}`);
  console.log(`  Contraseña:  ${PASSWORD}`);
  console.log(`  Rol:         Contador (solo lectura)\n`);
  console.log("  CREDENCIALES ADMIN:");
  console.log(`  Email:       ${ADMIN_EMAIL}`);
  console.log(`  Contraseña:  ${PASSWORD}\n`);
  console.log("  DATOS GENERADOS:");
  console.log(`  Período:     Abril 1 — Junio 25, 2026`);
  console.log(`  Clientes:    13 (8 jurídicos + 5 naturales)`);
  console.log(`  Productos:   11 (IVA 0%: 3 | IVA 5%: 2 | IVA 19%: 6)`);
  console.log(`  Facturas:    50 total`);
  console.log(`    • Aceptadas/pendiente de pago:  ${50 - facturasAnuladas - facturasPagadas}`);
  console.log(`    • Pagadas:                      ${facturasPagadas}`);
  console.log(`    • Anuladas (vía NC):            ${facturasAnuladas}`);
  console.log(`    • Vencidas sin pago:            ${facturasVencidas}`);
  console.log(`    • Con retenciones:              ${facturasConRetes}`);
  console.log(`  Total facturado (sin anuladas): $${totalFacturado.toLocaleString("es-CO")} COP`);
  console.log(`  Notas crédito:  5 (3 anulación + 1 devolución + 1 descuento)`);
  console.log(`  Gastos:         ${GASTOS_SPECS.length} (${gastosAprobados} aprobados, ${gastosPendientes} pendientes)`);
  console.log(`  Movimientos inv: ${entradas.length + salidas.length} (${entradas.length} entradas + ${salidas.length} salidas)\n`);
  console.log("  ACCESO CONTABLE (plan Raíz):");
  console.log("  ✓ Libro diario                    → /api/contabilidad/diario");
  console.log("  ✓ Libro mayor por cuenta          → /api/contabilidad/mayor/:codigo");
  console.log("  ✓ Balance de prueba               → /api/contabilidad/balance-prueba");
  console.log("  ✓ Balance general                 → /api/contabilidad/balance-general");
  console.log("  ✓ Facturas (incl. anuladas + NC)  → /api/facturas");
  console.log("  ✓ Notas crédito                   → /api/notas-credito");
  console.log("  ✓ Retenciones configuradas        → /api/retenciones");
  console.log("  ✓ Cartera / aging                 → /api/cartera");
  console.log("  ✓ Excel facturas                  → /api/exportar/facturas");
  console.log("  ✓ Excel clientes                  → /api/exportar/clientes");
  console.log("  ✗ Estado de resultados comparativo → requiere plan Brote (accounting_level 3)");
  console.log("  ✗ Centros de costos               → requiere plan Cosecha (accounting_level 4)\n");
}

// ── Entry point ───────────────────────────────────────────────────────────────

seedContador()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Error en seed-contador:", err);
    process.exit(1);
  });
