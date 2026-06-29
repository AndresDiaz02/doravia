# Integración DIAN — Guía de Activación

> Este documento explica exactamente qué pasos debes seguir el lunes cuando tengas tu RUT
> y hayas decidido entre Aliaddo o MATIAS API como Proveedor Tecnológico (PT).

---

## Estado actual

El sistema está en **modo STUB** (`DIAN_PROVEEDOR=stub`).

En este modo:
- Las facturas se emiten con un CUFE ficticio marcado `STUB-{id}-NO-VALIDO-DIAN`
- Las facturas **no son reconocidas por la DIAN** y no tienen validez fiscal
- Todo el código de la integración real está escrito y esperando las credenciales

El Dashboard muestra un banner rojo cuando está en modo stub. No lo confundirás.

---

## Arquitectura de la integración

```
apps/api/src/services/
├── dian.service.ts              ← punto de entrada (importado por factura.service.ts)
└── dian/
    ├── types.ts                 ← interfaces compartidas
    ├── cufe.ts                  ← cálculo SHA-384 del CUFE
    ├── xml-ubl.ts               ← generador XML UBL 2.1 completo
    ├── index.ts                 ← selector de proveedor (lee DIAN_PROVEEDOR)
    └── providers/
        ├── stub.ts              ← modo desarrollo (NUNCA en producción)
        ├── aliaddo.ts           ← PT Aliaddo
        └── matias.ts            ← PT MATIAS API
```

---

## Pasos del lunes (con RUT en mano)

### 1. Registrar el software en la DIAN

Antes de usar un PT necesitas un software registrado en el Portal DIAN:

