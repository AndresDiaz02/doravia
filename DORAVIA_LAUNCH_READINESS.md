# Doravia — Auditoría final de pre-lanzamiento

Fecha de auditoría: 10 de agosto de 2026. Este documento refleja evidencia de código, compilación y pruebas automatizadas; no sustituye una prueba con credenciales reales de DIAN/Plemsi, pagos ni hardware físico.

## Resumen ejecutivo

**Conclusión: NO-GO para venta general hoy.** El repositorio tiene una base funcional considerable (multi-tenant, autenticación, facturas, inventario, caja, POS, contabilidad, agendas y pagos), pero no cumple aún los criterios de seguridad transaccional, aislamiento comercial y validación externa necesarios para cobrar por Facturación Electrónica, POS o ERP a clientes reales.

La principal causa no es la interfaz: son las garantías que faltan cuando hay doble clic, timeout, dos cajeros o una integración externa incierta. Publicar antes de resolverlas puede duplicar documentos/ventas, permitir inventario negativo o vender combinaciones comerciales que el checkout no sabe modelar.

## Dictamen por producto

| Oferta | Dictamen | Evidencia y condición |
|---|---|---|
| Facturación Electrónica sola | **NO-GO** | No existe idempotencia de creación/emisión. La configuración productiva de Plemsi requiere confirmación y emisión real por tenant. |
| POS solo | **NO-GO** | No hay pagos mixtos persistidos, la venta suspendida es local al navegador, no hay modo offline robusto y falta control atómico de existencia. |
| ERP solo | **NO-GO** | El dominio está avanzado, pero las operaciones comerciales/facturación no tienen aislamiento completo por producto ni pruebas end-to-end de producción. |
| POS + Facturación | **NO-GO** | No existe vínculo único probado de venta POS a documento electrónico ni modelo comercial de bundle. |
| POS + ERP | **NO-GO** | Comparte productos/clientes, pero no hay garantía integral de una transacción única, stock concurrente y contabilidad atómica. |
| Nómina | **PRÓXIMAMENTE** | Operación bloqueada en API y rutas ERP; la landing comunica lista de interés. |

## Evidencia verificada

- Monorepo con API Express/Drizzle/PostgreSQL, ERP React, POS React y landing estática.
- Autenticación JWT, CORS explícito, Helmet, rate limiting y filtros `tenant_id` están presentes.
- `siguienteConsecutivo` usa bloqueo asesorado de PostgreSQL para consecutivos por tenant.
- La factura bloquea la resolución DIAN al asignar consecutivo; esto reduce colisiones de numeración.
- La API y los dos clientes compilan. La suite disponible ejecutó **301 pruebas en 14 archivos**.
- No hay suite de integración HTTP contra una base efímera, pruebas E2E de navegador, prueba de restauración de backup ni pruebas con DIAN/Plemsi/Bold reales.

## Arquitectura comercial actual

### Lo que sí existe

- Planes con producto (`erp`, `pos`, `origen`, `nomina`) y `features` por plan.
- Un registro relacional `plan_features` y middleware `requirePlanFeature` para varias rutas.
- Clientes, productos, impuestos e inventario compartidos por tenant, que es la dirección correcta para una sola fuente de verdad.

### Brechas P0/P1

1. **P0 — Bundles y entitlements no están modelados de forma central.** El checkout compra un único `plan_id`; no existe una matriz de compatibilidad que permita POS + Facturación o POS + ERP y que prohíba Facturación adicional cuando ERP ya la incluye.
2. **P0 — Aislamiento por producto incompleto.** Rutas como clientes, productos y facturas se montan para todo usuario autenticado, sin entitlement de producto. Esto no cumple el requisito de un cliente POS-only o Facturación-only con navegación y backend estrictamente pertinentes.
3. **P0 — Doble emisión de factura.** No hay `Idempotency-Key` ni una restricción de solicitud/operación para `POST /api/facturas`; dos solicitudes válidas pueden consumir dos consecutivos y generar dos documentos.
4. **P0 — Inventario POS concurrente.** La venta POS descuenta `productos.stock_actual` sin condición de saldo suficiente ni bloqueo de fila. Dos cajeros pueden vender la última unidad y dejar saldo negativo. El producto mantiene además un stock global, no un saldo materializado por bodega.
5. **P0 — Facturación electrónica productiva no verificada.** La URL productiva de Plemsi usa un valor por defecto marcado en código como “confirmar”; se requiere credencial, resolución, certificado/habilitación y emisión real por tenant antes de venderla como electrónica.
6. **P1 — POS no entrega capacidades anunciables de operación continua.** Sin pagos mixtos persistidos, recuperación de ventas suspendidas tras recarga, modo offline/sincronización, ni validación real de impresora/báscula/cajón.
7. **P1 — Efectos posteriores no atómicos.** Contabilidad, inventario y correo de factura tienen tramos fuera de la transacción principal. Hay manejo de advertencia, pero falta una cola/outbox reconciliable para garantizar recuperación.
8. **P1 — Backups y recuperación no demostrados.** No existe evidencia versionada de frecuencia, retención, RPO, RTO ni restauración exitosa en Neon.

