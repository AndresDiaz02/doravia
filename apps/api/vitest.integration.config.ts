import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.integration.test.ts"],
    passWithNoTests: false,
    // Las pruebas P0 instalan triggers de fallo deliberados; serializar
    // archivos evita que afecten otro flujo HTTP dentro del mismo esquema.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
