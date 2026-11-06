import { prisma } from "../src/db/prisma.js";
const rows = await prisma.$queryRawUnsafe(`
  SELECT conrelid::regclass::text AS tbl, conname
  FROM pg_constraint
  WHERE confrelid = 'users'::regclass AND contype = 'f'
`);
console.log(JSON.stringify(rows, null, 0));
await prisma.$disconnect();
