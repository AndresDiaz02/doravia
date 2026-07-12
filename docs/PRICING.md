# Política de Precios — Doravia

## 1. Precios promocionales 2026 (vigentes para cobro)

Los precios en `precio_anual_cop`, `precio_mensual_cop` y `precio_3cuotas_total_cop` del seed son los **PROMOCIONALES** y aplican a todos los clientes que ingresan durante 2026.

### ERP

| Plan | Anual | Mensual | Cuotas (total) | N.º cuotas |
|---|---|---|---|---|
| Semilla | $590.000 | $55.000 | $626.000 | 2 × $313.000 |
| Raíz | $790.000 | $74.000 | $838.000 | 3 × $280.000 (última $278.000) |
| Brote | $1.190.000 | $110.000 | $1.262.000 | 4 × $316.000 (última $314.000) |
| Cosecha | $1.590.000 | $149.000 | $1.686.000 | 4 × $422.000 (última $420.000) |

### POS

| Plan | Anual | Mensual | Cuotas (total) | N.º cuotas |
|---|---|---|---|---|
| Punto | $360.000 | $34.000 | $382.000 | 2 × $191.000 |
| Punto Plus | $630.000 | $59.000 | $668.000 | 2 × $334.000 |

### Origen (sin cambio)

| Plan | Anual |
|---|---|
| Origen 10 | Gratis |
| Origen 24 | $99.900 |
| Origen 60 | $169.900 |
| Origen 120 | $249.900 |
| Origen 300 | $329.900 |

---

## 2. Precios regulares 2027

Almacenados en `precio_regular_anual_cop` y `precio_regular_mensual_cop`. Son **informativos** — se muestran tachados en la landing y en las propuestas comerciales como referencia de ahorro.

| Plan | Regular anual | Regular mensual |
|---|---|---|
| Semilla | $730.000 | $73.000 |
| Raíz | $990.000 | $99.000 |
| Brote | $1.450.000 | $145.000 |
| Cosecha | $1.990.000 | $199.000 |
| Punto | $450.000 | $45.000 |
| Punto Plus | $790.000 | $79.000 |

---

## 3. Política comercial

- **Clientes que ingresan en 2026** pagan el precio promocional durante su primer año.
- **En renovación 2027** pasan al precio regular (salvo que se extienda la promo).
- **Origen**: sin precio promocional. Precio fijo permanente.

---

## 4. Regla operativa: cómo actualizar a precio regular

Cuando se decida subir a regular, **solo se actualiza `precio_anual_cop`, `precio_mensual_cop` y `precio_3cuotas_total_cop`** en `packages/db/src/seed/plans.ts`. Los campos `precio_regular_*` permanecen como referencia histórica.

Los campos activos (`precio_anual_cop`) son los únicos que llegan a la pasarela de pago (Bold/Wompi).

> **Regla inmutable:** nunca eliminar ni sobreescribir `precio_regular_anual_cop` — es la referencia de "tachado" para la landing y para reportes de descuento.

---

## 5. Ahorros promocionales 2026 vs 2027

| Plan | Ahorro anual |
|---|---|
| Semilla | $140.000 (19%) |
| Raíz | $200.000 (20%) |
| Brote | $260.000 (18%) |
| Cosecha | $400.000 (20%) |
| Punto | $90.000 (20%) |
| Punto Plus | $160.000 (20%) |
