import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/src/generated/**",
      "**/.{git,cache,output,temp}/**",
    ],
    globals: true,
  },
});
