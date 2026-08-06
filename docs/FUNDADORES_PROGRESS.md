# Progreso: Fundadores / Sales Operating System

## Completed

- Inventario y arquitectura inicial en `FUNDADORES_ARCHITECTURE.md`.
- Conservado el acceso interno real mediante `requireFundador`; el CRM no aparece ni queda accesible para clientes normales.
- Creado el nucleo de datos CRM: cuentas comerciales, contactos, oportunidades, actividades y timeline inmutable.
- Implementados endpoints de cuentas, contactos, oportunidades, movimiento validado de etapa, actividades y metricas de pipeline.
- Los cambios de etapa y actividades generan eventos de timeline. Una oportunidad perdida exige motivo.
- API typecheck y build de la web pasan localmente.

## In Progress

- UI de pipeline, detalle de oportunidad, agenda comercial y dashboard Fundadores.
- Migracion segura de las tablas `sales_*` en la base de datos administrada.

## Pending

- Cotizaciones comerciales versionadas, propuesta publica, PDF y tracking.
- Email, enlace WhatsApp, pagos, conversion a tenant y onboarding.
- Customer success, expansion, renovaciones, importacion/exportacion y E2E.

## Blocked

- `EXTERNAL_INTEGRATION_REQUIRED`: contrato de proveedor para email de propuestas y webhook de suscripciones/pagos.
- La migracion de produccion requiere sincronizar el Blueprint o ejecutarse una vez con el `DATABASE_URL` de Render/Neon; no se debe intentar con credenciales expuestas en chats.

## Product Decisions

- `PRODUCT_DECISION_REQUIRED`: reglas de descuento, add-ons, cuotas, terminos y plantillas comerciales.
