import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL_TEST;

if (!databaseUrl) {
  console.error("DATABASE_URL_TEST es requerida para las pruebas de integración locales.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error("DATABASE_URL_TEST no tiene un formato PostgreSQL válido.");
  process.exit(1);
}

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const databaseName = parsed.pathname.replace(/^\//, "");
const disallowedConnectionOptions = ["host", "hostaddr", "service"];
if (
  !["postgres:", "postgresql:"].includes(parsed.protocol) ||
  !allowedHosts.has(parsed.hostname) ||
  !/^doravia_test_[a-z0-9_]+$/i.test(databaseName) ||
  disallowedConnectionOptions.some((option) => parsed.searchParams.has(option))
) {
  console.error("Las pruebas solo aceptan PostgreSQL local y una base doravia_test_*. No se ejecutó nada.");
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
for (const args of [
  // La migración incremental presupone el esquema base. Este push solo puede
  // ejecutarse después de la validación estricta de la base local efímera.
  ["--filter", "@workspace/db", "push"],
  ["--filter", "@workspace/db", "migrate"],
  ["--filter", "@workspace/api", "exec", "vitest", "run", "--config", "vitest.integration.config.ts"],
]) {
  const result = spawnSync("pnpm", args, { cwd: process.cwd(), env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
