# Reporte Completo del Sistema Doravia

> Documento para entregar contexto completo a una nueva sesión de Claude.
> Generado el 2026-07-06.

---

## 1. Descripción general del negocio

**Doravia** es un SaaS de contabilidad, facturación electrónica y punto de venta (POS) para empresas colombianas. Está en etapa de validación (primeros clientes reales).

- **Co-fundadores**: Andres (desarrollador) y Rose
- **Repositorio GitHub**: `AndresDiaz02/doravia`
- **Monorepo pnpm** en `c:\Users\epsa2\doravia`

### Productos ofrecidos

#### Origen — Solo facturación electrónica DIAN
| Plan slug | Docs/año | Precio |
|---|---|---|
| `origen` | 12 | Gratis permanente |
| `origen_24` | 24 | $99.900/año |
| `origen_60` | 60 | $169.900/año |
| `origen_120` | 120 | $249.900/año |
| `origen_300` | 300 | $329.900/año |

- Sin prueba gratuita (el gratis permanente ES el tier free)
- Pago anual único

#### ERP — Contabilidad, inventario, CRM completo
| Plan slug | Nombre | Precio/año |
|---|---|---|
| `semilla` | Semilla ⭐ | $730.000 |
| `raiz` | Raíz | $990.000 |
| `brote` | Brote | $1.450.000 |
| `cosecha` | Cosecha | $1.990.000 |

- Prueba gratuita de 15 días (suspensión sin eliminación al vencer)
- Pago: anual / mensual (+8–10%) / cuotas (2–4 cuotas según plan)
- Semilla = plan más vendido; incluye facturación, inventario, compras, gastos, Kardex, C×C, C×P, contabilidad, reportes, Excel

#### POS — Punto de venta
| Plan slug | Nombre | Precio/año |
|---|---|---|
| `punto` | Punto | $450.000 |
| `punto_plus` | Punto Plus | $790.000 |

- Punto: 1 caja, 2 usuarios, 1 bodega
- Punto Plus: multi-caja, usuarios ilimitados, 3 bodegas

#### Incluido en todos los planes
- Soporte 24/7 con IA (chatbot Claude Haiku 4.5)
- Usuario "Contador" gratuito (rol solo-lectura/exportación)

---

## 2. Stack tecnológico

### Apps en el monorepo

| App | Tecnología | Descripción |
|---|---|---|
| `apps/api` | Express + TypeScript + tsx (sin compilar) + Drizzle ORM + PostgreSQL | Backend principal |
| `apps/web` | React 18 + Vite + TailwindCSS + react-router-dom v6 + recharts | ERP web |
| `apps/pos` | React 18 + Vite + TailwindCSS | App de cajero POS |
| `apps/landing` | HTML/CSS/JS vanilla | Sitio de marketing |
| `packages/db` | Drizzle ORM + PostgreSQL | Schemas y cliente DB compartido |
| `packages/shared` | TypeScript puro | Errores tipados, features de planes, PlanDefinition |

### Infraestructura

| Servicio | Plataforma | URL |
|---|---|---|
| API | Railway | `https://doravia-production.up.railway.app` (también `https://api.doraviasoft.com`) |
| ERP web | Cloudflare Pages (`doravia-erp`) | `https://app.doraviasoft.com` |
| POS | Cloudflare Pages (`doravia-pos`) | `https://pos.doraviasoft.com` |
| Landing | Cloudflare Pages (`doravia-landing`) | `https://doraviasoft.com` |
| Base de datos | Railway PostgreSQL | `DATABASE_URL` |
| Email | Resend | Dominio `doraviasoft.com` verificado |
| Pagos | Bold Checkout | Integración con webhook |
| IA | Anthropic (Claude Haiku 4.5) | Soporte chat + dictado facturas + foto inventario |
| DIAN | Plemsi (staging: `pruebas.plemsi.com`) | Facturación electrónica UBL 2.1 |

### Deploy
- **API**: `railway up --service doravia` (Railway usa sus propias env vars)
- **ERP/POS/Landing**: GitHub Actions (`deploy-erp.yml`, `deploy-pos.yml`, `deploy-landing.yml`)
- **API start command**: `pnpm db:migrate && pnpm db:seed && pnpm --filter @workspace/api run start`

### Variables de entorno Railway (principales)
```
DATABASE_URL               = Railway Postgres interno
RESEND_API_KEY             = clave de Resend
ANTHROPIC_API_KEY          = clave de Anthropic
BOLD_SECRET_KEY            = clave Bold pagos
BOLD_INTEGRITY_SECRET      = secreto integridad Bold
PLEMSI_API_KEY_DEFAULT     = token Bearer Plemsi
PLEMSI_URL                 = https://pruebas.plemsi.com
PLEMSI_RESOLUCION_DEFAULT  = número de resolución fallback
DIAN_PROVEEDOR             = plemsi
DIAN_AMBIENTE              = 2 (pruebas) / 1 (producción)
FUNDADOR_EMAILS            = andres@doravia.com,rose@doravia.com
ALLOWED_ORIGINS            = lista de URLs permitidas CORS
JWT_SECRET                 = secreto JWT
REFRESH_TOKEN_SECRET       = secreto refresh token
APP_URL                    = https://app.doraviasoft.com
```

