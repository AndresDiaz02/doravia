import type { NewCuentaContable } from "../schema/contabilidad.js";

// PUC simplificado para NIIF Grupo 2/3 — cuentas de sistema (tenant_id null).
// Cubre las operaciones de Semilla y Raíz. Cosecha agrega centros de costos sobre este PUC.
export const PUC_BASE: Omit<NewCuentaContable, "id" | "tenant_id" | "created_at">[] = [
  // ── Clase 1 — Activos ──────────────────────────────────────────────────
  { codigo: "1", nombre: "Activos", tipo: "activo", naturaleza: "debito", nivel: 1, padre_id: null, activo: true },
  { codigo: "11", nombre: "Efectivo y equivalentes", tipo: "activo", naturaleza: "debito", nivel: 2, padre_id: null, activo: true },
  { codigo: "1105", nombre: "Caja", tipo: "activo", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "1110", nombre: "Bancos", tipo: "activo", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "13", nombre: "Deudores comerciales y otras cuentas por cobrar", tipo: "activo", naturaleza: "debito", nivel: 2, padre_id: null, activo: true },
  { codigo: "1305", nombre: "Clientes nacionales", tipo: "activo", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "1355", nombre: "Anticipos y avances", tipo: "activo", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "14", nombre: "Inventarios", tipo: "activo", naturaleza: "debito", nivel: 2, padre_id: null, activo: true },
  { codigo: "1435", nombre: "Mercancías no fabricadas por la empresa", tipo: "activo", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },

  // ── Clase 2 — Pasivos ──────────────────────────────────────────────────
  { codigo: "2", nombre: "Pasivos", tipo: "pasivo", naturaleza: "credito", nivel: 1, padre_id: null, activo: true },
  { codigo: "21", nombre: "Obligaciones financieras", tipo: "pasivo", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "2105", nombre: "Bancos nacionales", tipo: "pasivo", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "22", nombre: "Proveedores", tipo: "pasivo", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "2205", nombre: "Proveedores nacionales", tipo: "pasivo", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "24", nombre: "Impuestos por pagar", tipo: "pasivo", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "2408", nombre: "IVA por pagar", tipo: "pasivo", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "2410", nombre: "Impuesto al Consumo por pagar", tipo: "pasivo", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "2365", nombre: "Retención en la fuente por pagar", tipo: "pasivo", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "2368", nombre: "Impuesto de industria y comercio retenido (ReteICA)", tipo: "pasivo", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },

  // ── Clase 3 — Patrimonio ───────────────────────────────────────────────
  { codigo: "3", nombre: "Patrimonio", tipo: "patrimonio", naturaleza: "credito", nivel: 1, padre_id: null, activo: true },
  { codigo: "31", nombre: "Capital social", tipo: "patrimonio", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "3105", nombre: "Capital suscrito y pagado", tipo: "patrimonio", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "36", nombre: "Resultados del ejercicio", tipo: "patrimonio", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "3605", nombre: "Utilidad del ejercicio", tipo: "patrimonio", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },

  // ── Clase 4 — Ingresos ─────────────────────────────────────────────────
  { codigo: "4", nombre: "Ingresos", tipo: "ingreso", naturaleza: "credito", nivel: 1, padre_id: null, activo: true },
  { codigo: "41", nombre: "Ingresos operacionales", tipo: "ingreso", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "4135", nombre: "Comercio al por mayor y por menor", tipo: "ingreso", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "4175", nombre: "Ingresos por servicios", tipo: "ingreso", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },
  { codigo: "42", nombre: "Ingresos no operacionales", tipo: "ingreso", naturaleza: "credito", nivel: 2, padre_id: null, activo: true },
  { codigo: "4250", nombre: "Recuperaciones", tipo: "ingreso", naturaleza: "credito", nivel: 3, padre_id: null, activo: true },

  // ── Clase 5 — Gastos ───────────────────────────────────────────────────
  { codigo: "5", nombre: "Gastos", tipo: "gasto", naturaleza: "debito", nivel: 1, padre_id: null, activo: true },
  { codigo: "51", nombre: "Gastos operacionales de administración", tipo: "gasto", naturaleza: "debito", nivel: 2, padre_id: null, activo: true },
  { codigo: "5105", nombre: "Gastos de personal", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "5110", nombre: "Honorarios", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "5115", nombre: "Impuestos", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "5135", nombre: "Servicios públicos", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "5145", nombre: "Mantenimiento y reparaciones", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "5195", nombre: "Diversos", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
  { codigo: "52", nombre: "Gastos operacionales de ventas", tipo: "gasto", naturaleza: "debito", nivel: 2, padre_id: null, activo: true },
  { codigo: "5205", nombre: "Gastos de personal de ventas", tipo: "gasto", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },

  // ── Clase 6 — Costos ───────────────────────────────────────────────────
  { codigo: "6", nombre: "Costos de ventas", tipo: "costo", naturaleza: "debito", nivel: 1, padre_id: null, activo: true },
  { codigo: "61", nombre: "Costo de ventas y de prestación de servicios", tipo: "costo", naturaleza: "debito", nivel: 2, padre_id: null, activo: true },
  { codigo: "6135", nombre: "Comercio al por mayor y por menor", tipo: "costo", naturaleza: "debito", nivel: 3, padre_id: null, activo: true },
];
