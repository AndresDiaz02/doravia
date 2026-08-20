import * as Sentry from "@sentry/node";
import {
  db, empleados, nominas_periodo, nominas_detalle, documentos_soporte_nomina,
  pool_documentos_nomina_tenant, tenants, nomina_plemsi_config,
} from "@workspace/db";
import type { NominaPeriodo, NominaDetalle, Empleado, Tenant } from "@workspace/db";
import { eq, and, or, gte, lte, isNull, count } from "drizzle-orm";
import { calcularNominaEmpleado, type AjusteEmpleado } from "./nomina/calculadora.js";
import { getParametrosNominaAnio, ParametrosNominaNotFoundError } from "./parametros-nomina.service.js";
import { getTaxParameter } from "./tax-parameters.service.js";
import { TAX_PARAM_KEYS } from "@workspace/db";
import { decrypt } from "./encryption.js";
import { emitirNominaIndividual } from "./plemsi.service.js";
import { crearAsientoNomina } from "./contabilidad.service.js";

export class NominaEstadoError extends Error {
  constructor(
    public readonly code: "ESTADO_INVALIDO" | "PERIODO_NO_ENCONTRADO" | "SIN_EMPLEADOS" | "POOL_INSUFICIENTE" | "PLEMSI_NO_LISTO",
    message: string,
  ) {
    super(message);
    this.name = "NominaEstadoError";
  }
}

function periodoRangoFechas(periodo: NominaPeriodo): { inicio: string; fin: string } {
  const ultimoDia = new Date(periodo.ano, periodo.mes, 0).getDate();
  if (periodo.quincena === 1) {
    return { inicio: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-01`, fin: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-15` };
  }
  if (periodo.quincena === 2) {
    return { inicio: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-16`, fin: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-${ultimoDia}` };
  }
  return { inicio: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-01`, fin: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-${ultimoDia}` };
}

async function validarAlistamientoParaEmitir(tenantId: string, detalles: NominaDetalle[]): Promise<void> {
  const [config] = await db.select().from(nomina_plemsi_config)
    .where(eq(nomina_plemsi_config.tenant_id, tenantId)).limit(1);
  const pendientes: string[] = [];
  if (!config?.habilitado || !config.api_key_encrypted) pendientes.push("token de nómina Plemsi");
  if (!config?.resolucion_individual || !config.prefijo_individual) pendientes.push("numeración individual");

  const ids = [...new Set(detalles.map((detalle) => detalle.empleado_id))];
  const rows = await db.select().from(empleados).where(and(eq(empleados.tenant_id, tenantId)));
  for (const empleado of rows.filter((row) => ids.includes(row.id))) {
    if (!empleado.municipio_dian_id || !empleado.direccion || !empleado.tipo_trabajador_plemsi_id || !empleado.subtipo_trabajador_plemsi_id || !empleado.tipo_contrato_plemsi_id) {
      pendientes.push(`datos Plemsi de ${empleado.nombres} ${empleado.apellidos}`);
    }
  }
  const conConceptosPendientes = detalles.filter((detalle) => Number(detalle.horas_extras_valor) > 0 || Number(detalle.recargos_valor) > 0);
  if (conConceptosPendientes.length > 0) pendientes.push("equivalencias Plemsi para horas extra o recargos");
  if (pendientes.length > 0) {
    throw new NominaEstadoError("PLEMSI_NO_LISTO", `No se puede emitir: falta ${pendientes.join(", ")}.`);
  }
}

async function getPeriodoTenant(tenantId: string, periodoId: string): Promise<NominaPeriodo> {
  const [periodo] = await db.select().from(nominas_periodo)
    .where(and(eq(nominas_periodo.id, periodoId), eq(nominas_periodo.tenant_id, tenantId))).limit(1);
  if (!periodo) throw new NominaEstadoError("PERIODO_NO_ENCONTRADO", "Período de nómina no encontrado.");
  return periodo;
}

