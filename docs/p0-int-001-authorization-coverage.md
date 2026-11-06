# P0-INT-001 — cobertura de autorización pendiente

Las pruebas PostgreSQL de P0-INT-001 ejercitan la ruta HTTP de POS con un middleware de identidad de prueba para aislar la integridad transaccional. No prueban emisión de JWT, sesión real, ni el conjunto completo de entitlements comerciales.

Esta cobertura queda explícitamente pendiente de SEC/entitlements. La prueba de seguridad correspondiente debe validar, con autenticación real, que una identidad no puede:

1. crear una venta sin permiso operativo de POS;
2. usar un `tenant_id` distinto al de su sesión;
3. operar el turno de otro usuario cuando el rol no lo permite;
4. acceder a POS si su entitlement no contiene el producto.

No se amplía P0-INT-001 con cambios de autenticación, planes o suscripciones.
