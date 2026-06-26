import { defineConfig } from "drizzle-kit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const env = readFileSync(resolve(process.cwd(), "../../.env"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#][^=\s][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* .env no encontrado, se usan vars del sistema */ }

export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/doravia",
  },
});