/**
 * Calcula (o recalcula) la nómina de un período: trae los empleados activos en el rango de
 * fechas del período, aplica calculadora.ts por cada uno, y guarda/actualiza nominas_detalle.
 * Solo válido desde 'borrador' o 'calculada' (recalcular antes de aprobar es válido).
 *
 * `ajustes` — overrides manuales por empleado (horas extra/recargos/comisiones/otras deducciones
 * en COP). Etapa 2 (LITE) no calcula horas extra desde turnos — eso es Etapa 4 (Plus).
 */
export async function calcularPeriodo(
  tenantId: string,
  periodoId: string,
  ajustes: Record<string, AjusteEmpleado> = {},
): Promise<{ periodo: NominaPeriodo; detalles: NominaDetalle[] }> {
  const periodo = await getPeriodoTenant(tenantId, periodoId);
  if (periodo.estado !== "borrador" && periodo.estado !== "calculada") {
    throw new NominaEstadoError("ESTADO_INVALIDO", `No se puede calcular un período en estado "${periodo.estado}".`);
  }

  const { inicio, fin } = periodoRangoFechas(periodo);

  const empleadosPeriodo = await db.select().from(empleados).where(
    and(
      eq(empleados.tenant_id, tenantId),
      lte(empleados.fecha_ingreso, fin),
      or(eq(empleados.estado, "activo"), and(eq(empleados.estado, "retirado"), gte(empleados.fecha_retiro, inicio))),
    ),
  );

  if (empleadosPeriodo.length === 0) {
    throw new NominaEstadoError("SIN_EMPLEADOS", "No hay empleados activos para este período.");
  }

  const parametros = await getParametrosNominaAnio(periodo.ano);
  const uvtParam = await getTaxParameter(TAX_PARAM_KEYS.UVT, fin);
  const uvt = Number(uvtParam.valor);

  const detalles: NominaDetalle[] = [];
  let totalDevengado = 0, totalDeducciones = 0, totalAportes = 0, totalNeto = 0, totalAuxilioTransporte = 0;

  for (const empleado of empleadosPeriodo) {
    const calculo = calcularNominaEmpleado(empleado, ajustes[empleado.id] ?? {}, parametros, uvt, fin);
    const devengado = calculo.salario_base + calculo.horas_extras_valor + calculo.recargos_valor + calculo.comisiones_valor;
    totalDevengado += devengado;
    totalDeducciones += calculo.deducciones_totales;
    totalAportes += calculo.aportes_parafiscales;
    totalNeto += calculo.neto_pagar;
    totalAuxilioTransporte += calculo.auxilio_transporte;

    const [row] = await db
      .insert(nominas_detalle)
      .values({
        nomina_periodo_id: periodo.id,
        empleado_id: empleado.id,
        salario_base: String(calculo.salario_base),
        horas_extras_valor: String(calculo.horas_extras_valor),
        recargos_valor: String(calculo.recargos_valor),
        comisiones_valor: String(calculo.comisiones_valor),
        auxilio_transporte: String(calculo.auxilio_transporte),
        salud_empleado: String(calculo.salud_empleado),
        pension_empleado: String(calculo.pension_empleado),
        retencion_fuente: String(calculo.retencion_fuente),
        otras_deducciones: String(calculo.otras_deducciones),
        deducciones_totales: String(calculo.deducciones_totales),
        aportes_parafiscales: String(calculo.aportes_parafiscales),
        neto_pagar: String(calculo.neto_pagar),
      })
      .onConflictDoUpdate({
        target: [nominas_detalle.nomina_periodo_id, nominas_detalle.empleado_id],
        set: {
          salario_base: String(calculo.salario_base),
          horas_extras_valor: String(calculo.horas_extras_valor),
          recargos_valor: String(calculo.recargos_valor),
          comisiones_valor: String(calculo.comisiones_valor),
          auxilio_transporte: String(calculo.auxilio_transporte),
          salud_empleado: String(calculo.salud_empleado),
          pension_empleado: String(calculo.pension_empleado),
          retencion_fuente: String(calculo.retencion_fuente),
          otras_deducciones: String(calculo.otras_deducciones),
          deducciones_totales: String(calculo.deducciones_totales),
          aportes_parafiscales: String(calculo.aportes_parafiscales),
          neto_pagar: String(calculo.neto_pagar),
        },
      })
      .returning();

    detalles.push(row);
  }

  const [periodoActualizado] = await db
    .update(nominas_periodo)
    .set({
      estado: "calculada",
      totales_calculados: {
        total_devengado: round2(totalDevengado),
        total_deducciones: round2(totalDeducciones),
        total_aportes_parafiscales: round2(totalAportes),
        total_neto_pagar: round2(totalNeto),
        total_auxilio_transporte: round2(totalAuxilioTransporte),
      },
      updated_at: new Date(),
    })
    .where(eq(nominas_periodo.id, periodo.id))
    .returning();

  return { periodo: periodoActualizado, detalles };
}

