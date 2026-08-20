/**
 * Crea una nómina FICTICIA lista para comprobar el flujo de Plemsi en pruebas.
 * No configura token ni llama servicios externos.
 */
import { eq } from "drizzle-orm";
import { db, empleados, nominas_detalle, nominas_periodo, tenants } from "../index.js";

const TENANT_NOMBRE = "Empresa Demo Contable Cosecha Pruebas SAS";

async function main() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.nombre, TENANT_NOMBRE)).limit(1);
  if (!tenant) throw new Error(`No existe ${TENANT_NOMBRE}. Ejecuta primero seed:contador.`);

  const plantilla = [
    { cedula: "1000000011", nombres: "Mariana", apellidos: "Torres", cargo: "Auxiliar administrativa", salario: "2000000.00" },
    { cedula: "1000000012", nombres: "Felipe", apellidos: "Rojas", cargo: "Asesor comercial", salario: "2400000.00" },
  ];
  const empleadosDemo = [] as Array<typeof empleados.$inferSelect>;
  for (const item of plantilla) {
    const [empleado] = await db.insert(empleados).values({
      tenant_id: tenant.id, cedula: item.cedula, nombres: item.nombres, apellidos: item.apellidos,
      cargo: item.cargo, fecha_ingreso: "2026-01-02", salario_base: item.salario, tipo_contrato: "indefinido",
      municipio_dian_id: 149, direccion: "Carrera 13 # 82-74, Bogotá D.C.",
      tipo_trabajador_plemsi_id: 1, subtipo_trabajador_plemsi_id: 1, tipo_contrato_plemsi_id: 2,
    }).onConflictDoUpdate({
      target: [empleados.tenant_id, empleados.cedula],
      set: { cargo: item.cargo, municipio_dian_id: 149, direccion: "Carrera 13 # 82-74, Bogotá D.C.", tipo_trabajador_plemsi_id: 1, subtipo_trabajador_plemsi_id: 1, tipo_contrato_plemsi_id: 2, updated_at: new Date() },
    }).returning();
    empleadosDemo.push(empleado);
  }

  const [periodo] = await db.insert(nominas_periodo).values({
    tenant_id: tenant.id, ano: 2026, mes: 7, estado: "aprobada",
    totales_calculados: { total_devengado: 4_400_000, total_deducciones: 352_000, total_neto_pagar: 4_048_000 },
  }).onConflictDoUpdate({
    target: [nominas_periodo.tenant_id, nominas_periodo.ano, nominas_periodo.mes, nominas_periodo.quincena],
    set: { estado: "aprobada", updated_at: new Date() },
  }).returning();

  for (const empleado of empleadosDemo) {
    const salario = Number(empleado.salario_base);
    const salud = salario * 0.04;
    const pension = salario * 0.04;
    await db.insert(nominas_detalle).values({
      nomina_periodo_id: periodo.id, empleado_id: empleado.id, salario_base: empleado.salario_base,
      auxilio_transporte: "0", salud_empleado: String(salud), pension_empleado: String(pension),
      retencion_fuente: "0", otras_deducciones: "0", deducciones_totales: String(salud + pension),
      aportes_parafiscales: "0", neto_pagar: String(salario - salud - pension),
    }).onConflictDoNothing();
  }
  console.log("✓ Nómina ficticia julio 2026 creada: 2 empleados, período aprobado, sin emisión externa.");
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
