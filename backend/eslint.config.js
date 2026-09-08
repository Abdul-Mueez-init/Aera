import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/generated/prisma/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/common/auth/auth.types.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
    },
  },
);