---

## 3. Multi-tenancy y autenticación

### Modelo de datos
- Cada empresa = un **tenant** (tabla `tenants`) identificado por NIT
- Usuarios (tabla `users`) pertenecen a un tenant, tienen `role`: `admin`, `cajero`, `contador`
- Los contadores son usuarios especiales en el **hub tenant** (NIT `0000000001`)
- Un usuario puede pertenecer a múltiples empresas (tabla `user_accesos`)

### Flujo de autenticación
1. `POST /api/auth/login` — retorna `accessToken` (JWT 15 min) + `refreshToken` (30 días, HttpOnly)
2. Si el usuario tiene múltiples empresas: retorna `selectionToken` + lista `empresas`
3. `POST /api/auth/select-empresa` — elige empresa, retorna JWT del tenant
4. `POST /api/auth/refresh` — renueva access token via refresh token
5. `POST /api/auth/logout` — invalida refresh token
6. `POST /api/auth/cambiar-password` — autenticado
7. `POST /api/auth/cambiar-empresa` — switch de empresa sin re-login

### Recuperación de contraseña
- `POST /api/auth/solicitar-reset` — genera token, envía email con link
- `POST /api/auth/resetear-password` — valida token + actualiza contraseña
- Token expira en 1 hora (tabla `password_reset_tokens`)
- Frontend: `/recuperar-password` (`RecuperarPassword.tsx`)

### Registro
- Gratuito (Origen): crea tenant + usuario inmediatamente → email de bienvenida
- De pago: guarda registro pendiente → checkout Bold → webhook confirma → crea cuenta
- `POST /api/auth/register`
- `POST /api/auth/completar-registro` (post-pago)

### Rate limiting
- Login: 15 req / 15 min por IP
- IA: 30 req / 10 min por IP

---

## 4. Módulos del ERP web (apps/web)

### 4.1 Dashboard (`Dashboard.tsx`)
- Tarjeta ventas del mes (total + cantidad facturas)
- Tarjeta gastos del mes (solo planes con feature `gastos`)
- Tarjeta cartera pendiente (total sin pagar)
- Alerta "Productos sin stock" (solo planes con feature `inventario`)
- Alerta de vencimiento de plan (cuando quedan ≤7 días)
- Banner rojo cuando `DIAN_PROVEEDOR=stub` (modo sin DIAN real)
- Gráfico de ventas por mes (últimos 6 meses) con recharts
- Top 5 clientes del mes

### 4.2 Facturación electrónica

#### Facturas (`Facturas.tsx`, `FacturaNueva.tsx`, `FacturaDetalle.tsx`)
- Lista con filtros: búsqueda por número/cliente/NIT (server-side con debounce), estado, rango de fechas
- Columna DIAN: badge "emitida ✓ / pendiente / error"
- Crear factura con: cliente, ítems (producto o texto libre), retenciones, descuentos, IVA por ítem, observaciones
- **IA Dictado** (`DictadoIA.tsx`): botón "IA" en nueva factura → modal con campo de texto libre o micrófono (Web Speech API) → Claude Haiku parsea y pre-llena ítems → usuario revisa antes de confirmar
- Ver detalle: datos completos, PDF, botón reenviar a DIAN, botón enviar por email al cliente, marcar como pagada
- Botón "Excel" → `GET /api/exportar/facturas?desde&hasta`
- Retenciones: retefuente, reteiva, reteica por ítem o a nivel de factura
- Tutorial guiado (4 pasos) con overlay flotante
- HelpTooltip en retenciones

#### Resoluciones DIAN (`ResolucionesDian.tsx`)
- CRUD completo de resoluciones: número, prefijo, rango desde/hasta, fechas vigencia, clave técnica
- HelpTooltip en campo "consecutivo desde"

#### Notas crédito (`NotasCredito.tsx`, `NotaCreditoDetalle.tsx`)
- Lista con badge DIAN, filtros
- Crear: tipo (anulación/devolución/descuento/ajuste), factura origen, motivo, ítems propios
- Reenviar a DIAN (endpoint `POST /api/notas-credito/:id/reenviar-dian`)
- Botón "Excel" → `GET /api/exportar/notas-credito?desde&hasta`

#### Notas débito (`NotasDebito.tsx`, `NotaDebitoDetalle.tsx`)
- Lista con badge DIAN
- Crear: tipo (`interes`/`gastos`/`ajuste` — sin plural en "interes"), factura origen, motivo, ítems propios
- Reenviar a DIAN (endpoint `POST /api/notas-debito/:id/reenviar-dian`)
- Botón "Excel" → `GET /api/exportar/notas-debito?desde&hasta`

#### Cotizaciones (`Cotizaciones.tsx`)
- Lista con filtros por estado y búsqueda
- Crear propuesta comercial con ítems
- Cambio de estado manual: borrador → enviada → aceptada / rechazada
- Convertir a factura (feature `cotizacion_a_factura`, plan Raíz+)
- Descarga PDF
- Botón "Excel" → `GET /api/exportar/cotizaciones?desde&hasta`

#### Remisiones (`Remisiones.tsx`)
- CRUD de remisiones (notas de entrega)
- Estados: borrador, enviada, entregada, anulada
- Botón "Excel" → `GET /api/exportar/remisiones`