## Cambios realizados durante esta auditoría

- Nómina se aisló como **Próximamente**: la API rechaza operación con `NOMINA_COMING_SOON`, el ERP redirige sus rutas al dashboard y la navegación interna ya no la expone como módulo activo.
- La landing de Nómina ya no comunica activación ni venta: solo lista de interés y validación pendiente.

## Matriz comercial objetivo (pendiente de implementación)

| Producto seleccionado | Facturación | POS | ERP | Resultado |
|---|---:|---:|---:|---|
| Facturación | Sí | No | No | Producto independiente |
| POS | No | Sí | No | Producto independiente |
| ERP | Incluida | No | Sí | Facturación incluida, no cobrable aparte |
| POS + Facturación | Sí | Sí | No | Bundle permitido |
| POS + ERP | Incluida | Sí | Sí | Bundle permitido |
| ERP + Facturación adicional | Incluida | No | Sí | Incompatible: no vender/cobrar dos veces |

La implementación requerida debe separar `products`, `entitlements`, `subscriptions`, `addons` y `bundles`. Un bundle solo concede entitlements; no crea tablas, ventas ni datos duplicados.

## Riesgos de producción y lista de salida

- [x] HTTPS y dominios de aplicación configurados.
- [x] Health check y Sentry configurables en API.
- [x] Compilación y pruebas unitarias actuales.
- [ ] Emisión real de factura en producción por tenant con Plemsi/DIAN.
- [ ] Idempotencia de facturas, ventas, pagos, devoluciones y webhooks.
- [ ] Stock por bodega y reserva/validación atómica de existencias.
- [ ] Matriz centralizada y testeada de productos, bundles, upgrades y downgrades.
- [ ] Gates backend para todas las capacidades compartidas por producto.
- [ ] Checkout multi-producto que elimine cobros redundantes.
- [ ] Backup documentado y restauración probada.
- [ ] Pruebas E2E de onboarding, POS, ERP, aislamiento entre dos tenants y roles.
- [ ] Hardware físico, correo y pagos reales validados en entorno de producción.

## Clasificación comercial

- **Vender ahora:** ninguna oferta operativa todavía.
- **Beta cerrada:** ERP administrativo sin prometer emisión electrónica ni POS, únicamente con empresas piloto acompañadas y datos de prueba/controlados.
- **Próximamente:** Nómina y cualquier bundle comercial.
- **No mostrar como disponible:** pagos mixtos POS, offline POS, hardware “compatible” no probado y emisión electrónica hasta completar validación productiva.

## Cliente piloto recomendado

Un negocio de **servicios pequeño** (sin inventario físico crítico) es el piloto menos riesgoso después de implementar idempotencia y validar facturación. Evitar inicialmente minimercados y tiendas a granel: ejercen exactamente las brechas actuales de concurrencia, pagos mixtos y stock por bodega.

## Siguiente prioridad

1. Modelo de productos/entitlements/bundles y checkout compatible.
2. Idempotencia transaccional para factura, venta POS, pago, devolución y webhook.
3. Inventario por bodega con saldo atómico, kardex y pruebas de dos cajeros.
4. Validación completa Plemsi/DIAN y checklist guiado de onboarding por tenant.
5. Backups, restauración, E2E y piloto controlado.