/** Aprueba un período ya calculado — solo cambia estado, no recalcula. */
export async function aprobarPeriodo(tenantId: string, periodoId: string): Promise<NominaPeriodo> {
  const periodo = await getPeriodoTenant(tenantId, periodoId);
  if (periodo.estado !== "calculada") {
    throw new NominaEstadoError("ESTADO_INVALIDO", `Solo se puede aprobar un período en estado "calculada" (actual: "${periodo.estado}").`);
  }
  const [actualizado] = await db.update(nominas_periodo)
    .set({ estado: "aprobada", updated_at: new Date() })
    .where(eq(nominas_periodo.id, periodo.id))
    .returning();
  return actualizado;
}

/**
 * Envía UN documento de nómina a Plemsi. Nunca lanza — actualiza documentos_soporte_nomina
 * con el resultado (mismo patrón best-effort que factura.service.ts:enviarAPlemsiSiAplica).
 */
async function enviarNominaAPlemsi(
  tenant: Tenant,
  detalle: NominaDetalle,
  empleado: Empleado,
  periodo: NominaPeriodo,
  numeroSecuencial: number,
): Promise<{ ok: boolean; error?: string }> {
  const [config] = await db.select().from(nomina_plemsi_config)
    .where(eq(nomina_plemsi_config.tenant_id, tenant.id)).limit(1);
  if (!config?.habilitado || !config.api_key_encrypted || !config.resolucion_individual || !config.prefijo_individual) {
    await db.insert(documentos_soporte_nomina).values({
      tenant_id: tenant.id,
      nomina_detalle_id: detalle.id,
      estado_dian: "error",
      error_dian: "La configuración de nómina Plemsi está incompleta para esta empresa.",
    }).onConflictDoUpdate({
      target: documentos_soporte_nomina.nomina_detalle_id,
      set: { estado_dian: "error", error_dian: "La configuración de nómina Plemsi está incompleta para esta empresa." },
    });
    return { ok: false, error: "Plemsi nómina no configurado" };
  }

  const datosBancarios = empleado.datos_bancarios_encrypted
    ? JSON.parse(decrypt(empleado.datos_bancarios_encrypted)) as Record<string, string>
    : {};

  const { inicio, fin } = periodoRangoFechas(periodo);
  const resultado = await emitirNominaIndividual({
    apiKey: decrypt(config.api_key_encrypted),
    ambiente: config.ambiente,
    numeracion: {
      resolucion: config.resolucion_individual,
      prefijo: config.prefijo_individual,
      numero: config.siguiente_numero_individual,
    },
    periodo: {
      fechaIngreso: empleado.fecha_ingreso,
      fechaLiquidacionInicio: inicio,
      fechaLiquidacionFin: fin,
      fechaGeneracion: new Date().toISOString().slice(0, 10),
    },
    empleado: {
      numeroDocumento: empleado.cedula,
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      salario: Number(detalle.salario_base),
      municipioDianId: empleado.municipio_dian_id,
      direccion: empleado.direccion,
      tipoTrabajadorId: empleado.tipo_trabajador_plemsi_id,
      subtipoTrabajadorId: empleado.subtipo_trabajador_plemsi_id,
      tipoContratoId: empleado.tipo_contrato_plemsi_id,
      salarioIntegral: empleado.salario_integral,
      pensionAltoRiesgo: empleado.pension_alto_riesgo,
    },
    pago: {
      metodoId: Number(datosBancarios.metodo_pago_id ?? 10),
      banco: datosBancarios.banco,
      tipoCuenta: datosBancarios.tipo_cuenta,
      numeroCuenta: datosBancarios.cuenta,
    },
    devengos: {
      salarioBase: Number(detalle.salario_base),
      auxilioTransporte: Number(detalle.auxilio_transporte),
      horasExtra: Number(detalle.horas_extras_valor),
      recargos: Number(detalle.recargos_valor),
      comisiones: Number(detalle.comisiones_valor),
    },
    deducciones: {
      saludEmpleado: Number(detalle.salud_empleado),
      pensionEmpleado: Number(detalle.pension_empleado),
      retencionFuente: Number(detalle.retencion_fuente),
      otras: Number(detalle.otras_deducciones),
    },
    netoPagar: Number(detalle.neto_pagar),
  });

  await db.insert(documentos_soporte_nomina).values({
    tenant_id: tenant.id,
    nomina_detalle_id: detalle.id,
    cude: resultado.cufe ?? null,
    estado_dian: resultado.ok ? "emitida" : "error",
    fecha_emision: resultado.ok ? new Date() : null,
    plemsi_response: resultado.respuesta ?? null,
    error_dian: resultado.ok ? null : (resultado.error ?? null),
  }).onConflictDoUpdate({
    target: documentos_soporte_nomina.nomina_detalle_id,
    set: {
      cude: resultado.cufe ?? null,
      estado_dian: resultado.ok ? "emitida" : "error",
      fecha_emision: resultado.ok ? new Date() : null,
      plemsi_response: resultado.respuesta ?? null,
      error_dian: resultado.ok ? null : (resultado.error ?? null),
    },
  });

  if (!resultado.ok) {
    console.error(`[PLEMSI] Error nómina empleado ${empleado.cedula}: ${resultado.error}`);
    Sentry.withScope((scope) => {
      scope.setTag("tipo_error", "dian_emission");
      scope.setTag("tipo_documento", "nomina");
      scope.setContext("documento", { nomina_detalle_id: detalle.id, tenant_id: tenant.id, empleado_id: empleado.id });
      Sentry.captureException(new Error(`Plemsi nomina emission failed: ${resultado.error}`));
    });
  }

  if (resultado.ok) {
    await db.update(nomina_plemsi_config)
      .set({ siguiente_numero_individual: config.siguiente_numero_individual + 1, updated_at: new Date() })
      .where(eq(nomina_plemsi_config.tenant_id, tenant.id));
  }

  return resultado;
}