### 4.3 Clientes

#### Lista y detalle (`Clientes.tsx`, `ClienteDetalle.tsx`)
- CRUD completo: nombre, tipo persona, tipo documento, NIT/CC, correo, teléfono, dirección, municipio, departamento, régimen IVA
- Detalle: historial de facturas, cotizaciones, cartera del cliente
- Botón "Ir a cartera" → filtro en Cartera
- Botón "Excel" → `GET /api/exportar/clientes`

### 4.4 Inventario (solo planes con feature `inventario`)

#### Productos (`Productos.tsx`)
- CRUD: código, nombre, descripción, tipo (producto/servicio), precio base, precio venta, IVA%, unidad, stock mínimo
- Búsqueda client-side por código/nombre
- Botón "Excel" → `GET /api/exportar/productos`

#### Inventario / Stock (`Inventario.tsx`)
- Tab "Stock actual": búsqueda por código/nombre
- Tab "Movimientos": historial de entradas/salidas/ajustes
- Ajustes manuales de inventario
- Tutorial guiado (3 pasos)

#### Bodegas (`Bodegas.tsx`)
- CRUD de bodegas (plan limita max_bodegas)
- Movimientos por bodega

#### Kardex (`Kardex.tsx`)
- Kardex por producto: saldo acumulado, costo unitario por movimiento
- HelpTooltip en título
- Exportar Excel → `GET /api/exportar/kardex/:productoId`

#### Ensamble / BOM (`Ensamble.tsx`)
- Bill of Materials: producto terminado + componentes + cantidades
- Registro de ensamble: reduce stock componentes, aumenta stock producto terminado
- Feature `ensamble` requerida — disponible desde plan **Raíz** (no en Semilla)

#### Recibir mercancía con IA (`RecibirMercanciaIA.tsx`)
- Sube foto de factura/remisión de compra
- Claude Haiku analiza la imagen y extrae ítems, cantidades y precios
- Pre-llena movimientos de inventario para revisión

### 4.5 Gastos y proveedores

#### Gastos (`Gastos.tsx`)
- Registro de gastos con categoría, proveedor, monto, IVA, estado (borrador/aprobado)
- Categorías: nómina, arriendo, servicios públicos, proveedores, impuestos, marketing, transporte, tecnología, seguros, otros
- Programación de fecha de pago (feature `programacion_pagos`)
- Botón "Excel" → `GET /api/exportar/gastos?desde&hasta`

#### Proveedores (`Proveedores.tsx`, `ProveedorDetalle.tsx`)
- CRUD extendido: tipo documento, dirección, ciudad, persona contacto, términos de pago, observaciones
- Detalle: historial de compras (gastos), CxP (cuentas por pagar)
- Botón "Excel" → `GET /api/exportar/proveedores`

#### Recurrentes (`Recurrentes.tsx`)
- Facturas recurrentes programadas (mensual, trimestral, anual)
- Cron job ejecuta `iniciarCronRecurrentes()` — genera facturas automáticamente

### 4.6 Cartera (`Cartera.tsx`, `AlertasCobro.tsx`)
- Aging de cartera: facturas vencidas agrupadas en buckets (al día, 1–30, 31–60, 61–90, +90 días)
- Resumen top 10 deudores
- Estado de cuenta por cliente (`GET /api/cartera/estado-cuenta/:clienteId`)
- **Alertas de cobro automáticas**: cron job `alertas-cobro.ts` envía email a clientes con facturas vencidas los **lunes, miércoles y viernes a las 08:00**

### 4.7 Contabilidad

#### Plan de cuentas (`PlanCuentas.tsx`)
- Árbol de cuentas contables PUC Colombia
- CRUD: código, nombre, tipo (activo/pasivo/patrimonio/ingreso/gasto), acepta movimientos
- Niveles 1–5

#### Asientos contables (`Contabilidad.tsx`)
- Diario y mayor contable
- Asientos automáticos al emitir facturas, notas crédito/débito, ventas POS, gastos
- Vista de auxiliares por cuenta (`Auxiliares.tsx`)
- Balance de prueba (`BalancePrueba.tsx`)

#### Períodos contables (`PeriodosContables.tsx`)
- Apertura y cierre de períodos
- Bloquea asientos fuera del período abierto

#### Centros de costos (`CentrosCostos.tsx`)
- CRUD de centros de costos
- Asignación a asientos contables
- Feature `centros_costos` requerida (plan Cosecha)
- HelpTooltip en título

#### Reporte de IVA (`ReporteIVA.tsx`)
- Filtros por rango de fechas
- 3 cards: IVA generado (ventas), IVA descontable (compras), saldo neto
- Tabla por período contable

### 4.8 Reportes

#### Ventas del mes (`reportes/ventas-mes`)
- Total ventas, cantidad facturas, subtotal, IVA
- Top 10 clientes del mes
- Detalle de facturas del período

#### Comparativo (`reportes/comparativo`)
- Mes actual vs mes anterior
- Año actual vs año anterior
- Feature `reportes_comparativos` requerida (plan Brote+)

#### Reporte IVA
- Ver sección 4.7

