import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const testEnvPath = path.resolve(import.meta.dirname, ".env.test");
if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath, override: false });
}

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/src/generated/**",
      "**/.{git,cache,output,temp}/**",
    ],
    globals: true,
  },
});
