import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, plans, tenants, users, clientes, productos, bodegas, cajas_pos } from "../index.js";

const DEMO_EMAIL = "admin@demo.doraviasoft.com";

/**
 * Siembra una empresa demo para presentaciones comerciales.
 * Idempotente: no hace nada si el usuario demo ya existe.
 */
export async function seedDemo() {
  const [existe] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existe) {
    console.log("✓ Demo ya existe, omitiendo.");
    return;
  }

  console.log("Sembrando datos de demo...");

  // ── Plan semilla ──────────────────────────────────────────────────────────
  const [plan] = await db.select().from(plans).where(eq(plans.slug, "semilla")).limit(1);
  if (!plan) throw new Error("Plan semilla no encontrado. Ejecuta el seed principal primero.");

  // ── Tenant demo ───────────────────────────────────────────────────────────
  const ahora = new Date();
  const planFin = new Date(ahora);
  planFin.setFullYear(planFin.getFullYear() + 1);

  const [tenant] = await db
    .insert(tenants)
    .values({
      nombre: "Ferretería El Constructor S.A.S",
      nit: "900123456",
      plan_id: plan.id,
      plan_starts_at: ahora,
      plan_ends_at: planFin,
      activo: true,
      direccion: "Calle 80 # 20-45, Local 12",
      ciudad: "Bogotá D.C.",
      telefono: "6013456789",
      correo: "info@elconstructor.com",
      regimen: "comun",
      representante_legal: "Andrés Felipe Gómez Ríos",
      actividad_economica: "4752",
      pie_factura: "Gracias por su compra. Para PQR comuníquese al 601-345-6789.",
      onboarding_completado: true,
    })
    .returning();

  // ── Usuarios ──────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Demo2024!", 10);

  await db.insert(users).values([
    {
      tenant_id: tenant.id,
      email: "admin@demo.doraviasoft.com",
      nombre: "Andrés Gómez (Admin)",
      role: "admin",
      password_hash: passwordHash,
    },
    {
      tenant_id: tenant.id,
      email: "contador@demo.doraviasoft.com",
      nombre: "Rosa Martínez (Contadora)",
      role: "contador",
      password_hash: passwordHash,
    },
    {
      tenant_id: tenant.id,
      email: "vendedor@demo.doraviasoft.com",
      nombre: "Luis Herrera (Vendedor)",
      role: "vendedor",
      password_hash: passwordHash,
    },
  ]);

  // ── Bodega ────────────────────────────────────────────────────────────────
  const [bodega] = await db
    .insert(bodegas)
    .values({
      tenant_id: tenant.id,
      nombre: "Bodega Central",
      descripcion: "Bodega principal — Calle 80 # 20-45",
      activo: true,
    })
    .returning();

  // ── Caja POS ──────────────────────────────────────────────────────────────
  await db.insert(cajas_pos).values({
    tenant_id: tenant.id,
    nombre: "Caja 1",
    descripcion: "Punto de venta principal",
    activo: true,
  });

  // ── Productos ─────────────────────────────────────────────────────────────
  await db.insert(productos).values([
    {
      tenant_id: tenant.id,
      codigo: "CEM-001",
      nombre: "Cemento gris Argos 50 kg",
      tipo: "producto",
      unidad: "bulto",
      precio_base: "32000",
      precio_venta: "38000",
      iva_pct: "0",
      stock_actual: "84",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "ARE-001",
      nombre: "Arena de río bulto 40 kg",
      tipo: "producto",
      unidad: "bulto",
      precio_base: "14000",
      precio_venta: "18500",
      iva_pct: "0",
      stock_actual: "120",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "BLQ-001",
      nombre: "Bloque de concreto 15×20×40 cm",
      tipo: "producto",
      unidad: "und",
      precio_base: "1800",
      precio_venta: "2400",
      iva_pct: "0",
      stock_actual: "500",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "TUB-001",
      nombre: "Tubo PVC presión 4\" × 6 m",
      tipo: "producto",
      unidad: "und",
      precio_base: "35000",
      precio_venta: "45000",
      iva_pct: "19",
      stock_actual: "42",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "PIN-001",
      nombre: "Pintura vinilo blanco galón",
      tipo: "producto",
      unidad: "galon",
      precio_base: "31000",
      precio_venta: "42000",
      iva_pct: "19",
      stock_actual: "35",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "TOR-001",
      nombre: "Tornillos 3/4\" caja × 100 und",
      tipo: "producto",
      unidad: "caja",
      precio_base: "9000",
      precio_venta: "12800",
      iva_pct: "19",
      stock_actual: "68",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "CAB-001",
      nombre: "Cable THHN calibre 12 rollo 100 m",
      tipo: "producto",
      unidad: "rollo",
      precio_base: "155000",
      precio_venta: "198000",
      iva_pct: "19",
      stock_actual: "18",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "LLA-001",
      nombre: "Llave de paso bronce 1/2\"",
      tipo: "producto",
      unidad: "und",
      precio_base: "16000",
      precio_venta: "22500",
      iva_pct: "19",
      stock_actual: "57",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "MAN-001",
      nombre: "Manguera PVC jardín 25 m",
      tipo: "producto",
      unidad: "und",
      precio_base: "34000",
      precio_venta: "48000",
      iva_pct: "19",
      stock_actual: "23",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "MAL-001",
      nombre: "Malla eslabonada calibre 11 rollo 25 m",
      tipo: "producto",
      unidad: "rollo",
      precio_base: "142000",
      precio_venta: "185000",
      iva_pct: "19",
      stock_actual: "11",
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "SRV-001",
      nombre: "Corte y dimensionado de material",
      tipo: "servicio",
      unidad: "hr",
      precio_base: "35000",
      precio_venta: "45000",
      iva_pct: "19",
      stock_actual: null,
      activo: true,
    },
    {
      tenant_id: tenant.id,
      codigo: "SRV-002",
      nombre: "Flete y entrega en obra (Bogotá)",
      tipo: "servicio",
      unidad: "serv",
      precio_base: "60000",
      precio_venta: "80000",
      iva_pct: "19",
      stock_actual: null,
      activo: true,
    },
  ]);

  // ── Clientes ──────────────────────────────────────────────────────────────
  await db.insert(clientes).values([
    {
      tenant_id: tenant.id,
      tipo_persona: "juridica",
      tipo_documento: "NIT",
      numero_documento: "900456789",
      digito_verificacion: "2",
      nombre: "Constructora Andina S.A.S",
      correo: "compras@constructoraandina.com",
      telefono: "3112345678",
      direccion: "Av. El Dorado # 68B-31 Of. 502",
      municipio: "Bogotá D.C.",
      departamento: "Cundinamarca",
    },
    {
      tenant_id: tenant.id,
      tipo_persona: "natural",
      tipo_documento: "CC",
      numero_documento: "12345678",
      nombre: "Pedro Antonio Jiménez Ruiz",
      correo: "pedro.jimenez@gmail.com",
      telefono: "3198765432",
      direccion: "Cra 7 # 45-22",
      municipio: "Bogotá D.C.",
      departamento: "Cundinamarca",
    },
    {
      tenant_id: tenant.id,
      tipo_persona: "juridica",
      tipo_documento: "NIT",
      numero_documento: "800234567",
      digito_verificacion: "3",
      nombre: "Edificios del Norte Ltda",
      correo: "gerencia@edificiosnorte.co",
      telefono: "6044567890",
      direccion: "Calle 10 # 43C-15",
      municipio: "Medellín",
      departamento: "Antioquia",
    },
    {
      tenant_id: tenant.id,
      tipo_persona: "natural",
      tipo_documento: "CC",
      numero_documento: "52789012",
      nombre: "María Fernanda López Castro",
      correo: "mflopez@hotmail.com",
      telefono: "3156789012",
      direccion: "Calle 127 # 53-40 Apto 302",
      municipio: "Bogotá D.C.",
      departamento: "Cundinamarca",
    },
    {
      tenant_id: tenant.id,
      tipo_persona: "juridica",
      tipo_documento: "NIT",
      numero_documento: "900789012",
      digito_verificacion: "5",
      nombre: "Inversiones y Construcciones del Valle S.A",
      correo: "pagos@invconstrucciones.com",
      telefono: "6023456789",
      direccion: "Cra 100 # 16-55 Piso 8",
      municipio: "Cali",
      departamento: "Valle del Cauca",
    },
    {
      tenant_id: tenant.id,
      tipo_persona: "natural",
      tipo_documento: "CC",
      numero_documento: "79456123",
      nombre: "Carlos Alberto Martínez Herrera",
      correo: "camartinez@outlook.com",
      telefono: "3204567891",
      direccion: "Cra 15 # 90-12",
      municipio: "Bogotá D.C.",
      departamento: "Cundinamarca",
    },
  ]);

  console.log(`✓ Demo creado — tenant: ${tenant.id}`);
  console.log("  Usuarios:");
  console.log("    admin@demo.doraviasoft.com   / Demo2024!  (Admin)");
  console.log("    contador@demo.doraviasoft.com / Demo2024!  (Contador)");
  console.log("    vendedor@demo.doraviasoft.com / Demo2024!  (Vendedor)");
}
