# Doravia — checklist de habilitación DIAN

Estado actual: **pendiente**. Este archivo no certifica ni activa la habilitación.

## Antes de empezar

1. Confirmar el RUT y correo de cada empresa, y que Plemsi sea el proveedor tecnológico contratado aplicable.
2. Registrar por empresa, sin compartirlas entre tenants: identificador Plemsi, llave API de pruebas, ambiente `pruebas`, resolución/rango de prueba y certificado que corresponda al modelo acordado.
3. No guardar certificados, contraseñas ni API keys en código, logs, tickets o evidencia.
4. Configurar la resolución, prefijo, rango, vigencia y clave técnica de **pruebas**. Nunca reutilizar la resolución productiva.
5. En el panel de habilitación DIAN seleccionar **Software de un proveedor tecnológico**, empresa proveedora **EMPRESA DE DIVULGACIONES Y ASESORÍAS ECA SAS** y software **Plemsi**. Copiar el `SetTestID` del set y registrarlo en Plemsi en Configuración > Integraciones > DIAN.

## Ejecución en habilitación

1. Mantener `plemsi_ambiente=pruebas`.
2. Ejecutar el set exigido por DIAN/Plemsi: persona natural/jurídica, IVA/no IVA, descuentos, decimales, varios ítems, notas crédito/débito y rechazos.
3. Conservar por documento: número, fecha, ambiente, identificador Plemsi, CUFE/CUDE, respuesta, estado y mensajes técnicos, sin secretos.
4. Validar consulta posterior y representación gráfica.
5. No reintentar automáticamente rechazos de validación: corregir primero la causa.

## Criterio de cierre

Solo evidencia verificable de que DIAN/Plemsi completó el set requerido permite configurar manualmente `DIAN_HABILITATION_COMPLETE=true` en producción. Debe quedar fecha, empresa, responsable y evidencia externa. Un XML, mock o test interno no es evidencia suficiente.

## Después de habilitación

1. Cargar por tenant las credenciales y resolución de producción.
2. Verificar un documento controlado, su CUFE, estado y representación gráfica.
3. Monitorear rechazos, vencimiento de resolución/certificado y folios disponibles.
4. Mantener POS core separado del Documento Equivalente Electrónico POS hasta su habilitación específica.

## Referencias verificadas

- [Habilitar documentos electrónicos DIAN — Plemsi](https://ayuda.plemsi.com/para-empezar/habilitar-documentos-electronicos-dian)
- [Asociar resolución o numeración DIAN — Plemsi](https://ayuda.plemsi.com/para-empezar/asociar-una-resolucion-o-numeracion-dian)
- [Numeración para notas crédito y débito — Plemsi](https://ayuda.plemsi.com/ventas/crear-una-numeracion-para-notas-credito-y-debito)
