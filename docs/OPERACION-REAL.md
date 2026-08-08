# Operación real: controles y límites

Doravia automatiza los registros y reportes que se generan dentro de la plataforma. Antes de activar operaciones externas, el administrador debe validar la configuración de cada empresa desde el panel de preparación operativa.

## Facturación electrónica

La empresa debe tener los datos fiscales completos, una resolución DIAN activa con rango disponible y su configuración de Plemsi habilitada. Las credenciales se conservan cifradas y no se muestran en el panel.

## Nómina electrónica

El entorno de pruebas permite verificar cálculos y flujos internos. La emisión real requiere que el proveedor habilite el API de nómina, confirme las credenciales y acepte una prueba. No debe cambiarse el entorno a producción solo para probar una pantalla.

## Bancos

La conciliación bancaria funciona mediante cuentas registradas e importación de extractos CSV o Excel. No existe una conexión automática con bancos; una integración futura requiere un proveedor autorizado, credenciales de la empresa, consentimiento y manejo de autenticación reforzada.

## Impuestos

Los reportes contables y tributarios sirven como soporte para la preparación. La revisión, firma y presentación de declaraciones, información exógena u otros trámites ante autoridades corresponde al contribuyente y su contador responsable.
