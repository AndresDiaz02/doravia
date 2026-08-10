# Plan de pruebas de Doravia

## Entorno de simulacion contable

La semilla `seed:contador` crea Empresa Demo Contador SAS, una empresa ficticia
con ERP Cosecha, POS Punto Plus, Facturación Origen 300 y Nómina Pro, con actividad
entre enero y junio de 2026. Nunca se debe usar para
emitir documentos reales ni con datos de clientes reales.

El entorno contiene ventas de contado y credito, cartera vencida, retenciones,
notas credito, gastos aprobados y pendientes, inventario, proveedores y asientos
contables. La prueba termina correctamente solo si debitos y creditos cuadran.

## Recorrido para contador

1. Abrir **Contabilidad > Libro diario** y revisar partida doble.
2. Comparar **Balance de prueba**, **Balance general** y **Estado de resultados** entre enero y junio.
3. Revisar cartera: facturas por cobrar, vencidas, pagadas y notas credito.
4. Revisar gastos aprobados, pagados y pendientes de aprobacion.
5. Exportar facturas y clientes y contrastar una muestra contra el sistema.
6. Revisar entradas, salidas y existencias por bodega.
7. Registrar hallazgos con fecha, pantalla, caso y resultado esperado/obtenido.

## Matriz por producto

| Producto | Casos minimos | Resultado esperado |
| --- | --- | --- |
| ERP | Clientes, proveedores, productos, gastos, cartera, reportes y usuarios | Datos aislados por empresa y permisos correctos |
| Contabilidad | Diario, mayor, balance, estados, retenciones y cierres | Partida doble sin diferencias y cifras coherentes |
| POS | Apertura, venta, descuento, pago, cierre y devolucion | Inventario y contabilidad se actualizan una sola vez |
| Facturacion electronica | Borrador, factura, notas y resolucion | En pruebas: respuesta trazable; en produccion: DIAN habilitada |
| Nomina | Empleado, novedades, liquidacion y comprobante | Calculos revisables; transmision externa solo tras habilitacion |
| Pagos | Aprobacion, rechazo, webhook y reintento | Ningun pago se duplica y su estado queda conciliado |
| Landing y registro | Plan independiente, paquete y recuperacion de acceso | Mensajes claros y plan contratado reflejado en el sistema |

## Criterios de salida

- Sin errores bloqueantes ni redirecciones a paneles incorrectos.
- Inventario negativo solo cuando la empresa lo permita expresamente.
- Pagos, DIAN y nomina no se consideran productivos sin confirmacion de sus proveedores.
- Un contador valida reportes y firma la lista de hallazgos resueltos.
