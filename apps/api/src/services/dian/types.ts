import type { Factura, ItemFactura, Cliente, Tenant, ResolucionDian } from "@workspace/db";

export interface FacturaDianInput {
  factura: Factura;
  items: ItemFactura[];
  cliente: Cliente;
  tenant: Tenant;
  resolucion: ResolucionDian;
}

export interface RespuestaDian {
  cufe: string;
  qr_code: string;
  xml_firmado: string;
  aceptada: boolean;
  mensaje?: string;
}

export interface DianProvider {
  readonly nombre: string;
  enviarFactura(input: FacturaDianInput): Promise<RespuestaDian>;
}
