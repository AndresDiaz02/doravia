# Doravia POS: auditoría, arquitectura objetivo y plan de ejecución

Fecha de auditoría: 10 de agosto de 2026.

## Alcance y conclusión

Doravia ya cuenta con una base ERP/POS reutilizable. No debe crearse un segundo catálogo, inventario, cliente, usuario, proveedor ni contabilidad para el POS. El producto actual permite operar ventas básicas, pero todavía no cumple las garantías necesarias para venderse como POS profesional de alta confianza.

La prioridad no es añadir pantallas ni IA. Primero se deben cerrar las garantías de dinero, inventario, aislamiento por empresa, caja y trazabilidad.

## Arquitectura encontrada

El monorepo usa pnpm y TypeScript:

- `apps/api`: API Express con Drizzle/PostgreSQL, JWT, rate limits, CORS configurado por ambiente, Sentry y rutas protegidas.
- `apps/web`: ERP React/Vite.
- `apps/pos`: POS React/Vite independiente que consume la misma API y las mismas entidades de negocio.
- `apps/landing`: sitio comercial.
- `packages/db`: esquemas Drizzle, semillas y migraciones aditivas.
- `packages/shared`: catálogo central de capacidades de plan.

La unidad de aislamiento es `tenant_id`. Las rutas autenticadas cargan el tenant y el plan desde el JWT mediante `authenticate`. En general, las rutas POS consultadas filtran por tenant; las entidades de venta, caja, turno, fiado, agenda, inventario, producto y bodega lo incluyen.

### Módulos existentes reutilizables

| Dominio | Estado actual | Reutilización POS |
| --- | --- | --- |
| Clientes | CRUD, importación, cartera | Cliente de venta y ficha 360 |
| Productos | Producto/servicio, código, código de barras, precio, IVA e impuesto al consumo | Catálogo POS |
| Inventario | Bodegas, movimientos inmutables, Kardex, ensambles | Salidas de ventas y compras futuras |
| POS | Cajas, turnos, ventas, fiados, abonos, gastos de caja, devoluciones, reportes y anulaciones | Core actual |
| Agenda | Citas, profesionales, horarios y bloqueos | Add-on de servicios |
| Contabilidad | Asientos automáticos, cierre y conciliación | Contabilización de operaciones POS |
| Comercial | Planes, `plan_features`, add-ons de tenant y límites | Entitlements de módulos |
| IA | OCR/consulta asistida y configuración de gramera | Base para propuestas, nunca ejecución directa |

## Hallazgos críticos

### P0: deben resolverse antes de comercializar POS

1. **Ventas sin idempotencia.** `POST /api/pos/ventas` no recibe ni persiste una llave de idempotencia. Una doble pulsación, reintento de red u operación futura offline puede crear dos ventas, salidas de inventario y asientos.
2. **Dinero y cantidades se calculan con `number` de JavaScript.** Aunque la base usa `numeric`, el cálculo de impuestos, descuentos, totales y stock se hace con flotantes binarios antes de persistir. Debe centralizarse una política decimal y de redondeo en servidor.
3. **Inventario por bodega incompleto.** Existe `movimientos_inventario` con `bodega_id`, pero `productos.stock_actual` es un saldo global. No hay tabla de saldos por producto/bodega ni control transaccional de existencias negativas. El POS puede seleccionar bodega y después actualizar el saldo global, por lo cual multi-bodega no está cerrado.
4. **Pagos combinados no están modelados.** `ventas_pos` guarda solo un `metodo_pago`, aun cuando existe el valor `mixto`. No existe tabla de pagos por venta; efectivo, tarjeta y transferencia no pueden cuadrarse correctamente dentro de una venta combinada.
5. **Cierre ciego no está implementado.** La interfaz precarga al cajero el efectivo esperado antes de declarar, de modo que conoce el valor. Además, una diferencia no exige motivo y el cierre no registra importe esperado/diferencia como dato inmutable y auditado.
6. **Auditoría POS insuficiente.** Existe servicio de auditoría, pero las operaciones críticas de POS no lo usan de forma consistente: apertura/cierre, venta, anulación, devolución, gasto de caja y cambios de configuración deben quedar trazados.
7. **Contabilización fuera de la transacción principal.** La venta puede quedar confirmada aunque falle la creación de su asiento. Esta tolerancia debe convertirse en una cola/reconciliación explícita y observable, no en un error de consola.

### P1: alta prioridad

1. Cajas no representan terminal, sede, permisos de operación ni cuenta de efectivo de forma completa.
2. La devolución guarda solo un monto: no restituye ítems, inventario, impuestos, medio original ni límite acumulado de devolución.
3. Las ventas suspendidas viven solamente en memoria del navegador; se pierden al recargar y no pueden retomarse en otro terminal.
4. El POS carga todo el catálogo y hasta 500 clientes en el navegador. No escala para comercios reales; requiere búsqueda paginada/indexada y favoritos por caja o usuario.
5. La agenda existe, pero no es un módulo completamente desacoplado del producto comercial ni tiene reservas públicas.
6. El detector de gramera usa IA para proponer una configuración y la persiste sin una validación estructural estricta ni prueba manual del dispositivo.
7. RBAC depende principalmente de roles codificados. `plan_features` es una buena base de entitlements, pero faltan permisos granulares como `pos.sell`, `cash.close`, `pos.refund` y `inventory.adjust`.
8. La migración es una lista grande de SQL aditivo. Funciona para preservar datos, pero debe evolucionar a migraciones versionadas con una prueba de base vacía y de actualización.

### P2: expansión posterior

