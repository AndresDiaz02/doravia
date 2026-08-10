# Doravia — modo de integración DIAN

## Dictamen actual

**Modelo B: proveedor tecnológico.** Doravia gestiona datos, consecutivos y auditoría; Plemsi transmite la Factura Electrónica con credenciales cifradas por tenant. Doravia no debe presentarse como proveedor tecnológico propio ni como validado ante DIAN.

## Responsabilidades

| Componente | Responsable actual |
|---|---|
| Datos comerciales, consecutivo interno y representación ERP | Doravia |
| Credencial por empresa y ambiente | Doravia / empresa cliente |
| Generación, firma, transmisión y respuesta fiscal | Plemsi, sujeto a habilitación real |
| Validación y habilitación | DIAN y el proceso de cada participante |

## Ambientes

- Desarrollo: mocks/stub, sin validez fiscal.
- Pruebas: `plemsi_ambiente=pruebas`, destinado a habilitación.
- Producción: bloqueada por defecto hasta evidencia real y activación manual de `DIAN_HABILITATION_COMPLETE=true`.

El endpoint API productivo confirmado es `https://api.plemsi.com`; el panel de aliados es `https://app.aliados.plemsi.com` y no es un endpoint de transmisión.

No reutilizar credenciales, rangos o resoluciones entre empresas/ambientes. Secretos y certificados nunca se registran en logs.

## Contingencia

Un timeout del proveedor o DIAN no equivale a aprobación ni rechazo: se revisa por el identificador persistido. Doravia no activa contingencia fiscal sin procedimiento confirmado por Plemsi/DIAN.
