import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// postgres es una dependencia del workspace de base de datos, no de la raíz.
// Resolverla desde allí mantiene el script sin una dependencia duplicada.
const requireFromDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgresModule = requireFromDb("postgres");
const postgres = postgresModule.default ?? postgresModule;

const databaseUrl = process.env.DATABASE_URL_TEST;
const resetExplicitlyAllowed = process.env.DORAVIA_QA_ALLOW_SCHEMA_RESET === "true";

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

// No se acepta un hostname resoluble (ni siquiera "localhost"): una entrada
// manipulada en hosts/DNS podría redirigir el borrado a un servicio remoto.
// El uso de literales loopback hace que esta primera barrera no dependa de DNS.
const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
const allowedHosts = new Set(["127.0.0.1", "::1"]);
const databaseName = parsed.pathname.replace(/^\//, "");
if (
  !["postgres:", "postgresql:"].includes(parsed.protocol) ||
  !allowedHosts.has(hostname) ||
  !/^doravia_test_[a-z0-9_]+$/i.test(databaseName) ||
  parsed.searchParams.size > 0
) {
  console.error("Las pruebas solo aceptan una IP loopback y una base doravia_test_* sin parámetros de conexión. No se ejecutó nada.");
  process.exit(1);
}

if (!resetExplicitlyAllowed) {
  console.error("DORAVIA_QA_ALLOW_SCHEMA_RESET=true es requerida para autorizar el reinicio de la base efímera.");
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: databaseUrl };
const isWindows = process.platform === "win32";
const pnpmCommand = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";

// La base ya fue validada como local y con nombre exclusivo de QA. Reiniciar
// su esquema hace que una segunda corrida no herede DDL parcial de Drizzle ni
// datos de la primera; no existe ruta desde aquí hacia Neon o producción.
const sql = postgres(databaseUrl, { max: 1 });
try {
  // Segunda barrera: aun si un puerto local fuera un túnel hacia otra red, el
  // servidor debe confirmar que su dirección de escucha es loopback y que la
  // base efectiva coincide exactamente con la validada en la URL.
  const [connection] = await sql`
    SELECT current_database() AS database_name, inet_server_addr()::text AS server_address
  `;
  const serverAddress = connection?.server_address?.split("/")[0];
  if (
    connection?.database_name !== databaseName ||
    !allowedHosts.has(serverAddress)
  ) {
    throw new Error("El servidor PostgreSQL conectado no es la base local efímera esperada.");
  }

  await sql.unsafe("DROP SCHEMA public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO CURRENT_USER");
} finally {
  await sql.end();
}

for (const args of [
  // La migración incremental presupone el esquema base. Este push solo puede
  // ejecutarse después de la validación estricta de la base local efímera.
  ["--filter", "@workspace/db", "push"],
  ["--filter", "@workspace/db", "migrate"],
  ["--filter", "@workspace/api", "exec", "vitest", "run", "--config", "vitest.integration.config.ts"],
]) {
  // Windows no puede ejecutar directamente archivos .cmd con spawnSync. Se
  // invoca cmd.exe explícitamente con argumentos constantes, en lugar de usar
  // shell:true (que concatena argumentos y emite una advertencia de seguridad).
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["pnpm", ...args].join(" ")]
    : args;
  const result = spawnSync(pnpmCommand, commandArgs, { cwd: process.cwd(), env, stdio: "inherit", shell: false });
  if (result.error) {
    console.error(`No se pudo ejecutar ${pnpmCommand}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
