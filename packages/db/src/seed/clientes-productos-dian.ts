/**
 * Script de datos de prueba para el set de habilitación DIAN.
 * Inserta 10 clientes y 10 productos en el tenant con facturación electrónica activa.
 * Uso: pnpm --filter @workspace/db seed:dian
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

// Busca el tenant con facturación electrónica habilitada (excluye hub contadores)
const [tenant] = await sql`
  SELECT id, nombre, nit
  FROM tenants
  WHERE facturacion_electronica = true
    AND nit != '0000000001'
    AND activo = true
  ORDER BY created_at DESC
  LIMIT 1
`;

if (!tenant) {
  console.error("No se encontró un tenant con facturación electrónica habilitada.");
  process.exit(1);
}

console.log(`Insertando datos para tenant: ${tenant.nombre} (NIT: ${tenant.nit})`);

const clientes = [
  { tipo_persona: "natural",  tipo_documento: "CC",  numero_documento: "52456789",  nombre: "María Fernanda López",      correo: "mflopez@gmail.com",      telefono: "3101234567", direccion: "Cra 15 # 93-47",          municipio: "Bogotá",      departamento: "Cundinamarca" },
  { tipo_persona: "natural",  tipo_documento: "CC",  numero_documento: "71234567",  nombre: "Carlos Andrés Gómez",       correo: "cagomez@outlook.com",    telefono: "3157894561", direccion: "Av El Poblado # 25-10",    municipio: "Medellín",    departamento: "Antioquia" },
  { tipo_persona: "juridica", tipo_documento: "NIT", numero_documento: "900456781", digito_verificacion: "3", nombre: "Distribuidora Andina S.A.S", correo: "factura@andina.com.co",  telefono: "6013456789", direccion: "Calle 13 # 42-15",       municipio: "Bogotá",      departamento: "Cundinamarca" },
  { tipo_persona: "natural",  tipo_documento: "CC",  numero_documento: "43789012",  nombre: "Patricia Salcedo Torres",   correo: "psalcedo@yahoo.com",     telefono: "3204567891", direccion: "Calle 10 # 5-34",          municipio: "Cali",        departamento: "Valle del Cauca" },
  { tipo_persona: "juridica", tipo_documento: "NIT", numero_documento: "800123456", digito_verificacion: "7", nombre: "Inversiones del Pacifico",  correo: "contabilidad@pacifico.co", telefono: "6024321098", direccion: "Cra 5 # 16-80",           municipio: "Cali",        departamento: "Valle del Cauca" },
  { tipo_persona: "natural",  tipo_documento: "CC",  numero_documento: "91345678",  nombre: "Jorge Enrique Prada",       correo: "jeprada@gmail.com",      telefono: "3176543210", direccion: "Calle 45 # 27-12",         municipio: "Bucaramanga", departamento: "Santander" },
  { tipo_persona: "juridica", tipo_documento: "NIT", numero_documento: "901234567", digito_verificacion: "1", nombre: "Comercializadora La Mejor",  correo: "ventas@lamejor.co",      telefono: "6057891234", direccion: "Cra 33 # 72-10",          municipio: "Barranquilla", departamento: "Atlántico" },
  { tipo_persona: "natural",  tipo_documento: "CC",  numero_documento: "32567890",  nombre: "Sandra Milena Ríos",        correo: "smrios@hotmail.com",     telefono: "3008765432", direccion: "Cra 70 # 49-25",           municipio: "Medellín",    departamento: "Antioquia" },
  { tipo_persona: "juridica", tipo_documento: "NIT", numero_documento: "860012345", digito_verificacion: "9", nombre: "Servicios Técnicos Norte",  correo: "info@serviciosnorte.co", telefono: "6075432198", direccion: "Av Libertadores # 3-45",   municipio: "Cúcuta",      departamento: "Norte de Santander" },
  { tipo_persona: "natural",  tipo_documento: "CC",  numero_documento: "18234567",  nombre: "Hernando Castaño Mejía",    correo: "hcastano@gmail.com",     telefono: "3135678901", direccion: "Calle 19 # 10-32",         municipio: "Manizales",   departamento: "Caldas" },
];

for (const c of clientes) {
  await sql`
    INSERT INTO clientes (tenant_id, tipo_persona, tipo_documento, numero_documento, digito_verificacion, nombre, correo, telefono, direccion, municipio, departamento)
    VALUES (
      ${tenant.id},
      ${c.tipo_persona},
      ${c.tipo_documento},
      ${c.numero_documento},
      ${(c as { digito_verificacion?: string }).digito_verificacion ?? null},
      ${c.nombre},
      ${c.correo},
      ${c.telefono},
      ${c.direccion},
      ${c.municipio},
      ${c.departamento}
    )
    ON CONFLICT DO NOTHING
  `;
  console.log(`  ✓ Cliente: ${c.nombre}`);
}

const productos = [
  { codigo: "PROD001", nombre: "Arroz blanco 500g",          tipo: "producto",  precio_base: "3500",   iva_pct: "0"  },
  { codigo: "PROD002", nombre: "Aceite vegetal 1L",           tipo: "producto",  precio_base: "12000",  iva_pct: "0"  },
  { codigo: "PROD003", nombre: "Harina de trigo 1kg",         tipo: "producto",  precio_base: "4800",   iva_pct: "0"  },
  { codigo: "PROD004", nombre: "Leche entera 1L",             tipo: "producto",  precio_base: "3200",   iva_pct: "0"  },
  { codigo: "PROD005", nombre: "Shampoo 400ml",               tipo: "producto",  precio_base: "18500",  iva_pct: "19" },
  { codigo: "PROD006", nombre: "Detergente líquido 1.8L",     tipo: "producto",  precio_base: "22000",  iva_pct: "19" },
  { codigo: "SERV001", nombre: "Consultoría empresarial",     tipo: "servicio",  precio_base: "250000", iva_pct: "19" },
  { codigo: "SERV002", nombre: "Mantenimiento de equipos",    tipo: "servicio",  precio_base: "150000", iva_pct: "19" },
  { codigo: "SERV003", nombre: "Transporte de mercancía",     tipo: "servicio",  precio_base: "80000",  iva_pct: "19" },
  { codigo: "PROD007", nombre: "Cuaderno universitario 100h", tipo: "producto",  precio_base: "8500",   iva_pct: "19" },
];

for (const p of productos) {
  await sql`
    INSERT INTO productos (tenant_id, codigo, nombre, tipo, precio_base, precio_venta, iva_pct)
    VALUES (
      ${tenant.id},
      ${p.codigo},
      ${p.nombre},
      ${p.tipo},
      ${p.precio_base},
      ${p.precio_base},
      ${p.iva_pct}
    )
    ON CONFLICT DO NOTHING
  `;
  console.log(`  ✓ Producto: ${p.nombre} (IVA ${p.iva_pct}%)`);
}

await sql.end();
console.log("\n✅ Datos de prueba DIAN insertados correctamente.");
process.exit(0);
