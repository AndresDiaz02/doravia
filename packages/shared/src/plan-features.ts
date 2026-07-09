export const PLAN_FEATURES = [
  // Inventario
  "inventario",
  // Facturación
  "facturacion_ilimitada",
  "facturacion_recurrente",
  // Contabilidad avanzada
  "reportes_comparativos",
  "centros_costos",
  // Infraestructura
  "multi_sede",
  "ensamble",
  "cartera_avanzada",
  // CRM / Cotizaciones
  "cotizaciones",
  "cotizacion_a_factura",
  "oportunidades_crm",
  "pipeline_comercial",
  // Gastos / Cuentas por pagar
  "gastos",
  "cuentas_por_pagar",
  "programacion_pagos",
  "flujo_caja",
  // IA
  "ia_asistente",
  // POS
  "pos",
  "pos_multi_caja",
  // Conciliación bancaria
  "conciliacion_bancaria",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

// Plan mínimo requerido para desbloquear cada feature
export const FEATURE_MIN_PLAN: Partial<Record<PlanFeature, string>> = {
  inventario:             "Semilla",
  facturacion_ilimitada:  "Semilla",
  cotizaciones:           "Raíz",
  cotizacion_a_factura:   "Raíz",
  cartera_avanzada:       "Raíz",
  ensamble:               "Raíz",
  gastos:                 "Semilla",
  cuentas_por_pagar:      "Raíz",
  programacion_pagos:     "Raíz",
  facturacion_recurrente: "Brote",
  reportes_comparativos:  "Brote",
  oportunidades_crm:      "Brote",
  pipeline_comercial:     "Brote",
  ia_asistente:           "Raíz",
  centros_costos:         "Cosecha",
  multi_sede:             "Cosecha",
  flujo_caja:             "Cosecha",
  pos:                    "Punto",
  pos_multi_caja:         "Punto Plus",
  conciliacion_bancaria:  "Semilla",
};

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  inventario:              "Inventario",
  facturacion_ilimitada:   "Facturación ilimitada",
  facturacion_recurrente:  "Facturación recurrente",
  reportes_comparativos:   "Reportes comparativos",
  centros_costos:          "Centros de costos",
  multi_sede:              "Multi-sede",
  ensamble:                "Ensamble de productos",
  cartera_avanzada:        "Cartera avanzada",
  cotizaciones:            "Cotizaciones",
  cotizacion_a_factura:    "Conversión cotización → factura",
  oportunidades_crm:       "Seguimiento de oportunidades",
  pipeline_comercial:      "Pipeline comercial completo",
  gastos:                  "Registro de gastos",
  cuentas_por_pagar:       "Cuentas por pagar a proveedores",
  programacion_pagos:      "Programación de pagos",
  flujo_caja:              "Flujo de caja proyectado",
  ia_asistente:            "Asistente con IA",
  pos:                     "Punto de venta (POS)",
  pos_multi_caja:          "POS multi-caja",
  conciliacion_bancaria:   "Conciliación bancaria",
};

// Nivel contable ordinal — niveles superiores incluyen todos los anteriores
// 0 = sin contabilidad (planes Origen)
export const ACCOUNTING_LEVELS = {
  ninguno:        0,
  diario_mayor:   1,
  balance_general: 2,
  comparativo:    3,
  centros_costos: 4,
} as const;

export type AccountingLevel = keyof typeof ACCOUNTING_LEVELS;

export type PlanFeatures = Record<PlanFeature, boolean>;

export interface PlanLimits {
  max_usuarios:      number | null;
  max_bodegas:       number | null;
  max_facturas_mes:  number | null;
  max_facturas_ano:  number | null; // para Origen con límite anual
  max_ia_docs_mes:   number | null; // null = ilimitado, 0 = sin IA
}

export interface PlanDefinition extends PlanLimits {
  id: string;
  slug:
    | "origen"
    | "origen_24" | "origen_60" | "origen_120" | "origen_300"
    | "semilla" | "raiz" | "brote" | "cosecha"
    | "punto" | "punto_plus";
  nombre: string;
  accounting_level: number;
  features: PlanFeatures;
  precio_anual_cop: number;
}
