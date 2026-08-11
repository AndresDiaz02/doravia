# Estado de validación — Nómina electrónica

Estado: **módulo disponible para pruebas; emisión real bloqueada hasta validar Plemsi.**

Este documento refleja el estado verificable del código. El módulo no debe presentarse como listo para emisión DIAN real mientras el punto pendiente permanezca abierto.

## Parámetros 2026 — cerrado en código

El seed y la corrección de migración para `parametros_nomina_anuales` usan:

- Salario mínimo mensual 2026: **$1.750.905**.
- Auxilio de transporte 2026: **$249.095**.
- Tope de auxilio: **2 SMLMV**.

La migración también corrige de manera acotada bases que conservaron el valor preliminar anterior (`$1.509.000 / $212.000`); no sobrescribe una corrección manual diferente.

Fuente normativa registrada: Decretos 1469 y 1470 de 2025. El Decreto 159 de 2026 mantuvo transitoriamente el SMLMV en $1.750.905 mientras se resuelve el proceso señalado en ese acto. Verificar la vigencia normativa antes de crear parámetros para un año nuevo.

## Retención laboral Art. 383 — cerrada en código

`apps/api/src/services/nomina/deducciones.ts` implementa la tabla progresiva por UVT del artículo 383 ET: 0 %, 19 %, 28 %, 33 %, 35 %, 37 % y 39 %, incluidos los componentes fijos acumulados por tramo.

Las pruebas cubren cada tramo y el cálculo integrado de nómina. La configuración operativa conserva el banner de revisión porque el envío DIAN aún está pendiente de validar con el proveedor.

## Emisión de nómina con Plemsi — pendiente externo y bloqueante

El endpoint y el payload de nómina de Plemsi no se deben asumir. La implementación conserva el flujo de prueba y la emisión real queda restringida por `NOMINA_MODO` hasta contar con:

1. Endpoint oficial de nómina electrónica y contrato/API key habilitados por Plemsi.
2. Payload, respuesta, CUDE y manejo de errores confirmados en el ambiente de pruebas del proveedor.
3. Prueba de extremo a extremo aprobada antes de cambiar `NOMINA_MODO` a `produccion`.

Mientras tanto, se pueden verificar empleados, contratos, períodos, cálculo, asientos y documentos de prueba sin declarar emisión DIAN real.
