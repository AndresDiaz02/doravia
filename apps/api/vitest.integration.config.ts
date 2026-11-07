import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.integration.test.ts"],
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Todas las suites usan el mismo esquema efímero. Los escenarios P0
    // instalan triggers de fallo temporales; los archivos se serializan para
    // que esos triggers no puedan afectar otra suite. La concurrencia dentro
    // de cada escenario POS se conserva mediante Promise.all.
    fileParallelism: false,
  },
});
