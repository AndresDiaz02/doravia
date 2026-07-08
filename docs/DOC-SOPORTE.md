# Documento Soporte — Estado del módulo

## Estado: PROTOTIPO — NO listo para producción

El módulo de Documento Soporte (`/api/documentos-soporte`) está **deshabilitado por defecto**.
Para activarlo en un ambiente de pruebas, se requiere la variable de entorno:

```
FEATURE_DOC_SOPORTE=true
```

## ¿Corrió alguna vez de punta a punta?

**No.** El schema `packages/db/src/schema/documentos_soporte.ts` importaba `integer` sin haberlo declarado en el import de drizzle-orm/pg-core. Eso causa un `ReferenceError` en tiempo de ejecución desde la primera línea del módulo. El import fue corregido en la rama `feature/audit-implementations`, pero confirma que el módulo nunca fue compilado ni ejecutado exitosamente en ningún ambiente.

## Qué funciona (en código, no probado en producción)

- Crear documentos soporte con ítems, totales y consecutivo automático.
- Listar y consultar documentos por tenant.
- Anular documentos (soft delete).

## Qué NO está implementado

- **Transmisión DIAN**: el módulo NO envía nada a la DIAN ni a Plemsi. El payload UBL requerido por la Resolución 42 de 2020 no ha sido construido ni verificado.
- **Validación de NIT vendedor**: no se verifica que el NIT corresponda a un no obligado a facturar.
- **Asiento contable automático**: el campo `asiento_id` queda en null.

## Marco legal

El Documento Soporte está regulado por el **Artículo 616-1 del Estatuto Tributario** y la **Resolución DIAN 042 de 2020**. Se exige cuando se realizan compras a personas naturales no obligadas a facturar, para soportar costos y deducciones.

## Antes de activar en producción

1. Construir el XML UBL 2.1 requerido por la DIAN / Plemsi para el tipo `DocumentoSoporte`.
2. Verificar el payload con el ambiente de habilitación DIAN.
3. Implementar el asiento contable automático (cuentas de gasto vs. por pagar al proveedor).
4. Validar NIT/CC del vendedor contra el RUT.
5. Agregar la opción al menú de navegación solo cuando `FEATURE_DOC_SOPORTE=true`.
