# Deuda técnica — Nómina Electrónica (Fase 10)

Estado: **Etapa 1 y 2 aprobadas con esta deuda técnica documentada.** Ninguno de los tres puntos bloquea el desarrollo funcional (Etapas 3+ pueden avanzar en paralelo), pero **(c) es bloqueante para vender/emitir nómina real** hasta resolverse. Sin merge a `main` hasta que las tres queden cerradas.

---

## a. Endpoint de Plemsi para nómina — asumido, sin confirmar

**Dónde:** `apps/api/src/services/plemsi.service.ts`, función `emitirNominaIndividual`.

Plemsi expone nómina electrónica como producto separado de facturación (`/api/billing/*`). El path usado, `POST /api/payroll/individual`, sigue la misma convención REST del resto del archivo pero **no fue verificado contra la documentación real de Plemsi para nómina** — no había credenciales de prueba de nómina disponibles en el entorno donde se implementó.

El manejo de la respuesta (fallback de CUDE, mapeo de errores, actualización de `estado_dian`) sí replica el patrón ya probado en producción para facturas/notas — ese código no debería necesitar cambios grandes, solo el path y el shape exacto del `body`.

**Para cerrar:** confirmar con Plemsi el endpoint real, el shape del payload esperado, y probar contra su ambiente de pruebas con una API key de nómina real. Actualizar `emitirNominaIndividual` en consecuencia.

**Bloquea:** solo la emisión real a la DIAN. Calcular, aprobar, PDF y contabilización funcionan sin esto (Plemsi es best-effort — si falla, el período igual queda "emitida" con advertencia, no se bloquea el flujo).

---

## b. Salario mínimo 2026 — estimado, no confirmado

**Dónde:** `packages/db/src/migrate.ts` (seed de `parametros_nomina_anuales`, año 2026), replicado en `apps/api/src/__tests__/nomina-calculo.test.ts`.

Valores cargados como estimado:
- `salario_minimo_cop`: 1.509.000
- `auxilio_transporte_cop`: 212.000

No se confirmó la cifra exacta del decreto oficial del Ministerio de Trabajo (Diciembre 2025). Los **porcentajes** de aportes (salud, pensión, ARL, parafiscales, cesantías, prima, vacaciones) sí son norma estable y no decretada anualmente — esos no tienen este problema.

**Para cerrar:** confirmar el valor exacto del decreto SMLV 2026 e insertar una fila corregida en `parametros_nomina_anuales` (la tabla es inmutable — no se sobreescribe, se corrige con `UPDATE` puntual antes de que haya nóminas calculadas con el valor estimado, o con una nueva fila si ya las hay).

**Bloquea:** cualquier cálculo de nómina real hecho con el valor estimado quedará con salario base incorrecto si el decreto real difiere. No bloquea el desarrollo de Etapas 3+.

---

## c. Retención en la fuente — aproximación simplificada ⚠️ BLOQUEANTE PARA VENDER

**Dónde:** `apps/api/src/services/nomina/deducciones.ts`, función `calcularRetencionFuenteSimplificada`; parámetros en `parametros_nomina_anuales.retencion_base_uvt` / `retencion_pct_simplificada`.

Lo implementado: exento por debajo de un umbral (95 UVT), tarifa marginal **única** (19%) sobre el exceso. Esto **NO es la tabla progresiva real del Art. 383 del Estatuto Tributario**, que tiene múltiples tramos UVT con tarifas marginales distintas y deducciones fijas por tramo. Fue una decisión explícita de alcance para Etapa 2 ("procedimiento 1 fijo" vs. "procedimiento 2 por tabla", este último fuera de alcance según el documento de fase), pero incluso el procedimiento 1 real de la ley es más complejo que esta aproximación de tarifa única.

**Por qué es bloqueante:** una retención mal calculada es un error tributario real con consecuencias legales para el cliente (Doravia calculando mal impuestos de terceros). No es aceptable para nómina de producción, aunque no impide seguir construyendo el resto del sistema.

**Para cerrar:** implementar la tabla progresiva completa del Art. 383 ET (todos los tramos UVT vigentes, con sus tarifas marginales y deducciones por tramo), revisada y aprobada por un contador antes de habilitarse. Candidato natural para una etapa dedicada dentro de Fase 10, no un ajuste menor.

**No bloquea:** empleados en o cerca del salario mínimo (la inmensa mayoría en planes Semilla/Raíz) — su retención da 0 con cualquiera de los dos métodos, porque están muy por debajo del umbral exento. El riesgo real es con salarios altos.

---

## Regla operativa mientras esto no se resuelve

Etapa 3 agrega un banner visible en la sección de Nómina del ERP ("MÓDULO EN CONFIGURACIÓN — No emitir nómina real hasta que se validen parámetros tributarios"), controlado por un flag que solo el fundador puede desactivar desde el Panel Fundador. El banner es la barrera operativa mientras (a), (b) y (c) siguen abiertos — no se retira hasta que las tres estén cerradas y el fundador lo confirme explícitamente.
