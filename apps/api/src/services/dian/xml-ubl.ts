import type { FacturaDianInput } from "./types.js";

/**
 * Genera el XML UBL 2.1 para una factura electrónica colombiana según la
 * Resolución DIAN 000042 de 2020 y el Anexo técnico 1.9.
 *
 * El XML generado es el input para el Proveedor Tecnológico (PT), que lo
 * firma y lo envía a la DIAN. El PT puede aceptar JSON o XML según su API.
 *
 * Si se omite el CUFE (modo sin clave técnica), el campo cbc:UUID queda vacío
 * y el PT debe calcularlo antes de firmar.
 */

const FORMA_PAGO_CODIGO: Record<string, string> = {
  efectivo:        "10",
  tarjeta_credito: "48",
  tarjeta_debito:  "49",
  transferencia:   "42",
  cheque:          "20",
  otro:            "10",
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function f2(v: string | number): string {
  return Number(v).toFixed(2);
}

function pad(n: number, d: number): string {
  return String(n).padStart(d, "0");
}

export function generarXmlUbl(
  input: FacturaDianInput,
  opts: {
    cufe?: string;
    qrUrl?: string;
    ambiente?: "1" | "2";
    softwareId?: string;
    softwarePin?: string;
    nitProveedorTecnologico?: string;
  } = {},
): string {
  const { factura, items, cliente, tenant, resolucion } = input;

  const ambiente = opts.ambiente ?? (process.env.DIAN_AMBIENTE as "1" | "2" | undefined) ?? "2";
  const cufe = opts.cufe ?? "";
  const qrUrl = opts.qrUrl ?? "";
  const softwareId = opts.softwareId ?? process.env.DIAN_SOFTWARE_ID ?? "";
  const softwarePin = opts.softwarePin ?? process.env.DIAN_SOFTWARE_PIN ?? "";
  const nitPT = opts.nitProveedorTecnologico ?? process.env.DIAN_NIT_PT ?? "";

  const fechaEmision = new Date(factura.fecha_emision);
  const fechaStr = fechaEmision.toISOString().slice(0, 10);
  const horaStr = fechaEmision
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Bogota" })
    + "-05:00";

  const subtotal = Number(factura.subtotal);
  const ivaTot   = Number(factura.iva_total);
  const total    = Number(factura.total);
  const descuento = Number(factura.descuento_total ?? 0);
  const neto     = Number(factura.neto_a_pagar ?? total);

  const tipoPagoCode = FORMA_PAGO_CODIGO[factura.forma_pago] ?? "10";
  const nitEmisor = tenant.nit.split("-")[0].trim();

  // ── UBLExtensions / DianExtensions ───────────────────────────────────────
  const securityCode = (() => {
    if (!softwareId || !softwarePin) return "";
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    return createHash("sha384")
      .update(softwareId + softwarePin + factura.numero, "utf8")
      .digest("hex");
  })();

  // ── Supplier party ────────────────────────────────────────────────────────
  const supplierParty = `
    <cac:AccountingSupplierParty>
      <cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>
      <cac:Party>
        <cac:PartyName><cbc:Name>${esc(tenant.nombre)}</cbc:Name></cac:PartyName>
        <cac:PhysicalLocation>
          <cac:Address>
            <cbc:CityName>${esc(tenant.ciudad ?? "")}</cbc:CityName>
            <cbc:CountrySubentity>Colombia</cbc:CountrySubentity>
            <cbc:CountrySubentityCode>CO-${esc(tenant.ciudad ?? "").slice(0, 2).toUpperCase()}</cbc:CountrySubentityCode>
            <cac:AddressLine><cbc:Line>${esc(tenant.direccion ?? "")}</cbc:Line></cac:AddressLine>
            <cac:Country><cbc:IdentificationCode>CO</cbc:IdentificationCode></cac:Country>
          </cac:Address>
        </cac:PhysicalLocation>
        <cac:PartyTaxScheme>
          <cbc:RegistrationName>${esc(tenant.nombre)}</cbc:RegistrationName>
          <cbc:CompanyID schemeID="31" schemeName="31" schemeAgencyID="195"
            schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${esc(nitEmisor)}</cbc:CompanyID>
          <cbc:TaxLevelCode listName="48">${tenant.regimen === "simplificado" ? "O-49" : "O-13"}</cbc:TaxLevelCode>
          <cac:RegistrationAddress>
            <cbc:CityName>${esc(tenant.ciudad ?? "")}</cbc:CityName>
            <cac:AddressLine><cbc:Line>${esc(tenant.direccion ?? "")}</cbc:Line></cac:AddressLine>
            <cac:Country><cbc:IdentificationCode>CO</cbc:IdentificationCode></cac:Country>
          </cac:RegistrationAddress>
          <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
        </cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${esc(tenant.nombre)}</cbc:RegistrationName>
          <cbc:CompanyID schemeID="31" schemeName="31" schemeAgencyID="195"
            schemeAgencyName="CO, DIAN">${esc(nitEmisor)}</cbc:CompanyID>
        </cac:PartyLegalEntity>
        ${tenant.representante_legal ? `
        <cac:Contact>
          <cbc:Name>${esc(tenant.representante_legal)}</cbc:Name>
          ${tenant.correo ? `<cbc:ElectronicMail>${esc(tenant.correo)}</cbc:ElectronicMail>` : ""}
          ${tenant.telefono ? `<cbc:Telephone>${esc(tenant.telefono)}</cbc:Telephone>` : ""}
        </cac:Contact>` : ""}
      </cac:Party>
    </cac:AccountingSupplierParty>`;

  // ── Customer party ────────────────────────────────────────────────────────
  const schemeId = { CC: "13", NIT: "31", CE: "22", PPN: "41", TI: "12" }[cliente.tipo_documento] ?? "13";
  const customerParty = `
    <cac:AccountingCustomerParty>
      <cbc:AdditionalAccountID>${cliente.tipo_persona === "juridica" ? "1" : "2"}</cbc:AdditionalAccountID>
      <cac:Party>
        <cac:PartyName><cbc:Name>${esc(cliente.nombre)}</cbc:Name></cac:PartyName>
        <cac:PhysicalLocation>
          <cac:Address>
            <cbc:CityName>${esc(cliente.municipio ?? "")}</cbc:CityName>
            <cac:AddressLine><cbc:Line>${esc(cliente.direccion ?? "")}</cbc:Line></cac:AddressLine>
            <cac:Country><cbc:IdentificationCode>CO</cbc:IdentificationCode></cac:Country>
          </cac:Address>
        </cac:PhysicalLocation>
        <cac:PartyTaxScheme>
          <cbc:RegistrationName>${esc(cliente.nombre)}</cbc:RegistrationName>
          <cbc:CompanyID schemeID="${schemeId}" schemeName="${schemeId}" schemeAgencyID="195"
            schemeAgencyName="CO, DIAN">${esc(cliente.numero_documento)}</cbc:CompanyID>
          <cbc:TaxLevelCode listName="48">R-99-PN</cbc:TaxLevelCode>
          <cac:TaxScheme><cbc:ID>ZZ</cbc:ID><cbc:Name>No aplica</cbc:Name></cac:TaxScheme>
        </cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${esc(cliente.nombre)}</cbc:RegistrationName>
          <cbc:CompanyID schemeID="${schemeId}" schemeName="${schemeId}" schemeAgencyID="195"
            schemeAgencyName="CO, DIAN">${esc(cliente.numero_documento)}</cbc:CompanyID>
        </cac:PartyLegalEntity>
        ${cliente.correo ? `
        <cac:Contact>
          <cbc:ElectronicMail>${esc(cliente.correo)}</cbc:ElectronicMail>
          ${cliente.telefono ? `<cbc:Telephone>${esc(cliente.telefono)}</cbc:Telephone>` : ""}
        </cac:Contact>` : ""}
      </cac:Party>
    </cac:AccountingCustomerParty>`;

  // ── Invoice lines ─────────────────────────────────────────────────────────
  const lineas = items.map((item, idx) => {
    const cant = Number(item.cantidad);
    const precio = Number(item.precio_unitario);
    const descPct = Number(item.descuento_pct ?? 0);
    const ivaPct = Number(item.iva_pct ?? 19);
    const subtotalItem = Number(item.subtotal);
    const ivaValor = Number(item.iva_valor);
    const impoconsumoPct = Number(item.impoconsumo_pct ?? 0);
    const impoconsumoValor = Number(item.impoconsumo_valor ?? 0);

    return `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${item.unidad_medida ?? "EA"}">${cant.toFixed(4)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="COP">${f2(subtotalItem)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${esc(item.descripcion)}</cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="COP">${f2(precio)}</cbc:PriceAmount>
        <cbc:BaseQuantity unitCode="${item.unidad_medida ?? "EA"}">1.0000</cbc:BaseQuantity>
      </cac:Price>
      ${descPct > 0 ? `
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:AllowanceChargeReason>Descuento</cbc:AllowanceChargeReason>
        <cbc:MultiplierFactorNumeric>${(descPct / 100).toFixed(4)}</cbc:MultiplierFactorNumeric>
        <cbc:Amount currencyID="COP">${f2(precio * cant * (descPct / 100))}</cbc:Amount>
        <cbc:BaseAmount currencyID="COP">${f2(precio * cant)}</cbc:BaseAmount>
      </cac:AllowanceCharge>` : ""}
      ${ivaPct > 0 ? `
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">${f2(ivaValor)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="COP">${f2(subtotalItem)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="COP">${f2(ivaValor)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>${ivaPct.toFixed(2)}</cbc:Percent>
            <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>` : ""}
      ${impoconsumoPct > 0 ? `
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">${f2(impoconsumoValor)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="COP">${f2(subtotalItem)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="COP">${f2(impoconsumoValor)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>${impoconsumoPct.toFixed(2)}</cbc:Percent>
            <cac:TaxScheme><cbc:ID>05</cbc:ID><cbc:Name>Impuesto al consumo</cbc:Name></cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>` : ""}
    </cac:InvoiceLine>`;
  }).join("\n");

  // ── TaxTotal ──────────────────────────────────────────────────────────────
  // Calcular totales de impoconsumo desde los ítems
  const impoconsumoTot = items.reduce((s, item) => s + Number(item.impoconsumo_valor ?? 0), 0);
  const impoconsumoBase = items.reduce((s, item) => s + (Number(item.impoconsumo_valor ?? 0) > 0 ? Number(item.subtotal) : 0), 0);
  const impoconsumoPctPromedio = impoconsumoBase > 0
    ? (items.reduce((s, item) => s + Number(item.impoconsumo_pct ?? 0) * Number(item.subtotal), 0) / impoconsumoBase)
    : 0;

  const taxTotal = ivaTot > 0 ? `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="COP">${f2(ivaTot)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="COP">${f2(subtotal)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="COP">${f2(ivaTot)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>19.00</cbc:Percent>
          <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>` : `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="COP">0.00</cbc:TaxAmount>
    </cac:TaxTotal>`;

  const taxTotalImpoconsumo = impoconsumoTot > 0 ? `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="COP">${f2(impoconsumoTot)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="COP">${f2(impoconsumoBase)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="COP">${f2(impoconsumoTot)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${impoconsumoPctPromedio.toFixed(2)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>05</cbc:ID><cbc:Name>Impuesto al consumo</cbc:Name></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${esc(resolucion.numero_resolucion)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${resolucion.fecha_desde}</cbc:StartDate>
              <cbc:EndDate>${resolucion.fecha_hasta}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${esc(resolucion.prefijo)}</sts:Prefix>
              <sts:From>${resolucion.consecutivo_desde}</sts:From>
              <sts:To>${resolucion.consecutivo_hasta}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations - Tax and trade"
              listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN">${esc(nitPT)}</sts:ProviderID>
            <sts:SoftwareID schemeAgencyID="195" schemeAgencyName="CO, DIAN">${esc(softwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN">${esc(securityCode)}</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN"
              schemeID="4" schemeName="UN/CEFACT">800197268</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${esc(qrUrl)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ProfileExecutionID>${ambiente}</cbc:ProfileExecutionID>
  <cbc:ID>${esc(factura.numero)}</cbc:ID>
  <cbc:UUID schemeID="${ambiente}" schemeName="CUFE-SHA384">${esc(cufe)}</cbc:UUID>
  <cbc:IssueDate>${fechaStr}</cbc:IssueDate>
  <cbc:IssueTime>${horaStr}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listAgencyID="195" listAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)"
    listSchemeURI="http://www.dian.gov.co/contratos/facturacionelectronica/v1/InvoiceType">01</cbc:InvoiceTypeCode>
  ${factura.observaciones ? `<cbc:Note>${esc(factura.observaciones)}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>

  <cac:OrderReference>
    <cbc:ID>${esc(factura.numero)}</cbc:ID>
  </cac:OrderReference>
  ${supplierParty}
  ${customerParty}

  <cac:PaymentMeans>
    <cbc:ID>${tipoPagoCode}</cbc:ID>
    <cbc:PaymentMeansCode>${tipoPagoCode}</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${factura.fecha_vencimiento
      ? new Date(factura.fecha_vencimiento).toISOString().slice(0, 10)
      : fechaStr}</cbc:PaymentDueDate>
  </cac:PaymentMeans>

  ${descuento > 0 ? `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Descuento general</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="COP">${f2(descuento)}</cbc:Amount>
    <cbc:BaseAmount currencyID="COP">${f2(subtotal + descuento)}</cbc:BaseAmount>
  </cac:AllowanceCharge>` : ""}

  ${taxTotal}
  ${taxTotalImpoconsumo}

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${f2(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${f2(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${f2(total)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="COP">${f2(descuento)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="COP">${f2(neto)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  ${lineas}
</Invoice>`;
}
