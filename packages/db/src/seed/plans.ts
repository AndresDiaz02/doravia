import type { NewPlan } from "../schema/plans.js";
import type { PlanFeatures } from "@workspace/shared";

const noFeatures: PlanFeatures = {
  pos:             false,
  pos_multi_caja:  false,
  inventario:             false,
  facturacion_ilimitada:  false,
  facturacion_recurrente: false,
  reportes_comparativos:  false,
  centros_costos:         false,
  multi_sede:             false,
  ensamble:               false,
  cartera_avanzada:       false,
  cotizaciones:           false,
  cotizacion_a_factura:   false,
  oportunidades_crm:      false,
  pipeline_comercial:     false,
  gastos:                 false,
  cuentas_por_pagar:      false,
  programacion_pagos:     false,
  flujo_caja:             false,
  ia_asistente:           false,
};

export const PLAN_SEEDS: NewPlan[] = [
  // ── Plan gratuito de entrada ─────────────────────────────────────────────
  {
    slug: "origen",
    nombre: "Origen",
    max_usuarios: 1,
    max_bodegas: 0,
    max_facturas_mes: null,
    max_facturas_año: 30,   // 30 facturas/año
    max_ia_docs_mes: 0,     // sin IA
    accounting_level: 0,    // sin contabilidad
    features: { ...noFeatures },
    precio_anual_cop: 0,
  },
  // ── Plan solo facturación ────────────────────────────────────────────────
  {
    slug: "expres",
    nombre: "Exprés",
    max_usuarios: 1,
    max_bodegas: 0,
    max_facturas_mes: null,
    max_facturas_año: 300,  // 300 facturas/año
    max_ia_docs_mes: 0,     // sin IA
    accounting_level: 0,    // sin contabilidad
    features: { ...noFeatures },
    precio_anual_cop: 350_000,
  },
  // ── Escalera principal ───────────────────────────────────────────────────
  {
    slug: "semilla",
    nombre: "Semilla",
    max_usuarios: 1,
    max_bodegas: 0,
    max_facturas_mes: 50,
    max_facturas_año: null,
    max_ia_docs_mes: 30,
    accounting_level: 1,    // libro diario + mayor
    features: {
      ...noFeatures,
      cotizaciones:  true,
      gastos:        true,
      ia_asistente:  true,
    },
    precio_anual_cop: 730_000,
  },
  {
    slug: "raiz",
    nombre: "Raíz",
    max_usuarios: 2,
    max_bodegas: 1,
    max_facturas_mes: null,
    max_facturas_año: null,
    max_ia_docs_mes: 100,
    accounting_level: 2,    // + balance general + estado de resultados
    features: {
      ...noFeatures,
      inventario:           true,
      facturacion_ilimitada: true,
      cotizaciones:          true,
      cotizacion_a_factura:  true,
      gastos:                true,
      cuentas_por_pagar:     true,
      ia_asistente:          true,
    },
    precio_anual_cop: 1_150_000,
  },
  {
    slug: "brote",
    nombre: "Brote",
    max_usuarios: 4,
    max_bodegas: 3,
    max_facturas_mes: null,
    max_facturas_año: null,
    max_ia_docs_mes: 300,
    accounting_level: 3,    // + reportes comparativos
    features: {
      ...noFeatures,
      inventario:            true,
      facturacion_ilimitada: true,
      facturacion_recurrente: true,
      reportes_comparativos: true,
      cotizaciones:          true,
      cotizacion_a_factura:  true,
      oportunidades_crm:     true,
      gastos:                true,
      cuentas_por_pagar:     true,
      programacion_pagos:    true,
      ia_asistente:          true,
    },
    precio_anual_cop: 1_680_000,
  },
  {
    slug: "cosecha",
    nombre: "Cosecha",
    max_usuarios: 6,
    max_bodegas: null,
    max_facturas_mes: null,
    max_facturas_año: null,
    max_ia_docs_mes: null,  // ilimitado
    accounting_level: 4,    // + centros de costos
    features: {
      inventario:            true,
      facturacion_ilimitada: true,
      facturacion_recurrente: true,
      reportes_comparativos: true,
      centros_costos:        true,
      multi_sede:            true,
      ensamble:              true,
      cartera_avanzada:      true,
      cotizaciones:          true,
      cotizacion_a_factura:  true,
      oportunidades_crm:     true,
      pipeline_comercial:    true,
      gastos:                true,
      cuentas_por_pagar:     true,
      programacion_pagos:    true,
      flujo_caja:            true,
      ia_asistente:          true,
    },
    precio_anual_cop: 2_320_000,
  },

  // ── Planes POS ──────────────────────────────────────────────────────────────
  {
    slug: "pos_basico",
    nombre: "POS Básico",
    max_usuarios: 2,
    max_bodegas: 1,
    max_facturas_mes: null,
    max_facturas_año: null,
    max_ia_docs_mes: 0,
    accounting_level: 0,
    features: {
      ...noFeatures,
      inventario:  true,
      gastos:      true,
      pos:         true,
    },
    precio_anual_cop: 480_000,
  },
  {
    slug: "pos_pro",
    nombre: "POS Pro",
    max_usuarios: null,
    max_bodegas: 3,
    max_facturas_mes: null,
    max_facturas_año: null,
    max_ia_docs_mes: 0,
    accounting_level: 1,
    features: {
      ...noFeatures,
      inventario:      true,
      gastos:          true,
      cuentas_por_pagar: true,
      pos:             true,
      pos_multi_caja:  true,
    },
    precio_anual_cop: 840_000,
  },
];
