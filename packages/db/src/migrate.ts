import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

const migrations = [
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS en_prueba boolean NOT NULL DEFAULT true`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS prueba_ends_at timestamptz`,
];

for (const sql of migrations) {
  try {
    await client.query(sql);
    console.log("✓", sql.slice(0, 60));
  } catch (e) {
    console.error("✗", e instanceof Error ? e.message : e);
  }
}

await client.end();
console.log("Migración completada.");
