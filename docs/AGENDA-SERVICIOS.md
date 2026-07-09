# Módulo Agenda de Servicios — FASE 7

## Inventario del módulo de citas previo (citas_pos)

### Lo que existía antes de FASE-7

| Componente | Ubicación | Descripción |
|---|---|---|
| Tabla `citas_pos` | `packages/db/src/schema/pos.ts` | tenant_id, caja_id, cliente_nombre (texto libre), cliente_telefono, fecha_hora, servicio (texto libre), profesional, duracion_min, notas, estado |
| Estados previos | — | `programada`, `en_proceso`, `completada`, `cancelada` |
| API citas | `apps/api/src/routes/pos.ts` líneas 1044–1148 | GET/POST/PATCH/DELETE en `/api/pos/citas` |
| Frontend POS | `apps/pos/src/pages/Citas.tsx` | Vista diaria simple, cambio de estado con botones pequeños, sin ciclo de cobro, sin WhatsApp, sin sujeto |
| Gating | `pos_config.citas_visible` (JSON en tenants) | Toggle por tenant, **no** plan feature — se mantiene así |

### Decisión: MIGRAR (no reemplazar)

- `citas_pos` se extiende con ALTER TABLE ADD COLUMN IF NOT EXISTS (preserva datos demo)
- Los estados viejos se mapean a los nuevos en la migración (UPDATE idempotente)
- Las rutas en `pos.ts` se deprecan silenciosamente (siguen funcionando para compatibilidad)
- Nueva ruta `/api/agenda` maneja todo el flujo FASE-7
- `Citas.tsx` se reescribe con el ciclo completo

### Migración de estados

| Estado previo | Estado nuevo |
|---|---|
| `programada` | `agendada` |
| `en_proceso` | `en_atencion` |
| `completada` | `entregada_cobrada` |
| `cancelada` | `cancelada` |

---

## Ciclo de vida de la cita

```
agendada → confirmada (opcional) → en_atencion (check-in) → lista_entrega → entregada_cobrada
                                                           ↘ no_show
         ↘ cancelada (desde cualquier estado activo)
```

### Transiciones válidas

| Desde | Hacia | Acción |
|---|---|---|
| agendada | confirmada | Confirmar cita |
| agendada, confirmada | en_atencion | "Llegó" (check-in) |
| agendada, confirmada | no_show | "No llegó" |
| en_atencion | lista_entrega | "Listo para entrega" |
| lista_entrega | entregada_cobrada | Cobrar via POS (requiere venta_pos_id) |
| agendada, confirmada, en_atencion, lista_entrega | cancelada | Cancelar |

### Transiciones inválidas (bloqueadas en API)
- `no_show` → cualquier estado
- `entregada_cobrada` → cualquier estado
- `cancelada` → cualquier estado
- `lista_entrega` → `entregada_cobrada` sin venta_pos_id

---

## Configuración del sujeto (horizontal)

El "sujeto" del servicio es configurable por tenant en `pos_config`:
- `sujeto_label`: string (ej. `"Mascota"`, `"Vehículo"`, `"Prenda"`) o `null`/ausente → sin sujeto (ej. barbería)
- Si `sujeto_label` es null, la tabla `sujetos_servicio` no se usa en ese tenant

### Ejemplos de uso por industria
| Industria | sujeto_label | Ejemplo |
|---|---|---|
| Pet shop / veterinaria | `"Mascota"` | Rocky (Golden Retriever) |
| Taller mecánico | `"Vehículo"` | Toyota Corolla AKO-123 |
| Lavandería | `"Prenda"` | Tapete persa 3×2 |
| Barbería / spa | `null` | (la cita es de la persona) |

---

## Fuera del MVP (explícitamente excluido)

1. **WhatsApp Cloud API** — Los mensajes de recordatorio se generan como links `wa.me` que el cajero abre manualmente. NO hay envío automático, NO hay integración con Meta Business API, NO hay webhooks de WhatsApp. Queda documentado como evolución futura (FASE-X: automatización WhatsApp).

2. **Recordatorios automáticos** — No hay cron job, no hay scheduler. El cajero presiona el botón manualmente cuando quiere enviar el recordatorio.

3. **Estados configurables** — Los estados del ciclo son fijos. No se pueden personalizar por tenant en este MVP.

4. **Confirmación por parte del cliente** — No hay link de autoconfirmación para el cliente. La confirmación la hace el operario en el sistema.

5. **Integración con calendario externo** — No hay sincronización con Google Calendar, Outlook, etc.

6. **Cobro fuera del POS** — Todo pago pasa por el flujo de venta POS existente. La cita NUNCA genera un cobro por su cuenta.

---

## Mensajes WhatsApp generados

### Recordatorio de cita (botón "Enviar recordatorio")
```
Hola [nombre_cliente] 👋 Te recordamos tu cita en [nombre_negocio] el [fecha] a las [hora] para [servicio][: [nombre_sujeto]]. ¡Te esperamos!
```
*Ejemplo con mascota:* "Hola María 👋 Te recordamos tu cita en PetShop Peludo el martes 10 de junio a las 10:00 para Baño y corte: Rocky. ¡Te esperamos!"
*Ejemplo sin sujeto:* "Hola Carlos 👋 Te recordamos tu cita en Barbería El Corte el miércoles 11 de junio a las 14:30 para Corte clásico. ¡Te esperamos!"

### Listo para entrega (botón "Notificar listo")
```
¡[nombre_sujeto_o_servicio] ya está listo(a) para recoger! 🐾 Puedes venir cuando gustes a [nombre_negocio].
```
*Ejemplo con mascota:* "¡Rocky ya está listo para recoger! 🐾 Puedes venir cuando gustes a PetShop Peludo."
*Ejemplo sin sujeto:* "¡Tu servicio ya está listo! 🙌 Puedes venir cuando gustes a Barbería El Corte."
