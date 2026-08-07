# Auditoría operativa — agosto de 2026

## Alcance y método

Esta auditoría revisa el monorepo en ejecución: landing pública, ERP web, API,
POS, base de datos, integraciones y tareas programadas. Nómina electrónica se
mantiene fuera de esta fase. Los resultados se basan en código y compilaciones;
una integración externa solo se considera validada después de una prueba en su
ambiente correspondiente.

## Correcciones aplicadas en esta fase

- El POS usa como respaldo la URL de la API de producción cuando no recibe
  `VITE_API_URL`. Evita que un POS desplegado en un subdominio independiente
  intente enviar sus peticiones a sí mismo.
- La venta POS recalcula precio, IVA e impoconsumo a partir del producto activo
  del tenant. Ya no acepta esos valores como autoridad desde el navegador.
- La venta valida método de pago, cantidades, descuento y correspondencia entre
  caja y turno. Los servicios no disminuyen existencias.

Validación realizada: compilaciones de API y POS correctas, más 298 pruebas
automáticas del API correctas.

## Estado módulo por módulo

| Módulo | Estado observado | Próxima mejora prioritaria |
| --- | --- | --- |
| Landing pública | Diseño y mensaje comercial renovados; despliegue independiente. | Medir conversión y simplificar el registro a un CTA principal. |
| Acceso, usuarios y tenants | JWT, roles y filtros por tenant presentes en los flujos revisados. | Añadir pruebas de integración para mutaciones entre tenants y política de sesión/renovación del POS. |
| Facturación DIAN / Plemsi | Integración por tenant y protecciones de `stub` en producción. | Probar el contrato real de Plemsi, guardar idempotencia e historial de cada intento/respuesta. |
| Clientes, cotizaciones y remisiones | Flujo comercial amplio y búsqueda global disponible. | Importador de clientes y proveedores para acelerar onboarding; convertir cotización aceptada en venta/factura con trazabilidad. |
| Inventario y bodegas | Kardex, movimientos, recepción de lote y asesor de pedido disponibles. | Definir una sola fuente de verdad para stock por bodega y conciliarla con `productos.stock_actual`. |
| POS y caja | Turnos, cajas, scanner, pagos, fiados, pre-cuentas, devolución y tirilla presentes. | Cola offline recuperable, permisos de descuento/anulación y prueba end-to-end de una venta real. |
| Cartera, gastos y proveedores | Cartera, alertas de cobro, gastos y documentos operativos presentes. | Automatizar recordatorios con consentimiento y conciliación de pagos contra documentos. |
| Contabilidad | Asientos, períodos, balances, P&G, auxiliares y exportaciones disponibles. | Pruebas de invariantes contables, reversos y cierres contra una base PostgreSQL real. |
| Pagos y suscripciones | Configuración por tenant y webhooks con mitigaciones previas. | Mantener webhooks cerrados si no hay firma verificada; registrar eventos y reintentos idempotentes. |
| CRM de fundadores | Pipeline, propuestas, renovaciones y métricas existentes. | Automatizar tareas de seguimiento y alertas de cuentas sin actividad. |
| IA | Asesor de pedidos y detección de gramera disponibles. | Límite por tenant, registro de coste/uso y no enviar más datos de negocio de los indispensables. |
| Operación y despliegues | API, ERP, POS y landing se despliegan por separado. | E2E previo a producción, health checks y alertas de error/degradación. |

## Hallazgos que requieren decisión técnica

### P0 — rotación de credenciales y control de secretos

Las claves de proveedores no deben compartirse en chats, repositorios ni
archivos de ejemplo. Deben rotarse las credenciales que se hayan expuesto y
conservarse únicamente como secretos de la plataforma de despliegue. Añadir
escaneo de secretos al CI evita que el problema reaparezca.

### P1 — consistencia de inventario

El kardex calcula existencias desde `movimientos_inventario`, mientras que POS,
alertas y recomendaciones también consumen `productos.stock_actual`. Las
entradas/salidas/ajustes manuales y algunas operaciones de ensamble registran
movimientos sin actualizar ese campo. No conviene parchear registros históricos
sin conciliación: hay que elegir una fuente de verdad, crear una migración de
reconciliación auditable y hacer todas las mutaciones en una transacción.

### P1 — cobertura de pruebas de flujos reales

Las pruebas unitarias son una buena base, pero no hay evidencia de pruebas E2E
de registro, login, venta POS, cierre de caja, inventario, factura y webhook.
La prioridad es una suite pequeña de escenarios críticos contra PostgreSQL de
prueba, ejecutada en cada cambio a `main`.

### P1 — observabilidad y privacidad

Existen logs de respuestas y errores de proveedores. Deben normalizarse con un
correlation ID, ocultar PII y secretos, y enviar alertas solo de eventos
accionables: error DIAN, cobro fallido, desfase de inventario, turno sin cerrar
y fallo de tarea programada.

### P2 — rendimiento de frontend

Los builds web y POS generan bundles iniciales superiores a la recomendación de
Vite. Aplicar carga diferida por página y separar librerías pesadas mejora el
primer acceso, especialmente en cajas con internet móvil.

## Automatizaciones recomendadas

1. **Cierre diario de operación:** aviso al cajero y administrador de turnos
   abiertos; resumen de ventas, efectivo esperado, gastos y diferencias.
2. **Inventario inteligente:** alerta por mínimo configurable por producto y
   bodega; propuesta de pedido basada en rotación, no en `stock_actual` hasta
   resolver la conciliación.
3. **Cartera respetuosa:** recordatorio programado antes y después del
   vencimiento, con plantilla aprobada, registro de envío y opción de detenerlo.
4. **Documentos electrónicos:** cola con reintentos idempotentes, panel de
   errores y reenvío manual seguro para facturas y documentos soporte.
5. **Onboarding guiado:** checklist que termina con una venta/factura de prueba,
   cliente, producto, resolución y primer usuario adicional.
6. **Fundadores:** tarea automática para prospectos sin actividad, propuestas
   próximas a vencer y suscripciones cercanas a renovación.

## Orden de ejecución propuesto

1. Conciliación y modelo único de stock por bodega.
2. E2E de los cinco flujos críticos y escaneo de secretos en CI.
3. Cola offline y atajos operativos del POS; permisos de descuento y anulación.
4. Idempotencia/observabilidad de documentos y pagos.
5. Importadores de clientes, proveedores y saldos iniciales.
6. Optimización de bundles y revisión de accesibilidad de ERP y POS.
