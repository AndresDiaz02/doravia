import { db, asientos_contables, tenants, facturas, gastos, notas_credito } from "../index.js";
import { eq, count, sql } from "drizzle-orm";

const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.nit, "901234567")).limit(1);
if (!t) throw new Error("Tenant 901234567 no encontrado");
const TID = t.id;

const [{ numAsientos }] = await db.select({ numAsientos: count() }).from(asientos_contables).where(eq(asientos_contables.tenant_id, TID));

// drizzle + postgres.js returns rows array directly
const balRows = await db.execute(
  sql`SELECT ROUND(SUM(l.debito::numeric),2) AS d, ROUND(SUM(l.credito::numeric),2) AS c,
      ROUND(SUM(l.debito::numeric)-SUM(l.credito::numeric),2) AS diff
      FROM lineas_asiento l JOIN asientos_contables a ON a.id=l.asiento_id WHERE a.tenant_id=${TID}`
);
const bal = (balRows as unknown as { d: string; c: string; diff: string }[])[0];

const estF = await db.execute(sql`SELECT estado, COUNT(*) AS cnt FROM facturas WHERE tenant_id=${TID} GROUP BY estado ORDER BY estado`);
const estG = await db.execute(sql`SELECT estado, COUNT(*) AS cnt FROM gastos WHERE tenant_id=${TID} GROUP BY estado ORDER BY estado`);
const ncR  = await db.execute(sql`SELECT tipo, COUNT(*) AS cnt FROM notas_credito WHERE tenant_id=${TID} GROUP BY tipo ORDER BY tipo`);

console.log("═══════════════════════════════════════════");
console.log("  VERIFICACIÓN ENTORNO CONTADOR");
console.log("═══════════════════════════════════════════");
console.log(`  Asientos contables : ${numAsientos}`);
console.log(`  Total débitos      : $${Number(bal.d).toLocaleString("es-CO")}`);
console.log(`  Total créditos     : $${Number(bal.c).toLocaleString("es-CO")}`);
console.log(`  Diferencia (debe=0): $${bal.diff}`);
console.log("  Estados facturas   :", JSON.stringify(estF as unknown[]));
console.log("  Estados gastos     :", JSON.stringify(estG as unknown[]));
console.log("  Notas crédito      :", JSON.stringify(ncR as unknown[]));
