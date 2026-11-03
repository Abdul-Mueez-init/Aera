import { prisma } from "../src/db/prisma.js";

const rows = await prisma.quote.findMany({
  where: { jobId: null, serviceRequestId: null },
  select: { id: true, companyId: true, customerId: true, quoteNumber: true },
  orderBy: { createdAt: "asc" },
});

console.table(rows);
console.log(`Found ${rows.length} legacy quotes without a job or request.`);
await prisma.$disconnect();
