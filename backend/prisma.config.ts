import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Use test database URL if in test environment
const databaseUrl =
  process.env.NODE_ENV === "test"
    ? process.env.DATABASE_URL
    : env("DIRECT_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