#### Dashboard Fundador (`FundadorAdmin.tsx`)
- Solo para emails en `FUNDADOR_EMAILS`
- Lista de todos los tenants, planes, ingresos
- Métricas globales del negocio

### 4.9 Configuración

#### Empresa (`ConfiguracionEmpresa.tsx`)
- Datos empresa: nombre, NIT, dirección, ciudad, teléfono, correo, régimen, actividad económica
- Logo (subida, sin SVG)
- Pie de página de facturas

#### Usuarios (`Usuarios.tsx`)
- CRUD de usuarios del tenant
- Roles: admin, cajero, contador
- Límite de usuarios según plan

#### Mi Plan (`MiPlan.tsx`)
- Estado de suscripción actual
- Fecha de vencimiento
- Botón para upgrade

#### Upgrade de plan (`UpgradePlan.tsx`)
- Tabla comparativa de planes
- Checkout Bold

#### Módulos adicionales (`ModulosAdicionales.tsx`)
- Add-ons disponibles según plan base

### 4.10 Panel de Contador (`ContadorDashboard.tsx`)
- Accesible solo para usuarios con `role: "contador"` en el hub (NIT `0000000001`)
- Lista de empresas asignadas
- Historial de comisiones generadas (15%)
- Al hacer login, si NIT === "0000000001" → redirige a `/contador`

### 4.11 Otros

#### Audit Log (`AuditLog.tsx`)
- Historial de acciones: quién hizo qué y cuándo
- Filtros por tipo de acción, entidad, usuario

#### Soporte / Chat IA (`soporte`)
- Chat con Claude Haiku 4.5
- Contexto: nombre empresa, plan, páginas del ERP
- ~$0.0014 USD por conversación

#### Notificaciones inteligentes (en tiempo real, sin tabla BD)
Generadas en `/api/notificaciones` al hacer GET:
1. **Cartera vencida**: facturas aceptadas sin pagar y vencidas (urgencia alta)
2. **Facturas por vencer**: próximas 7 días (urgencia media)
3. **Stock sin existencia**: productos con `stock_actual <= 0` (urgencia alta si tiene inventario)
4. **Turno abierto POS**: turno sin cerrar (urgencia baja)
5. **Error DIAN**: facturas con `estado_dian IN ('error', 'pendiente')` (urgencia alta)

#### Tutoriales guiados
- Schema `tutorial_progress` (user_id, tenant_id, slug, completado_at, saltado_at)
- API: `GET/POST/DELETE /api/tutoriales/:slug`
- `TutorialOverlay.tsx` — overlay flotante bottom-right con highlight por CSS selector
- Integrado en: **Facturas** (4 pasos), **Inventario** (3 pasos), **Venta POS** (3 pasos)

#### HelpTooltips
- `HelpTooltip.tsx` — hover + tap
- Aplicado en: Retenciones, Centros de costos, Kardex, Resoluciones DIAN, Notas crédito, Nota crédito tipo, Cierre turno POS

#### Onboarding (`Onboarding.tsx`)
- Flujo guiado post-registro para completar configuración inicial

---

## 5. Módulo POS (apps/pos)

App separada de cajero. Acceso vía URL del POS (diferente a la URL del ERP).

### Páginas POS

| Página | Descripción |
|---|---|
| `Login.tsx` | Login cajero con PIN o contraseña (mínimo 6 caracteres) |
| `SeleccionCaja.tsx` | Selecciona caja antes de iniciar turno |
| `Venta.tsx` | Pantalla principal de venta: catálogo, carrito, métodos de pago, impresión ticket. Tutorial guiado (3 pasos) |
| `HistorialVentas.tsx` | Ventas del turno actual y anteriores, botón anular |
| `Fiados.tsx` | Ventas a crédito ("fiados"): lista, abonos, saldo |
| `GastosCaja.tsx` | Registro de gastos de la caja durante el turno |
| `CierreTurno.tsx` | Cuadre de caja: efectivo contado vs esperado, diferencia, cierre con firma. HelpTooltip. Genera asiento contable |
| `Reportes.tsx` | Reportes del POS: ventas por método de pago, top productos |
| `Citas.tsx` | Módulo de citas (para salones de belleza, etc.) |

### Funcionalidades POS
- Descuentos por ítem o globales
- Múltiples métodos de pago: efectivo, tarjeta, transferencia, fiado
- Devoluciones / anulaciones de venta
- Impresión de ticket (80mm térmica) o PDF
- Multi-caja (plan Punto Plus)
- Asientos contables automáticos en ventas, fiados, abonos, gastos, devoluciones, cierre
- Gramera: soporte para balanza por peso (configuración en caja)

### Administración POS (en ERP)
- `AdminCajas.tsx` — Gestiona cajas, cajeros, config de gramera
- `CajerosPOS.tsx` — CRUD de cajeros con PIN/contraseña
- Botón "Ir al POS" en `AdminCajas.tsx`

---

## 6. Landing pages (apps/landing)

Todas en HTML/CSS/JS vanilla. Dominio: `doraviasoft.com`.