/**
 * Emite un período aprobado: consume 1 documento del pool por empleado (chequeo de saldo
 * SOLO aquí, nunca en calcular/aprobar — regla de negocio confirmada), envía cada empleado a
 * Plemsi (best-effort, nunca bloquea la emisión completa por un error individual), y genera
 * el asiento contable consolidado del período.
 */
export async function emitirPeriodo(
  tenantId: string,
  periodoId: string,
): Promise<{ periodo: NominaPeriodo; advertencias: string[] }> {
  const periodo = await getPeriodoTenant(tenantId, periodoId);
  if (periodo.estado !== "aprobada") {
    throw new NominaEstadoError("ESTADO_INVALIDO", `Solo se puede emitir un período en estado "aprobada" (actual: "${periodo.estado}").`);
  }

  const detalles = await db.select().from(nominas_detalle).where(eq(nominas_detalle.nomina_periodo_id, periodo.id));
  if (detalles.length === 0) {
    throw new NominaEstadoError("SIN_EMPLEADOS", "El período no tiene empleados calculados.");
  }

  // Nunca enviar datos parciales al proveedor: este chequeo sucede antes de
  // consumir pool, crear asiento o reservar consecutivos.
  await validarAlistamientoParaEmitir(tenantId, detalles);

  const [pool] = await db.select().from(pool_documentos_nomina_tenant).where(eq(pool_documentos_nomina_tenant.tenant_id, tenantId)).limit(1);
  if (!pool) throw new NominaEstadoError("POOL_INSUFICIENTE", "Tu empresa no tiene un pool de nómina activo.");

  const disponibles = pool.documentos_incluidos + pool.documentos_acumulados_previos + pool.documentos_adicionales_comprados - pool.documentos_consumidos_ciclo;
  if (disponibles < detalles.length) {
    throw new NominaEstadoError(
      "POOL_INSUFICIENTE",
      `Documentos insuficientes en el pool: disponibles ${Math.max(0, disponibles)}, requeridos ${detalles.length}. Compra documentos adicionales o actualiza tu plan de nómina.`,
    );
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const empleadosIds = [...new Set(detalles.map((d) => d.empleado_id))];
  const empleadosRows = await db.select().from(empleados).where(and(eq(empleados.tenant_id, tenantId)));
  const empleadosMap = new Map(empleadosRows.filter((e) => empleadosIds.includes(e.id)).map((e) => [e.id, e]));

  const [{ value: yaEmitidos }] = await db.select({ value: count() }).from(documentos_soporte_nomina).where(eq(documentos_soporte_nomina.tenant_id, tenantId));
  let secuencial = Number(yaEmitidos) + 1;

  const advertencias: string[] = [];
  for (const detalle of detalles) {
    const empleado = empleadosMap.get(detalle.empleado_id);
    if (!empleado) { advertencias.push(`Empleado ${detalle.empleado_id} no encontrado — se omitió su emisión.`); continue; }
    try {
      const resultado = await enviarNominaAPlemsi(tenant, detalle, empleado, periodo, secuencial++);
      if (!resultado.ok) advertencias.push(`${empleado.nombres} ${empleado.apellidos}: ${resultado.error}`);
    } catch (e) {
      advertencias.push(`${empleado.nombres} ${empleado.apellidos}: error inesperado al emitir.`);
      console.error(`[NOMINA] Error inesperado emitiendo empleado ${empleado.id}:`, e);
    }
  }

  // El consumo del pool se descuenta por intento (Plemsi cobra por envío, no solo por éxito) —
  // mismo criterio que facturación electrónica de documentos normales.
  await db.update(pool_documentos_nomina_tenant)
    .set({ documentos_consumidos_ciclo: pool.documentos_consumidos_ciclo + detalles.length, updated_at: new Date() })
    .where(eq(pool_documentos_nomina_tenant.tenant_id, tenantId));

  let asientoId: string | null = null;
  try {
    asientoId = await crearAsientoNomina(tenantId, periodo, detalles);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido al crear asiento contable.";
    advertencias.push(`Asiento contable: ${msg}`);
    console.error(`[CONTABILIDAD] Asiento nómina período ${periodo.id} fallido:`, msg);
  }

  const [periodoFinal] = await db.update(nominas_periodo)
    .set({ estado: "emitida", asiento_id: asientoId, updated_at: new Date() })
    .where(eq(nominas_periodo.id, periodo.id))
    .returning();

  return { periodo: periodoFinal, advertencias };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export { ParametrosNominaNotFoundError };
