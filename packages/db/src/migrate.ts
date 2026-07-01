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
  // tabla de pre-registro de contadores externos
  `CREATE TABLE IF NOT EXISTS contador_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre varchar(200) NOT NULL,
    email varchar(200) UNIQUE NOT NULL,
    celular varchar(20),
    firma_contable varchar(200),
    token_confirmacion varchar(100) UNIQUE NOT NULL,
    confirmado boolean NOT NULL DEFAULT false,
    user_id uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    confirmado_at timestamptz
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
