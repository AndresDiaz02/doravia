#!/usr/bin/env node
/**
 * Backup manual de la base de datos Doravia.
 * Requiere: pg_dump instalado localmente y DATABASE_URL en el entorno.
 *
 * Uso:
 *   node scripts/backup-db.mjs
 *   DATABASE_URL="postgres://..." node scripts/backup-db.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no definida.");
  process.exit(1);
}

const pgDump = process.env.PG_DUMP_PATH || "pg_dump";

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
  const result = spawnSync(
    pgDump,
    [
      "--format=custom",
      "--no-acl",
      "--no-owner",
      "--dbname",
      DATABASE_URL,
      "--file",
      archivo,
    ],
    // No usar un shell: la URL puede contener caracteres especiales y debe
    // viajar como un argumento opaco a pg_dump.
    { stdio: "inherit", shell: false },
  );

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        "No se encontró pg_dump. Instala PostgreSQL Client Tools o define PG_DUMP_PATH con la ruta del ejecutable.",
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump finalizó con código ${result.status ?? "desconocido"}.`);
  }
  console.log(`✅ Backup completado: ${archivo}`);
} catch (err) {
  console.error("❌ Error al ejecutar pg_dump:", err.message);
  process.exit(1);
}
