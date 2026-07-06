#!/usr/bin/env node
/**
 * Backup manual de la base de datos Doravia.
 * Requiere: pg_dump instalado localmente y DATABASE_URL en el entorno.
 *
 * Uso:
 *   node scripts/backup-db.mjs
 *   DATABASE_URL="postgres://..." node scripts/backup-db.mjs
 */

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no definida.");
  process.exit(1);
}

const ahora = new Date();
const timestamp = ahora
  .toISOString()
  .replace(/:/g, "-")
  .replace("T", "_")
  .slice(0, 19); // 2026-06-22_14-35-00

const backupsDir = join(process.cwd(), "backups");
mkdirSync(backupsDir, { recursive: true });

const archivo = join(backupsDir, `doravia_${timestamp}.dump`);

console.log(`📦 Iniciando backup → ${archivo}`);

try {
  execSync(`pg_dump --format=custom --no-acl --no-owner "${DATABASE_URL}" -f "${archivo}"`, {
    stdio: "inherit",
  });
  console.log(`✅ Backup completado: ${archivo}`);
} catch (err) {
  console.error("❌ Error al ejecutar pg_dump:", err.message);
  process.exit(1);
}
