/**
 * Tests del motor de ventana horaria de notificaciones (FASE 6).
 *
 * Regla: WhatsApp y Email solo se despachan entre 08:00 y 17:00 Bogotá (UTC-5).
 * In-App: siempre inmediato, sin importar la hora.
 *
 * Casos cubiertos:
 *   1. Evento a las 22:00 Bogotá → programado para el día siguiente 08:00
 *   2. Evento a las 16:59 Bogotá → enviado inmediatamente
 *   3. Evento a las 17:01 Bogotá → programado para el día siguiente 08:00
 *   4. Evento a las 07:59 Bogotá → programado para hoy 08:00 (mismo día)
 *   5. Evento a las 08:00 Bogotá → inmediato (límite inferior inclusivo)
 *   6. Evento a las 17:00 Bogotá → programado para mañana (límite superior exclusivo)
 *   7. In-App siempre inmediato sin importar la hora
 */

import { describe, it, expect } from "vitest";
import { calcularScheduledAt, fechaLocalBogota } from "../services/notification.service.js";

// Colombia es UTC-5 (sin DST). Helper para construir fechas UTC a partir de hora Bogotá.
function bogotaHora(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const iso = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00-05:00`;
  return new Date(iso);
}

describe("notification-window: ventana horaria Bogotá", () => {

  // ── Regla de ventana para WhatsApp/Email ─────────────────────────────────────

  it("22:00 Bogotá → scheduled mañana 08:00 (fuera de ventana)", () => {
    const now = bogotaHora(2026, 7, 10, 22, 0); // 22:00 Bogotá = 03:00 UTC del día 11
    const scheduled = calcularScheduledAt(now, "whatsapp");
    const expected  = bogotaHora(2026, 7, 11, 8, 0);
    expect(scheduled.getTime()).toBe(expected.getTime());
  });

  it("16:59 Bogotá → inmediato (dentro de la ventana)", () => {
    const now = bogotaHora(2026, 7, 10, 16, 59);
    const scheduled = calcularScheduledAt(now, "email");
    expect(scheduled.getTime()).toBe(now.getTime());
  });

  it("17:01 Bogotá → scheduled mañana 08:00 (fuera de ventana)", () => {
    const now = bogotaHora(2026, 7, 10, 17, 1);
    const scheduled = calcularScheduledAt(now, "whatsapp");
    const expected  = bogotaHora(2026, 7, 11, 8, 0);
    expect(scheduled.getTime()).toBe(expected.getTime());
  });

  it("07:59 Bogotá → scheduled hoy 08:00 (antes de la ventana, mismo día)", () => {
    const now = bogotaHora(2026, 7, 10, 7, 59);
    const scheduled = calcularScheduledAt(now, "email");
    const expected  = bogotaHora(2026, 7, 10, 8, 0);
    expect(scheduled.getTime()).toBe(expected.getTime());
  });

  it("08:00 Bogotá → inmediato (límite inferior inclusivo)", () => {
    const now = bogotaHora(2026, 7, 10, 8, 0);
    const scheduled = calcularScheduledAt(now, "whatsapp");
    expect(scheduled.getTime()).toBe(now.getTime());
  });

  it("17:00 Bogotá → scheduled mañana 08:00 (límite superior exclusivo)", () => {
    const now = bogotaHora(2026, 7, 10, 17, 0);
    const scheduled = calcularScheduledAt(now, "email");
    const expected  = bogotaHora(2026, 7, 11, 8, 0);
    expect(scheduled.getTime()).toBe(expected.getTime());
  });

  // ── In-App siempre inmediato ───────────────────────────────────────────────

  it("in_app a las 22:00 → inmediato (sin ventana)", () => {
    const now = bogotaHora(2026, 7, 10, 22, 0);
    const scheduled = calcularScheduledAt(now, "in_app");
    expect(scheduled.getTime()).toBe(now.getTime());
  });

  it("in_app a las 03:00 → inmediato (sin ventana)", () => {
    const now = bogotaHora(2026, 7, 10, 3, 0);
    const scheduled = calcularScheduledAt(now, "in_app");
    expect(scheduled.getTime()).toBe(now.getTime());
  });

  it("in_app a las 08:00 → inmediato", () => {
    const now = bogotaHora(2026, 7, 10, 8, 0);
    const scheduled = calcularScheduledAt(now, "in_app");
    expect(scheduled.getTime()).toBe(now.getTime());
  });

  // ── fechaLocalBogota ──────────────────────────────────────────────────────

  it("fechaLocalBogota devuelve la fecha en hora Bogotá, no UTC", () => {
    // 00:30 UTC del 11 de julio = 19:30 Bogotá del 10 de julio
    const utcDate = new Date("2026-07-11T00:30:00Z");
    expect(fechaLocalBogota(utcDate)).toBe("2026-07-10");
  });

  it("fechaLocalBogota a las 05:00 UTC = 00:00 Bogotá → mismo día", () => {
    const utcDate = new Date("2026-07-10T05:00:00Z"); // 00:00 Bogotá
    expect(fechaLocalBogota(utcDate)).toBe("2026-07-10");
  });
});
