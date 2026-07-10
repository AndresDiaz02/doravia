/** Templates canónicos del motor de notificaciones FASE 6. */
export interface NotifTemplate {
  title: string;
  body: (params: Record<string, string>) => string;
  channels: ("whatsapp" | "email" | "in_app")[];
  link?: string;
}

export const NOTIFICATION_TEMPLATES: Record<string, NotifTemplate> = {
  // ── Trial ───────────────────────────────────────────────────────────────────
  trial_d10: {
    title: "Tu prueba gratuita vence en 10 días",
    body: () => "Tienes 10 días restantes de tu período de prueba. Activa tu plan para continuar sin interrupciones.",
    channels: ["in_app", "email"],
    link: "/mi-plan",
  },
  trial_d13: {
    title: "Tu prueba gratuita vence en 3 días",
    body: () => "Solo quedan 3 días de prueba. No pierdas el acceso a tus datos: activa tu plan hoy.",
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },

  // ── Renovación ──────────────────────────────────────────────────────────────
  renovacion_aviso_mes: {
    title: "Tu plan vence en un mes",
    body: (p) => `Tu plan ${p.plan} vence el ${p.fecha}. Renueva ahora para asegurar la continuidad.`,
    channels: ["in_app", "email"],
    link: "/mi-plan",
  },
  renovacion_d15: {
    title: "Tu plan vence en 15 días",
    body: (p) => `Quedan 15 días para que venza tu plan ${p.plan}. Renueva antes para evitar interrupciones.`,
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },
  renovacion_d5: {
    title: "Tu plan vence en 5 días",
    body: (p) => `Tu plan ${p.plan} vence el ${p.fecha}. Renueva ahora.`,
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },
  renovacion_dia: {
    title: "Tu plan vence hoy",
    body: (p) => `Tu plan ${p.plan} vence hoy. Renueva para seguir facturando sin interrupciones.`,
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },

  // ── Mora ────────────────────────────────────────────────────────────────────
  mora_aviso: {
    title: "Pago no procesado",
    body: () => "No pudimos procesar tu pago. Actualiza tu método de pago para evitar la suspensión.",
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },
  mora_fallo: {
    title: "Fallo en el cobro de tu plan",
    body: () => "El cobro de tu plan falló. Tu cuenta quedará en lectura en 3 días si no regularizas.",
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },
  mora_readonly: {
    title: "Cuenta en modo lectura",
    body: () => "Tu cuenta está en modo lectura por falta de pago. Paga ahora para restaurar el acceso completo.",
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },

  // ── Cupo de documentos Origen ───────────────────────────────────────────────
  cupo_80: {
    title: "Usaste el 80% de tu cupo de documentos",
    body: (p) => `Has emitido ${p.emitidos} de ${p.limite} documentos electrónicos este año (80%). Considera ampliar tu plan.`,
    channels: ["in_app", "email"],
    link: "/mi-plan",
  },
  cupo_95: {
    title: "Usaste el 95% de tu cupo de documentos",
    body: (p) => `Solo te quedan ${p.restantes} documentos electrónicos este año. Amplía tu plan para no quedarte sin cupo.`,
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },
  cupo_100: {
    title: "Cupo de documentos agotado",
    body: () => "Agotaste tu cupo anual de documentos electrónicos. Contrata documentos adicionales para seguir facturando.",
    channels: ["in_app", "email", "whatsapp"],
    link: "/mi-plan",
  },

  // ── Archivo / DIAN ──────────────────────────────────────────────────────────
  archivo_d75: {
    title: "Documentos por enviar a la DIAN (75 días)",
    body: () => "Tienes documentos electrónicos emitidos hace más de 75 días pendientes de envío a la DIAN.",
    channels: ["in_app", "email"],
    link: "/facturas",
  },
  archivo_d85: {
    title: "Urgente: documentos DIAN (85 días)",
    body: () => "Documentos electrónicos a punto de vencer el plazo DIAN (90 días). Envía ahora para evitar sanciones.",
    channels: ["in_app", "email", "whatsapp"],
    link: "/facturas",
  },

  // ── R7 — Alertas de vigencia tributaria (solo fundadores) ───────────────────
  r7_recordatorio_1dic: {
    title: "R7: Recordatorio parámetros tributarios del próximo año",
    body: (p) => `El 1 de diciembre se acerca el cierre del año ${p.ano}. Recuerda registrar UVT y demás parámetros para ${p.siguiente} antes del 31 de diciembre.`,
    channels: ["in_app", "email"],
    link: "/fundador/tax-parameters",
  },
  r7_critico_15dic: {
    title: "R7: Faltan parámetros tributarios para el próximo año",
    body: (p) => `Faltan ${p.faltantes} para el año ${p.siguiente}: ${p.lista}. Sin estos parámetros las liquidaciones del próximo año serán incorrectas.`,
    channels: ["in_app", "email", "whatsapp"],
    link: "/fundador/tax-parameters",
  },
  r7_expiracion_30d: {
    title: "R7: Parámetro tributario expira en 30 días",
    body: (p) => `El parámetro "${p.parametro}" (${p.descripcion}) vence el ${p.fecha}. Registra la nueva vigencia antes de esa fecha.`,
    channels: ["in_app", "email"],
    link: "/fundador/tax-parameters",
  },
};

export type TemplateKey = keyof typeof NOTIFICATION_TEMPLATES;
