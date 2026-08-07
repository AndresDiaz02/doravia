# Progreso: Fundadores / Sales Operating System

## Completed

- Inventario y arquitectura inicial en `FUNDADORES_ARCHITECTURE.md`.
- Conservado el acceso interno real mediante `requireFundador`; el CRM no aparece ni queda accesible para clientes normales.
- Creado el nucleo de datos CRM: cuentas comerciales, contactos, oportunidades, actividades y timeline inmutable.
- Implementados endpoints de cuentas, contactos, oportunidades, movimiento validado de etapa, actividades y metricas de pipeline.
- Los cambios de etapa y actividades generan eventos de timeline. Una oportunidad perdida exige motivo.
- API typecheck y build de la web pasan localmente.
- Creada la vista interna `/fundador/ventas`: dashboard de ACV, alta rapida de prospectos y oportunidades, y pipeline comercial con movimientos trazables.
- Aplicada en Neon la migración de CRM y cotizaciones comerciales (`sales_quotes` y sus ítems).
- Creado el constructor inicial en `/fundador/cotizaciones`, usando el catálogo real de planes y vinculable a cuenta y oportunidad.
- Cada propuesta genera un token público criptográfico, registra aperturas y está disponible en `/propuesta/:token` sin exponer el CRM.

## In Progress

- Detalle de oportunidad, contactos, agenda comercial y filtros del pipeline.
- Versionado de propuestas, plantillas y control de descuentos.

## Pending

- PDF, envío de email, aceptación y cobro de propuestas.
- Pagos, conversión a tenant y onboarding.
- Customer success, expansion, renovaciones, importacion/exportacion y E2E.

## Blocked

- `EXTERNAL_INTEGRATION_REQUIRED`: contrato de proveedor para email de propuestas y webhook de suscripciones/pagos.
- Los enlaces de pago y el envío de email requieren configurar sus proveedores y sus webhooks antes de activarlos.

## Product Decisions

- `PRODUCT_DECISION_REQUIRED`: reglas de descuento, add-ons, cuotas, terminos y plantillas comerciales.
