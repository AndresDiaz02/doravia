import { pgTable, uuid, integer, numeric, varchar, timestamp, unique } from "drizzle-orm/pg-core";

// Parámetros normativos anuales de nómina (salario mínimo, % de aportes, etc).
// Un registro por año, INMUTABLE — nunca se actualiza, se inserta uno nuevo cuando cambia la norma.
// Mismo principio que tax_parameters (packages/db/src/schema/tax_parameters.ts) pero indexado
// por año en vez de rango de vigencia, porque estos valores siempre cambian juntos una vez al año.
//
// ⚠️ retencion_base_uvt / retencion_pct_simplificada implementan una aproximación simplificada
// de la retención en la fuente laboral (NO es la tabla progresiva del Art. 383 ET completa).
// Ver services/nomina/deducciones.ts para el detalle — requiere revisión de un contador antes
// de usarse con nóminas reales de producción.
export const parametros_nomina_anuales = pgTable("parametros_nomina_anuales", {
  id: uuid("id").primaryKey().defaultRandom(),
  ano: integer("ano").notNull(),
  salario_minimo_cop: integer("salario_minimo_cop").notNull(),
  auxilio_transporte_cop: integer("auxilio_transporte_cop").notNull(),
  // Auxilio de transporte aplica solo a quienes ganan hasta N SMLV (2 en 2026)
  tope_auxilio_transporte_smlv: numeric("tope_auxilio_transporte_smlv", { precision: 4, scale: 2 }).notNull(),
  salud_empleado_pct: numeric("salud_empleado_pct", { precision: 5, scale: 2 }).notNull(),
  salud_empleador_pct: numeric("salud_empleador_pct", { precision: 5, scale: 2 }).notNull(),
  pension_empleado_pct: numeric("pension_empleado_pct", { precision: 5, scale: 2 }).notNull(),
  pension_empleador_pct: numeric("pension_empleador_pct", { precision: 5, scale: 2 }).notNull(),
  // ARL clase I (riesgo mínimo) como valor por defecto — variable por clase de riesgo real (Etapa futura)
  arl_pct_default: numeric("arl_pct_default", { precision: 5, scale: 4 }).notNull(),
  sena_pct: numeric("sena_pct", { precision: 5, scale: 2 }).notNull(),
  icbf_pct: numeric("icbf_pct", { precision: 5, scale: 2 }).notNull(),
  caja_compensacion_pct: numeric("caja_compensacion_pct", { precision: 5, scale: 2 }).notNull(),
  cesantias_pct: numeric("cesantias_pct", { precision: 5, scale: 2 }).notNull(),
  intereses_cesantias_pct: numeric("intereses_cesantias_pct", { precision: 5, scale: 2 }).notNull(),
  prima_pct: numeric("prima_pct", { precision: 5, scale: 2 }).notNull(),
  vacaciones_pct: numeric("vacaciones_pct", { precision: 5, scale: 2 }).notNull(),
  // Retención en la fuente laboral — aproximación simplificada (ver nota arriba)
  retencion_base_uvt: numeric("retencion_base_uvt", { precision: 8, scale: 2 }).notNull(),
  retencion_pct_simplificada: numeric("retencion_pct_simplificada", { precision: 5, scale: 2 }).notNull(),
  fuente_normativa: varchar("fuente_normativa", { length: 300 }),
  creado_por: varchar("creado_por", { length: 200 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq_parametros_nomina_ano: unique("uq_parametros_nomina_ano").on(t.ano),
}));

export type ParametrosNominaAnuales = typeof parametros_nomina_anuales.$inferSelect;
export type NewParametrosNominaAnuales = typeof parametros_nomina_anuales.$inferInsert;
