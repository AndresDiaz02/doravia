# Checklist de go-live

## Antes del deploy

- [ ] CI verde: API typecheck, pruebas, build ERP y POS.
- [ ] Migraciones revisadas, backup y plan de rollback listos.
- [ ] Variables de producción comprobadas sin revelar valores.
- [ ] `DIAN_PROVEEDOR`, firma de pagos, `FUNDADOR_PIN` y `NOMINA_MODO` configurados conforme al entorno.

## Después del deploy

- [ ] `/health` responde y la base está conectada.
- [ ] Login con cuenta de prueba.
- [ ] Crear cliente, producto y operación principal de prueba.
- [ ] Revisar Sentry/logs por errores nuevos.
- [ ] Confirmar landing, ERP, POS y API en dominios correctos.
- [ ] Confirmar no se emitió documento electrónico real durante smoke test.

## Si falla

1. Detener comunicaciones comerciales.
2. Revertir al último commit/deploy conocido como sano.
3. Restaurar solo con backup y procedimiento aprobado; nunca corregir saldos financieros manualmente sin auditoría.
4. Registrar causa, impacto y prueba de recuperación.
