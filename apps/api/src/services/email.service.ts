import nodemailer from "nodemailer";
import type { Factura, Cliente, Tenant } from "@workspace/db";

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   ?? "smtp.gmail.com",
  port:   Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
  },
});

const FROM = process.env.SMTP_FROM ?? "noreply@doravia.co";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", minimumFractionDigits: 0,
});

function emailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function baseLayout(titulo: string, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#16a34a;padding:20px 32px;">
            <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Doravia</span>
            <span style="color:#bbf7d0;font-size:12px;margin-left:8px;">Facturación electrónica</span>
          </td>
        </tr>
        <tr><td style="padding:32px;">${cuerpo}</td></tr>
        <tr>
          <td style="background:#f3f4f6;padding:16px 32px;text-align:center;color:#9ca3af;font-size:11px;">
            Este correo fue generado automáticamente por Doravia. Por favor no respondas a este mensaje.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function enviarFacturaAceptada(
  factura: Factura,
  cliente: Cliente,
  tenant: Tenant,
  pdfBuffer: Buffer,
): Promise<void> {
  if (!emailConfigured()) return;
  if (!cliente.correo) return;

  const fecha = new Date(factura.fecha_emision).toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const cuerpo = `
    <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">Factura electrónica recibida</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">
      ${tenant.nombre} te ha enviado la siguiente factura electrónica.
    </p>

    <table style="width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#374151;font-weight:600;">N° Factura</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">${factura.numero}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#374151;font-weight:600;border-top:1px solid #f3f4f6;">Fecha</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-top:1px solid #f3f4f6;">${fecha}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#374151;font-weight:600;border-top:1px solid #f3f4f6;">Total</td>
        <td style="padding:12px 16px;font-size:16px;color:#16a34a;font-weight:700;border-top:1px solid #f3f4f6;">
          ${COP.format(Number(factura.total))}
        </td>
      </tr>
    </table>

    <p style="color:#6b7280;font-size:13px;margin:0;">
      La factura en formato PDF se adjunta a este correo. También puedes consultarla con el CUFE en la página de la DIAN.
    </p>
    ${factura.cufe ? `<p style="color:#9ca3af;font-size:11px;margin-top:12px;word-break:break-all;">CUFE: ${factura.cufe}</p>` : ""}
  `;

  await transporter.sendMail({
    from: `"${tenant.nombre}" <${FROM}>`,
    to:   cliente.correo,
    subject: `Factura electrónica ${factura.numero} de ${tenant.nombre}`,
    html:    baseLayout(`Factura ${factura.numero}`, cuerpo),
    attachments: [
      {
        filename:    `${factura.numero}.pdf`,
        content:     pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function enviarAlertaCobro(
  facturas: { numero: string; total: string; dias_vencida: number; fecha_vencimiento: string }[],
  cliente: Cliente,
  tenant: Tenant,
): Promise<void> {
  if (!emailConfigured()) return;
  if (!cliente.correo || facturas.length === 0) return;

  const totalPendiente = facturas.reduce((s, f) => s + Number(f.total), 0);

  const filas = facturas.map((f) => `
    <tr>
      <td style="padding:10px 14px;font-size:13px;color:#111827;border-top:1px solid #f3f4f6;">${f.numero}</td>
      <td style="padding:10px 14px;font-size:13px;color:#111827;border-top:1px solid #f3f4f6;">${COP.format(Number(f.total))}</td>
      <td style="padding:10px 14px;font-size:13px;border-top:1px solid #f3f4f6;color:${f.dias_vencida > 30 ? "#dc2626" : "#d97706"};">
        ${f.dias_vencida} día(s)
      </td>
    </tr>
  `).join("");

  const cuerpo = `
    <h2 style="color:#111827;font-size:18px;margin:0 0 8px;">Recordatorio de pago</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">
      Tienes ${facturas.length} factura(s) pendiente(s) de pago con <strong>${tenant.nombre}</strong>.
    </p>

    <table style="width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:left;font-weight:600;">Factura</th>
          <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:left;font-weight:600;">Valor</th>
          <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:left;font-weight:600;">Días vencida</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr style="background:#fef2f2;">
          <td colspan="2" style="padding:12px 14px;font-size:13px;color:#374151;font-weight:700;border-top:2px solid #fecaca;">
            Total pendiente
          </td>
          <td style="padding:12px 14px;font-size:15px;color:#dc2626;font-weight:700;border-top:2px solid #fecaca;">
            ${COP.format(totalPendiente)}
          </td>
        </tr>
      </tfoot>
    </table>

    <p style="color:#6b7280;font-size:13px;">
      Por favor comunícate con nosotros para coordinar el pago o si tienes alguna inquietud.
    </p>
  `;

  await transporter.sendMail({
    from:    `"${tenant.nombre}" <${FROM}>`,
    to:      cliente.correo,
    subject: `Recordatorio de pago — ${facturas.length} factura(s) pendiente(s)`,
    html:    baseLayout("Recordatorio de pago", cuerpo),
  });
}
