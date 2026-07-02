import postgres from "postgres";

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
  // tenant hub para contadores (NIT especial 0000000001)
  `INSERT INTO tenants (nombre, nit, plan_id, plan_starts_at, plan_ends_at, activo, onboarding_completado)
   SELECT 'Hub Contadores Doravia', '0000000001',
          (SELECT id FROM plans WHERE slug = 'origen' LIMIT 1),
          now(), now() + interval '100 years', true, true
   WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE nit = '0000000001')`,
];

for (const migration of migrations) {
  try {
    await sql.unsafe(migration);
    console.log("✓", migration.slice(0, 70));
  } catch (e) {
    console.error("✗", e instanceof Error ? e.message : e);
  }
}

await sql.end();
console.log("Migración completada.");
process.exit(0);
