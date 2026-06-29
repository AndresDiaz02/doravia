import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Carga .env si DATABASE_URL no está en el entorno
if (!process.env.DATABASE_URL) {
  const roots = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../../.env"),
  ];
  for (const p of roots) {
    try {
      const env = readFileSync(p, "utf-8");
      for (const line of env.split("\n")) {
        const m = line.match(/^([^#][^=\s][^=]*)=(.*)/);
        if (m) process.env[m[1].trim()] = m[2].trim();
      }
      break;
    } catch { /* intentar siguiente ruta */ }
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está definida");

const queryClient = postgres(connectionString, {
  max: 20,           // pool de hasta 20 conexiones simultáneas
  idle_timeout: 30,  // libera conexiones inactivas después de 30s
  connect_timeout: 10,
  prepare: false,    // necesario si Railway usa PgBouncer
});
export const db = drizzle(queryClient, { schema });

export type DB = typeof db;