| Archivo | URL | Contenido |
|---|---|---|
| `index.html` | `/` | Home principal: hero, features, planes ERP+Origen+POS, CTA registro |
| `origen.html` | `/origen` | Landing específica Origen (facturación electrónica), precios por volumen |
| `erp.html` | `/erp` | Landing ERP completo, tabla comparativa de planes (5 categorías, 15+ filas) |
| `punto.html` | `/punto` | Landing POS Punto y Punto Plus |
| `contadores.html` | `/contadores` | Landing para contadores, beneficios, CTA registro contador |
| `privacidad.html` | `/privacidad` | Política de privacidad (Ley 1581/2012) |
| `terminos.html` | `/terminos` | Términos y condiciones |

### Diseño visual (v4.0)
- **Paleta**: Índigo profundo `#1E1B4B`, Índigo medio `#4F46C0`, Fondo `#F5F4FA`, Coral `#E0664E`, Blanco
- **Tipografía**: Inter
- **Logo**: "D" de bloque en índigo
- Footer 4 columnas: Brand | Productos | Legal | Contacto

---

## 7. API — Endpoints completos

Todos bajo `https://api.doraviasoft.com`. Requieren `Authorization: Bearer <token>` excepto los marcados como públicos.

### Auth (`/api/auth`)
| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | `/register` | Público | Registrar empresa y usuario |
| POST | `/login` | Público | Login |
| POST | `/select-empresa` | Público (con selectionToken) | Elegir empresa multi-tenant |
| POST | `/refresh` | Público (refreshToken cookie) | Renovar access token |
| POST | `/logout` | Autenticado | Invalida refresh token |
| POST | `/cambiar-password` | Autenticado | Cambiar contraseña |
| POST | `/cambiar-empresa` | Autenticado | Switch de empresa |
| GET | `/mis-empresas` | Autenticado | Lista empresas del usuario |
| POST | `/solicitar-reset` | Público | Solicitar reset de contraseña |
| POST | `/resetear-password` | Público | Aplicar nuevo password con token |
| POST | `/completar-registro` | Público (token Bold) | Completar registro post-pago |

### Facturas (`/api/facturas`)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/` | Lista con filtros: `?q=&estado=&desde=&hasta=&page=&limit=` |
| GET | `/:id` | Detalle con ítems y retenciones |
| POST | `/` | Crear factura |
| POST | `/:id/reenviar` | Reintentar envío (solo borrador) |
| POST | `/:id/reenviar-dian` | Reintentar envío a Plemsi (estado_dian error/pendiente/stub) |
| POST | `/:id/enviar-email` | Enviar factura PDF al cliente |
| PATCH | `/:id/marcar-pagada` | Marcar como pagada |
| POST | `/sync-cude-plemsi` | Consulta Plemsi y sincroniza CUDEs reales en BD |

### Notas crédito (`/api/notas-credito`)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/` | Lista con estado_dian |
| GET | `/:id` | Detalle |
| POST | `/factura/:facturaId` | Crear NC (vinculada a una factura) |
| POST | `/:id/reenviar-dian` | Reintentar envío a Plemsi |

> ⚠️ La ruta de creación es `POST /api/notas-credito/factura/:facturaId`, NO `POST /api/notas-credito/`.

### Notas débito (`/api/notas-debito`)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/` | Lista |
| GET | `/:id` | Detalle |
| POST | `/factura/:facturaId` | Crear ND (vinculada a una factura) |
| POST | `/:id/reenviar-dian` | Reintentar envío a Plemsi |

> ⚠️ La ruta de creación es `POST /api/notas-debito/factura/:facturaId`. Tipos válidos de ND: `interes`, `gastos`, `ajuste` (sin plural en "interes").

> **`estado_dian` enum real:** `"pendiente"` | `"emitida"` | `"error"` | `"no_aplica"` (este último en modo stub).

### Clientes (`/api/clientes`)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/` | Lista paginada con búsqueda |
| GET | `/:id` | Detalle con historial |
| POST | `/` | Crear cliente |
| PATCH | `/:id` | Actualizar |
| DELETE | `/:id` | Desactivar |

