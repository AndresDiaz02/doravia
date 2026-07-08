import postgres from "postgres";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.ts";

const sql = postgres(process.env.DATABASE_URL!);

const migrations = [
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS en_prueba boolean NOT NULL DEFAULT true`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS prueba_ends_at timestamptz`,
  // permisos_contables en users y user_accesos (se omitió en el push inicial de Railway)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS permisos_contables boolean NOT NULL DEFAULT false`,
  `ALTER TABLE user_accesos ADD COLUMN IF NOT EXISTS permisos_contables boolean NOT NULL DEFAULT false`,
  // dark_mode por usuario (preferencia guardada en servidor, no solo en localStorage)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS dark_mode boolean NOT NULL DEFAULT false`,
  `ALTER TABLE contador_registrations ADD COLUMN IF NOT EXISTS password_hash varchar(200) NOT NULL DEFAULT ''`,
  // tabla de pre-registro de contadores (tablas nuevas se crean aquí, no via db:push)
  `CREATE TABLE IF NOT EXISTS contador_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre varchar(200) NOT NULL,
    email varchar(200) UNIQUE NOT NULL,
    celular varchar(20),
    firma_contable varchar(200),
    password_hash varchar(200) NOT NULL DEFAULT '',
    token_confirmacion varchar(100) UNIQUE NOT NULL,
    confirmado boolean NOT NULL DEFAULT false,
    user_id uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    confirmado_at timestamptz
  )`,
  // tabla de comisiones para contadores
  `CREATE TABLE IF NOT EXISTS comisiones_contador (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contador_user_id uuid NOT NULL REFERENCES users(id),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    tipo varchar(20) NOT NULL,
    ano_renovacion smallint NOT NULL DEFAULT 1,
    porcentaje numeric(5,2) NOT NULL,
    base_cop integer NOT NULL,
    valor_cop integer NOT NULL,
    pagada boolean NOT NULL DEFAULT false,
    fecha_pago timestamptz,
    notas text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // clave técnica DIAN en resoluciones (agregada al schema pero nunca aplicada via push)
  `ALTER TABLE resoluciones_dian ADD COLUMN IF NOT EXISTS clave_tecnica text`,
  // tabla de recuperación de contraseña
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // índices de rendimiento — tablas sin index en el schema inicial
  `CREATE INDEX IF NOT EXISTS clientes_tenant_idx ON clientes(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS productos_tenant_idx ON productos(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS gastos_tenant_fecha_idx ON gastos(tenant_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS asientos_tenant_fecha_idx ON asientos_contables(tenant_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS lineas_asiento_asiento_idx ON lineas_asiento(asiento_id)`,
  `CREATE INDEX IF NOT EXISTS cotizaciones_tenant_idx ON cotizaciones(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS notas_credito_tenant_idx ON notas_credito(tenant_id)`,
  // config por caja (grameras, impresoras, periféricos)
  `ALTER TABLE cajas_pos ADD COLUMN IF NOT EXISTS config jsonb`,
  // gastos de caja chica durante el turno POS
  `CREATE TABLE IF NOT EXISTS gastos_caja_pos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    turno_id uuid NOT NULL REFERENCES turnos_pos(id),
    caja_id uuid NOT NULL REFERENCES cajas_pos(id),
    usuario_id uuid NOT NULL,
    monto numeric(14,2) NOT NULL,
    concepto varchar(30) NOT NULL DEFAULT 'otros',
    descripcion varchar(200),
    asiento_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // devoluciones en el POS (reverso de venta)
  `CREATE TABLE IF NOT EXISTS devoluciones_pos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    venta_id uuid NOT NULL REFERENCES ventas_pos(id),
    turno_id uuid NOT NULL REFERENCES turnos_pos(id),
    usuario_id uuid NOT NULL,
    monto_devuelto numeric(14,2) NOT NULL,
    metodo_devolucion varchar(20) NOT NULL DEFAULT 'efectivo',
    motivo varchar(200),
    asiento_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // facturacion_electronica: flag para habilitar/deshabilitar DIAN por tenant
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS facturacion_electronica boolean NOT NULL DEFAULT false`,
  // usuario_pos: nombre corto para cajeros POS (sin email)
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS usuario_pos varchar(50)`,
  // tabla de remisiones (documentos de entrega sin valor fiscal)
  `CREATE TABLE IF NOT EXISTS remisiones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    numero varchar(30) NOT NULL,
    consecutivo integer NOT NULL,
    cliente_id uuid REFERENCES clientes(id),
    nombre_cliente varchar(200),
    direccion_entrega varchar(300),
    fecha varchar(10) NOT NULL,
    fecha_entrega varchar(10),
    total numeric(14,2) NOT NULL DEFAULT 0,
    estado varchar(20) NOT NULL DEFAULT 'borrador',
    observaciones text,
    creado_por uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // ítems de cada remisión
  `CREATE TABLE IF NOT EXISTS items_remision (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    remision_id uuid NOT NULL REFERENCES remisiones(id) ON DELETE CASCADE,
    producto_id uuid REFERENCES productos(id),
    descripcion varchar(300) NOT NULL,
    cantidad numeric(10,4) NOT NULL,
    precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
    total numeric(14,2) NOT NULL
  )`,
  // tenant hub para contadores (NIT especial 0000000001)
  `INSERT INTO tenants (nombre, nit, plan_id, plan_starts_at, plan_ends_at, activo, onboarding_completado)
   SELECT 'Hub Contadores Doravia', '0000000001',
          (SELECT id FROM plans WHERE slug = 'origen' LIMIT 1),
          now(), now() + interval '100 years', true, true
   WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE nit = '0000000001')`,
  // TAREA 5 — índice único compuesto (tenant_id, usuario_pos) WHERE usuario_pos IS NOT NULL
  `CREATE UNIQUE INDEX IF NOT EXISTS users_usuario_pos_tenant_unique ON users(tenant_id, usuario_pos) WHERE usuario_pos IS NOT NULL`,
  // TAREA 6 — FK self-referencial en cuentas_contables (padre_id → id)
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'cuentas_padre_fk') THEN ALTER TABLE cuentas_contables ADD CONSTRAINT cuentas_padre_fk FOREIGN KEY (padre_id) REFERENCES cuentas_contables(id); END IF; END $$`,
  // TAREA 7 — FK explícita asiento_id en gastos_caja_pos
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'gastos_caja_asiento_fk') THEN ALTER TABLE gastos_caja_pos ADD CONSTRAINT gastos_caja_asiento_fk FOREIGN KEY (asiento_id) REFERENCES asientos_contables(id); END IF; END $$`,
  // TAREA 9 — normalizar fechas en remisiones (varchar → date)
  `ALTER TABLE remisiones ALTER COLUMN fecha TYPE date USING fecha::date`,
  `ALTER TABLE remisiones ALTER COLUMN fecha_entrega TYPE date USING fecha_entrega::date`,
  // TAREA 10 — bodega_id en turnos_pos para soporte multi-bodega en POS
  `ALTER TABLE turnos_pos ADD COLUMN IF NOT EXISTS bodega_id uuid REFERENCES bodegas(id)`,
  // BOLD — tabla de pagos Bold para suscripciones
  `CREATE TABLE IF NOT EXISTS bold_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    reference_id varchar(100) NOT NULL UNIQUE,
    transaction_id varchar(100),
    plan_id varchar(50),
    monto numeric(14,2) NOT NULL,
    moneda varchar(10) NOT NULL DEFAULT 'COP',
    metodo_pago varchar(30),
    estado varchar(30) NOT NULL DEFAULT 'PENDING',
    descripcion varchar(200),
    callback_url varchar(500),
    bold_response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Índices únicos como segunda capa de protección contra consecutivos duplicados
  `CREATE UNIQUE INDEX IF NOT EXISTS ventas_pos_tenant_consecutivo_unique ON ventas_pos(tenant_id, consecutivo)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS remisiones_tenant_consecutivo_unique ON remisiones(tenant_id, consecutivo)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_tenant_consecutivo_unique ON cotizaciones(tenant_id, consecutivo)`,
  // condicion_pago y forma_pago en facturas (agregadas al schema pero no aplicadas)
  `ALTER TABLE facturas ADD COLUMN IF NOT EXISTS condicion_pago varchar(30)`,
  `ALTER TABLE facturas ADD COLUMN IF NOT EXISTS forma_pago varchar(30)`,
  // bold_payments.tenant_id nullable para pagos pre-registro (clientes nuevos sin cuenta)
  `ALTER TABLE bold_payments ALTER COLUMN tenant_id DROP NOT NULL`,
  // unidad_medida en items_factura (en schema pero nunca aplicada a la BD)
  `ALTER TABLE items_factura ADD COLUMN IF NOT EXISTS unidad_medida varchar(10) NOT NULL DEFAULT 'UN'`,
  // PLEMSI — integración facturación electrónica DIAN vía Plemsi
  `ALTER TABLE facturas ADD COLUMN IF NOT EXISTS plemsi_id varchar(100)`,
  `ALTER TABLE facturas ADD COLUMN IF NOT EXISTS estado_dian varchar(30) NOT NULL DEFAULT 'no_aplica'`,
  `ALTER TABLE facturas ADD COLUMN IF NOT EXISTS error_dian text`,
  `ALTER TABLE notas_credito ADD COLUMN IF NOT EXISTS cude varchar(256)`,
  `ALTER TABLE notas_credito ADD COLUMN IF NOT EXISTS plemsi_id varchar(100)`,
  `ALTER TABLE notas_credito ADD COLUMN IF NOT EXISTS estado_dian varchar(30) NOT NULL DEFAULT 'no_aplica'`,
  `ALTER TABLE resoluciones_dian ADD COLUMN IF NOT EXISTS plemsi_id varchar(100)`,
  // Notas débito (documentos que aumentan el valor de una factura para la DIAN)
  `CREATE TABLE IF NOT EXISTS notas_debito (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    factura_id uuid NOT NULL REFERENCES facturas(id),
    cliente_id uuid NOT NULL REFERENCES clientes(id),
    numero varchar(30) NOT NULL,
    consecutivo integer NOT NULL,
    tipo varchar(20) NOT NULL,
    motivo text NOT NULL,
    estado varchar(20) NOT NULL DEFAULT 'aceptada',
    subtotal numeric(14,2) NOT NULL,
    iva_total numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    cude varchar(256),
    plemsi_id varchar(100),
    estado_dian varchar(30) DEFAULT 'no_aplica',
    error_dian text,
    asiento_id uuid,
    fecha_emision timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS items_nota_debito (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_debito_id uuid NOT NULL REFERENCES notas_debito(id),
    descripcion varchar(500) NOT NULL,
    cantidad numeric(10,4) NOT NULL,
    precio_unitario numeric(14,4) NOT NULL,
    iva_pct numeric(5,2) NOT NULL DEFAULT 19,
    subtotal numeric(14,2) NOT NULL,
    iva_valor numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL
  )`,
  // Proveedores — campos adicionales para módulo completo
  `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tipo_documento varchar(20) NOT NULL DEFAULT 'NIT'`,
  `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS direccion varchar(300)`,
  `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ciudad varchar(100)`,
  `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS persona_contacto varchar(200)`,
  `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS terminos_pago integer NOT NULL DEFAULT 0`,
  `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS observaciones text`,
  // CREATE TABLE proveedores si no existe (tenants sin la tabla aún)
  `CREATE TABLE IF NOT EXISTS proveedores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    nombre varchar(200) NOT NULL,
    tipo_documento varchar(20) NOT NULL DEFAULT 'NIT',
    nit varchar(30),
    correo varchar(200),
    telefono varchar(30),
    direccion varchar(300),
    ciudad varchar(100),
    persona_contacto varchar(200),
    terminos_pago integer NOT NULL DEFAULT 0,
    observaciones text,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Índices de rendimiento — segunda ronda (tablas con mayor carga de lectura)
  `CREATE INDEX IF NOT EXISTS facturas_tenant_fecha_idx ON facturas(tenant_id, fecha_emision)`,
  `CREATE INDEX IF NOT EXISTS facturas_tenant_estado_idx ON facturas(tenant_id, estado)`,
  `CREATE INDEX IF NOT EXISTS facturas_tenant_pagada_idx ON facturas(tenant_id, pagada_at) WHERE pagada_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS items_factura_factura_idx ON items_factura(factura_id)`,
  `CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id)`,
  `CREATE INDEX IF NOT EXISTS notas_debito_tenant_idx ON notas_debito(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS notas_debito_factura_idx ON notas_debito(factura_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS notas_debito_tenant_consecutivo_unique ON notas_debito(tenant_id, consecutivo)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS notas_credito_tenant_consecutivo_unique ON notas_credito(tenant_id, consecutivo)`,
  `CREATE INDEX IF NOT EXISTS movimientos_inventario_producto_idx ON movimientos_inventario(producto_id)`,
  `CREATE INDEX IF NOT EXISTS movimientos_inventario_tenant_idx ON movimientos_inventario(tenant_id)`,
  // ── Auditoría de funcionalidades — feature/audit-implementations ─────────────
  // EAN / código de barras en productos
  `ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barras varchar(50)`,
  // Impoconsumo 8% — productos
  `ALTER TABLE productos ADD COLUMN IF NOT EXISTS impoconsumo_pct numeric(5,2) NOT NULL DEFAULT 0`,
  // Impoconsumo 8% — ítems de factura
  `ALTER TABLE items_factura ADD COLUMN IF NOT EXISTS impoconsumo_pct numeric(5,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE items_factura ADD COLUMN IF NOT EXISTS impoconsumo_valor numeric(14,2) NOT NULL DEFAULT 0`,
  // Impoconsumo 8% — ítems de venta POS
  `ALTER TABLE items_venta_pos ADD COLUMN IF NOT EXISTS impoconsumo_pct numeric(5,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE items_venta_pos ADD COLUMN IF NOT EXISTS impoconsumo_valor numeric(14,2) NOT NULL DEFAULT 0`,
  // Retenciones aplicadas a proveedores (para certificados anuales)
  `CREATE TABLE IF NOT EXISTS retenciones_proveedor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    proveedor_id uuid REFERENCES proveedores(id),
    nombre_proveedor varchar(200) NOT NULL,
    nit_proveedor varchar(30),
    tipo varchar(20) NOT NULL,
    nombre_concepto varchar(100) NOT NULL,
    porcentaje numeric(6,4) NOT NULL,
    base numeric(14,2) NOT NULL,
    valor numeric(14,2) NOT NULL,
    fecha date NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    referencia_tipo varchar(30),
    referencia_id uuid,
    referencia_numero varchar(50),
    observaciones text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ret_prov_tenant_ano_idx ON retenciones_proveedor(tenant_id, ano)`,
  `CREATE INDEX IF NOT EXISTS ret_prov_proveedor_idx ON retenciones_proveedor(tenant_id, proveedor_id, ano)`,
  // Activos fijos
  `CREATE TABLE IF NOT EXISTS activos_fijos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    codigo varchar(30),
    descripcion varchar(300) NOT NULL,
    categoria varchar(100),
    valor_adquisicion numeric(14,2) NOT NULL,
    valor_residual numeric(14,2) NOT NULL DEFAULT 0,
    depreciacion_acumulada numeric(14,2) NOT NULL DEFAULT 0,
    valor_neto numeric(14,2) NOT NULL,
    vida_util_meses integer NOT NULL,
    metodo varchar(20) NOT NULL DEFAULT 'lineal',
    fecha_adquisicion date NOT NULL,
    fecha_inicio_depreciacion date NOT NULL,
    cuenta_activo varchar(20),
    cuenta_depreciacion varchar(20),
    cuenta_gasto varchar(20),
    estado varchar(20) NOT NULL DEFAULT 'activo',
    observaciones text,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS depreciaciones_activo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activo_id uuid NOT NULL REFERENCES activos_fijos(id),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    ano integer NOT NULL,
    mes integer NOT NULL,
    valor numeric(14,2) NOT NULL,
    valor_neto_al_final numeric(14,2) NOT NULL,
    asiento_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS depreciacion_activo_mes_unique ON depreciaciones_activo(activo_id, ano, mes)`,
  `CREATE INDEX IF NOT EXISTS activos_fijos_tenant_idx ON activos_fijos(tenant_id)`,
  // Documentos soporte (adquisiciones a no obligados Art. 616-1 ET)
  `CREATE TABLE IF NOT EXISTS documentos_soporte (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    numero varchar(30) NOT NULL,
    consecutivo integer NOT NULL,
    nombre_vendedor varchar(200) NOT NULL,
    tipo_documento_vendedor varchar(20) NOT NULL DEFAULT 'CC',
    nit_vendedor varchar(30) NOT NULL,
    descripcion varchar(500) NOT NULL,
    subtotal numeric(14,2) NOT NULL,
    iva_asumido numeric(14,2) NOT NULL DEFAULT 0,
    retencion_fuente numeric(14,2) NOT NULL DEFAULT 0,
    total numeric(14,2) NOT NULL,
    fecha date NOT NULL,
    asiento_id uuid,
    observaciones text,
    anulado boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS items_documento_soporte (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    documento_id uuid NOT NULL REFERENCES documentos_soporte(id) ON DELETE CASCADE,
    descripcion varchar(300) NOT NULL,
    cantidad numeric(10,4) NOT NULL,
    valor_unitario numeric(14,4) NOT NULL,
    total numeric(14,2) NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS documentos_soporte_tenant_consecutivo_unique ON documentos_soporte(tenant_id, consecutivo)`,
  `CREATE INDEX IF NOT EXISTS documentos_soporte_tenant_fecha_idx ON documentos_soporte(tenant_id, fecha)`,
  // Corrección de dígitos de verificación en clientes NIT del set de habilitación DIAN
  `UPDATE clientes SET digito_verificacion = '6' WHERE numero_documento = '900456781' AND digito_verificacion = '3'`,
  `UPDATE clientes SET digito_verificacion = '5' WHERE numero_documento = '800123456' AND digito_verificacion = '7'`,
  `UPDATE clientes SET digito_verificacion = '7' WHERE numero_documento = '901234567' AND digito_verificacion = '1'`,
  `UPDATE clientes SET digito_verificacion = '8' WHERE numero_documento = '860012345' AND digito_verificacion = '9'`,
  // trial_ends_at: columna añadida en schema (commit 733c459) pero nunca aplicada a la BD
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz`,
  // ventas_pos — columnas DIAN/FE y auditoría de anulación (detectadas por drift check)
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS tipo_documento varchar(30) NOT NULL DEFAULT 'tiquete_pos'`,
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS estado_dian varchar(30) NOT NULL DEFAULT 'pendiente_envio'`,
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS fecha_limite_envio timestamptz`,
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS enviado_en timestamptz`,
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS anulado_por uuid`,
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS anulado_en timestamptz`,
  `ALTER TABLE ventas_pos ADD COLUMN IF NOT EXISTS anulado_motivo text`,
];

for (const migration of migrations) {
  try {
    await sql.unsafe(migration);
    console.log("✓", migration.slice(0, 70));
  } catch (e) {
    console.error("✗ MIGRACIÓN FALLIDA — abortando deploy");
    console.error(e instanceof Error ? e.message : e);
    await sql.end();
    process.exit(1);
  }
}

// ── Verificación de drift entre schema Drizzle y BD real ─────────────────────
// Si falta cualquier tabla o columna definida en el schema → el deploy aborta.
// Cierra el hueco donde el schema se actualizó pero migrate.ts no (bug 2026-07-06).

const tables = Object.values(schema).filter((v): v is PgTable => is(v, PgTable));

const expected = new Map<string, Set<string>>();
for (const table of tables) {
  const config = getTableConfig(table);
  expected.set(config.name, new Set(config.columns.map((c) => c.name)));
}

const rows = await sql<{ table_name: string; column_name: string }[]>`
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_name = c.table_name AND t.table_schema = c.table_schema
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
`;

const actual = new Map<string, Set<string>>();
for (const { table_name, column_name } of rows) {
  if (!actual.has(table_name)) actual.set(table_name, new Set());
  actual.get(table_name)!.add(column_name);
}

const drift: string[] = [];
for (const [tableName, expectedCols] of expected) {
  const actualCols = actual.get(tableName);
  if (!actualCols) {
    drift.push(`TABLA FALTANTE en BD: "${tableName}"`);
    continue;
  }
  for (const col of expectedCols) {
    if (!actualCols.has(col)) {
      drift.push(`COLUMNA FALTANTE en BD: "${tableName}.${col}"`);
    }
  }
}

if (drift.length > 0) {
  console.error("\n❌ DRIFT DE SCHEMA DETECTADO — abortando deploy:");
  for (const d of drift) {
    console.error("  •", d);
  }
  console.error("\nSolución: agrega el ALTER TABLE o CREATE TABLE correspondiente a migrate.ts");
  await sql.end();
  process.exit(1);
}

console.log("✓ Schema Drizzle coincide con la BD — sin drift");
await sql.end();
console.log("Migración completada.");
process.exit(0);
