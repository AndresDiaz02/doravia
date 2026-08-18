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

## Escenarios verificables de caja y POS

| Caso | Acción | Evidencia esperada |
| --- | --- | --- |
| Apertura | Abrir una caja con base en efectivo y arqueo por denominaciones | El total de denominaciones coincide con la base declarada y el turno queda asignado al cajero que lo abrió. |
| Venta en efectivo | Vender un producto gravado, con y sin monto recibido | Inventario disminuye una sola vez, vuelto calculado por servidor y asiento en caja 1105. |
| Pago mixto | Cobrar una venta repartida entre efectivo y tarjeta/transferencia | Se crean líneas de pago separadas; el asiento contable conserva un débito por cada método. |
| Permisos de turno | Intentar vender, registrar gasto, devolver o cerrar desde otro cajero | El sistema rechaza la operación; administración conserva supervisión. |
| Devolución | Devolver una venta desde el turno abierto de la misma caja | No permite exceder el total acumulado devuelto, registra el método de devolución y actualiza el arqueo correspondiente. |
| Cierre | Cerrar con conteo de monedas y billetes | La diferencia es visible; solo el propietario o administrador puede cerrar el turno. |
| Cartera POS | Crear una cuenta a crédito y registrar abonos por varios medios | El total se calcula en servidor, el saldo nunca queda negativo y cada abono genera su asiento. |

## Escenarios verificables de documentos electrónicos

| Caso | Acción | Evidencia esperada |
| --- | --- | --- |
| Factura | Emitir en ambiente de pruebas con resolución vigente | Estado, CUFE/error y respuesta del proveedor quedan trazables. |
| Notas | Crear nota crédito parcial y luego una segunda parcial | La suma de notas no puede superar la factura original. |
| Documento equivalente POS | Enviar una venta POS pendiente desde Cierre DIAN | Plemsi confirma el documento; se guarda fecha, CUFE y estado enviado. |
| Reintento POS | Provocar una respuesta rechazada o usar configuración incompleta | El mensaje queda visible, la venta sigue en cola y puede reenviarse tras corregirla. |
| Producción | Repetir solo después de habilitación aprobada del proveedor | No usar datos ficticios ni declarar cumplimiento DIAN sin aceptación verificable. |

## Matriz de permisos mínima

| Rol | Debe poder | No debe poder |
| --- | --- | --- |
| Administrador | Configurar, operar y supervisar todos los módulos contratados | — |
| Vendedor | Ventas, facturas y notas autorizadas | Contabilidad operativa, nómina o configuración sensible. |
| Cajero | Operar exclusivamente su turno POS | Caja de otro usuario, cierre DIAN, contabilidad y configuraciones. |
| Contador con permiso | Consultar/operar contabilidad y DIAN cuando corresponda | Vender, abrir caja o cambiar parámetros comerciales sin autorización. |
| Contador registrado | Gestionar las empresas asignadas desde su Hub | Acceder al Hub solo por tener un rol contador técnico. |
