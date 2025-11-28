import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/__tests__/**/*.spec.ts", "apps/**/__tests__/**/*.spec.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
  plugins: [tsconfigPaths({ projects: ["./tsconfig.base.json"] })],
});