1. Entra a [factura.dian.gov.co](https://factura.dian.gov.co)
2. Autentícate con el certificado digital de tu empresa
3. Ve a **Habilitación → Registro de Software**
4. Ingresa nombre del software, NIT del PT (lo da el proveedor), y obtendrás:
   - `Software ID` (UUID)
   - `Software PIN` (código de 6+ dígitos)
5. Descarga o anota la **Clave Técnica** de tu resolución (la necesitas para el CUFE)

> Si usas Aliaddo o MATIAS, ellos pueden hacer este registro por ti. Pregúntales.

---

### 2. Registrar la Clave Técnica en la resolución DIAN

Una vez tengas la clave técnica de la DIAN, guárdala en la resolución activa.
Por ahora puedes hacerlo directamente en la base de datos (mientras no hay UI para esto):

```sql
UPDATE resoluciones_dian
SET clave_tecnica = 'TU_CLAVE_TECNICA_AQUI'
WHERE tenant_id = 'TU_TENANT_ID'
  AND activa = true;
```

O via Railway → Data → resoluciones_dian → editar la fila activa.

El campo `clave_tecnica` es nullable — si está null, el CUFE no se calcula localmente
y el PT (Aliaddo/MATIAS) debe calcularlo por su cuenta.

---

### 3. Opción A — Activar con Aliaddo

**Obtén del equipo de Aliaddo:**
- Client ID
- Client Secret
- URL base de la API (generalmente `https://apiv2.aliaddo.com`)
- NIT de Aliaddo como PT

**Variables de entorno en Railway:**

```env
DIAN_PROVEEDOR=aliaddo
ALIADDO_API_URL=https://apiv2.aliaddo.com
ALIADDO_CLIENT_ID=tu_client_id
ALIADDO_CLIENT_SECRET=tu_client_secret
DIAN_AMBIENTE=2           # 2 = habilitación/pruebas, 1 = producción
DIAN_NIT_PT=nit_de_aliaddo
DIAN_SOFTWARE_ID=uuid_de_tu_software_dian
DIAN_SOFTWARE_PIN=pin_de_tu_software_dian
```

**Prueba antes de producción:**
```bash
# Emite una factura de prueba y verifica que el CUFE sea real (no empieza con "STUB-")
# Revisa que el estado en la respuesta sea "ACCEPTED"
```

---

### 3. Opción B — Activar con MATIAS API

**Obtén del equipo de MATIAS:**
- API Key
- Company ID (tu empresa registrada en MATIAS)
- URL base de la API

**Variables de entorno en Railway:**

```env
DIAN_PROVEEDOR=matias
MATIAS_API_URL=https://api.matiasapi.com
MATIAS_API_KEY=tu_api_key
MATIAS_COMPANY_ID=tu_company_id
DIAN_AMBIENTE=2           # 2 = habilitación/pruebas, 1 = producción
DIAN_NIT_PT=nit_de_matias
DIAN_SOFTWARE_ID=uuid_de_tu_software_dian
DIAN_SOFTWARE_PIN=pin_de_tu_software_dian
```

> **Nota:** Los nombres de campos del payload de MATIAS pueden diferir de los implementados.
> Revisa la documentación oficial y ajusta `apps/api/src/services/dian/providers/matias.ts`
> si hay discrepancias.

---

### 4. Configurar el certificado digital

Los PT (Aliaddo/MATIAS) firman el XML usando el certificado digital del emisor.
Debes subir el certificado PKCS#12 (`.p12` o `.pfx`) al portal del PT.

El proceso varía por proveedor — sigue sus instrucciones de onboarding.

---

### 5. Período de habilitación DIAN

Antes de emitir facturas en producción, debes pasar el período de habilitación:
1. Emite las facturas de prueba que requiere la DIAN (generalmente 3-5)
2. El PT las envía al entorno de pruebas (`DIAN_AMBIENTE=2`)
3. La DIAN aprueba la habilitación (puede tardar 1-3 días hábiles)
4. Una vez aprobado, cambia `DIAN_AMBIENTE=1` para producción

---

### 6. Cambiar a producción

```env
DIAN_AMBIENTE=1
```

Eso es todo. El código lee esta variable y la incluye en el XML UBL 2.1.

---

## Variables de entorno necesarias (resumen)

| Variable              | Requerida        | Descripción                                          |
|-----------------------|------------------|------------------------------------------------------|
| `DIAN_PROVEEDOR`      | Sí               | `stub` / `aliaddo` / `matias`                        |
| `DIAN_AMBIENTE`       | Sí (si no-stub)  | `1` = producción, `2` = habilitación/pruebas         |
| `DIAN_SOFTWARE_ID`    | Sí (si no-stub)  | UUID del software registrado en la DIAN              |
| `DIAN_SOFTWARE_PIN`   | Sí (si no-stub)  | PIN del software DIAN (para SecurityCode)            |
| `DIAN_NIT_PT`         | Sí (si no-stub)  | NIT del Proveedor Tecnológico                        |
| `ALIADDO_API_URL`     | Solo Aliaddo     | URL base API Aliaddo                                 |
| `ALIADDO_CLIENT_ID`   | Solo Aliaddo     | Client ID OAuth2                                     |
| `ALIADDO_CLIENT_SECRET` | Solo Aliaddo   | Client Secret OAuth2                                 |
| `MATIAS_API_URL`      | Solo MATIAS      | URL base API MATIAS                                  |
| `MATIAS_API_KEY`      | Solo MATIAS      | Bearer token                                         |
| `MATIAS_COMPANY_ID`   | Solo MATIAS      | ID de empresa en MATIAS                              |
| `APP_URL`             | Para emails      | URL pública del frontend (para links en emails)      |

---

## Variables ya configuradas en Railway (no tocar)

```env
DATABASE_URL       # PostgreSQL Railway — ya funciona
JWT_SECRET         # Secreto JWT — ya configurado
WOMPI_*            # Credenciales Wompi — ya configuradas
ANTHROPIC_API_KEY  # IA de análisis de facturas — ya configurado
SMTP_*             # Email transaccional — configurar si aún no
```

---

## Verificación post-activación

Después de activar el PT real, verifica:

1. El banner rojo del Dashboard **desaparece** (modo stub → producción)
2. `/health` retorna `"dian": "produccion"`
3. Una factura de prueba tiene CUFE real (96 caracteres hexadecimales, no empieza con `STUB-`)
4. El estado de la factura es `aceptada` (no `borrador`)
5. El cliente recibe el email con el PDF adjunto

---

## Arquitectura del XML UBL 2.1

El generador en `apps/api/src/services/dian/xml-ubl.ts` implementa:
- Namespace correcto (`urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`)
- Extensiones DIAN (`sts:DianExtensions`) con datos de la resolución
- SecurityCode = SHA-384(softwareId + softwarePin + numeroFactura)
- Supplier/Customer parties completos con tipo de documento colombiano
- TaxTotal con IVA por ítem y total
- LegalMonetaryTotal con subtotal, IVA, total y neto a pagar
- InvoiceLines con descuentos por ítem

El XML generado cumple el Anexo técnico 1.9 de la Resolución 000042 de 2020.

---

## ⚠️ Garantía anti-confusión stub/producción

El modo stub **no puede confundirse con producción** porque:

1. El CUFE ficticio siempre empieza con `STUB-{id}-NO-VALIDO-DIAN`
2. El Dashboard muestra un banner rojo inamovible mientras `DIAN_PROVEEDOR=stub`
3. El endpoint `/health` retorna `"dian": "stub"` explícitamente
4. El servidor imprime un `console.warn` en cada factura emitida en modo stub
5. Para pasar a producción **debes** cambiar `DIAN_PROVEEDOR` a `aliaddo` o `matias` —
   no existe una ruta accidental

Solo hay una forma de entrar en producción: configurar `DIAN_PROVEEDOR` con el proveedor
correcto Y tener las credenciales del PT válidas.