### Productos (`/api/productos`)
- CRUD completo: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`

### Inventario (`/api/inventario`)
- `GET /stock` — stock actual por bodega
- `GET /movimientos` — historial
- `POST /entrada` — entrada de mercancía
- `POST /ajuste` — ajuste manual
- `POST /transferencia` — entre bodegas

### Cotizaciones (`/api/cotizaciones`)
- CRUD + `PATCH /:id` (cambio estado) + `POST /:id/convertir` (a factura)

### Gastos (`/api/gastos`)
- CRUD completo + filtros
- `GET /api/gastos/proveedores` — lista proveedores
- CRUD proveedores dentro de gastos.ts

### Cartera (`/api/cartera`)
- `GET /aging` — facturas vencidas por bucket
- `GET /estado-cuenta/:clienteId` — estado de cuenta completo
- `GET /resumen` — top deudores + totales

### Contabilidad (`/api/contabilidad`)
- `GET /plan-cuentas` — árbol PUC
- `GET /asientos` — diario/mayor filtrable
- `GET /balance-prueba` — balance de prueba (⚠️ no `/balance`)
- `GET /auxiliares/:cuentaId` — movimientos de cuenta
- `GET /periodos` — períodos contables
- `POST /periodos` — crear período
- `PATCH /periodos/:id/cerrar` — cerrar período (⚠️ no `PATCH /periodos/:id`)

### Reportes (`/api/reportes`)
- `GET /ventas-mes?anio&mes`
- `GET /comparativo?anio&mes` (nivel contable ≥ 3)
- `GET /gastos-mes?anio&mes`
- `GET /productos-sin-stock`
- `GET /iva?desde&hasta`

### Exportar (`/api/exportar`)
Todos devuelven `.xlsx` (librería xlsx):
- `GET /facturas?desde&hasta`
- `GET /clientes`
- `GET /retenciones?desde&hasta` (+ hoja resumen por tipo)
- `GET /inventario` (movimientos)
- `GET /productos`
- `GET /gastos?desde&hasta`
- `GET /cotizaciones?desde&hasta`
- `GET /notas-credito?desde&hasta`
- `GET /notas-debito?desde&hasta`
- `GET /proveedores`
- `GET /remisiones`
- `GET /kardex/:productoId`
- `GET /datos-empresa` (JSON, solo admin — portabilidad Ley 1581)

### POS (`/api/pos`)
- `GET/POST /cajas` — CRUD cajas
- `PATCH /cajas/:id` — actualizar caja
- `GET/POST /turnos` — gestión de turnos
- `PATCH /turnos/:id/cerrar` — cierre de caja
- `POST /ventas` — registrar venta
- `GET /ventas` — historial ventas del turno
- `POST /ventas/:id/anular` — anular venta
- `GET/POST /fiados` — ventas a crédito
- `POST /fiados/:id/abonar` — registrar abono
- `GET/POST /gastos-caja` — gastos durante turno
- `GET /reportes` — reportes del POS
- `GET/POST /citas` — citas (módulo salones)
- `GET /devoluciones` — historial devoluciones

### IA (`/api/ia`)
- `POST /parsear-descripcion` — texto libre → ítems de factura (Haiku 4.5)
- `POST /analizar-compra` — foto/PDF → ítems de inventario (Haiku 4.5 vision)
- `POST /soporte` — chat soporte (Haiku 4.5)

### Empresa (`/api/empresa`)
- `GET /` — datos del tenant
- `PATCH /` — actualizar datos + logo
- `GET /dian-modo` — retorna si está en modo stub/real

### Notificaciones (`/api/notificaciones`)
- `GET /` — 5 tipos de alertas en tiempo real (sin tabla BD)

### Otros endpoints
- `GET /health` — DB ping + tiempo respuesta + modo DIAN
- `GET/POST/DELETE /api/tutoriales/:slug` — progreso tutoriales
- `POST /api/soporte` — chat IA soporte
- `GET /api/mi-plan` — estado suscripción
- `POST /api/pagos/checkout` — crear sesión Bold
- `POST /api/bold/webhook` — webhook Bold (confirma pago y crea tenant)
- `GET /api/audit-log` — log de auditoría
- `GET /api/notificaciones` — alertas activas
- `GET /api/documentos/facturas/:id/pdf` — PDF factura
- `GET /api/documentos/cotizaciones/:id/pdf` — PDF cotización
- `POST /api/contadores/registro` — registro contador (público)
- `GET /api/contadores/confirm` — confirmación email contador
- `GET /api/fundador/tenants` — panel fundador (solo FUNDADOR_EMAILS)

---

## 8. Integración DIAN / Plemsi

### Arquitectura
- `apps/api/src/services/dian/` — provider pattern:
  - `types.ts` — interfaces `DianProvider`, `EmitirFacturaParams`, `DianResponse`
  - `cufe.ts` — cálculo SHA-384 del CUFE
  - `xml-ubl.ts` — generación XML UBL 2.1 completo
  - `providers/stub.ts` — modo desarrollo, genera CUFE falso
  - `providers/aliaddo.ts` — proveedor Aliaddo
  - `providers/matias.ts` — proveedor Matías
  - `providers/plemsi.ts` — proveedor Plemsi (**activo**)
  - `index.ts` — selector via `DIAN_PROVEEDOR` env var

### Estado actual (2026-07-06)
- Proveedor: **Plemsi** (`pruebas.plemsi.com`)
- NIT habilitación: `[REDACTADO]`
- TestSetId DIAN: `[REDACTADO]`
- **34 facturas** emitidas en Plemsi con CUDEs reales en BD
- **19 notas crédito** emitidas con CUDEs reales (NC-0001 está en Plemsi pero CUDE no en BD — "already emitted")
- **20 notas débito** emitidas con CUDEs reales
- **Pendiente**: Plemsi debe configurar el TestSetId `[REDACTADO]` para que DIAN cuente los documentos

### Resoluciones registradas en Plemsi staging
- `type_document_id: 1` — Facturas: resolución "18760000001"
- `type_document_id: 4` — Notas crédito: resolución "18760000001"
- `type_document_id: 5` — Notas débito: resolución "18760000001"

### Campo CUDE vs CUFE
- Plemsi retorna el código en el campo `data.cude` (no `data.cufe`)
- El código se guarda en la columna `facturas.cufe` de BD (nombre heredado)
- Las NC/ND también guardan en su columna `cude`

### Endpoints DIAN útiles (scripts/)
- `scripts/reenviar-facturas-error.mjs` — reenvía facturas con estado error/pendiente/stub
- `scripts/reenviar-nc-nd-dian.mjs` — reenvía NC y ND pendientes
- Ambos usan `DORAVIA_EMAIL` + `DORAVIA_PASSWORD` env vars

---

## 9. Sistema de contadores

### Hub
- Tenant especial NIT `0000000001` — los contadores "viven" aquí
- Al hacer login, si el tenant es el hub → redirige a `/contador` (panel contador)
- `GuardiaERP` en `/dashboard` redirige contadores del hub a su panel

### Registro de contadores
- `POST /api/contadores/registro` (público) — nombre, email, password, celular, firma contable
- Envía email de confirmación (Resend)
- `GET /api/contadores/confirm?token=...` — confirma email y activa cuenta
- CTA en `apps/landing/contadores.html` → `/registro-contador` en ERP

### Panel contador (`ContadorDashboard.tsx`)
- Mis empresas asignadas (tabla `user_accesos`)
- Comisiones: 15% de las suscripciones de empresas asignadas (tabla `comisiones_contador`)
- Botón "Acceder" → switch de empresa

---

## 10. Ambiente demo

Corriendo en Railway con datos de ejemplo para demos/ventas.

### Credenciales
- **Contraseña universal demo**: `[REDACTADO]`
- **Rose (fundadora)**: `rose@doravia.com` / `[REDACTADO]`

### 10 empresas demo (NITs 900100001–900100010)
| Empresa | Plan |
|---|---|
| Restaurante El Fogón Dorado | brote |
| Ferretería El Martillo | semilla + POS |
| Clínica Dental Sonrisa Perfecta | raiz |
| Farmacia Salud Total | semilla |
| Consultora Estrategia SAS | cosecha |
| Distribuidora Frutalia | semilla |
| Hotel Boutique Las Palmas | brote + POS |
| Taller Automotriz Ruedas Express | semilla |
| Estudio Jurídico Lex Colombia | raiz |
| Papelería y Manualidades CreArte | punto_plus |

- 6 meses de facturas históricas por empresa
- 30% de facturas con cartera vencida
- Asientos contables generados para todas las facturas

### 5 contadores demo
- `carlos.ramirez@contador.co`, `diana.torres@contador.co`, `julian.perez@contador.co`, `sandra.gomez@contador.co`, `miguel.vargas@contador.co`
- Cada uno maneja 2 empresas; comisiones 15% generadas

---

## 11. Pagos / Suscripciones

### Bold (activo)
- `POST /api/pagos/checkout` — crea sesión Bold con `amount`, `orderId`, `redirectUrl`
- `POST /api/bold/webhook` — recibe confirmación de pago:
  1. Verifica firma HMAC-SHA256 con `BOLD_INTEGRITY_SECRET`
  2. Busca `pending_registration` por `orderId`
  3. Crea tenant + usuario + activa plan
  4. Envía email de bienvenida
- Tabla `bold_payments` — registro histórico de transacciones

### Flujo de suscripción
1. Landing → Elegir plan → `/register?plan=<slug>`
2. ERP: formulario de registro (datos empresa + usuario)
3. Gratis: cuenta creada inmediatamente
4. De pago: `POST /api/auth/register` → retorna `payment_required: true` + datos Bold
5. Frontend redirige a Bold checkout
6. Usuario paga
7. Bold webhook → `POST /api/bold/webhook` → crea cuenta
8. Usuario regresa a `/resultado-pago` → auto-login

---

## 12. Email (Resend)

Dominio `doraviasoft.com` verificado. Función `send()` en `email.service.ts`.

### Emails enviados automáticamente
1. **Bienvenida** — al registrarse (gratis o post-pago)
2. **Factura aceptada** — al cliente, con PDF adjunto
3. **Alerta de cobro** — clientes con facturas vencidas (L/M/V 8:00 AM)
4. **Reset de contraseña** — link de recuperación (expira 1 hora)
5. **Confirmación contador** — al registrar nuevo contador, link de confirmación

---

## 13. Cron jobs (Background Jobs)

| Job | Archivo | Schedule | Función |
|---|---|---|---|
| Facturas recurrentes | `jobs/recurrentes.ts` | Diario a las 06:00 | Genera facturas programadas automáticamente |
| Alertas de cobro | `jobs/alertas-cobro.ts` | L/M/V a las 08:00 | Email a clientes con facturas vencidas |

---

## 14. Seguridad y monitoreo

- **Helmet** — headers HTTP seguros
- **CORS** — whitelist de origenes (`ALLOWED_ORIGINS`)
- **Rate limiting**: login (15 req/15 min), IA (30 req/10 min)
- **JWT** — access token 15 min, refresh token 30 días (HttpOnly)
- **bcrypt** — hash de contraseñas
- **Audit log** — todas las acciones críticas registradas
- **Structured logging** — JSON con ts, method, path, status, ms, tenant
- **DB indexes**: facturas(tenant+fecha, tenant+estado, tenant+pagada), items_factura(factura_id), refresh_tokens(user, tenant), movimientos_inventario(producto+tenant), notas_debito(tenant, factura), notas_credito(tenant, consecutivo), notas_debito(tenant, consecutivo)
- **Consecutivos seguros**: `pg_advisory_xact_lock` en notas crédito y débito; `SELECT FOR UPDATE` en facturas

---

## 15. Esquema de base de datos (tablas principales)

| Tabla | Descripción |
|---|---|
| `tenants` | Empresas registradas (1 por NIT) |
| `users` | Usuarios del sistema |
| `user_accesos` | Relación usuario-empresa (multi-tenant) |
| `plans` | Definición de planes con features y límites |
| `refresh_tokens` | Tokens de refresh activos |
| `password_reset_tokens` | Tokens de recuperación de contraseña |
| `tutorial_progress` | Progreso de tutoriales por usuario+tenant |
| `clientes` | Clientes de cada tenant |
| `facturas` | Facturas electrónicas |
| `items_factura` | Ítems de cada factura |
| `retenciones_factura` | Retenciones aplicadas por factura |
| `resoluciones_dian` | Resoluciones DIAN del tenant |
| `notas_credito` | Notas crédito |
| `items_nota_credito` | Ítems de notas crédito |
| `notas_debito` | Notas débito |
| `productos` | Catálogo de productos/servicios |
| `bodegas` | Bodegas del tenant |
| `movimientos_inventario` | Entradas, salidas, ajustes de inventario |
| `cotizaciones` | Propuestas comerciales |
| `items_cotizacion` | Ítems de cotizaciones |
| `remisiones` | Notas de entrega |
| `gastos` | Gastos registrados |
| `proveedores` | Proveedores del tenant |
| `cuentas_contables` | Plan de cuentas PUC |
| `asientos_contables` | Asientos del diario |
| `lineas_asiento` | Líneas débito/crédito por asiento |
| `periodos_contables` | Períodos de contabilidad |
| `centros_costos` | Centros de costos |
| `cajas_pos` | Cajas del POS |
| `turnos_pos` | Turnos de cajero |
| `ventas_pos` | Ventas del POS |
| `items_venta_pos` | Ítems por venta |
| `fiados` | Ventas a crédito POS |
| `abonos_fiado` | Abonos a fiados |
| `gastos_caja_pos` | Gastos durante turno |
| `devoluciones_pos` | Anulaciones de venta POS |
| `citas_pos` | Citas (salones) |
| `ensamble` | Órdenes de ensamble BOM |
| `componentes_ensamble` | Componentes por orden |
| `comisiones_contador` | Comisiones generadas por contador |
| `contador_registrations` | Registros pendientes de confirmación |
| `audit_log` | Log de auditoría |
| `bold_payments` | Pagos procesados por Bold |
| `pending_registrations` | Registros pendientes de pago |
| `leads_doravia` | Leads del sitio de marketing |

---

## 16. Pendientes / Limitaciones actuales

1. **DIAN habilitación**: Plemsi debe configurar el TestSetId `[REDACTADO]` para el NIT de Doravia. Hasta que lo hagan, la DIAN no cuenta los documentos del período de habilitación. Los documentos YA están en Plemsi.

2. **NC-0001**: Esta nota crédito existe en Plemsi pero su CUDE no está guardado en BD (fue enviada antes de que se corrigiera el bug de extracción). No bloquea habilitación.

3. **Wompi**: Se intentó integrar Wompi como pasarela de pagos pero fue rechazado. Se integró Bold en su lugar y está funcionando.

4. **Modo producción DIAN**: Cuando se tenga RUT real y se complete habilitación, cambiar `DIAN_AMBIENTE=1` en Railway.

5. **Documento equivalente POS ante DIAN**: Plemsi soporta la emisión de documentos equivalentes para puntos de venta (POS), que es el reemplazo fiscal de los tiquetes de caja registradora. Esta funcionalidad es altamente relevante para el mercado de minimercados y tiendas de barrio — un argumento de venta diferenciador frente a Siigo, que no lo tiene integrado en sus planes base. Pendiente de integrar en el módulo POS de Doravia.

---

## 17. Registro de correcciones técnicas importantes (historial)

Durante la sesión de habilitación DIAN (2026-07-06) se corrigieron estos bugs:

1. **`data.cude` vs `data.cufe`**: Plemsi retorna el código en `data.cude`; el código leía `data.cufe`. Corregido en `emitirFactura` y `emitirNotaCredito`.

2. **NC campo `buyer` → `customer`**: Plemsi API para notas crédito espera `customer`, no `buyer`. Corregido en `emitirNotaCredito`.

3. **NC resolución incorrecta**: El código pasaba el número de la nota crédito ("NC-0011") como número de resolución. Corregido para buscar la resolución de la factura origen en BD.

4. **ND resolución incorrecta**: Mismo bug. Corregido en `notas-debito.ts`.

5. **ND resolución no registrada en Plemsi**: La resolución "18760000001" no estaba registrada para `type_document_id: 5` (ND) ni `type_document_id: 4` (NC). Se registraron vía API Plemsi.

6. **34 facturas con CUFE stub**: Estaban en Plemsi desde antes pero los CUDEs nunca se guardaron. Se creó endpoint `POST /api/facturas/sync-cude-plemsi` que consulta la API de Plemsi y actualiza BD. Resultado: 34/34 actualizadas.

---

*Fin del reporte. Para cualquier duda sobre implementación de un módulo específico, se puede pedir el código fuente de la ruta o página correspondiente.*