- Unidades, conversiones, lotes, vencimientos, variantes, presentaciones y venta a granel genérica.
- Compras: orden, recepción parcial, costo, cuentas por pagar e ingreso de inventario.
- Promociones, precios múltiples, fidelización, domicilios, ecommerce, WhatsApp y automatizaciones.
- Hardware de impresión, caja monedero, etiquetas y balanzas mediante una capa de adaptadores.
- Operación offline con cola persistente, idempotencia y resolución de conflictos.
- IA de compras, pricing, anomalías y copilot con acciones propuestas y confirmación explícita.

## Riesgos de seguridad y privacidad

- Las rutas base aplican autenticación, aislamiento de tenant, CORS explícito, Helmet y límites de solicitudes. No se detectó una ruta POS pública en el montaje de la API.
- Las cargas de archivos usan memoria y límites de tamaño; antes de ampliar OCR deben validarse formatos, antivirus/escaneo y almacenamiento por tenant.
- La IA no debe recibir documentos, clientes o historial completo si solo necesita campos mínimos. La configuración de hardware propuesta por IA debe presentarse como sugerencia y requerir confirmación/prueba.
- Los secretos no deben estar en el repositorio ni enviarse por formularios de hardware o bancos. La auditoría no debe guardar contraseñas, tokens, claves ni documentos completos.
- Los endpoints de búsqueda, exportación e informes deben mantener el filtro de tenant y límites de paginación; toda nueva consulta transversal debe probar aislamiento explícitamente.

## Arquitectura objetivo

### Capas de dominio

```text
Tenant
 ├─ Sede (foundation nueva)
 │   ├─ Bodega
 │   └─ Terminal POS / Caja
 ├─ Catálogo: producto, servicio, categoría, variante, unidad, lista de precios
 ├─ Inventario: saldo por bodega, movimiento inmutable, lote, conversión
 ├─ Ventas POS: borrador, venta, ítems, pagos, devolución, documento fiscal
 ├─ Caja: turno, movimientos, arqueo ciego, diferencia
 ├─ Compras: orden, recepción, proveedor, cuenta por pagar
 ├─ CRM: cliente, cartera, puntos, comunicaciones
 ├─ Add-ons: agenda, multi-sede, granel, hardware, IA, automatizaciones
 └─ Auditoría y eventos de dominio
```

### Reglas de diseño

1. Un solo catálogo, cliente, proveedor y motor de inventario para ERP y POS.
2. Las mutaciones críticas usan transacción, idempotency key, auditoría y eventos de dominio.
3. La fuente de verdad de inventario es el movimiento y el saldo por `tenant_id + bodega_id + producto_id`; `stock_actual` solo puede ser una proyección temporal de compatibilidad.
4. El backend recalcula precios, impuestos y redondeos desde datos autorizados. El cliente solo propone intención de compra.
5. Cada pago pertenece a una venta y puede tener su medio, referencia y monto. El total de pagos debe ser igual al total de la venta antes de confirmarla.
6. Las capacidades de producto se dividen en: capacidad de plataforma, entitlement comercial y permiso de usuario.
7. Hardware se abstrae mediante `HardwareManager` y adaptadores. Navegador: lectores HID/teclado y Web Serial donde sea compatible; impresoras USB/ESC-POS y cajón requieren pruebas por navegador o un bridge local, no capacidades inventadas.
8. IA consulta herramientas con scopes y devuelve propuestas. Toda acción financiera, inventario, precio, compra o comunicación requiere una confirmación autorizada y auditoría.

## Plan de implementación por fases

### Fase A — Integridad POS (crítica)

Dependencias: ninguna nueva.

1. Llaves de idempotencia y respuesta persistida para ventas, pagos, devoluciones y movimientos de caja.
2. Tabla `pagos_venta_pos` y validación de pago único/mixto.
3. Caja: arqueo ciego real, monto esperado/diferencia, motivo obligatorio y auditoría.
4. Auditoría transaccional de operaciones POS y estado de contabilización pendiente/reintentable.
5. Pruebas de multitenancy, doble envío, stock, cierre y pago mixto.

### Fase B — Motor de inventario (crítica)

Dependencias: Fase A.

1. Saldos por producto/bodega y bloqueo de concurrencia.
2. Política decimal de dinero/cantidad y redondeos.
3. Tipos de movimiento completos; devolución por ítems y reversos de inventario.
4. Unidades, conversiones, variantes y lotes como extensiones compatibles.

### Fase C — Experiencia POS profesional (alta)

Dependencias: Fase A y B.

1. Borradores suspendidos persistentes, búsqueda por código/SKU/nombre paginada, favoritos y atajos.
2. Flujo touch, mensajes claros, impresión/digital como adaptadores y permisos de descuento/anulación.
3. Catálogo de medios de pago configurable por tenant.

### Fase D — Compras y abastecimiento (alta)

Dependencias: Fase B.

Orden de compra, recepción parcial, costos, proveedores, CxP, adjuntos seguros y propuesta de OCR confirmable.

### Fase E — Add-ons y hardware (media)

Agenda/servicios, reservas públicas, WhatsApp por provider abstraction, centro de hardware, impresión, etiquetas y balanza con pruebas de compatibilidad.

### Fase F — Inteligencia y automatizaciones (media)

Eventos, herramientas de solo lectura, propuestas explicables, aprobaciones, reglas no-code y forecasting marcado como estimación.

### Fase G — Offline y escala (alta antes de comercios con conectividad inestable)

Cola local cifrada, IDs cliente, idempotencia, reintentos, conflictos de stock y estado visible de sincronización. No se habilitará facturación electrónica offline sin un diseño tributario validado.

## Criterio de salida por módulo

Una capacidad no se marca como comercialmente terminada hasta tener esquema/migración, API con tenant y permisos, frontend con estados de carga/error/vacío, auditoría donde aplique, pruebas de cálculo y aislamiento, y despliegue verificado.
